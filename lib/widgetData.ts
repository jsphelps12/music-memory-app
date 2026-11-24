/**
 * Memory widget (1.5): what the app hands the widget.
 *
 * The widget extension can't sign in or query the database, so the app
 * writes the next week of picks (lib/widgetPicks.ts) as one JSON file into
 * the App Group container, with each pick's artwork beside it, and asks iOS
 * to reload the widget's timeline. The widget then rotates through the week
 * on its own (targets/widget/MemoryWidget.swift).
 *
 * When it runs:
 * - the Journal's library loads or changes (hooks/useMemoryWidget.ts):
 *   syncMemoryWidget, written whenever the result differs from the last file
 * - coming back to the app: refreshMemoryWidget, at most every
 *   WIDGET_REFRESH_MS unless the picks changed (a new day)
 * - Settings → "Show my words on the widget" and the app lock: refresh with
 *   `force`, so words appear or vanish straight away
 * - sign-out and account deletion: clearMemoryWidget (contexts/AuthContext.tsx)
 *
 * Privacy: words only when the user turned them on AND the app lock is off.
 * The widget never gets photos, only the song's artwork. Nothing here leaves
 * the phone except the artwork downloads and, with words on, one read of
 * the picked moments' reflections (the owner's own rows).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { APP_LOCK_STORAGE_KEY, parseLockSetting } from "@/lib/appLock";
import { fetchMomentsByIds, type BrowseMeta } from "@/lib/browse";
import { dateToStr } from "@/lib/dateUtils";
import { firstLine, hash, pickWidgetMoments, rollShown, type WidgetPick, type WidgetSourceMoment } from "@/lib/widgetPicks";
import { getWidgetWords, readWidgetShown, writeWidgetShown } from "@/lib/widgetSettings";
import { clearWidgetData, reloadWidgets, writeWidgetData } from "@/modules/now-playing";

/** Bump when the JSON's shape changes; the widget ignores versions it doesn't know. */
export const WIDGET_SCHEMA_VERSION = 1;
/** Coming back to the app rewrites at most this often when nothing changed. */
export const WIDGET_REFRESH_MS = 30 * 60 * 1000;
/** Downloaded artwork waits here until the native side copies it in. */
const ART_CACHE_DIR = "widget-art";

export interface WidgetEntry {
  day: string;
  momentId: string;
  title: string;
  artist: string;
  dateLabel: string;
  dateText: string;
  onThisDay: boolean;
  line: string | null;
  /** File name in widget/images/, or null when there's no artwork. */
  image: string | null;
}

export interface WidgetPayload {
  version: typeof WIDGET_SCHEMA_VERSION;
  generatedAt: string;
  showWords: boolean;
  entries: WidgetEntry[];
}

/** Words on the widget: turned on in Settings, and never with the app lock on. Pure. */
export function wordsAllowed(setting: boolean, lockOn: boolean): boolean {
  return setting && !lockOn;
}

/** The Journal's whole-library rows (["browseMeta", uid]) as the picker's input. */
export function browseToWidgetSource(meta: readonly BrowseMeta[]): WidgetSourceMoment[] {
  return meta.map((m) => ({
    id: m.id,
    momentDate: m.momentDate,
    songTitle: m.songTitle,
    songArtist: m.songArtist,
    artworkUrl: m.songArtworkUrl,
  }));
}

/** The artwork's file name: changes when the artwork does, so iOS never shows a stale one. */
export function artworkFileName(momentId: string, url: string): string {
  return `${momentId}-${hash(url).toString(36)}.jpg`;
}

/** The JSON the widget reads. Pure. */
export function buildWidgetPayload(
  picks: readonly WidgetPick[],
  showWords: boolean,
  images: Readonly<Record<string, string>>,
  now: Date
): WidgetPayload {
  return {
    version: WIDGET_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    showWords,
    entries: picks.map((p) => {
      const image = p.artworkUrl ? artworkFileName(p.momentId, p.artworkUrl) : null;
      return {
        day: p.day,
        momentId: p.momentId,
        title: p.title,
        artist: p.artist,
        dateLabel: p.dateLabel,
        dateText: p.dateText,
        onThisDay: p.onThisDay,
        line: showWords ? p.line : null,
        image: image && images[image] ? image : null,
      };
    }),
  };
}

// ── state ───────────────────────────────────────────────────────────────

let source: { userId: string; moments: readonly WidgetSourceMoment[] } | null = null;
/** What was last written, to skip identical rewrites and throttle refreshes. */
let last: { userId: string; picksKey: string; content: string; at: number } | null = null;
/** Bumped by clearMemoryWidget: a run that started before it never writes. */
let generation = 0;
/** One run at a time, in order. */
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task).catch((e) => {
    if (__DEV__) console.warn("[widget]", e);
  });
  queue = next;
  return next;
}

type RunMode = "sync" | "refresh" | "force";

