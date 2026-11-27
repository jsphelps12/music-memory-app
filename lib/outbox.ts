import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { SaveMomentInput } from "@/lib/saveMoment";
import {
  deleteAllOutboxFiles,
  deleteOutboxFiles,
  keepOutboxFiles,
  liveOutboxUri,
  pruneOutboxFiles,
} from "@/lib/outboxFiles";

/**
 * The outbox: moments waiting to save (docs/PLAN-1.5.md, "5. Offline saves").
 * When capture can't save (no connection, a failed save), the moment goes
 * here instead of failing, per signed-in user, and lib/outboxFlush.ts saves
 * each one when the connection comes back.
 *
 * Each queued moment keeps its own id, the moment id it will be saved under,
 * so a try that landed but lost its response can never make a second moment
 * (saveMoment reads the row back). Its photos (and voice recording) are
 * copied into the app's documents (lib/outboxFiles.ts), so iOS clearing a
 * cache can't lose them.
 *
 * A failed try is remembered with what kind of failure it was:
 * - "offline": no connection. Tried again whenever a flush runs (the
 *   connection coming back, the app coming to the foreground); never counts
 *   toward giving up.
 * - "server": the server failed (a 5xx, a timeout inside the database).
 *   Tried again after a growing wait (30 s, 2 min, 10 min, then hourly).
 * - "rejected": the save was refused in a way retrying won't fix (a
 *   validation or permission error), or the server failed GIVE_UP_AFTER
 *   times. Stays in the list, visible, and is never tried automatically:
 *   the person can try again or discard it.
 *
 * The rules are pure functions below (tested in lib/__tests__/outbox.test.ts);
 * the storage calls run one at a time so two changes can never lose one.
 * Nothing in the outbox leaves the phone until it saves.
 */

export type OutboxErrorKind = "offline" | "server" | "rejected";

/** SaveMomentInput keys whose values can't go through JSON (functions, promises). */
type JsonSafeKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends ((...args: never[]) => unknown) | PromiseLike<unknown> ? never : K;
}[keyof T];

/**
 * What a queued moment keeps of SaveMomentInput: everything JSON can hold.
 * The preview lookup promise is left out (the save looks it up again), the
 * id lives on the item, and the date is stored as epoch ms. A field added to
 * SaveMomentInput later (a voice recording) is kept as it is, with no change
 * here; a local file URI in `photos` or `voiceUri` is rewritten to its kept
 * copy.
 */
export type OutboxInput = Pick<
  SaveMomentInput,
  Exclude<JsonSafeKeys<SaveMomentInput>, "prefetchedPreview" | "momentId" | "momentDate">
> & {
  /** The moment's date as epoch ms; null for "No specific date". */
  momentDate: number | null;
};

export interface OutboxItem {
  /** The moment's id: every try saves under it. */
  id: string;
  userId: string;
  queuedAt: number;
  /** Tries that reached the server and failed. Offline tries don't count. */
  attempts: number;
  lastAttemptAt: number | null;
  lastErrorKind?: OutboxErrorKind;
  /** A friendly reason for the last failure (lib/errors.ts), for a rejected item's row. */
  lastError?: string;
  input: OutboxInput;
}

export interface OutboxFailure {
  kind: OutboxErrorKind;
  message?: string;
}

/** The wait after the 1st, 2nd, 3rd and every later server failure. */
export const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000] as const;
/** At most how often a timer looks again at items that failed offline. */
export const OFFLINE_RETRY_MS = 30_000;
/** Server failures before an item stops being retried and waits for the person. */
export const GIVE_UP_AFTER = 8;

const key = (userId: string) => `capture_outbox_v1_${userId}`;
/** Every outbox key starts with this (lib/signOutKeys.ts). */
export const OUTBOX_KEY_PREFIX = "capture_outbox_";
export const outboxKey = key;

// ── Pure rules ──────────────────────────────────────────────────────────────

function isThenable(v: unknown): boolean {
  return !!v && typeof (v as { then?: unknown }).then === "function";
}

/** What the outbox stores of a save: a JSON-only copy, the date as epoch ms. */
export function toOutboxInput(input: SaveMomentInput): OutboxInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "prefetchedPreview" || k === "momentId" || k === "momentDate") continue;
    if (v === undefined || typeof v === "function" || isThenable(v)) continue;
    out[k] = v;
  }
  out.momentDate = input.momentDate ? input.momentDate.getTime() : null;
  return JSON.parse(JSON.stringify(out)) as OutboxInput;
}

/**
 * A queued moment back as a save: its own id, the date as a Date, and every
 * kept file URI resolved by `live` (stored → a file URI in this install).
 */
export function fromOutboxInput(item: OutboxItem, live: (stored: string) => string = (s) => s): SaveMomentInput {
  const input = withFileUris(item.input, live);
  const ms = input.momentDate;
  return {
    ...(input as Omit<OutboxInput, "momentDate">),
    momentDate: typeof ms === "number" ? new Date(ms) : null,
    momentId: item.id,
  };
}

