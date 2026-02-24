import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonProfile } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";

const REFETCH_COOLDOWN_MS = 2000;
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

function topValue(items: (string | null | undefined)[]): string | null {
  const freq = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    freq.set(item, (freq.get(item) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [val, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = val;
    }
  }
  return best;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, signOut, deleteAccount, refreshProfile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [momentCount, setMomentCount] = useState<number | null>(null);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState<number | null>(null);
  const [longestStreak, setLongestStreak] = useState<number | null>(null);
  const [daysLogged, setDaysLogged] = useState<number | null>(null);
  const [topArtist, setTopArtist] = useState<string | null | undefined>(undefined);
  const [topSong, setTopSong] = useState<string | null | undefined>(undefined);
  const [topMood, setTopMood] = useState<string | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const lastFetchTime = useRef(0);

  const loadProfileData = useCallback(async (isInitial: boolean) => {
    if (!user) return;
    try {
      if (isInitial) setLoadError("");
      setBannerError("");

      await refreshProfile();

      const [
        { count, error: countError },
        { data: files, error: storageError },
        { data: dateRows, error: dateError },
        { data: topRows, error: topError },
      ] = await Promise.all([
        supabase
          .from("moments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.storage.from("moment-photos").list(user.id, { limit: 1000 }),
        supabase
          .from("moments")
          .select("moment_date")
          .eq("user_id", user.id)
          .not("moment_date", "is", null)
          .order("moment_date", { ascending: false }),
        supabase
          .from("moments")
          .select("song_artist, song_title, mood")
          .eq("user_id", user.id),
      ]);

      if (countError) throw countError;
      if (dateError) throw dateError;
      if (topError) throw topError;

      setMomentCount(count ?? 0);

      if (!storageError && files) {
        const total = files.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
        setStorageBytes(total);
      }

      const dates = (dateRows ?? []).map((r: any) => r.moment_date as string);
      const streaks = computeStreaks(dates);
      setCurrentStreak(streaks.current);
      setLongestStreak(streaks.longest);
      setDaysLogged(streaks.daysLogged);

      const rows = topRows ?? [];
      setTopArtist(topValue(rows.map((r: any) => r.song_artist)));
      setTopSong(topValue(rows.map((r: any) => r.song_title)));
      setTopMood(topValue(rows.map((r: any) => r.mood)));

      lastFetchTime.current = Date.now();
      setInitialLoading(false);
    } catch (e) {
      if (isInitial) {
        setLoadError(friendlyError(e));
        setInitialLoading(false);
      } else {
        setBannerError(friendlyError(e));
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        loadProfileData(true);
      } else if (elapsed >= REFETCH_COOLDOWN_MS) {
        loadProfileData(false);
      }
    }, [loadProfileData])
  );

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfileData(false);
    setRefreshing(false);
  }, [loadProfileData]);

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

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch (e) {
      setSignOutError(friendlyError(e));
      setSigningOut(false);
    }
  };

  if (initialLoading) {
    return (
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.container}
      >
        <SkeletonProfile />
      </ScrollView>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => loadProfileData(true)}
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
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.text}
        />
      }
    >
      {bannerError ? (
        <ErrorBanner
          message={bannerError}
          onRetry={() => loadProfileData(false)}
          onDismiss={() => setBannerError("")}
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
            <Text style={styles.statValue}>{momentCount !== null ? momentCount : "—"}</Text>
            <Text style={styles.statLabel}>Moments</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{daysLogged !== null ? daysLogged : "—"}</Text>
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
              {currentStreak !== null ? `${currentStreak} 🔥` : "—"}
            </Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{longestStreak !== null ? longestStreak : "—"}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {storageBytes !== null ? formatBytes(storageBytes) : "—"}
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
              {topArtist === undefined ? "—" : topArtist ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <Text style={styles.topStatIcon}>🎶</Text>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Song</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {topSong === undefined ? "—" : topSong ?? "None yet"}
            </Text>
          </View>
        </View>
        <View style={styles.topStatRow}>
          <Text style={styles.topStatIcon}>😊</Text>
          <View style={styles.topStatText}>
            <Text style={styles.topStatLabel}>Top Mood</Text>
            <Text style={styles.topStatValue} numberOfLines={1}>
              {topMood === undefined ? "—" : topMood ?? "None yet"}
            </Text>
          </View>
        </View>
      </View>

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
    signOutErrorText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginBottom: theme.spacing.sm,
      textAlign: "center",
    },
    signOutButton: {
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
