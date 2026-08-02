import { useCallback, useMemo } from "react";
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
import { AppImage } from "@/components/AppImage";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { IconButton } from "@/components/IconButton";
import { confirmSheet } from "@/components/ConfirmSheet";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { invalidateFriendCaches } from "@/lib/cacheInvalidation";
import { fetchFriends, removeFriend } from "@/lib/friends";
import type { Friendship } from "@/types";

const AVATAR_SIZE = 40;
const STALE_TIME = 2 * 60 * 1000;

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string | null }) {
  const theme = useTheme();
  const initials = (displayName ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <View style={[styles.avatar, { backgroundColor: theme.colors.backgroundTertiary }]}>
      {avatarUrl ? (
        <AppImage source={{ uri: getPublicPhotoUrl(avatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[styles.avatarInitial, { color: theme.colors.textTertiary }]}>{initials}</Text>
      )}
    </View>
  );
}

// Mutual-by-link friends (Social Architecture v2): there are no pending or
// sent requests — a friendship exists the moment someone opens your link.
export default function FriendsListScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  // Add-by-link is the only door (Sharing v2): opening this link makes the
  // pair instantly mutual, so sharing it IS the whole "add a person" flow.
  const handleShareLink = useCallback(() => {
    if (!profile?.friendInviteToken) return;
    const url = `https://soundtracks.app/friend/${profile.friendInviteToken}`;
    Share.share(Platform.OS === "ios" ? { url } : { message: url });
  }, [profile?.friendInviteToken]);

  const { data: friends = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["friendsList", user?.id],
    queryFn: () => fetchFriends(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  const handleRemoveFriend = async (friendship: Friendship) => {
    const name = friendship.otherUserDisplayName ?? "this person";
    const confirmed = await confirmSheet({
      title: "Remove Friend",
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
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
  };

  return (
    <View style={[s.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[s.headerTitle, { color: theme.colors.text }]}>Friends</Text>
        <View style={s.headerActions}>
          <IconButton name="person-add-outline" onPress={handleShareLink} />
          <CloseButton onPress={() => router.back()} />
        </View>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={theme.colors.accent}
            />
          }
        >
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: theme.colors.textTertiary }]}>
              My Friends ({friends.length})
            </Text>
            {friends.length === 0 ? (
              <>
                <Text style={[s.emptyText, { color: theme.colors.textSecondary }]}>
                  Anyone who opens your friend link becomes a friend instantly —
                  then you can send moments straight to them.
                </Text>
                <TouchableOpacity
                  style={[s.shareLinkButton, { backgroundColor: theme.colors.buttonBg }]}
                  onPress={handleShareLink}
                  activeOpacity={0.8}
                >
                  <Text style={[s.shareLinkButtonText, { color: theme.colors.buttonText }]}>
                    Share your friend link
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              friends.map((friendship) => (
                <TouchableOpacity
                  key={friendship.id}
                  style={[s.row, { borderBottomColor: theme.colors.border }]}
                  onLongPress={() => handleRemoveFriend(friendship)}
                  activeOpacity={0.85}
                  delayLongPress={400}
                >
                  <Avatar avatarUrl={friendship.otherUserAvatarUrl} displayName={friendship.otherUserDisplayName} />
                  <View style={s.rowInfo}>
                    <Text style={[s.rowName, { color: theme.colors.text }]}>{friendship.otherUserDisplayName ?? "Unknown"}</Text>
                    {friendship.otherUserUsername && (
                      <Text style={[s.rowUsername, { color: theme.colors.textSecondary }]}>@{friendship.otherUserUsername}</Text>
                    )}
                  </View>
                  <Text style={[s.longPressHint, { color: theme.colors.textTertiary }]}>hold to remove</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: 12,
      paddingHorizontal: theme.spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 40,
    },
    section: {
      marginTop: 28,
    },
    sectionLabel: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 12,
    },
    rowInfo: {
      flex: 1,
    },
    rowName: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
    },
    rowUsername: {
      fontSize: theme.fontSize.sm,
      marginTop: 1,
    },
    longPressHint: {
      fontSize: theme.fontSize.xs,
    },
    emptyText: {
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    shareLinkButton: {
      marginTop: 16,
      alignSelf: "flex-start",
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: theme.radii.full,
    },
    shareLinkButtonText: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
    },
  });
}