/** A local file (not a remote URL or a Photos `ph://` reference). */
export function isLocalFileUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("/");
}

/** The local files a queued moment needs kept: its photos and voice recording. */
export function outboxFileUris(input: Pick<OutboxInput, "photos" | "voiceUri">): string[] {
  const voice = input.voiceUri;
  const uris = [...(input.photos ?? []), ...(typeof voice === "string" ? [voice] : [])];
  return [...new Set(uris.filter(isLocalFileUri))];
}

/** The input with its photo and voice URIs mapped (to kept copies, or back to live files). */
export function withFileUris<T extends Pick<OutboxInput, "photos">>(input: T, map: (uri: string) => string): T {
  const out: Record<string, unknown> = { ...input, photos: (input.photos ?? []).map(map) };
  if (typeof out.voiceUri === "string") out.voiceUri = map(out.voiceUri);
  return out as T;
}

export function isRejected(item: OutboxItem): boolean {
  return item.lastErrorKind === "rejected";
}

/** The wait after `failures` server failures (1 = the first). */
export function retryDelayMs(failures: number): number {
  const i = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i];
}

/**
 * When an item may next be tried; null for never (rejected). Never tried, or
 * last failed offline: straight away (whether there's a connection is the
 * flush's question). Failed on the server: after the backoff.
 */
export function dueAt(item: OutboxItem): number | null {
  if (isRejected(item)) return null;
  if (item.lastAttemptAt == null) return item.queuedAt;
  if (item.lastErrorKind === "server") return item.lastAttemptAt + retryDelayMs(item.attempts);
  return item.lastAttemptAt;
}

export function isDue(item: OutboxItem, now: number): boolean {
  const at = dueAt(item);
  return at != null && now >= at;
}

/** Oldest first, the order they save in. */
export function inQueuedOrder(items: readonly OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => a.queuedAt - b.queuedAt);
}

/** The next item to try, oldest first, leaving out ones already tried this run. */
export function nextToTry(
  items: readonly OutboxItem[],
  now: number,
  skip: ReadonlySet<string> = new Set()
): OutboxItem | null {
  return inQueuedOrder(items).find((i) => !skip.has(i.id) && isDue(i, now)) ?? null;
}

/**
 * When a timer should next run a flush; null when nothing is waiting on time.
 * Items that failed offline are mostly retried by the connection coming back,
 * so the timer looks at them at most every OFFLINE_RETRY_MS.
 */
export function nextWakeAt(items: readonly OutboxItem[]): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    const at =
      item.lastErrorKind === "offline" && item.lastAttemptAt != null
        ? item.lastAttemptAt + OFFLINE_RETRY_MS
        : dueAt(item);
    if (at != null && (soonest == null || at < soonest)) soonest = at;
  }
  return soonest;
}

/** Newest first, for the Journal. */
export function outboxForDisplay(items: readonly OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => b.queuedAt - a.queuedAt);
}

/**
 * The list with an item queued. Queuing the same moment again replaces it
 * in place (keeping when it was first queued), so it's never there twice.
 */
export function withQueued(items: readonly OutboxItem[], item: OutboxItem): OutboxItem[] {
  const existing = items.find((i) => i.id === item.id);
  if (!existing) return [...items, item];
  return items.map((i) => (i.id === item.id ? { ...item, queuedAt: existing.queuedAt } : i));
}

export function withoutItem(items: readonly OutboxItem[], id: string): OutboxItem[] {
  return items.filter((i) => i.id !== id);
}

/** An item after a failed try. */
export function afterFailure(item: OutboxItem, failure: OutboxFailure, now: number): OutboxItem {
  const next: OutboxItem = { ...item, lastAttemptAt: now, lastErrorKind: failure.kind };
  if (failure.message) next.lastError = failure.message;
  else delete next.lastError;
  if (failure.kind === "server") {
    next.attempts = item.attempts + 1;
    if (next.attempts >= GIVE_UP_AFTER) next.lastErrorKind = "rejected";
  }
  return next;
}

/** A rejected item the person asked to try again: as if just queued. */
export function afterRetryAsked(item: OutboxItem): OutboxItem {
  const next: OutboxItem = { ...item, attempts: 0, lastAttemptAt: null };
  delete next.lastError;
  delete next.lastErrorKind;
  return next;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A stored item, or null when it doesn't read right. The input is kept as stored. */
function readItem(value: unknown): OutboxItem | null {
  if (!isObject(value)) return null;
  const { id, userId, queuedAt, attempts, lastAttemptAt, lastErrorKind, lastError, input } = value;
  if (typeof id !== "string" || typeof userId !== "string" || typeof queuedAt !== "number") return null;
  if (!isObject(input) || !isObject(input.song) || !Array.isArray(input.photos)) return null;
  const item: OutboxItem = {
    id,
    userId,
    queuedAt,
    attempts: typeof attempts === "number" ? attempts : 0,
    lastAttemptAt: typeof lastAttemptAt === "number" ? lastAttemptAt : null,
    input: input as unknown as OutboxInput,
  };
  if (lastErrorKind === "offline" || lastErrorKind === "server" || lastErrorKind === "rejected") {
    item.lastErrorKind = lastErrorKind;
  }
  if (typeof lastError === "string") item.lastError = lastError;
  return item;
}

export function parseStoredOutbox(raw: string | null): OutboxItem[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readItem).filter((i): i is OutboxItem => !!i);
  } catch {
    return [];
  }
}

