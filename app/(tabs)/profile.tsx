import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Share,
  Switch,
  Linking,
  Platform,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { PromptsSection } from "@/components/PromptsSection";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl, avatarFullPath } from "@/lib/storage";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonProfile } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { IconButton } from "@/components/IconButton";
import { friendlyError } from "@/lib/errors";
import { topValue, pluralMoments } from "@/lib/utils";
import { pad } from "@/lib/dateUtils";
import { PROFILE_STATS_STALE } from "@/lib/queryConfig";

const STALE_TIME = PROFILE_STATS_STALE;
const AVATAR_SIZE = 80;


function subtractDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeStreaks(dates: string[]): { current: number; longest: number; daysLogged: number } {
  const uniqueDates = [...new Set(dates)];
  const daysLogged = uniqueDates.length;
  if (daysLogged === 0) return { current: 0, longest: 0, daysLogged: 0 };

  const dateSet = new Set(uniqueDates);

  // Current streak from today
  const today = new Date().toISOString().slice(0, 10);
  let current = 0;
  let checkDate = today;
  while (dateSet.has(checkDate)) {
    current++;
    checkDate = subtractDay(checkDate);
  }

  // Longest streak
  const sortedAsc = uniqueDates.slice().sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sortedAsc.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = new Date(sortedAsc[i - 1] + "T00:00:00");
      const curr = new Date(sortedAsc[i] + "T00:00:00");
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    }
    if (run > longest) longest = run;
  }

  return { current, longest, daysLogged };
}


