import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { IconButton } from "@/components/IconButton";
import { confirmSheet } from "@/components/ConfirmSheet";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { invalidateFriendCaches } from "@/lib/cacheInvalidation";
import { fetchFriends, removeFriend } from "@/lib/friends";
import { friendInviteUrl } from "@/lib/momentShares";
import type { Friendship } from "@/types";

const STALE_TIME = 2 * 60 * 1000;

function Avatar({
  avatarUrl,
  displayName,
  styles,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const initials = (displayName ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <View style={styles.avatar}>
      {avatarUrl ? (
        <AppImage source={{ uri: getPublicPhotoUrl(avatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={styles.avatarInitial} allowFontScaling={false}>{initials}</Text>
      )}
    </View>
  );
}

// Mutual-by-link friends (Social Architecture v2): there are no pending or
// sent requests — a friendship exists the moment someone opens your link.
// A pushed screen (back chevron + edge swipe), reached from You.
export default function FriendsListScreen() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Add-by-link is the only door (Sharing v2): opening this link makes the
  // pair instantly mutual, so sharing it IS the whole "add a person" flow.
  const handleShareLink = useCallback(() => {
    if (!profile?.friendInviteToken) return;
    const url = friendInviteUrl(profile.friendInviteToken);
    Share.share(Platform.OS === "ios" ? { url } : { message: url });
  }, [profile?.friendInviteToken]);

  const { data, isLoading, isFetching, isError, error, errorUpdatedAt, refetch } = useQuery({
    queryKey: ["friendsList", user?.id],
    queryFn: () => fetchFriends(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });
  const friends = data ?? [];
  // A background refresh failure over existing data; dismissing hides this
  // failure only, a later one shows again.
  const [dismissedErrorAt, setDismissedErrorAt] = useState(0);

  const handleRemoveFriend = async (friendship: Friendship) => {
    const name = friendship.otherUserDisplayName ?? "this person";
    const confirmed = await confirmSheet({
      title: "Remove friend",
      message: `Remove ${name} from your friends?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeFriend(friendship.id);
      queryClient.setQueryData(["friendsList", user?.id], (old: Friendship[] | undefined) =>
        old ? old.filter((f) => f.id !== friendship.id) : old
      );
      invalidateFriendCaches(queryClient, user?.id);
      // The You tab's friend count, which invalidateFriendCaches doesn't cover yet.
      void queryClient.invalidateQueries({ queryKey: ["youSummary", user?.id] });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
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
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + theme.spacing["4xl"] }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={theme.colors.textSecondary}
            />
          }
        >
          {isError && dismissedErrorAt !== errorUpdatedAt ? (
            <ErrorBanner
              message={friendlyError(error)}
              onRetry={() => refetch()}
              onDismiss={() => setDismissedErrorAt(errorUpdatedAt)}
            />
          ) : null}
          {friends.length === 0 ? (
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
          ) : (
            <>
              <SectionLabel meta={String(friends.length)} style={s.sectionLabel}>
                Your friends
              </SectionLabel>
              <View style={s.list}>
                {friends.map((friendship) => (
                  <TouchableOpacity
                    key={friendship.id}
                    style={s.row}
                    onLongPress={() => handleRemoveFriend(friendship)}
                    activeOpacity={0.85}
                    delayLongPress={400}
                    accessibilityHint="Hold to remove this friend"
                  >
                    <Avatar
                      avatarUrl={friendship.otherUserAvatarUrl}
                      displayName={friendship.otherUserDisplayName}
                      styles={s}
                    />
                    <View style={s.rowInfo}>
                      <Text style={s.rowName} numberOfLines={1}>
                        {friendship.otherUserDisplayName ?? "Unknown"}
                      </Text>
                      {friendship.otherUserUsername ? (
                        <Text style={s.rowUsername} numberOfLines={1}>
                          @{friendship.otherUserUsername}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.footnote}>Hold a name to remove a friend.</Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const AVATAR_SIZE = 40;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
    },
    sectionLabel: {
      marginBottom: theme.spacing.xs,
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      gap: theme.spacing.md,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: theme.colors.backgroundTertiary,
    },
    avatarInitial: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textSecondary,
    },
    rowInfo: {
      flex: 1,
    },
    rowName: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    rowUsername: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
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