// ── Change listeners ────────────────────────────────────────────────────────

type Listener = (userId: string) => void;
const listeners = new Set<Listener>();

/** Called with the user id after every change to that user's outbox. */
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(userId: string): void {
  for (const l of [...listeners]) {
    try {
      l(userId);
    } catch {}
  }
}

// ── Storage ─────────────────────────────────────────────────────────────────

// One storage operation at a time: each reads the list, changes it and writes
// it back, so two in flight would otherwise lose one of the changes (a save
// finishing while capture queues another).
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => {});
  return run;
}

async function readItems(userId: string): Promise<OutboxItem[]> {
  return parseStoredOutbox(await AsyncStorage.getItem(key(userId)));
}

async function writeItems(userId: string, items: OutboxItem[]): Promise<void> {
  if (items.length) await AsyncStorage.setItem(key(userId), JSON.stringify(items));
  else await AsyncStorage.removeItem(key(userId));
  notify(userId);
}

/**
 * Queues a moment to save later. Its id is `input.momentId` when capture
 * already picked one (it should: then a save that failed after landing is
 * the same moment, not a second one), else a new one. Its files are copied
 * into the outbox first. `failure` records the try that just failed, so the
 * backoff starts from it. Throws when the outbox can't be written (capture
 * then keeps its draft and shows the error).
 */
export function enqueueOutbox(
  userId: string,
  input: SaveMomentInput,
  opts: { failure?: OutboxFailure; now?: number } = {}
): Promise<OutboxItem> {
  return serial(async () => {
    const now = opts.now ?? Date.now();
    const id = input.momentId ?? Crypto.randomUUID();
    const stored = toOutboxInput(input);
    const kept = await keepOutboxFiles(userId, id, outboxFileUris(stored));
    let item: OutboxItem = {
      id,
      userId,
      queuedAt: now,
      attempts: 0,
      lastAttemptAt: null,
      input: withFileUris(stored, (uri) => kept[uri] ?? uri),
    };
    if (opts.failure) item = afterFailure(item, opts.failure, now);
    await writeItems(userId, withQueued(await readItems(userId), item));
    return item;
  });
}

/** This user's queued moments, oldest first. Empty when it can't be read. */
export function listOutbox(userId: string): Promise<OutboxItem[]> {
  return serial(async () => {
    try {
      return inQueuedOrder(await readItems(userId));
    } catch {
      return [];
    }
  });
}

/**
 * How many moments haven't saved yet, rejected ones included (sign-out asks
 * first). Throws when the outbox can't be read, so a caller can ask anyway
 * rather than take an unreadable outbox for an empty one.
 */
export function outboxCount(userId: string): Promise<number> {
  return serial(async () => (await readItems(userId)).length);
}

/** Records a failed try. */
export function recordOutboxFailure(userId: string, id: string, failure: OutboxFailure, now = Date.now()): Promise<void> {
  return serial(async () => {
    const items = await readItems(userId);
    if (!items.some((i) => i.id === id)) return;
    await writeItems(
      userId,
      items.map((i) => (i.id === id ? afterFailure(i, failure, now) : i))
    );
  });
}

/** Takes a moment out with its kept files: it saved, or the person discarded it. */
export function removeOutboxItem(userId: string, id: string): Promise<void> {
  return serial(async () => {
    const items = await readItems(userId);
    if (items.some((i) => i.id === id)) await writeItems(userId, withoutItem(items, id));
    deleteOutboxFiles(userId, id);
  });
}

/** The person asked to try a rejected moment again: the next flush tries it. */
export function retryOutboxItem(userId: string, id: string): Promise<void> {
  return serial(async () => {
    const items = await readItems(userId);
    if (!items.some((i) => i.id === id)) return;
    await writeItems(
      userId,
      items.map((i) => (i.id === id ? afterRetryAsked(i) : i))
    );
  });
}

/** Deletes kept files that no queued moment points at (an interrupted cleanup). */
export function pruneOutbox(userId: string): Promise<void> {
  return serial(async () => {
    try {
      const items = await readItems(userId);
      pruneOutboxFiles(userId, new Set(items.map((i) => i.id)));
    } catch {}
  });
}

/** Every queued moment and its files (sign-out, account deletion). Never throws. */
export function clearOutbox(userId: string): Promise<void> {
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(key(userId));
    } catch {}
    deleteAllOutboxFiles(userId);
    notify(userId);
  });
}

/** A queued moment as a save, with its kept files as file URIs in this install. */
export function outboxSaveInput(item: OutboxItem): SaveMomentInput {
  return fromOutboxInput(item, liveOutboxUri);
}
