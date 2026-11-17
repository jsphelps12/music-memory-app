import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { loadLastWeek, observeListening } from "@/lib/lastWeekData";
import { warmAnalyses } from "@/lib/photoAnalysisStore";

const STALE_TIME = 2 * 60 * 1000;

/**
 * "Last week" (1.4), shared by the Journal row and the screen. Reads only the
 * phone (plus the user's own moments for "Saved"), so it's cheap to keep
 * fresh: refetched on focus once stale. `observe` also records this week's
 * play counts and new Apple Music plays (the Journal does; throttled inside).
 */
export function useLastWeek({
  observe = false,
  passive = false,
}: {
  observe?: boolean;
  /** Only read the shared result: no photo analysis or focus refetch (the row does those). */
  passive?: boolean;
} = {}) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["lastWeek", user?.id],
    queryFn: () => loadLastWeek(user!.id),
    enabled: !!user,
    staleTime: STALE_TIME,
  });
  const { refetch, dataUpdatedAt, data } = query;

  // Photos not looked at yet: analyse them in the background (homework and
  // receipts drop out), then read the week again. Once per batch.
  const warming = useRef<string | null>(null);
  useEffect(() => {
    const ids = passive ? [] : (data?.unanalyzed ?? []);
    if (ids.length === 0) return;
    const batch = `${ids[0]}:${ids.length}`;
    if (warming.current === batch) return;
    warming.current = batch;
    void warmAnalyses(ids).then((ok) => {
      if (ok) void refetch();
    });
  }, [data?.unanalyzed, refetch, passive]);

  useFocusEffect(
    useCallback(() => {
      if (!user || passive) return;
      if (observe) void observeListening();
      if (dataUpdatedAt && Date.now() - dataUpdatedAt > STALE_TIME) void refetch();
    }, [user, observe, passive, dataUpdatedAt, refetch])
  );

  return query;
}
