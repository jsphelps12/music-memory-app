import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersonLink, Song } from "@/types";
import { keptFileNames, photoCountLabel, type DraftPhoto } from "@/lib/draftPhotos";
import { deleteDraftFiles, keepDraftPhotos, pruneDraftFiles } from "@/lib/captureDraftFiles";
import { keptVoiceNames, voiceTimeLabel, type LocalVoice } from "@/lib/voice";
import { deleteVoiceFiles, pruneVoiceFiles, storedDraftVoice } from "@/lib/voiceFiles";

/**
 * Capture drafts: unsaved writing on the capture screen survives Cancel, a
 * crash or iOS killing the app.
 *
 * Each capture screen owns one draft, by id, and only ever writes or clears
 * that one. So a capture opened pre-filled (a shared song, Last week, From
 * before, a prompt, Identify) can never overwrite or wipe writing left in an
 * earlier capture: that draft waits.
 * Every capture opens blank (decided 2026-11-18): a draft comes back only
 * when picked from long-press + → "Continue a draft", and that capture takes
 * over its id. Writing lost to a crash or iOS closing the app is kept the
 * same way and waits there too. A draft goes away
 * when its own capture is saved, on "Discard" when closing capture, on "Start
 * fresh", when it's emptied, or after a week.
 *
 * A draft keeps what the person added (version 2, 2026-11-21): the writing
 * and song, photos and videos (lib/draftPhotos.ts; copies of photos with no
 * library id are kept with the draft by lib/captureDraftFiles.ts), moods,
 * people and their friend links, the date, the place and the album, and a
 * voice recording (lib/voiceFiles.ts keeps the file). Drafts written before
 * have only the writing and song; every newer field is optional, so they
 * still load. Nothing about a draft leaves the phone.
 *
 * The rules are pure functions below (tested in
 * lib/__tests__/captureDraft.test.ts); the storage calls run one at a time so
 * a write and a clear can never land out of order.
 */
export interface CaptureDraft {
  id: string;
  reflection: string;
  song: Song | null;
  savedAt: number;
  /** 2 from when drafts kept the details below; absent on older drafts. */
  v?: 2;
  photos?: DraftPhoto[];
  moods?: string[];
  people?: string[];
  peopleLinks?: PersonLink[];
  /** The moment's date (epoch ms), null for "No specific date". */
  date?: number | null;
  place?: DraftPlace | null;
  album?: DraftAlbum | null;
  /** The part of the song in ms (lib/songPart.ts), null for none. */
  partMs?: number | null;
  /** A voice recording not saved yet (lib/voice.ts); its file is on this phone. */
  voice?: DraftVoice | null;
}

export type DraftVoice = LocalVoice;

export interface DraftPlace {
  name: string;
  lat: number | null;
  lng: number | null;
}

/** The album picked, by id (the name is only for reading the draft). */
export interface DraftAlbum {
  id: string;
  name: string;
}

export type DraftContent = Pick<CaptureDraft, "reflection" | "song"> &
  Partial<Pick<CaptureDraft, "photos" | "moods" | "people" | "peopleLinks" | "date" | "place" | "album" | "partMs" | "voice">>;

/**
 * What the app put in a capture rather than the person: starter and prompt
 * text, and photos that came with it (Last week's, ones shared in). Those
 * alone aren't worth keeping as a draft.
 */
export interface DraftGiven {
  templates?: readonly string[];
  photos?: readonly string[];
}

/** Older than a week and it's no longer "where you left off". */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A bound on storage, far above what a week of real use leaves behind. */
export const MAX_DRAFTS = 20;

const key = (userId: string) => `captureDrafts:${userId}`;
/** The single draft the first 1.4 builds kept, before drafts had ids. */
const legacyKey = (userId: string) => `captureDraft:${userId}`;
const LEGACY_ID = "legacy";

// ── Pure rules ──────────────────────────────────────────────────────────────

