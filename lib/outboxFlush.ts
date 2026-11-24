import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";
import { saveMoment, type SaveMomentInput, type SaveMomentResult } from "@/lib/saveMoment";
import { friendlyError } from "@/lib/errors";
import { isOnline } from "@/lib/appFocus";
import {
  enqueueOutbox,
  listOutbox,
  nextToTry,
  nextWakeAt,
  outboxSaveInput,
  pruneOutbox,
  recordOutboxFailure,
  removeOutboxItem,
  subscribeOutbox,
  type OutboxErrorKind,
  type OutboxFailure,
  type OutboxItem,
} from "@/lib/outbox";

export { clearOutbox, outboxCount } from "@/lib/outbox";

/**
 * Saving the outbox (lib/outbox.ts): moments queued while there was no
 * connection, or whose save failed, are saved here one at a time, oldest
 * first, when the connection comes back, when the app comes to the
 * foreground, and when a backoff runs out.
 *
 * Each try is a normal saveMoment under the moment's own id: the preview
 * lookup, the photo uploads, the row. A try that landed but lost its
 * response is found by that id on the next one, so nothing saves twice.
 *
 * flushOutbox takes its dependencies (the save, the storage, the clock, the
 * connection) so its rules are tested without React Native
 * (lib/__tests__/outboxFlush.test.ts); startOutboxFlushing wires the real
 * ones and the triggers.
 */

// ── Classifying a failed try ────────────────────────────────────────────────

const NETWORK_MESSAGES = [
  "network request failed",
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "load failed",
  "abort",
  "timed out",
  "timeout",
  "appears to be offline",
  "not connected to the internet",
  "network connection was lost",
  "could not connect to the server",
];

const REJECTED_MESSAGES = [
  "row-level security",
  "permission denied",
  "payload too large",
  "file too large",
  // saveMoment: a video whose Photos link can't be found. Retrying on its own
  // won't find it; the person decides.
  "couldn't be linked to your photos library",
];

function fieldOf(err: object, name: string): unknown {
  return (err as Record<string, unknown>)[name];
}

/** An HTTP status on the error (storage errors carry `status` or `statusCode`). */
function statusOf(err: object): number | null {
  for (const name of ["status", "statusCode"]) {
    const v = fieldOf(err, name);
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 100 && n < 600) return n;
  }
  return null;
}

/** What a Postgres / PostgREST error code says, or null when it says nothing. */
function kindForCode(code: string): OutboxErrorKind | null {
  // The id is already there: a try that landed. The next try reads it back.
  if (code === "23505") return "server";
  if (/^PGRST00\d$/.test(code)) return "server"; // PostgREST couldn't reach the database
  if (/^PGRST3\d\d$/.test(code)) return "server"; // JWT: a session refresh fixes it
  if (/^PGRST[12]\d\d$/.test(code)) return "rejected"; // a bad request, or the schema lacks something
  if (code.length !== 5) return null;
  const cls = code.slice(0, 2);
  // Connection, resources, operator intervention (57014 cancelled), system,
  // internal, serialization / deadlock, lock not available: all pass.
  if (["08", "53", "57", "58", "XX", "40"].includes(cls) || code === "55P03") return "server";
  // Data exceptions, integrity (not-null, check, foreign key), permission and
  // undefined objects, a trigger's raise: the same row fails the same way.
  if (["22", "23", "42", "44", "P0"].includes(cls)) return "rejected";
  return null;
}

/**
 * What kind of failure a save threw, for the outbox. Pure; tested.
 * - "offline": the request never got an answer (no connection, a timeout, an
 *   abort). Retrying when the connection is back will work.
 * - "server": the server failed (5xx, 429, a database hiccup, a lost session)
 *   or the error isn't recognised. Retried with backoff.
 * - "rejected": the server refused this moment (4xx, a validation or
 *   permission error). Retrying won't fix it.
 */