async function fetchProfileStats(userId: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const firstOfMonth = `${y}-${m}-01`;
  const lastOfMonth = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const firstOfLastMonth = new Date(y, now.getMonth() - 1, 1).toISOString().slice(0, 10);

  const [
    { data: allRows, error: allError },
    { data: twoMonthRows, error: twoMonthError },
    { count: friendCount },
    { status: notifStatus },
  ] = await Promise.all([
    supabase.from("moments").select("created_at, song_artist, song_title, mood, moods").eq("user_id", userId),
    supabase.from("moments").select("moment_date, song_artist, mood, moods").eq("user_id", userId)
      .gte("moment_date", firstOfLastMonth).lte("moment_date", lastOfMonth),
    supabase.from("friendships").select("id", { count: "exact", head: true })
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted"),
    Notifications.getPermissionsAsync(),
  ]);

  if (allError) throw allError;
  if (twoMonthError) throw twoMonthError;

  const rows = allRows ?? [];
  const dates = rows.map((r: any) => (r.created_at as string).slice(0, 10));
  const streaks = computeStreaks(dates);
  const uniqueArtistCount = new Set(rows.map((r: any) => r.song_artist).filter(Boolean)).size;
  const allTwoMonth = twoMonthRows ?? [];
  const tmRows = allTwoMonth.filter((r: any) => r.moment_date >= firstOfMonth);
  const lmRows = allTwoMonth.filter((r: any) => r.moment_date < firstOfMonth);

  return {
    momentCount: rows.length,
    ...streaks,
    topArtist: topValue(rows.map((r: any) => r.song_artist)),
    topSong: topValue(rows.map((r: any) => r.song_title)),
    // Every selected mood counts toward Top Mood, not just the legacy first one.
    topMood: topValue(rows.flatMap((r: any) => r.moods ?? (r.mood ? [r.mood] : []))),
    thisMonthCount: tmRows.length,
    lastMonthCount: lmRows.length,
    thisMonthTopArtist: topValue(tmRows.map((r: any) => r.song_artist)),
    thisMonthTopMood: topValue(tmRows.flatMap((r: any) => r.moods ?? (r.mood ? [r.mood] : []))),
    friendCount: friendCount ?? 0,
    uniqueArtistCount,
    notifPermission: (notifStatus === "granted" ? "granted" : notifStatus === "denied" ? "denied" : "undetermined") as "granted" | "denied" | "undetermined",
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, signOut, deleteAccount, refreshProfile, saveCustomPromptCategory, deleteCustomPromptCategory, preferredProvider, setPreferredProvider } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifOnThisDay, setNotifOnThisDay] = useState(true);
  const [notifStreak, setNotifStreak] = useState(true);
  const [notifPrompts, setNotifPrompts] = useState(true);
  const [notifResurfacing, setNotifResurfacing] = useState(true);
  const [notifMilestones, setNotifMilestones] = useState(true);
  const [savingNotifField, setSavingNotifField] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["profileStats", user?.id],
    queryFn: () => fetchProfileStats(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // `refreshProfile` is not a React Query observer, so it has no staleTime of
  // its own — left ungated it ran a full `profiles` select, an AsyncStorage
  // write and the Sentry/PostHog identify calls on every single tap of the Me
  // tab. Same cooldown the stats query uses.
  const lastProfileRefresh = useRef(0);
  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastProfileRefresh.current > STALE_TIME) {
      lastProfileRefresh.current = now;
      refreshProfile();
    }
    if (now - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt, refreshProfile]));

  // Sync notif prefs from profile into local toggle state
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    setNotifOnThisDay(profile.notifOnThisDay);
    setNotifStreak(profile.notifStreak);
    setNotifPrompts(profile.notifPrompts);
    setNotifResurfacing(profile.notifResurfacing);
    setNotifMilestones(profile.notifMilestones);
  }, [profile]));

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;

  // URL currently shown in the full-screen viewer; null = closed.
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);

  // Avatars uploaded before the dual-size change have no avatar_full.jpg, so
  // probe for it (public bucket, one HEAD per tap) and fall back to the 400px
  // file rather than opening a blank viewer.
  const handleAvatarPress = useCallback(async () => {
    if (!user || !avatarUri) return;
    const fullUrl = getPublicPhotoUrl(avatarFullPath(user.id));
    try {
      const res = await fetch(fullUrl, { method: "HEAD" });
      setAvatarViewerUrl(res.ok ? fullUrl : avatarUri);
    } catch {
      setAvatarViewerUrl(avatarUri);
    }
  }, [user, avatarUri]);

  // Pull-to-refresh is an explicit ask, so it bypasses the cooldown — but it
  // still stamps it, so the focus effect doesn't repeat the work moments later.
  const handleRefresh = useCallback(async () => {
    lastProfileRefresh.current = Date.now();
    refreshProfile();
    await refetch();
  }, [refetch, refreshProfile]);

  const handleShareProfile = useCallback(() => {
    if (!profile?.friendInviteToken) return;
    const url = `https://soundtracks.app/friend/${profile.friendInviteToken}`;
    Share.share(Platform.OS === "ios" ? { url } : { message: url });
  }, [profile?.friendInviteToken]);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your moments, photos, and collections. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Your data cannot be recovered after deletion.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setDeletingAccount(true);
                    try {
                      await deleteAccount();
                    } catch (e) {
                      setDeletingAccount(false);
                      Alert.alert("Error", friendlyError(e));
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleNotifToggle = useCallback(async (
    field: "notif_on_this_day" | "notif_streak" | "notif_prompts" | "notif_resurfacing" | "notif_milestones",
    value: boolean
  ) => {
    if (!user || savingNotifField !== null) return;
    if (field === "notif_on_this_day") setNotifOnThisDay(value);
    if (field === "notif_streak") setNotifStreak(value);
    if (field === "notif_prompts") setNotifPrompts(value);
    if (field === "notif_resurfacing") setNotifResurfacing(value);
    if (field === "notif_milestones") setNotifMilestones(value);
    posthog.capture("notification_preferences_changed", { notification_type: field, enabled: value });
    setSavingNotifField(field);
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    setSavingNotifField(null);
    if (error) {
      // Roll back optimistic update
      if (field === "notif_on_this_day") setNotifOnThisDay(!value);
      if (field === "notif_streak") setNotifStreak(!value);
      if (field === "notif_prompts") setNotifPrompts(!value);
      if (field === "notif_resurfacing") setNotifResurfacing(!value);
      if (field === "notif_milestones") setNotifMilestones(!value);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [user, posthog, savingNotifField]);

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSigningOut(true);
    setSignOutError("");
    try {
      posthog.capture("signed_out");
      await signOut();
    } catch (e) {
      setSignOutError(friendlyError(e));
    } finally {
      setSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.container}
      >
        <SkeletonProfile />
      </ScrollView>
    );
  }

  if (isError && !data) {
    return (
      <ErrorState
        message={friendlyError(error)}
        onRetry={() => refetch()}
      />
    );
  }

  const displayName = profile?.displayName || null;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <View style={styles.outerContainer}>
      {/* Screen header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Profile</Text>
        <View style={styles.headerButtons}>
          <IconButton name="help-circle-outline" onPress={() => router.push("/help")} />
          <IconButton name="person-add-outline" onPress={handleShareProfile} />
          <IconButton name="settings-outline" onPress={() => router.push("/profile-edit")} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text}
          />
        }
      >
        {isError && !!data ? (
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => {}}
          />
        ) : null}

        {/* User card */}
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => router.push("/profile-edit")}
        activeOpacity={0.7}
      >
        {avatarUri ? (
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
            <View style={styles.avatarContainer}>
              <AppImage source={{ uri: avatarUri }} style={styles.avatar} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.avatarContainer}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
        <View style={styles.userCardText}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName ?? "Add your name"}
          </Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>


      {/* Stats — row 1 */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statItem} onPress={() => router.push("/(tabs)" as any)} activeOpacity={0.7}>
            <Text style={styles.statValue}>{data?.momentCount ?? "—"}</Text>
            <Text style={styles.statLabel}>Moments</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data?.daysLogged ?? "—"}</Text>
            <Text style={styles.statLabel}>Days Logged</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>{memberSince ?? "—"}</Text>
            <Text style={styles.statLabel}>Member Since</Text>
          </View>
        </View>

        {/* Stats — row 2 */}
        <View style={[styles.statsRow, styles.statsRowBorder]}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {data != null ? `${data.current} 🔥` : "—"}
            </Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data?.longest ?? "—"}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={() => router.push("/friends-list" as any)} activeOpacity={0.7}>
            <Text style={styles.statValue}>{data?.friendCount ?? "—"}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Friends */}
      <TouchableOpacity
        style={[styles.promptsCard, styles.friendsRow]}
        onPress={() => router.push("/friends-list" as any)}
        activeOpacity={0.7}
      >
        <View style={styles.friendsRowLeft}>
          <Ionicons name="people-outline" size={20} color={theme.colors.text} />
          <Text style={styles.promptsRowLabel}>Friends</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>

      {/* Music Service */}
      <TouchableOpacity
        style={[styles.promptsCard, styles.friendsRow]}
        onPress={() => {
          Haptics.selectionAsync();
          Alert.alert(
            "Music Service",
            `Currently using ${preferredProvider === 'spotify' ? 'Spotify' : 'Apple Music'}.`,
            [
              {
                text: "Apple Music",
                onPress: async () => {
                  if (preferredProvider === 'apple_music') return;
                  const ok = await setPreferredProvider('apple_music');
                  if (!ok) Alert.alert("Error", "Couldn't switch to Apple Music. Check your Music permissions in Settings.");
                },
              },
              {
                text: "Spotify",
                onPress: async () => {
                  if (preferredProvider === 'spotify') return;
                  try {
                    const ok = await setPreferredProvider('spotify');
                    if (!ok) Alert.alert("Spotify", "Couldn't connect to Spotify. Make sure the Spotify app is installed and you have a Premium subscription.");
                  } catch {
                    Alert.alert("Spotify", "Couldn't connect to Spotify. Make sure the Spotify app is installed and you have a Premium subscription.");
                  }
                },
              },
              { text: "Cancel", style: "cancel" },
            ]
          );
        }}
        activeOpacity={0.7}
      >
        <View style={styles.friendsRowLeft}>
          <Ionicons name="musical-notes-outline" size={20} color={theme.colors.text} />
          <Text style={styles.promptsRowLabel}>Music Service</Text>
        </View>
        <View style={styles.friendsRowLeft}>
          <Text style={[styles.promptsRowLabel, { color: theme.colors.textSecondary }]}>
            {preferredProvider === 'spotify' ? 'Spotify' : 'Apple Music'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </View>
      </TouchableOpacity>

      {/* Top Stats */}
      <View style={styles.topStatsSection}>
        <Text style={styles.sectionTitle}>All-Time Favorites</Text>
        <View style={styles.topStatRow}>
          <View style={styles.topStatIconWrap}>
            <Ionicons name="mic-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Artist</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {data == null ? "—" : data.topArtist ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <View style={styles.topStatIconWrap}>
            <Ionicons name="musical-note" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Song</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {data == null ? "—" : data.topSong ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <View style={styles.topStatIconWrap}>
            <Ionicons name="happy-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Mood</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {data == null ? "—" : data.topMood ?? "None yet"}
            </Text>
          </View>
        </View>
      </View>

      {/* This Month */}
      {data != null && data.thisMonthCount > 0 && (() => {
        const { thisMonthCount, lastMonthCount, thisMonthTopArtist, thisMonthTopMood } = data;
        const diff = thisMonthCount - lastMonthCount;
        const compLabel = diff === 0
          ? "same as last month"
          : `${diff > 0 ? "↑" : "↓"}${Math.abs(diff)} vs last month`;
        return (
          <View style={styles.topStatsSection}>
            <Text style={styles.sectionTitle}>This Month</Text>
            <View style={styles.topStatRow}>
              <View style={styles.topStatIconWrap}>
                <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
              </View>
              <View style={styles.topStatText}>
                <Text style={styles.topStatLabel}>Moments logged</Text>
                <Text style={styles.topStatValue}>
                  {pluralMoments(thisMonthCount)}
                  {compLabel ? `  ·  ${compLabel}` : ""}
                </Text>
              </View>
            </View>
            {thisMonthTopArtist ? (
              <View style={styles.topStatRow}>
                <View style={styles.topStatIconWrap}>
                  <Ionicons name="mic-outline" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.topStatText}>
                  <Text style={styles.topStatLabel}>Top Artist</Text>
                  <Text style={styles.topStatValue} numberOfLines={1}>{thisMonthTopArtist}</Text>
                </View>
              </View>
            ) : null}
            {thisMonthTopMood ? (
              <View style={styles.topStatRow}>
                <View style={styles.topStatIconWrap}>
                  <Ionicons name="happy-outline" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.topStatText}>
                  <Text style={styles.topStatLabel}>Top Mood</Text>
                  <Text style={styles.topStatValue} numberOfLines={1}>{thisMonthTopMood}</Text>
                </View>
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* Milestones */}
      {data != null && (() => {
        const BADGES = [
          { id: "first_note", label: "First Note", icon: "musical-note", condition: data.momentCount >= 1 },
          { id: "memory_maker", label: "10 Moments", icon: "albums", condition: data.momentCount >= 10 },
          { id: "archivist", label: "50 Moments", icon: "archive", condition: data.momentCount >= 50 },
          { id: "century", label: "100 Moments", icon: "trophy", condition: data.momentCount >= 100 },
          { id: "on_a_roll", label: "7-Day Streak", icon: "flame", condition: data.longest >= 7 },
          { id: "dedicated", label: "30-Day Streak", icon: "medal", condition: data.longest >= 30 },
          { id: "habit", label: "2 Wks Logged", icon: "calendar", condition: data.daysLogged >= 14 },
          { id: "historian", label: "60 Days Logged", icon: "book", condition: data.daysLogged >= 60 },
          { id: "eclectic", label: "5 Artists", icon: "headset", condition: data.uniqueArtistCount >= 5 },
          { id: "explorer", label: "20 Artists", icon: "radio", condition: data.uniqueArtistCount >= 20 },
          { id: "connected", label: "Connected", icon: "person-add", condition: data.friendCount >= 1 },
          { id: "social", label: "Social", icon: "people", condition: data.friendCount >= 5 },
        ] as const;
        const unlockedCount = BADGES.filter((b) => b.condition).length;
        return (
          <View style={styles.promptsCard}>
            <TouchableOpacity
              style={styles.promptsRow}
              onPress={() => setShowMilestones((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.promptsRowLabel}>Milestones</Text>
              <View style={styles.collapsibleRight}>
                <Text style={styles.milestonesCount}>{unlockedCount} / {BADGES.length}</Text>
                <Ionicons
                  name={showMilestones ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.colors.textTertiary}
                />
              </View>
            </TouchableOpacity>
            {showMilestones && (
              <View style={styles.promptsBody}>
                <View style={styles.badgeGrid}>
                  {BADGES.map((badge) => (
                    <View key={badge.id} style={styles.badgeItem}>
                      <View style={[styles.badgeCircle, badge.condition ? styles.badgeUnlocked : styles.badgeLocked]}>
                        <Ionicons
                          name={badge.icon as any}
                          size={22}
                          color={badge.condition ? "#fff" : theme.colors.textTertiary}
                        />
                      </View>
                      <Text style={[styles.badgeLabel, !badge.condition && styles.badgeLabelLocked]} numberOfLines={2}>
                        {badge.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })()}

      {/* Prompts */}
      <View style={[styles.promptsCard, showPrompts && styles.promptsCardOpen]}>
        <TouchableOpacity
          style={styles.promptsRow}
          onPress={() => setShowPrompts((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.promptsRowLabel}>Prompts</Text>
          <Ionicons
            name={showPrompts ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.textTertiary}
          />
        </TouchableOpacity>
        {showPrompts && (
          <View style={styles.promptsBody}>
            <PromptsSection
              customCategories={profile?.customPromptCategories ?? []}
              onSave={saveCustomPromptCategory}
              onDelete={deleteCustomPromptCategory}
            />
          </View>
        )}
      </View>

      {/* Notifications */}
      <View style={styles.promptsCard}>
        <TouchableOpacity
          style={styles.promptsRow}
          onPress={() => setShowNotifications((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.promptsRowLabel}>Notifications</Text>
          <View style={styles.collapsibleRight}>
            {data?.notifPermission !== "granted" ? (
              <Text style={styles.notifStatusText}>Off</Text>
            ) : null}
            <Ionicons
              name={showNotifications ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.colors.textTertiary}
            />
          </View>
        </TouchableOpacity>
        {showNotifications && (
          <View style={[styles.promptsBody, { paddingTop: theme.spacing.sm }]}>
            {data?.notifPermission !== "granted" ? (
              <TouchableOpacity
                style={styles.notifSettingsRow}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-off-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.notifSettingsText}>Notifications are disabled</Text>
                <Text style={styles.notifSettingsLink}>Open Settings →</Text>
              </TouchableOpacity>
            ) : (
              <>
                {([
                  { field: "notif_on_this_day", label: "On This Day", sub: "When a song anniversary comes up", value: notifOnThisDay },
                  { field: "notif_resurfacing", label: "Random memories", sub: "A random moment from your past", value: notifResurfacing },
                  { field: "notif_milestones", label: "Streak milestones", sub: "Celebrate hitting a new streak", value: notifMilestones },
                  { field: "notif_streak", label: "Streak reminders", sub: "Keep your logging streak going", value: notifStreak },
                  { field: "notif_prompts", label: "Journal prompts", sub: "Occasional nudges to capture a moment", value: notifPrompts },
                ] as const).map(({ field, label, sub, value }, idx) => (
                  <View key={field} style={[styles.notifRow, idx > 0 && styles.notifRowBorder]}>
                    <View style={styles.notifRowText}>
                      <Text style={styles.notifRowLabel}>{label}</Text>
                      <Text style={styles.notifRowSub}>{sub}</Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={(v) => handleNotifToggle(field, v)}
                      disabled={savingNotifField !== null}
                      trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                      thumbColor="#fff"
                    />
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </View>

      {/* Feedback */}
      <TouchableOpacity
        style={styles.feedbackButton}
        onPress={() => {
          Haptics.selectionAsync();
          Linking.openURL("mailto:founder@soundtracks.app?subject=Soundtracks%20Feedback");
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.feedbackText}>Share Feedback</Text>
      </TouchableOpacity>

      {/* Sign Out */}
      {signOutError ? (
        <Text style={styles.signOutErrorText}>{signOutError}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={signingOut || deletingAccount}
        activeOpacity={0.7}
      >
        {signingOut ? (
          <ActivityIndicator color={theme.colors.destructive} />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>

      {/* Delete Account */}
      <TouchableOpacity
        style={[styles.deleteAccountButton, deletingAccount && styles.buttonDisabled]}
        onPress={handleDeleteAccount}
        disabled={signingOut || deletingAccount}
        activeOpacity={0.7}
      >
        {deletingAccount ? (
          <ActivityIndicator color={theme.colors.textTertiary} />
        ) : (
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        )}
      </TouchableOpacity>
      </ScrollView>

      <PhotoViewer
        photos={avatarViewerUrl ? [avatarViewerUrl] : []}
        initialIndex={0}
        visible={avatarViewerUrl !== null}
        onClose={() => setAvatarViewerUrl(null)}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      flex: 1,
    },
    container: {
      paddingTop: theme.spacing.lg,
      paddingBottom: 48,
      paddingHorizontal: theme.spacing.xl,
    },
    screenHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    headerButtons: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    screenTitle: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    userCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
      marginBottom: theme.spacing["2xl"],
    },
    avatarContainer: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: theme.colors.backgroundTertiary,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      flexShrink: 0,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    },
    initials: {
      fontSize: 28,
      fontFamily: theme.fonts.bodyBold,
      color: theme.colors.textTertiary,
    },
    userCardText: {
      flex: 1,
    },
    displayName: {
      fontSize: theme.fontSize.lg,
      fontFamily: theme.fonts.bodyBold,
      color: theme.colors.text,
    },
    email: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    statsGrid: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
      marginBottom: theme.spacing["2xl"],
    },
    statsRow: {
      flexDirection: "row",
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
    },
    statsRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    statValue: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyBold,
      color: theme.colors.text,
    },
    statLabel: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    topStatsSection: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing["2xl"],
      gap: 0,
    },
    sectionTitle: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: theme.spacing.sm,
    },
    topStatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    topStatIconWrap: {
      width: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    topStatText: {
      flex: 1,
    },
    topStatLabel: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    topStatValue: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
      marginTop: 1,
    },
    promptsCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
      marginBottom: theme.spacing["2xl"],
    },
    promptsCardOpen: {
      // no extra style needed — overflow hidden keeps it clean
    },
    collapsibleRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    milestonesCount: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
    notifStatusText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
    badgeGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      rowGap: theme.spacing.lg,
    },
    badgeItem: {
      width: "23%",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    badgeCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeUnlocked: {
      backgroundColor: theme.colors.accent,
    },
    badgeLocked: {
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    badgeLabel: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.text,
      textAlign: "center",
      lineHeight: 14,
    },
    badgeLabelLocked: {
      color: theme.colors.textTertiary,
    },
    friendsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
    },
    friendsRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    friendsBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    friendsBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontFamily: theme.fonts.bodyBold,
      lineHeight: 13,
    },
    promptsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
    },
    promptsRowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    promptsBody: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
    },
    notifSettingsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    notifSettingsText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    notifSettingsLink: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
    notifRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: theme.spacing.md,
    },
    notifRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    notifRowText: {
      flex: 1,
    },
    notifRowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    notifRowSub: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    signOutErrorText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginBottom: theme.spacing.sm,
      textAlign: "center",
    },
    feedbackButton: {
      marginTop: theme.spacing["2xl"],
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["3xl"],
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
    },
    feedbackText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    signOutButton: {
      marginTop: theme.spacing.md,
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["3xl"],
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.destructive,
      alignItems: "center",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    signOutText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    deleteAccountButton: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: theme.spacing.sm,
    },
    deleteAccountText: {
      color: theme.colors.textTertiary,
      fontSize: theme.fontSize.sm,
    },
  });
}