export { hasWriting } from "@/lib/writing";
import { hasWriting } from "@/lib/writing";

/**
 * Writing, a voice recording, or a photo or video the person added, is worth
 * keeping. A song alone is two taps to redo, and so are moods, people, a
 * place or an album without anything else.
 */
export function isWorthKeeping(
  content: Pick<DraftContent, "reflection" | "photos" | "voice">,
  given: DraftGiven = {}
): boolean {
  if (hasWriting(content.reflection, given.templates)) return true;
  if (content.voice) return true;
  const givenPhotos = given.photos ?? [];
  return (content.photos ?? []).some((p) => !givenPhotos.includes(p.uri));
}

/** Drafts still worth offering, newest first. */
export function liveDrafts(drafts: readonly CaptureDraft[], now: number): CaptureDraft[] {
  return drafts
    .filter((d) => now - d.savedAt <= MAX_AGE_MS && isWorthKeeping(d))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_DRAFTS);
}

/**
 * The list after one capture writes its draft. Writing nothing worth keeping
 * takes that capture's own draft out; no other draft is touched either way.
 */
export function withDraft(
  drafts: readonly CaptureDraft[],
  id: string,
  content: DraftContent,
  now: number,
  given: DraftGiven = {}
): CaptureDraft[] {
  const others = drafts.filter((d) => d.id !== id);
  if (!isWorthKeeping(content, given)) return liveDrafts(others, now);
  return liveDrafts([draftRecord(id, content, now), ...others], now);
}

/** A draft as stored: only the details that are set, so old and new read alike. */
export function draftRecord(id: string, content: DraftContent, now: number): CaptureDraft {
  const record: CaptureDraft = { id, reflection: content.reflection, song: content.song ?? null, savedAt: now, v: 2 };
  if (content.photos?.length) {
    record.photos = content.photos.map((p) => ({
      uri: p.uri,
      ...(p.assetId ? { assetId: p.assetId } : {}),
      ...(p.videoMs != null ? { videoMs: p.videoMs } : {}),
    }));
  }
  if (content.moods?.length) record.moods = [...content.moods];
  if (content.people?.length) record.people = [...content.people];
  if (content.peopleLinks?.length) {
    record.peopleLinks = content.peopleLinks.map((l) => ({ name: l.name, friendId: l.friendId }));
  }
  if (content.date !== undefined) record.date = content.date;
  if (content.place) record.place = { name: content.place.name, lat: content.place.lat, lng: content.place.lng };
  if (content.album) record.album = { id: content.album.id, name: content.album.name };
  if (content.partMs != null && content.song) record.partMs = content.partMs;
  if (content.voice) record.voice = { uri: content.voice.uri, durationMs: content.voice.durationMs };
  return record;
}

/** The list without one capture's draft. */
export function withoutDraft(drafts: readonly CaptureDraft[], id: string, now: number): CaptureDraft[] {
  return liveDrafts(
    drafts.filter((d) => d.id !== id),
    now
  );
}

/** One live draft by id, or null if it has expired, emptied or gone. */
export function draftById(drafts: readonly CaptureDraft[], id: string, now: number): CaptureDraft | null {
  return liveDrafts(drafts, now).find((d) => d.id === id) ?? null;
}

/**
 * What a capture screen picks up as it opens: only the draft asked for
 * (`draftId`, from "Continue a draft"; if that one has gone, nothing rather
 * than a different one). A plain capture opens blank. Never for a pre-filled
 * capture, and only while nothing has been typed yet, so a draft never
 * replaces fresh writing.
 */
export function draftToPickUp(
  drafts: readonly CaptureDraft[],
  opts: { prefilled: boolean; typed: string; draftId?: string },
  now: number
): CaptureDraft | null {
  if (opts.prefilled || opts.typed.trim() || !opts.draftId) return null;
  return draftById(drafts, opts.draftId, now);
}

