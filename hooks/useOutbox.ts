import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isRejected, listOutbox, outboxForDisplay, subscribeOutbox, type OutboxItem } from "@/lib/outbox";

export interface OutboxState {
  /** Every moment that hasn't saved yet, newest first. */
  items: OutboxItem[];
  /** Waiting to save on their own ("Saves when you're back online"). */
  pending: OutboxItem[];
  /** Refused or given up on: they wait for the person (try again or discard). */
  rejected: OutboxItem[];
}

const EMPTY: OutboxState = { items: [], pending: [], rejected: [] };

function stateFor(items: readonly OutboxItem[]): OutboxState {
  const shown = outboxForDisplay(items);
  return {
    items: shown,
    pending: shown.filter((i) => !isRejected(i)),
    rejected: shown.filter(isRejected),
  };
}

/**
 * The signed-in user's outbox (lib/outbox.ts), for the Journal to show the
 * moments still waiting to save. Read on mount and again after every change
 * to that user's outbox (queued, saved, failed, discarded).
 */
export function useOutbox(): OutboxState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; outbox: OutboxState }>({ userId: null, outbox: EMPTY });

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const read = () => {
      void listOutbox(userId).then((items) => {
        if (live) setState({ userId, outbox: stateFor(items) });
      });
    };
    read();
    const stop = subscribeOutbox((changed) => {
      if (changed === userId) read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [userId]);

  // Never another account's outbox, even for the render before the read lands.
  return state.userId === userId && userId ? state.outbox : EMPTY;
}
