import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchYearMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { BrowseScreen } from "@/components/BrowseScreen";

export default function YearScreen() {
  const { user } = useAuth();
  const { year: initialYear } = useLocalSearchParams<{ year: string }>();
  const [activeYear, setActiveYear] = useState(Number(initialYear) || new Date().getFullYear());

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["yearMoments", user?.id, activeYear] as const,
    queryFn: ({ queryKey }) => fetchYearMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activeYear,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  const allYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of meta) {
      if (m.momentDate) years.add(new Date(m.momentDate + "T00:00:00").getFullYear());
    }
    return [...years].sort((a, b) => b - a);
  }, [meta]);

  // BrowseScreen has no error slot, and an empty list would claim there's
  // nothing here.

  return (
    <BrowseScreen
      title={String(activeYear)}
      items={allYears.map((y) => ({ key: String(y), label: String(y) }))}
      activeKey={String(activeYear)}
      onSelect={(key) => setActiveYear(Number(key))}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
    />
  );
}