// ── Labels ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * When a draft was last written, the way a person would say it, in local
 * time: "this morning", "this afternoon", "this evening", "last night",
 * "yesterday", a weekday within the week ("Tuesday"), else a date ("Nov 10").
 * Reads after "Draft from".
 */
export function draftWhenLabel(savedAt: number, now: number): string {
  const saved = new Date(savedAt);
  // Calendar days apart, robust to DST (a day can be 23 or 25 hours).
  const days = Math.round((startOfDay(now) - startOfDay(savedAt)) / 86_400_000);
  const hour = saved.getHours();
  if (days <= 0) {
    if (hour < 5) return "last night";
    if (hour < 12) return "this morning";
    if (hour < 17) return "this afternoon";
    return "this evening";
  }
  if (days === 1) return hour >= 21 ? "last night" : "yesterday";
  if (days < 7) return WEEKDAYS[saved.getDay()];
  return `${MONTHS[saved.getMonth()]} ${saved.getDate()}`;
}

/** A draft's first line of writing, cut at a word near `max` characters. */
export function draftExcerpt(reflection: string, max = 48): string {
  const line = reflection.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/**
 * What a draft is called in the drafts list: its first words, or for one
 * with only photos, how many ("2 photos"), or for one with only a
 * recording, "Voice recording".
 */
export function draftTitle(draft: CaptureDraft): string {
  return (
    draftExcerpt(draft.reflection) ||
    photoCountLabel(draft.photos) ||
    (draft.voice ? "Voice recording" : "") ||
    draft.song?.title ||
    "Draft"
  );
}

/**
 * A drafts-list row's meta: the song, how many photos and the recording's
 * length (unless the title already says so) and when.
 */
export function draftMeta(draft: CaptureDraft, now: number): string {
  const excerpt = draftExcerpt(draft.reflection);
  const photos = excerpt ? photoCountLabel(draft.photos) : "";
  const voice = draft.voice && (excerpt || photoCountLabel(draft.photos)) ? `Voice ${voiceTimeLabel(draft.voice.durationMs)}` : "";
  return [draft.song?.title, photos, voice, draftWhenLabel(draft.savedAt, now)].filter(Boolean).join(" · ");
}

/**
 * The "Continue a draft" row's subtitle: the one draft's words and its song
 * ("Dad's truck · Harvest Moon"; the song alone when that's the title), or
 * how many.
 */
export function continueDraftSubtitle(drafts: readonly CaptureDraft[]): string {
  if (drafts.length === 1) {
    const title = draftTitle(drafts[0]);
    const song = drafts[0].song?.title;
    return song && song !== title ? `${title} · ${song}` : title;
  }
  return `${drafts.length} drafts`;
}

/**
 * A capture screen's hold on its draft.
 * - "loading": a blank capture is checking for a draft to pick up; writes wait,
 *   or an empty first write could race the read.
 * - "open": writes go to this capture's own id.
 * - "saved": the moment is saved. Nothing is written again, or a late debounce
 *   or the flush on leaving would bring the draft back after the save.
 * - "discarded": the user closed capture and chose Discard. Same rule: the
 *   flush on leaving mustn't write the draft back.
 */
export type DraftPhase = "loading" | "open" | "saved" | "discarded";

export interface DraftSession {
  id: string;
  phase: DraftPhase;
}

export function startDraftSession(id: string, prefilled: boolean): DraftSession {
  return { id, phase: prefilled ? "open" : "loading" };
}

/** After the read: a picked-up draft's id becomes this capture's own. */
export function afterDraftLoad(session: DraftSession, pickedUp: CaptureDraft | null): DraftSession {
  if (session.phase !== "loading") return session;
  return { id: pickedUp?.id ?? session.id, phase: "open" };
}

export function afterMomentSaved(session: DraftSession): DraftSession {
  return { ...session, phase: "saved" };
}

export function afterDraftDiscarded(session: DraftSession): DraftSession {
  return { ...session, phase: "discarded" };
}

export function canWriteDraft(session: DraftSession | null): session is DraftSession {
  return session?.phase === "open";
}

export function newDraftId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Storage ─────────────────────────────────────────────────────────────────

function isDraft(value: unknown): value is CaptureDraft {
  const d = value as CaptureDraft | null;
  return !!d && typeof d.id === "string" && typeof d.reflection === "string" && typeof d.savedAt === "number";
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNumberOrNull = (v: unknown): v is number | null => v === null || typeof v === "number";

function isDraftPhoto(v: unknown): v is DraftPhoto {
  const p = v as DraftPhoto | null;
  return (
    !!p &&
    typeof p.uri === "string" &&
    (p.assetId == null || typeof p.assetId === "string") &&
    (p.videoMs == null || typeof p.videoMs === "number")
  );
}

/**
 * A stored draft, with any detail that doesn't read right left off rather
 * than losing the whole draft. Older drafts simply have none of them.
 */
function readDraft(value: unknown): CaptureDraft | null {
  if (!isDraft(value)) return null;
  const d = value as CaptureDraft & Record<string, unknown>;
  const draft: CaptureDraft = { id: d.id, reflection: d.reflection, song: d.song ?? null, savedAt: d.savedAt };
  if (d.v === 2) draft.v = 2;
  if (Array.isArray(d.photos)) draft.photos = d.photos.filter(isDraftPhoto);
  if (Array.isArray(d.moods)) draft.moods = d.moods.filter(isString);
  if (Array.isArray(d.people)) draft.people = d.people.filter(isString);
  if (Array.isArray(d.peopleLinks)) {
    draft.peopleLinks = d.peopleLinks.filter(
      (l): l is PersonLink => !!l && typeof l.name === "string" && typeof l.friendId === "string"
    );
  }
  if (isNumberOrNull(d.date)) draft.date = d.date;
  const place = d.place as DraftPlace | null | undefined;
  if (place && typeof place.name === "string" && isNumberOrNull(place.lat) && isNumberOrNull(place.lng)) {
    draft.place = { name: place.name, lat: place.lat, lng: place.lng };
  }
  if (typeof d.partMs === "number" && Number.isFinite(d.partMs) && d.partMs >= 0) draft.partMs = d.partMs;
  const voice = d.voice as DraftVoice | null | undefined;
  if (voice && typeof voice.uri === "string" && typeof voice.durationMs === "number" && Number.isFinite(voice.durationMs)) {
    draft.voice = { uri: voice.uri, durationMs: voice.durationMs };
  }
  const album = d.album as DraftAlbum | null | undefined;
  if (album && typeof album.id === "string" && typeof album.name === "string") {
    draft.album = { id: album.id, name: album.name };
  }
  return draft;
}

/** Parses the stored list and folds in a draft from the single-draft era. */
export function parseStoredDrafts(raw: string | null, legacyRaw: string | null): CaptureDraft[] {
  const drafts: CaptureDraft[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const draft = readDraft(item);
        if (draft) drafts.push(draft);
      }
    }
  } catch {}
  try {
    const legacy = legacyRaw ? (JSON.parse(legacyRaw) as Omit<CaptureDraft, "id">) : null;
    if (legacy && typeof legacy.reflection === "string" && typeof legacy.savedAt === "number") {
      if (!drafts.some((d) => d.id === LEGACY_ID)) {
        drafts.push({ id: LEGACY_ID, reflection: legacy.reflection, song: legacy.song ?? null, savedAt: legacy.savedAt });
      }
    }
  } catch {}
  return drafts;
}

