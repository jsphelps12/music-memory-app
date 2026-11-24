import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useFriends } from "@/hooks/useFriends";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { IconButton } from "@/components/IconButton";
import { PersonPicker } from "@/components/PersonPicker";
import { confirmSheet } from "@/components/ConfirmSheet";
import { friendlyError } from "@/lib/errors";
import { invalidateFriendCaches } from "@/lib/cacheInvalidation";
import { friendsAsPeople, friendsQueryKey, removeFriend, type FriendPerson } from "@/lib/friends";
import { rankPeople } from "@/lib/people";
import { friendInviteUrl } from "@/lib/momentShares";
import { ContextMenuView, type ContextMenuAction } from "@/modules/context-menu";
import type { Friendship } from "@/types";

const FRIEND_ACTIONS: ContextMenuAction[] = [
  { id: "remove", title: "Remove friend", systemImage: "person.badge.minus", destructive: true },
];

// Mutual-by-link friends (Social Architecture v2): there are no pending or
// sent requests — a friendship exists the moment someone opens your link.
// A pushed screen (back chevron + edge swipe), reached from You.
export default function FriendsListScreen() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const NativeMenu = ContextMenuView;

  // Add-by-link is the only door (Sharing v2): opening this link makes the
  // pair instantly mutual, so sharing it IS the whole "add a person" flow.
  const handleShareLink = useCallback(() => {
    if (!profile?.friendInviteToken) return;
    const url = friendInviteUrl(profile.friendInviteToken);
    Share.share(Platform.OS === "ios" ? { url } : { message: url });
  }, [profile?.friendInviteToken]);

  // The shared friends cache (hooks/useFriends.ts), A–Z.
  const { data, isLoading, isFetching, isError, error, errorUpdatedAt, refetch } = useFriends();
  const people = useMemo(() => rankPeople(friendsAsPeople(data ?? [])), [data]);
  // A background refresh failure over existing data; dismissing hides this
  // failure only, a later one shows again.
  const [dismissedErrorAt, setDismissedErrorAt] = useState(0);

  const handleRemoveFriend = async (friendship: Friendship) => {
    const name = friendship.otherUserDisplayName ?? "this person";
    const confirmed = await confirmSheet({
      title: `Remove ${name}?`,
      message: "They'll leave your friends.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeFriend(friendship.id);
      queryClient.setQueryData(friendsQueryKey(user?.id), (old: Friendship[] | undefined) =>
        old ? old.filter((f) => f.id !== friendship.id) : old
      );
      invalidateFriendCaches(queryClient, user?.id);
      // The You tab's friend count, which invalidateFriendCaches doesn't cover yet.
      void queryClient.invalidateQueries({ queryKey: ["youSummary", user?.id] });
    } catch (e) {
      Alert.alert("Couldn't remove friend", friendlyError(e));
    }
  };

  return (
    <View style={s.container}>
      <ScreenHeader
        leading="back"
        title="Friends"
        right={
          <IconButton
            name="person-add-outline"
            onPress={handleShareLink}
            accessibilityLabel="Share your friend link"
          />
        }
      />

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : isError && !data ? (
        // Nothing to show: a failed load must not read as "no friends".
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />
      ) : (
        <PersonPicker
          mode="list"
          people={people}
          handles="always"
          searchPlaceholder="Search friends"
          style={s.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing["4xl"] }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => void refetch()}
              tintColor={theme.colors.textSecondary}
            />
          }
          header={
            <View>
              {isError && dismissedErrorAt !== errorUpdatedAt ? (
                <ErrorBanner
                  message={friendlyError(error)}
                  onRetry={() => refetch()}
                  onDismiss={() => setDismissedErrorAt(errorUpdatedAt)}
                />
              ) : null}
              {people.length > 0 ? (
                <SectionLabel meta={String(people.length)} style={s.sectionLabel}>
                  Your friends
                </SectionLabel>
              ) : null}
            </View>
          }
          emptyState={
            <View style={s.empty}>
              <Text style={s.emptyText}>
                Anyone who opens your friend link becomes a friend right away.
                Then you can send moments straight to them.
              </Text>
              <Button
                label="Share your friend link"
                icon="link-outline"
                onPress={handleShareLink}
                style={s.shareButton}
              />
            </View>
          }
          // A long-press opens the iOS menu (DESIGN.md); builds without the
          // native view hold straight to the confirm.
          wrapRow={(person: FriendPerson, row) =>
            NativeMenu ? (
              <NativeMenu
                actions={FRIEND_ACTIONS}
                onAction={() => void handleRemoveFriend(person.friendship)}
                previewBackgroundColor={theme.colors.background}
                previewRadius={theme.radii.md}
                previewInset={theme.spacing.md}
              >
                {row}
              </NativeMenu>
            ) : (
              <TouchableOpacity
                onLongPress={() => handleRemoveFriend(person.friendship)}
                activeOpacity={0.85}
                delayLongPress={400}
                accessibilityHint="Hold to remove this friend"
              >
                {row}
              </TouchableOpacity>
            )
          }
          footer={<Text style={s.footnote}>Touch and hold a name for options.</Text>}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: {
      flex: 1,
      paddingTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
    },
    sectionLabel: {
      marginBottom: theme.spacing.xs,
    },
    footnote: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing.md,
    },
    empty: {
      paddingTop: theme.spacing.sm,
    },
    emptyText: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
    },
    shareButton: {
      marginTop: theme.spacing.xl,
    },
  });
}
