import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useOnForeground } from "@/lib/appFocus";
import { lastWeekRange } from "@/lib/lastWeek";
import { loadLastWeek, observeListening, refreshWeekPhotos, type LastWeekData } from "@/lib/lastWeekData";
import { warmAnalyses } from "@/lib/photoAnalysisStore";

/**
 * Last week reads the phone, which changes slowly (the library is cached for
 * an hour, lib/libraryCache.ts), and saving a moment invalidates it
 * (lib/cacheInvalidation.ts), so it needn't refetch on every focus.
 */
const STALE_TIME = 30 * 60 * 1000;

/** The week being recapped right now: its key changes Sunday at 6pm. */
function recappedWeekKey(): string {
  return lastWeekRange(Date.now()).key;
}

/**
 * "Last week" (1.4), shared by the Journal row and the screen. Reads only the
 * phone (plus the user's own moments for "Saved"). Keyed by the week, so a
 * new week never shows the last one's cached recap; refetched on focus once
 * stale. `observe` also records this week's play counts and new Apple Music
 * plays (the Journal does; throttled inside).
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
  const queryClient = useQueryClient();
  const [weekKey, setWeekKey] = useState(recappedWeekKey);
  const queryKey = ["lastWeek", user?.id, weekKey];
  const query = useQuery({
    queryKey,
    queryFn: () => loadLastWeek(user!.id),
    enabled: !!user,
    staleTime: STALE_TIME,
  });
  const { refetch, dataUpdatedAt, data } = query;

  // Photos not looked at yet: analyse them in the background (homework and
  // receipts drop out), then drop those from the week. Once per batch, and
  // only the photos are redone: the library, catalog and "Saved" aren't.
  const warming = useRef<string | null>(null);
  const userId = user?.id;
  useEffect(() => {
    const ids = passive ? [] : (data?.unanalyzed ?? []);
    if (ids.length === 0) return;
    const batch = `${ids[0]}:${ids.length}`;
    if (warming.current === batch) return;
    warming.current = batch;
    const key = ["lastWeek", userId, weekKey];
    void warmAnalyses(ids).then(async (ok) => {
      if (!ok) return;
      const current = queryClient.getQueryData<LastWeekData>(key);
      if (!current) return;
      const next = await refreshWeekPhotos(current);
      // Unless a full read replaced it meanwhile; keep its age (only photos changed).
      const state = queryClient.getQueryState(key);
      if (queryClient.getQueryData(key) !== current) return;
      queryClient.setQueryData(key, next, { updatedAt: state?.dataUpdatedAt });
    });
  }, [data?.unanalyzed, passive, queryClient, userId, weekKey]);

  // A new week (Sunday evening, or Monday for a phone left open): move to its key.
  const syncWeek = useCallback(() => {
    setWeekKey(recappedWeekKey());
  }, []);
  useOnForeground(syncWeek);

  useFocusEffect(
    useCallback(() => {
      syncWeek();
      if (!user || passive) return;
      if (observe) void observeListening();
      if (dataUpdatedAt && Date.now() - dataUpdatedAt > STALE_TIME) void refetch();
    }, [user, observe, passive, dataUpdatedAt, refetch, syncWeek])
  );

  return query;
}