// One storage operation at a time: each reads the list, changes it and writes
// it back, so two in flight would otherwise lose one of the changes.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => {});
  return run;
}

async function readDrafts(userId: string): Promise<CaptureDraft[]> {
  const [raw, legacyRaw] = await Promise.all([
    AsyncStorage.getItem(key(userId)),
    AsyncStorage.getItem(legacyKey(userId)),
  ]);
  return parseStoredDrafts(raw, legacyRaw);
}

async function writeDrafts(userId: string, drafts: CaptureDraft[]): Promise<void> {
  if (drafts.length) await AsyncStorage.setItem(key(userId), JSON.stringify(drafts));
  else await AsyncStorage.removeItem(key(userId));
  // Folded into the list by readDrafts, so the old key can go.
  await AsyncStorage.removeItem(legacyKey(userId));
  // Kept photo copies of drafts that have gone, or of photos taken off one,
  // and voice takes no draft points at any more.
  pruneDraftFiles(userId, keptFileNames(drafts, userId));
  pruneVoiceFiles(userId, keptVoiceNames(drafts, userId));
}

// Drafts picked up by a capture screen that's still open, so a second
// capture opened over it doesn't pick up the same one and write over it.
const held = new Set<string>();

/**
 * Reads the drafts and returns the one this capture should pick up, if any.
 * The capture holds it until it calls releaseDraft on leaving.
 */