export function classifyOutboxError(err: unknown): OutboxErrorKind {
  if (!err || typeof err !== "object") {
    const text = String(err ?? "").toLowerCase();
    return NETWORK_MESSAGES.some((m) => text.includes(m)) ? "offline" : "server";
  }
  const name = fieldOf(err, "name");
  if (name === "AbortError" || name === "TimeoutError") return "offline";

  const code = fieldOf(err, "code");
  if (typeof code === "string" && code) {
    const byCode = kindForCode(code);
    if (byCode) return byCode;
  }

  const status = statusOf(err);
  if (status != null) {
    if (status === 408) return "offline";
    if (status >= 500 || status === 429 || status === 401) return "server";
    if (status >= 400) return "rejected";
  }

  const message = String(fieldOf(err, "message") ?? "").toLowerCase();
  if (NETWORK_MESSAGES.some((m) => message.includes(m))) return "offline";
  if (REJECTED_MESSAGES.some((m) => message.includes(m))) return "rejected";
  return "server";
}

/** A failed try as the outbox records it. */
export function failureFrom(err: unknown): OutboxFailure {
  return { kind: classifyOutboxError(err), message: friendlyError(err) };
}

/**
 * Capture's call when a save fails: queues the moment with that failure
 * recorded, or returns null without queuing when retrying won't fix it
 * (capture then shows the error, as it does today). Pass the same
 * `momentId` the failed save used, so a save that landed after all isn't
 * saved a second time.
 */
export async function queueFailedSave(
  userId: string,
  input: SaveMomentInput,
  err: unknown
): Promise<OutboxItem | null> {
  const failure = failureFrom(err);
  if (failure.kind === "rejected") return null;
  return enqueueOutbox(userId, input, { failure });
}

// ── Flushing ────────────────────────────────────────────────────────────────

export interface OutboxStore {
  list(userId: string): Promise<OutboxItem[]>;
  /** Takes the item and its kept files out. */
  remove(userId: string, id: string): Promise<void>;
  recordFailure(userId: string, id: string, failure: OutboxFailure, now: number): Promise<void>;
}

export interface FlushDeps {
  save: (input: SaveMomentInput) => Promise<SaveMomentResult>;
  store: OutboxStore;
  /** The item as a save (kept files resolved). */
  toSaveInput: (item: OutboxItem) => SaveMomentInput;
  now: () => number;
  isOnline: () => boolean | Promise<boolean>;
  /** After each moment saves: the caller refreshes the Journal and caches. */
  onSaved?: (result: SaveMomentResult, item: OutboxItem) => void;
  /** Server and rejected failures (Sentry in the app). */
  report?: (err: unknown, item: OutboxItem, kind: OutboxErrorKind) => void;
  /** False once whoever started the flush has gone (sign-out): it stops before the next item. */
  isActive?: () => boolean;
}

export interface FlushResult {
  /** Why nothing was tried: another flush is running, or there's no connection. */
  skipped: "busy" | "offline" | null;
  saved: string[];
  failed: { id: string; kind: OutboxErrorKind }[];
  /** The run stopped early on a failure that means the connection is gone. */
  stoppedOffline: boolean;
}

// Only one flush at a time, app-wide: two would try the same moment at once.
let running: Promise<FlushResult> | null = null;

/** Whether a flush is running now. */
export function isFlushing(): boolean {
  return running != null;
}

/** Resolves when the running flush (if any) has finished. */
export function whenFlushIdle(): Promise<void> {
  return (running ?? Promise.resolve()).then(
    () => {},
    () => {}
  );
}

/**
 * Tries this user's due moments one at a time, oldest first. A save removes
 * the item and its files and calls onSaved. A failure is recorded: offline
 * stops the run (the rest would fail the same way), a server failure moves on
 * to the next, a rejected one is left for the person. The list is read again
 * after each item, so a moment queued during the run is tried in it.
 */
export function flushOutbox(userId: string, deps: FlushDeps): Promise<FlushResult> {
  if (running) return Promise.resolve({ skipped: "busy", saved: [], failed: [], stoppedOffline: false });
  const run = runFlush(userId, deps).finally(() => {
    running = null;
  });
  running = run;
  return run;
}

