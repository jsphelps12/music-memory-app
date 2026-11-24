import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPeopleLinks, peopleLinksQueryKey } from "@/lib/momentPeopleLinks";
import { PEOPLE_LINKS_STALE } from "@/lib/queryConfig";

/**
 * Every "Who was there" name the signed-in user linked to a friend
 * (`["peopleLinks", userId]`, lib/momentPeopleLinks.ts). `data.available` is
 * false until the migration is applied: callers then behave as before links
 * existed. One cache for capture, edit, Rediscover and the share sheet.
 */
export function usePeopleLinks({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: peopleLinksQueryKey(user?.id),
    queryFn: () => fetchPeopleLinks(user!.id),
    staleTime: PEOPLE_LINKS_STALE,
    enabled: !!user && enabled,
  });
}