/** The Journal's library loaded or changed: rewrite the widget if its file would differ. */
export function syncMemoryWidget(userId: string, moments: readonly WidgetSourceMoment[]): Promise<void> {
  source = { userId, moments };
  return enqueue(() => run("sync"));
}

/**
 * Re-pick from the last library the Journal handed over. Throttled to
 * WIDGET_REFRESH_MS when the picks haven't changed, unless `force` (a
 * setting that changes what the widget may show).
 */
export function refreshMemoryWidget(opts: { force?: boolean } = {}): Promise<void> {
  if (!source) return Promise.resolve();
  return enqueue(() => run(opts.force ? "force" : "refresh"));
}

/**
 * Sign-out and account deletion: the widget's file and images go, the
 * widget reloads empty, and this module forgets the library.
 */
export async function clearMemoryWidget(): Promise<void> {
  generation++;
  source = null;
  last = null;
  // Straight away, not behind a run that may be waiting on a download (that
  // would hold up sign-out). A run already past its last check could still
  // land its write, so it's wiped again once the queue is through.
  await wipe();
  void enqueue(wipe);
}

async function wipe(): Promise<void> {
  await clearWidgetData();
  deleteArtCache();
  await reloadWidgets();
}

async function run(mode: RunMode): Promise<void> {
  const gen = generation;
  const src = source;
  if (!src) return;
  const { userId } = src;
  const now = new Date();
  const today = dateToStr(now);

  const [wordsSetting, lockRaw, record] = await Promise.all([
    getWidgetWords(userId),
    AsyncStorage.getItem(APP_LOCK_STORAGE_KEY).catch(() => null),
    readWidgetShown(userId),
  ]);
  const showWords = wordsAllowed(wordsSetting, parseLockSetting(lockRaw));
  const shown = rollShown(record.shown, record.planned, today);
  let picks = pickWidgetMoments({ moments: src.moments, shown, today, seed: userId });

  const picksKey = JSON.stringify([showWords, picks]);
  if (
    mode === "refresh" &&
    last?.userId === userId &&
    last.picksKey === picksKey &&
    now.getTime() - last.at < WIDGET_REFRESH_MS
  ) {
    return;
  }

  if (showWords && picks.length > 0) picks = await withLines(userId, picks);
  const images = await downloadArtwork(picks);
  const payload = buildWidgetPayload(picks, showWords, images, now);
  // Compared without the timestamp: an identical week isn't rewritten.
  const content = JSON.stringify({ ...payload, generatedAt: null });
  if (gen !== generation) return;
  if (mode !== "force" && last?.userId === userId && last.content === content) {
    last = { ...last, picksKey, at: now.getTime() };
    return;
  }

  const ok = await writeWidgetData(JSON.stringify(payload), images);
  // A binary without the native side (before 1.5): nothing to reload.
  if (!ok || gen !== generation) return;
  await writeWidgetShown(userId, {
    shown,
    planned: Object.fromEntries(picks.map((p) => [p.day, p.momentId])),
  });
  await reloadWidgets();
  last = { userId, picksKey, content, at: now.getTime() };
  pruneArtCache(new Set(Object.keys(images)));
}

/**
 * The picks with the first line of each reflection. The Journal's library
 * rows don't carry reflections, so the (at most 7) picked moments are read
 * by id, the owner's own rows only. On failure the picks go without words.
 */
async function withLines(userId: string, picks: WidgetPick[]): Promise<WidgetPick[]> {
  try {
    const rows = await fetchMomentsByIds(userId, picks.map((p) => p.momentId));
    const byId = new Map(rows.map((r) => [r.id, r.reflectionText]));
    return picks.map((p) => ({ ...p, line: firstLine(byId.get(p.momentId)) }));
  } catch {
    return picks.map((p) => ({ ...p, line: null }));
  }
}

/** Downloads each pick's artwork (once; kept in the cache). File name → local URI. */
async function downloadArtwork(picks: readonly WidgetPick[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let dir: Directory;
  try {
    dir = new Directory(Paths.cache, ART_CACHE_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    return out;
  }
  await Promise.all(
    picks.map(async (p) => {
      if (!p.artworkUrl) return;
      const name = artworkFileName(p.momentId, p.artworkUrl);
      try {
        const file = new File(dir, name);
        if (!file.exists || file.size === 0) {
          await File.downloadFileAsync(p.artworkUrl, file, { idempotent: true });
        }
        out[name] = file.uri;
      } catch {
        // No artwork for this one; the widget draws its placeholder.
      }
    })
  );
  return out;
}

function pruneArtCache(keep: ReadonlySet<string>): void {
  try {
    const dir = new Directory(Paths.cache, ART_CACHE_DIR);
    if (!dir.exists) return;
    for (const item of dir.list()) {
      if (item instanceof File && !keep.has(item.name)) item.delete();
    }
  } catch {}
}

function deleteArtCache(): void {
  try {
    const dir = new Directory(Paths.cache, ART_CACHE_DIR);
    if (dir.exists) dir.delete();
  } catch {}
}
