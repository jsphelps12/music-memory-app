import type { OutboxItem } from "@/lib/outbox";
import type { SaveMomentInput } from "@/lib/saveMoment";

/**
 * The words and analytics around offline saves (docs/PLAN-1.5.md, "5. Offline
 * saves"): the Journal's pending cards, the notice after capture queues a
 * moment, the sign-out question, and the event properties. Pure; tested in
 * lib/__tests__/outboxUi.test.ts.
 */

/** Shown once capture has put a moment in the outbox instead of saving it. */
export const QUEUED_NOTICE = "Saved on your phone. It'll go up when you're back online.";

/** A pending card's meta line, waiting on its own. */
export const PENDING_LABEL = "Saves when you're back online";
/** A rejected card's meta line, waiting for the person (Try again / Discard). */
export const REJECTED_LABEL = "Couldn't save";

export interface OutboxCardStatus {
  rejected: boolean;
  label: string;
  /** Why it was refused, when known (already a friendly message, lib/errors.ts). */
  reason: string | null;
}

/** What a pending card says about its moment. */
export function outboxCardStatus(item: Pick<OutboxItem, "lastErrorKind" | "lastError">): OutboxCardStatus {
  if (item.lastErrorKind === "rejected") {
    return { rejected: true, label: REJECTED_LABEL, reason: item.lastError?.trim() || null };
  }
  return { rejected: false, label: PENDING_LABEL, reason: null };
}

export interface SignOutAsk {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: true;
}

/**
 * The question sign-out asks first, or null when there's nothing to lose.
 * `count` is null when the outbox couldn't be read: ask anyway, since an
 * unreadable outbox may still hold moments.
 */
export function signOutOutboxAsk(count: number | null): SignOutAsk | null {
  if (count === 0) return null;
  const title =
    count == null
      ? "Some moments haven't saved yet"
      : count === 1
        ? "1 moment hasn't saved yet"
        : `${count} moments haven't saved yet`;
  return {
    title,
    message: count === 1 ? "It's only on this phone. Signing out deletes it." : "They're only on this phone. Signing out deletes them.",
    confirmLabel: "Sign out anyway",
    cancelLabel: "Stay signed in",
    destructive: true,
  };
}

/** The parts of a save the analytics look at (never the words, only counts and flags). */
export type MomentShape = Pick<
  SaveMomentInput,
  "song" | "reflection" | "moods" | "photos" | "locationResult" | "people" | "peopleLinks" | "selectedAlbum" | "captureSource"
>;

/**
 * moment_created's properties that come from the moment itself, the same for
 * a save from capture and one from the outbox. Capture adds its timings and
 * source; the outbox adds `from_outbox`.
 */
export function momentCreatedProperties(m: MomentShape) {
  const moods = m.moods ?? [];
  const people = m.people ?? [];
  return {
    song_title: m.song.title,
    song_artist: m.song.artistName,
    has_reflection: (m.reflection ?? "").trim().length > 0,
    has_mood: moods.length > 0,
    mood_count: moods.length,
    photo_count: m.photos.length,
    has_location: Boolean(m.locationResult),
    has_people: people.length > 0,
    has_people_links: (m.peopleLinks?.length ?? 0) > 0,
    has_collection: Boolean(m.selectedAlbum),
    capture_source: m.captureSource ?? null,
  };
}

/** Why capture queued instead of saving: no connection before trying, or a save that failed. */
export type QueuedReason = "offline" | "save_failed";

/** moment_queued_offline's properties: counts and flags only, no content. */
export function momentQueuedProperties(m: MomentShape, reason: QueuedReason) {
  return {
    reason,
    photo_count: m.photos.length,
    mood_count: (m.moods ?? []).length,
    has_reflection: (m.reflection ?? "").trim().length > 0,
    has_collection: Boolean(m.selectedAlbum),
    capture_source: m.captureSource ?? null,
  };
}