async function runFlush(userId: string, deps: FlushDeps): Promise<FlushResult> {
  const result: FlushResult = { skipped: null, saved: [], failed: [], stoppedOffline: false };
  const active = deps.isActive ?? (() => true);

  let online = true;
  try {
    online = await deps.isOnline();
  } catch {}
  if (!online) return { ...result, skipped: "offline" };

  const tried = new Set<string>();
  while (active()) {
    const item = nextToTry(await deps.store.list(userId), deps.now(), tried);
    if (!item) break;
    tried.add(item.id);

    let saved: SaveMomentResult;
    try {
      saved = await deps.save(deps.toSaveInput(item));
    } catch (err) {
      const failure = failureFrom(err);
      result.failed.push({ id: item.id, kind: failure.kind });
      await deps.store.recordFailure(userId, item.id, failure, deps.now()).catch(() => {});
      if (failure.kind !== "offline") deps.report?.(err, item, failure.kind);
      if (failure.kind === "offline") {
        result.stoppedOffline = true;
        break;
      }
      continue;
    }

    result.saved.push(item.id);
    // If this fails the item stays, and the next try finds the moment by its
    // id and only cleans up.
    await deps.store.remove(userId, item.id).catch(() => {});
    try {
      deps.onSaved?.(saved, item);
    } catch {}
  }
  return result;
}

// ── In the app ──────────────────────────────────────────────────────────────

/** Never sooner than this after a change, so a burst of writes runs one flush. */
const MIN_WAKE_MS = 1_000;
/** A long timer is re-armed at most this far ahead. */
const MAX_WAKE_MS = 60 * 60_000;

async function netIsOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return isOnline(state.isConnected, state.isInternetReachable);
  } catch {
    return true;
  }
}

function reportToSentry(err: unknown, item: OutboxItem, kind: OutboxErrorKind): void {
  Sentry.captureException(err, {
    tags: { area: "outbox", outbox_error: kind },
    extra: { attempts: item.attempts + 1 },
  });
}

const appStore: OutboxStore = {
  list: listOutbox,
  remove: removeOutboxItem,
  recordFailure: recordOutboxFailure,
};

/**
 * Saves this user's outbox while they're signed in: once now, whenever the
 * connection comes back, whenever the app comes back to the foreground, and
 * when the next backoff runs out. Call from the signed-in root; returns the
 * unsubscribe (call it on sign-out). `onSaved` runs after each moment saves
 * (mark the timeline stale with it, invalidate the moment caches).
 */
export function startOutboxFlushing(
  userId: string,
  onSaved: (result: SaveMomentResult, item: OutboxItem) => void
): () => void {
  let active = true;
  let offline = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deps: FlushDeps = {
    save: saveMoment,
    store: appStore,
    toSaveInput: outboxSaveInput,
    now: Date.now,
    isOnline: netIsOnline,
    onSaved,
    report: reportToSentry,
    isActive: () => active,
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  // Arms one timer for the next item waiting on time. Not while offline (the
  // connection coming back starts the next run) or while a flush runs (it
  // arms one when it ends).
  const schedule = async () => {
    if (!active || offline || isFlushing()) return;
    const at = nextWakeAt(await listOutbox(userId));
    clearTimer();
    if (at == null || !active || offline || isFlushing()) return;
    const wait = Math.min(Math.max(at - Date.now(), MIN_WAKE_MS), MAX_WAKE_MS);
    timer = setTimeout(() => void run(), wait);
  };

  const run = async () => {
    if (!active) return;
    clearTimer();
    let result = await flushOutbox(userId, deps);
    if (result.skipped === "busy") {
      // Someone else's flush: wait for it, then make sure nothing's left due.
      await whenFlushIdle();
      if (!active) return;
      result = await flushOutbox(userId, deps);
      if (result.skipped === "busy") return;
    }
    offline = result.skipped === "offline";
    void schedule();
  };

  let wasOffline = false;
  const stopNet = NetInfo.addEventListener((state) => {
    if (!isOnline(state.isConnected, state.isInternetReachable)) {
      wasOffline = true;
      offline = true;
      clearTimer();
      return;
    }
    offline = false;
    if (wasOffline) {
      wasOffline = false;
      void run();
    }
  });

  let wasBackground = false;
  const appSub = AppState.addEventListener("change", (state) => {
    if (state === "background") wasBackground = true;
    else if (state === "active" && wasBackground) {
      wasBackground = false;
      void run();
    }
  });

  // Capture queued a moment, or the person asked to retry one.
  const stopOutbox = subscribeOutbox((changed) => {
    if (changed === userId) void schedule();
  });

  void pruneOutbox(userId).then(run);

  return () => {
    active = false;
    clearTimer();
    stopNet();
    appSub.remove();
    stopOutbox();
  };
}
