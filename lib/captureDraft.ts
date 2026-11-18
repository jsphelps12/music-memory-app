import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Song } from "@/types";

/**
 * Capture drafts: unsaved writing on the capture screen survives Cancel, a
 * crash or iOS killing the app.
 *
 * Each capture screen owns one draft, by id, and only ever writes or clears
 * that one. So a capture opened pre-filled (a shared song, Last week, From
 * before, a prompt, Identify) can never overwrite or wipe writing left in an
 * earlier capture: that draft waits, and the next blank capture picks it up.
 * A blank capture picks up the newest draft (or, opened from "Continue a
 * draft", exactly the one picked) and takes over its id. A draft goes away
 * when its own capture is saved, on "Discard" when closing capture, on "Start
 * fresh", when its text is emptied, or after a week.
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
}

export type DraftContent = Pick<CaptureDraft, "reflection" | "song">;

/** Older than a week and it's no longer "where you left off". */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A bound on storage, far above what a week of real use leaves behind. */
export const MAX_DRAFTS = 20;

const key = (userId: string) => `captureDrafts:${userId}`;
/** The single draft the first 1.4 builds kept, before drafts had ids. */
const legacyKey = (userId: string) => `captureDraft:${userId}`;
const LEGACY_ID = "legacy";

// ── Pure rules ──────────────────────────────────────────────────────────────

/**
 * Only writing is worth keeping; a song alone is two taps to redo. Text that
 * is exactly a starter or prompt the app put there isn't the user's writing.
 */
export function isWorthKeeping(reflection: string, templates: readonly string[] = []): boolean {
  const text = reflection.trim();
  if (!text) return false;
  return !templates.some((t) => t.trim() === text);
}

/** Drafts still worth offering, newest first. */
export function liveDrafts(drafts: readonly CaptureDraft[], now: number): CaptureDraft[] {
  return drafts
    .filter((d) => now - d.savedAt <= MAX_AGE_MS && isWorthKeeping(d.reflection))
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
  templates: readonly string[] = []
): CaptureDraft[] {
  const others = drafts.filter((d) => d.id !== id);
  if (!isWorthKeeping(content.reflection, templates)) return liveDrafts(others, now);
  return liveDrafts([{ id, reflection: content.reflection, song: content.song, savedAt: now }, ...others], now);
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
 * What a capture screen picks up as it opens: the newest draft, or exactly
 * the one asked for (`draftId`, from "Continue a draft"; if that one has gone,
 * nothing rather than a different one). Only for a blank capture (pre-filled
 * ones never pick one up), and only while nothing has been typed yet, so a
 * draft never replaces fresh writing.
 */
export function draftToPickUp(
  drafts: readonly CaptureDraft[],
  opts: { prefilled: boolean; typed: string; draftId?: string },
  now: number
): CaptureDraft | null {
  if (opts.prefilled || opts.typed.trim()) return null;
  if (opts.draftId) return draftById(drafts, opts.draftId, now);
  return liveDrafts(drafts, now)[0] ?? null;
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

/** The "Continue a draft" row's subtitle: the one draft's words, or how many. */
export function continueDraftSubtitle(drafts: readonly CaptureDraft[]): string {
  if (drafts.length === 1) return draftExcerpt(drafts[0].reflection);
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

/** Parses the stored list and folds in a draft from the single-draft era. */
export function parseStoredDrafts(raw: string | null, legacyRaw: string | null): CaptureDraft[] {
  const drafts: CaptureDraft[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) drafts.push(...parsed.filter(isDraft));
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
      return liveDrafts(await readDrafts(userId), Date.now()).filter((d) => !held.has(d.id));
    } catch {
      return [];
    }
  });
}

/** The capture holding this draft has closed: another may pick it up. */
export function releaseDraft(id: string): void {
  held.delete(id);
}

/** Writes this capture's draft (or takes it out when there's nothing worth keeping). */
export function saveCaptureDraft(
  userId: string,
  id: string,
  content: DraftContent,
  templates: readonly string[] = []
): Promise<void> {
  return serial(async () => {
    try {
      await writeDrafts(userId, withDraft(await readDrafts(userId), id, content, Date.now(), templates));
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

/** Every draft for this user (sign out, account deletion). */
export function clearCaptureDraft(userId: string): Promise<void> {
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(key(userId));
      await AsyncStorage.removeItem(legacyKey(userId));
    } catch {}
  });
}
