import { useCallback, useMemo, useState } from "react";
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
  Switch,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { LinearGradient } from "expo-linear-gradient";
import { PromptsSection } from "@/components/PromptsSection";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonProfile } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { topValue } from "@/lib/utils";

const STALE_TIME = 2 * 60 * 1000;
const AVATAR_SIZE = 80;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const firstOfMonth = `${y}-${m}-01`;
  const lastOfMonth = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const firstOfLastMonth = new Date(y, now.getMonth() - 1, 1).toISOString().slice(0, 10);

  const [
    { data: allRows, error: allError },
    { data: twoMonthRows, error: twoMonthError },
    { data: files },
    { status: notifStatus },
  ] = await Promise.all([
    supabase.from("moments").select("created_at, song_artist, song_title, mood").eq("user_id", userId),
    supabase.from("moments").select("moment_date, song_artist, mood").eq("user_id", userId)
      .gte("moment_date", firstOfLastMonth).lte("moment_date", lastOfMonth),
    supabase.storage.from("moment-photos").list(userId, { limit: 1000 }),
    Notifications.getPermissionsAsync(),
  ]);

  if (allError) throw allError;
  if (twoMonthError) throw twoMonthError;

  const rows = allRows ?? [];
  const dates = rows.map((r: any) => (r.created_at as string).slice(0, 10));
  const streaks = computeStreaks(dates);
  const allTwoMonth = twoMonthRows ?? [];
  const tmRows = allTwoMonth.filter((r: any) => r.moment_date >= firstOfMonth);
  const lmRows = allTwoMonth.filter((r: any) => r.moment_date < firstOfMonth);

  return {
    momentCount: rows.length,
    ...streaks,
    topArtist: topValue(rows.map((r: any) => r.song_artist)),
    topSong: topValue(rows.map((r: any) => r.song_title)),
    topMood: topValue(rows.map((r: any) => r.mood)),
    thisMonthCount: tmRows.length,
    lastMonthCount: lmRows.length,
    thisMonthTopArtist: topValue(tmRows.map((r: any) => r.song_artist)),
    thisMonthTopMood: topValue(tmRows.map((r: any) => r.mood)),
    storageBytes: files ? files.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0) : null,
    notifPermission: (notifStatus === "granted" ? "granted" : notifStatus === "denied" ? "denied" : "undetermined") as "granted" | "denied" | "undetermined",
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, signOut, deleteAccount, refreshProfile, saveCustomPromptCategory, deleteCustomPromptCategory } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showCaptureMethods, setShowCaptureMethods] = useState(false);
  const [notifOnThisDay, setNotifOnThisDay] = useState(true);
  const [notifStreak, setNotifStreak] = useState(true);
  const [notifPrompts, setNotifPrompts] = useState(true);
  const [notifResurfacing, setNotifResurfacing] = useState(true);
  const [notifMilestones, setNotifMilestones] = useState(true);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["profileStats", user?.id],
    queryFn: () => fetchProfileStats(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  useFocusEffect(useCallback(() => {
    refreshProfile();
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
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

  const handleRefresh = useCallback(async () => {
    refreshProfile();
    await refetch();
  }, [refetch, refreshProfile]);

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
    if (!user) return;
    if (field === "notif_on_this_day") setNotifOnThisDay(value);
    if (field === "notif_streak") setNotifStreak(value);
    if (field === "notif_prompts") setNotifPrompts(value);
    if (field === "notif_resurfacing") setNotifResurfacing(value);
    if (field === "notif_milestones") setNotifMilestones(value);
    posthog.capture("notification_preferences_changed", { notification_type: field, enabled: value });
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) {
      // Roll back optimistic update
      if (field === "notif_on_this_day") setNotifOnThisDay(!value);
      if (field === "notif_streak") setNotifStreak(!value);
      if (field === "notif_prompts") setNotifPrompts(!value);
      if (field === "notif_resurfacing") setNotifResurfacing(!value);
      if (field === "notif_milestones") setNotifMilestones(!value);
    }
  }, [user, posthog]);

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

      {/* Screen header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Profile</Text>
        <TouchableOpacity
          onPress={() => router.push("/profile-edit")}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* User card */}
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => router.push("/profile-edit")}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <Text style={styles.initials}>{initials}</Text>
          )}
        </View>
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
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data?.momentCount ?? "—"}</Text>
            <Text style={styles.statLabel}>Moments</Text>
          </View>
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
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {data?.storageBytes != null ? formatBytes(data.storageBytes) : "—"}
            </Text>
            <Text style={styles.statLabel}>Storage</Text>
          </View>
        </View>
      </View>

      {/* Top Stats */}
      <View style={styles.topStatsSection}>
        <Text style={styles.sectionTitle}>All-Time Favorites</Text>
        <View style={styles.topStatRow}>
          <Text style={styles.topStatIcon}>🎵</Text>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Artist</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {data == null ? "—" : data.topArtist ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <Text style={styles.topStatIcon}>🎶</Text>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Song</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {data == null ? "—" : data.topSong ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <Text style={styles.topStatIcon}>😊</Text>
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
              <Text style={styles.topStatIcon}>📅</Text>
              <View style={styles.topStatText}>
                <Text style={styles.topStatLabel}>Moments logged</Text>
                <Text style={styles.topStatValue}>
                  {thisMonthCount} {thisMonthCount === 1 ? "moment" : "moments"}
                  {compLabel ? `  ·  ${compLabel}` : ""}
                </Text>
              </View>
            </View>
            {thisMonthTopArtist ? (
              <View style={styles.topStatRow}>
                <Text style={styles.topStatIcon}>🎵</Text>
                <View style={styles.topStatText}>
                  <Text style={styles.topStatLabel}>Top Artist</Text>
                  <Text style={styles.topStatValue} numberOfLines={1}>{thisMonthTopArtist}</Text>
                </View>
              </View>
            ) : null}
            {thisMonthTopMood ? (
              <View style={styles.topStatRow}>
                <Text style={styles.topStatIcon}>😊</Text>
                <View style={styles.topStatText}>
                  <Text style={styles.topStatLabel}>Top Mood</Text>
                  <Text style={styles.topStatValue} numberOfLines={1}>{thisMonthTopMood}</Text>
                </View>
              </View>
            ) : null}
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

      {/* How to capture */}
      <View style={[styles.promptsCard, showCaptureMethods && styles.promptsCardOpen]}>
        <TouchableOpacity
          style={styles.promptsRow}
          onPress={() => setShowCaptureMethods((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.promptsRowLabel}>How to capture a memory</Text>
          <Ionicons
            name={showCaptureMethods ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.textTertiary}
          />
        </TouchableOpacity>
        {showCaptureMethods && (
          <View style={[styles.promptsBody, { gap: 0 }]}>
            {([
              { icon: "search-outline", label: "Search", desc: "Find any song by title or artist" },
              { icon: "musical-note-outline", label: "Now Playing", desc: "Auto-fills when Apple Music is playing" },
              { icon: "share-outline", label: "Share from Apple Music / Spotify", desc: "Tap Share → Soundtracks in any music app" },
              { icon: "image-outline", label: "Share from Photos", desc: "Tap Share → Soundtracks from camera roll" },
              { icon: "ear-outline", label: "ShazamKit", desc: "Hear a song anywhere — identify it in-app" },
            ] as const).map(({ icon, label, desc }, idx) => (
              <View key={label} style={[styles.captureRow, idx > 0 && styles.captureRowBorder]}>
                <Ionicons name={icon} size={18} color={theme.colors.accent} style={styles.captureIcon} />
                <View style={styles.captureText}>
                  <Text style={styles.captureLabel}>{label}</Text>
                  <Text style={styles.captureDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Notifications */}
      <View style={styles.notifCard}>
        <Text style={styles.sectionTitle}>Notifications</Text>
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
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </>
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
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      paddingTop: 70,
      paddingBottom: 48,
      paddingHorizontal: theme.spacing.xl,
    },
    screenHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing["2xl"],
    },
    screenTitle: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    userCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
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
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textTertiary,
    },
    userCardText: {
      flex: 1,
    },
    displayName: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
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
      fontWeight: theme.fontWeight.bold,
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
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing["2xl"],
      gap: 0,
    },
    sectionTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
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
    topStatIcon: {
      fontSize: 20,
      width: 28,
      textAlign: "center",
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
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.text,
      marginTop: 1,
    },
    promptsCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      overflow: "hidden",
      marginBottom: theme.spacing["2xl"],
    },
    promptsCardOpen: {
      // no extra style needed — overflow hidden keeps it clean
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
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.text,
    },
    promptsBody: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
    },
    captureRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
    },
    captureRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    captureIcon: {
      width: 28,
      marginRight: theme.spacing.sm,
    },
    captureText: {
      flex: 1,
    },
    captureLabel: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    captureDesc: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    proCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing["2xl"],
      gap: theme.spacing.sm,
    },
    proCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    proCardTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    proBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#6B5F8C",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.radii.full,
    },
    proBadgeText: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
    },
    proCardSub: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    proCardActions: {
      marginTop: theme.spacing.xs,
    },
    proManageButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.sm,
      paddingVertical: 10,
      alignItems: "center",
    },
    proManageText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
    },
    upgradeCard: {
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing["2xl"],
      gap: theme.spacing.sm,
    },
    upgradeTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: "#fff",
    },
    upgradeSub: {
      fontSize: theme.fontSize.sm,
      color: "rgba(255,255,255,0.85)",
      lineHeight: 20,
    },
    upgradeButton: {
      marginTop: theme.spacing.sm,
      backgroundColor: "#fff",
      borderRadius: theme.radii.button,
      paddingVertical: 12,
      alignItems: "center",
    },
    upgradeButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.bold,
      color: "#6B5F8C",
    },
    restoreButton: {
      alignItems: "center",
      paddingTop: theme.spacing.xs,
    },
    restoreText: {
      fontSize: theme.fontSize.xs,
      color: "rgba(255,255,255,0.7)",
    },
    notifCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing["2xl"],
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
      fontWeight: theme.fontWeight.medium,
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
      fontWeight: theme.fontWeight.semibold,
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
      fontWeight: theme.fontWeight.semibold,
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
