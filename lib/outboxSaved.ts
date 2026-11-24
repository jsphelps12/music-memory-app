import type { QueryClient } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { invalidateAlbumCaches, invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { checkAndNotifyMilestone } from "@/lib/notifications";
import { momentCreatedProperties } from "@/lib/outboxUi";
import type { OutboxItem } from "@/lib/outbox";
import type { SaveMomentResult } from "@/lib/saveMoment";

/**
 * What happens after the outbox saves a moment (lib/outboxFlush.ts calls it
 * through startOutboxFlushing, wired in app/_layout.tsx): the same follow-up
 * a save from capture does. The moment caches (and its album's) are
 * invalidated, the Journal is told with the saved moment for an instant
 * prepend, and moment_created fires with `from_outbox: true`. Server and
 * rejected failures go to Sentry from the flush itself, without content.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Called after each outbox save, once the timeline is marked stale. The
 * Journal listens while focused: it's often on screen when a flush runs,
 * and a focused screen otherwise only catches up on its next focus.
 */
export function subscribeOutboxSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function handleOutboxSaved(queryClient: QueryClient, userId: string, result: SaveMomentResult, item: OutboxItem): void {
  markTimelineStale(result.moment);
  invalidateMomentCaches(queryClient, userId);
  const albumId = item.input.selectedAlbum?.id;
  if (albumId) invalidateAlbumCaches(queryClient, userId, albumId);

  posthog.capture("moment_created", {
    ...momentCreatedProperties(item.input),
    from_outbox: true,
    queued_ms: Date.now() - item.queuedAt,
  });
  checkAndNotifyMilestone(userId).catch(() => {});

  for (const l of [...listeners]) {
    try {
      l();
    } catch {}
  }
}