export function loadDraftToPickUp(
  userId: string,
  opts: { prefilled: boolean; typed: () => string; draftId?: string }
): Promise<CaptureDraft | null> {
  return serial(async () => {
    try {
      const free = (await readDrafts(userId)).filter((d) => !held.has(d.id));
      const draft = draftToPickUp(
        free,
        { prefilled: opts.prefilled, typed: opts.typed(), draftId: opts.draftId },
        Date.now()
      );
      if (draft) held.add(draft.id);
      return draft;
    } catch {
      return null;
    }
  });
}

/**
 * Drafts a capture could pick up right now, newest first: live, and not held
 * by a capture that's open (for "Continue a draft" in the long-press menu).
 */
export function listCaptureDrafts(userId: string): Promise<CaptureDraft[]> {
  return serial(async () => {
    try {
      const live = liveDrafts(await readDrafts(userId), Date.now());
      // An expired draft's kept photos and takes go even when nothing has
      // been written since.
      pruneDraftFiles(userId, keptFileNames(live, userId));
      pruneVoiceFiles(userId, keptVoiceNames(live, userId));
      return live.filter((d) => !held.has(d.id));
    } catch {
      return [];
    }
  });
}

/** The capture holding this draft has closed: another may pick it up. */
export function releaseDraft(id: string): void {
  held.delete(id);
}

/**
 * Writes this capture's draft (or takes it out when there's nothing worth
 * keeping). Photos that need one get a copy kept with the draft first; a
 * voice take is already in the app's documents and is stored relative to them.
 */
export function saveCaptureDraft(
  userId: string,
  id: string,
  content: DraftContent,
  given: DraftGiven = {}
): Promise<void> {
  return serial(async () => {
    try {
      const next = withDraft(await readDrafts(userId), id, content, Date.now(), given);
      const mine = next.find((d) => d.id === id);
      const photos = mine?.photos?.length ? await keepDraftPhotos(userId, id, mine.photos) : null;
      const voice = mine?.voice ? storedDraftVoice(mine.voice) : null;
      await writeDrafts(
        userId,
        photos || voice
          ? next.map((d) => (d.id === id ? { ...d, ...(photos ? { photos } : {}), ...(voice ? { voice } : {}) } : d))
          : next
      );
    } catch {}
  });
}

/** Takes one capture's draft out: its moment was saved, or "Start fresh". */
export function discardCaptureDraft(userId: string, id: string): Promise<void> {
  return serial(async () => {
    try {
      await writeDrafts(userId, withoutDraft(await readDrafts(userId), id, Date.now()));
    } catch {}
  });
}

/** Every draft for this user, and their kept photos and takes (sign out, account deletion). */
export function clearCaptureDraft(userId: string): Promise<void> {
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(key(userId));
      await AsyncStorage.removeItem(legacyKey(userId));
    } catch {}
    deleteDraftFiles(userId);
    deleteVoiceFiles(userId);
  });
}
