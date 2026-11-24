import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata } from "@/lib/browse";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import { useOnForeground } from "@/lib/appFocus";
import { browseToWidgetSource, refreshMemoryWidget, syncMemoryWidget } from "@/lib/widgetData";

/**
 * Memory widget (1.5), mounted by the Journal. Feeds lib/widgetData.ts the
 * whole library from the shared ["browseMeta", uid] cache (AuthContext warms
 * it at launch and saves invalidate it), so the widget needs no query of
 * its own. Coming back to the app re-picks too, so a new day or a changed
 * setting reaches the widget.
 */
export function useMemoryWidget(): void {
  const { user } = useAuth();
  const userId = user?.id;
  const { data } = useQuery({
    queryKey: ["browseMeta", userId],
    queryFn: () => fetchBrowseMetadata(userId!),
    enabled: !!userId,
    staleTime: BROWSE_META_STALE,
  });

  useEffect(() => {
    if (!userId || !data) return;
    void syncMemoryWidget(userId, browseToWidgetSource(data));
  }, [userId, data]);

  useOnForeground(() => {
    void refreshMemoryWidget();
  });
}
