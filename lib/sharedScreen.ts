import {
  fetchSharedCollectionActivity,
  fetchPendingCollectionInvites,
  CollectionInvite,
} from "@/lib/collections";
import { fetchPendingRequests, fetchFriends, fetchTaggedMomentsSharedTab } from "@/lib/friends";

export async function fetchSharedScreenData(userId: string) {
  const [requests, friends, tagged, collections, invites] = await Promise.all([
    fetchPendingRequests(userId),
    fetchFriends(userId),
    fetchTaggedMomentsSharedTab(userId),
    fetchSharedCollectionActivity(userId),
    fetchPendingCollectionInvites(userId).catch(() => [] as CollectionInvite[]),
  ]);
  return {
    pendingRequests: requests,
    hasFriends: friends.length > 0,
    taggedMoments: tagged,
    sharedCollections: collections,
    collectionInvites: invites,
  };
}
