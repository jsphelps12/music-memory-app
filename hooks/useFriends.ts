import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchFriends, friendsQueryKey } from "@/lib/friends";
import { fetchRecentRecipients } from "@/lib/momentShares";
import { FRIENDS_STALE, RECENT_RECIPIENTS_STALE } from "@/lib/queryConfig";

/**
 * The signed-in user's friends, from the one shared cache
 * (`["friendsList", userId]`). Every surface that lists friends reads this,
 * so a picker opens from cache and a removal shows everywhere. `enabled`
 * lets a sheet wait until it's open.
 */
export function useFriends({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: friendsQueryKey(user?.id),
    queryFn: () => fetchFriends(user!.id),
    staleTime: FRIENDS_STALE,
    enabled: !!user && enabled,
  });
}

/** `["recentRecipients", userId]`: when this user last sent to each person. */
export function recentRecipientsQueryKey(userId: string | undefined) {
  return ["recentRecipients", userId] as const;
}

/**
 * Who the user sent moments to lately (person id → last send time), for the
 * share picker's "recent first" order. A failure just means A–Z.
 */
export function useRecentRecipients({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: recentRecipientsQueryKey(user?.id),
    queryFn: () => fetchRecentRecipients(user!.id),
    staleTime: RECENT_RECIPIENTS_STALE,
    enabled: !!user && enabled,
  });
}
