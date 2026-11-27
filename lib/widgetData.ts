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
 *   (also across cold launches: a fingerprint of the last file is kept in
 *   lib/widgetSettings.ts, so the same week isn't rewritten or reloaded)
 * - coming back to the app: refreshMemoryWidget, at most every
 *   WIDGET_REFRESH_MS unless the picks changed (a new day)
 * - Settings → "Show my words on the widget" and the app lock: refresh with
 *   `force`, so words appear or vanish straight away. Words going away
 *   don't wait for a run that is stuck on the network: the last file is
 *   rewritten without its lines first, then the week is re-picked
 * - the session ending, however it ends: clearMemoryWidget
 *   (contexts/AuthContext.tsx)
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
import {
  clearWidgetWritten,
  getWidgetWords,
  readWidgetShown,
  readWidgetWritten,
  writeWidgetShown,
  writeWidgetWritten,
} from "@/lib/widgetSettings";
import { clearWidgetData, reloadWidgets, writeWidgetData } from "@/modules/now-playing";

/** Bump when the JSON's shape changes; the widget ignores versions it doesn't know. */
export const WIDGET_SCHEMA_VERSION = 1;
/** Coming back to the app rewrites at most this often when nothing changed. */
export const WIDGET_REFRESH_MS = 30 * 60 * 1000;
/** Downloaded artwork waits here until the native side copies it in. */
const ART_CACHE_DIR = "widget-art";
/** An artwork download or the reflections read that takes longer is skipped. */
export const WIDGET_NETWORK_TIMEOUT_MS = 8000;

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
    createdAt: m.createdAt ?? null,
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


/** The payload with every line taken out (words no longer allowed). Pure. */
export function withoutWords(payload: WidgetPayload): WidgetPayload {
  return { ...payload, showWords: false, entries: payload.entries.map((e) => ({ ...e, line: null })) };
}

/** The file's content without its timestamp: an identical week isn't rewritten. Pure. */
function contentOf(payload: WidgetPayload): string {
  return JSON.stringify({ ...payload, generatedAt: null });
}

/** A short fingerprint of that content, kept across launches. Pure. */
export function widgetFingerprint(content: string): string {
  return `${hash(content).toString(36)}.${content.length.toString(36)}`;
}

const TIMED_OUT = Symbol("timed out");

/** The promise's value, or TIMED_OUT once `ms` have passed. A rejection still rejects. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── state ───────────────────────────────────────────────────────────────

let source: { userId: string; moments: readonly WidgetSourceMoment[] } | null = null;
/** What was last written, to skip identical rewrites and throttle refreshes. */
let last: { userId: string; picksKey: string; content: string; at: number } | null = null;
/** The file as it stands (written, or found identical) this launch: what words-off rewrites. */
let written: { userId: string; payload: WidgetPayload; images: Record<string, string> } | null = null;
/** Bumped by clearMemoryWidget: a run that started before it never writes. */
let generation = 0;
/** Bumped when words go away: a run that read them as allowed before that never writes. */
let wordsEpoch = 0;
/** One run at a time, in order. */
let queue: Promise<void> = Promise.resolve();
/**
 * Every native write and wipe, in order. Only local file work waits here,
 * never the network, so taking the words off can't be held up by a run
 * that is waiting on a download.
 */
let writes: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task).catch((e) => {
    if (__DEV__) console.warn("[widget]", e);
  });
  queue = next;
  return next;
}

function serialWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writes.then(task);
  writes = next.catch(() => {});
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
 * setting that changes what the widget may show). A forced refresh that
 * finds words no longer allowed first rewrites the current file without
 * them, straight away and without the network.
 */
export function refreshMemoryWidget(opts: { force?: boolean } = {}): Promise<void> {
  if (!source) return Promise.resolve();
  const hidden = opts.force ? hideWordsIfOff(source.userId) : Promise.resolve();
  const next = enqueue(() => run(opts.force ? "force" : "refresh"));
  return Promise.all([hidden, next]).then(() => {});
}

/**
 * The session ended (sign-out, account deletion, or any other way): the
 * widget's file and images go, the widget reloads empty, and this module
 * forgets the library.
 */
export async function clearMemoryWidget(): Promise<void> {
  generation++;
  source = null;
  last = null;
  written = null;
  // Straight away, not behind a run that may be waiting on a download (that
  // would hold up sign-out). A run already past its last check could still
  // land its write, so it's wiped again once the queue is through.
  await Promise.all([serialWrite(wipe), clearWidgetWritten()]);
  void enqueue(() => serialWrite(wipe));
}

