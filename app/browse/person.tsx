import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchPersonMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { BrowseScreen } from "@/components/BrowseScreen";

export default function PersonScreen() {
  const { user } = useAuth();
  const { name: initialName } = useLocalSearchParams<{ name: string }>();
  const [activePerson, setActivePerson] = useState(initialName ?? "");

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["personMoments", user?.id, activePerson] as const,
    queryFn: ({ queryKey }) => fetchPersonMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activePerson,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  const allPeople = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of meta) for (const p of m.people) counts[p] = (counts[p] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [meta]);

  // BrowseScreen has no error slot, and an empty list would claim there's
  // nothing here.

  return (
    <BrowseScreen
      title={`With ${activePerson}`}
      items={allPeople.map((name) => ({ key: name, label: name }))}
      activeKey={activePerson}
      onSelect={setActivePerson}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
    />
  );
}
