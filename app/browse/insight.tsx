import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchMomentsByIds } from "@/lib/browse";
import { insightGroups, type InsightKind } from "@/lib/insights";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { BrowseScreen } from "@/components/BrowseScreen";

const KINDS: readonly InsightKind[] = ["genre", "decade", "time"];

/**
 * The moments behind one row of Insights: a genre ("Pop"), a decade of
 * release ("1990s") or a time of day you wrote ("Evening"), with the others
 * of the same kind as chips to switch between, like Rediscover's mood and
 * year screens. Which moments belong is worked out from the browse metadata
 * exactly as Insights counts them (lib/insights.ts insightGroups), then read
 * by id, so the count on the row and the moments here always agree.
 */
export default function InsightBrowseScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ kind: string; value: string }>();
  const kind: InsightKind = KINDS.includes(params.kind as InsightKind) ? (params.kind as InsightKind) : "genre";
  const [activeKey, setActiveKey] = useState(params.value ?? "");

  const meta = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const groups = useMemo(() => (meta.data ? insightGroups(meta.data, kind) : []), [meta.data, kind]);
  const active = groups.find((g) => g.key === activeKey);
  const ids = active?.momentIds ?? null;

  const moments = useQuery({
    queryKey: ["insightMoments", user?.id, kind, activeKey, ids] as const,
    queryFn: ({ queryKey }) => fetchMomentsByIds(queryKey[1]!, queryKey[4]!),
    enabled: !!user && !!ids && ids.length > 0,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  // Nothing to read until the metadata says which moments: loading until
  // then, and an error from either read.
  const failed = meta.isError && !meta.data ? meta.error : moments.isError ? moments.error : null;

  return (
    <BrowseScreen
      title={active?.label ?? ""}
      items={groups.map((g) => ({ key: g.key, label: g.label }))}
      activeKey={activeKey}
      onSelect={setActiveKey}
      moments={moments.data ?? []}
      isLoading={meta.isLoading || moments.isLoading}
      error={failed ? friendlyError(failed) : null}
      onRetry={() => (meta.isError && !meta.data ? meta.refetch() : moments.refetch())}
    />
  );
}
