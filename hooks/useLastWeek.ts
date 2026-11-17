import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { loadLastWeek, observeListening } from "@/lib/lastWeekData";

const STALE_TIME = 2 * 60 * 1000;

/**
 * "Last week" (1.4), shared by the Journal row and the screen. Reads only the
 * phone (plus the user's own moments for "Saved"), so it's cheap to keep
 * fresh: refetched on focus once stale. `observe` also records this week's
 * play counts and new Apple Music plays (the Journal does; throttled inside).
 */
export function useLastWeek({ observe = false }: { observe?: boolean } = {}) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["lastWeek", user?.id],
    queryFn: () => loadLastWeek(user!.id),
    enabled: !!user,
    staleTime: STALE_TIME,
  });
  const { refetch, dataUpdatedAt } = query;

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (observe) void observeListening();
      if (dataUpdatedAt && Date.now() - dataUpdatedAt > STALE_TIME) void refetch();
    }, [user, observe, dataUpdatedAt, refetch])
  );

  return query;
}
