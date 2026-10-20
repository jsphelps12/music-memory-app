import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { MOODS } from "@/constants/Moods";
import { fetchBrowseMetadata, fetchMoodMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { BrowseScreen } from "@/components/BrowseScreen";

export default function MoodScreen() {
  const { user, profile } = useAuth();
  const { value: initialValue } = useLocalSearchParams<{ value: string }>();
  const [activeMood, setActiveMood] = useState(initialValue ?? "");

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["moodMoments", user?.id, activeMood] as const,
    queryFn: ({ queryKey }) => fetchMoodMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activeMood,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  // Every mood the user has actually used, custom ones included, most used first.
  const usedMoods = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of meta) for (const mood of m.moods) counts[mood] = (counts[mood] ?? 0) + 1;
    return [...MOODS, ...(profile?.customMoods ?? [])]
      .filter((m) => counts[m.value])
      .sort((a, b) => counts[b.value] - counts[a.value]);
  }, [meta, profile?.customMoods]);

  const label = usedMoods.find((m) => m.value === activeMood)?.label
    ?? [...MOODS, ...(profile?.customMoods ?? [])].find((m) => m.value === activeMood)?.label
    ?? activeMood;

  // BrowseScreen has no error slot, and an empty list would claim there's
  // nothing here.

  return (
    <BrowseScreen
      title={label}
      items={usedMoods.map((m) => ({ key: m.value, label: m.label }))}
      activeKey={activeMood}
      onSelect={setActiveMood}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
    />
  );
}