async function wipe(): Promise<void> {
  await clearWidgetData();
  deleteArtCache();
  await reloadWidgets();
}

async function readShowWords(userId: string): Promise<boolean> {
  const [wordsSetting, lockRaw] = await Promise.all([
    getWidgetWords(userId),
    AsyncStorage.getItem(APP_LOCK_STORAGE_KEY).catch(() => null),
  ]);
  return wordsAllowed(wordsSetting, parseLockSetting(lockRaw));
}

/** Words were just turned off (or the lock on): take them off the widget now. */
async function hideWordsIfOff(userId: string): Promise<void> {
  const gen = generation;
  try {
    if (await readShowWords(userId)) return;
    wordsEpoch++;
    await serialWrite(async () => {
      const w = written;
      if (gen !== generation || !w || w.userId !== userId) return;
      if (!w.payload.showWords && w.payload.entries.every((e) => e.line === null)) return;
      const payload = withoutWords(w.payload);
      if (!(await writeWidgetData(JSON.stringify(payload), w.images))) return;
      written = { ...w, payload };
      // The file no longer matches what was last compared or kept.
      last = null;
      await clearWidgetWritten();
      await reloadWidgets();
    });
  } catch (e) {
    if (__DEV__) console.warn("[widget]", e);
  }
}

async function run(mode: RunMode): Promise<void> {
  const gen = generation;
  const epoch = wordsEpoch;
  const src = source;
  if (!src) return;
  const { userId } = src;
  const now = new Date();
  const today = dateToStr(now);

  const [showWords, record] = await Promise.all([readShowWords(userId), readWidgetShown(userId)]);
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
  const content = contentOf(payload);
  if (gen !== generation) return;
  if (mode !== "force") {
    const same =
      last?.userId === userId
        ? last.content === content
        : // First run this launch: the file the last launch left may already be this week.
          (await readWidgetWritten(userId)) === widgetFingerprint(content);
    if (same && gen === generation) {
      last = { userId, picksKey, content, at: now.getTime() };
      written = { userId, payload, images };
      return;
    }
  }

  const ok = await serialWrite(async () => {
    if (gen !== generation) return false;
    // Words were taken away while this run was out; the forced run behind
    // it re-picks without them.
    if (showWords && epoch !== wordsEpoch) return false;
    const done = await writeWidgetData(JSON.stringify(payload), images);
    if (done) written = { userId, payload, images };
    return done;
  });
  // A binary without the native side (before 1.5): nothing to reload.
  if (!ok || gen !== generation) return;
  await Promise.all([
    writeWidgetShown(userId, {
      shown,
      planned: Object.fromEntries(picks.map((p) => [p.day, p.momentId])),
    }),
    writeWidgetWritten(userId, widgetFingerprint(content)),
  ]);
  await reloadWidgets();
  last = { userId, picksKey, content, at: now.getTime() };
  pruneArtCache(new Set(Object.keys(images)));
}

/**
 * The picks with the first line of each reflection. The Journal's library
 * rows don't carry reflections, so the (at most 7) picked moments are read
 * by id, the owner's own rows only. On failure or timeout the picks go
 * without words.
 */
async function withLines(userId: string, picks: WidgetPick[]): Promise<WidgetPick[]> {
  try {
    const rows = await within(
      fetchMomentsByIds(userId, picks.map((p) => p.momentId)),
      WIDGET_NETWORK_TIMEOUT_MS
    );
    if (rows === TIMED_OUT) return picks.map((p) => ({ ...p, line: null }));
    const byId = new Map(rows.map((r) => [r.id, r.reflectionText]));
    return picks.map((p) => ({ ...p, line: firstLine(byId.get(p.momentId)) }));
  } catch {
    return picks.map((p) => ({ ...p, line: null }));
  }
}

/**
 * Downloads each pick's artwork (once; kept in the cache). File name → local
 * URI. A download that takes longer than WIDGET_NETWORK_TIMEOUT_MS is left
 * out this time (it may still land in the cache for the next run).
 */
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
          const got = await within(
            File.downloadFileAsync(p.artworkUrl, file, { idempotent: true }),
            WIDGET_NETWORK_TIMEOUT_MS
          );
          if (got === TIMED_OUT) return;
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
