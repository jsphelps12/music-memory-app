import { useCallback, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  Switch,
  Linking,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { PromptsSection } from "@/components/PromptsSection";
import { confirmSheet } from "@/components/ConfirmSheet";
import { IconButton } from "@/components/IconButton";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { friendInviteUrl } from "@/lib/momentShares";

/**
 * "1.2.0 (27) · update Oct 17, 3:40 PM": which binary and which OTA bundle
 * this is, so "I can't see the changes" can be answered from the phone.
 * The embedded bundle (no OTA applied yet) says so.
 */
function versionLine(): string {
  const binary = `${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`;
  if (__DEV__) return `${binary} · development`;
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `${binary} · built-in bundle`;
  const when = Updates.createdAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${binary} · update ${when}`;
}

type NotifField =
  | "notifOnThisDay"
  | "notifStreak"
  | "notifPrompts"
  | "notifResurfacing"
  | "notifMilestones";

// Analytics names predate the camelCase fields; keep the event values stable.
const NOTIF_EVENT_NAME: Record<NotifField, string> = {
  notifOnThisDay: "notif_on_this_day",
  notifStreak: "notif_streak",
  notifPrompts: "notif_prompts",
  notifResurfacing: "notif_resurfacing",
  notifMilestones: "notif_milestones",
};

/**
 * Settings (Phase 1, 2026-10): everything that used to stack up under the
 * You tab's stats. You is now about your stuff (shared with you, albums,
 * friends); the knobs live here, behind its gear.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const {
    user,
    profile,
    updateProfile,
    signOut,
    deleteAccount,
    saveCustomPromptCategory,
    deleteCustomPromptCategory,
  } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifPermission, setNotifPermission] = useState<"granted" | "denied" | "undetermined">("granted");
  // The profile in AuthContext is the source of truth for the toggles; this
  // only holds the value being saved, so the switch moves on tap.
  const [pendingNotif, setPendingNotif] = useState<{ field: NotifField; value: boolean } | null>(null);

  // Permission can change in iOS Settings while we're away, so read it on
  // every focus; it's a local call.
  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync()
        .then(({ status }) =>
          setNotifPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined")
        )
        .catch(() => {});
    }, [])
  );

  const notifValue = (field: NotifField): boolean =>
    pendingNotif?.field === field ? pendingNotif.value : profile?.[field] ?? true;

  const handleNotifToggle = async (field: NotifField, value: boolean) => {
    if (!user || !profile || pendingNotif !== null) return;
    setPendingNotif({ field, value });
    posthog.capture("notification_preferences_changed", { notification_type: NOTIF_EVENT_NAME[field], enabled: value });
    try {
      // Goes through AuthContext so the profile everyone reads is updated too.
      await updateProfile({ [field]: value });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Couldn't save", friendlyError(e));
    } finally {
      setPendingNotif(null);
    }
  };

  const handleInvite = () => {
    if (!profile?.friendInviteToken) return;
    const url = friendInviteUrl(profile.friendInviteToken);
    Share.share(Platform.OS === "ios" ? { url } : { message: url });
  };

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

  const handleDeleteAccount = async () => {
    // Double-confirm on purpose: this is the app's only unrecoverable action.
    const first = await confirmSheet({
      title: "Delete Account",
      message:
        "This will permanently delete your account and all your moments, photos, and collections. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!first) return;
    const second = await confirmSheet({
      title: "Are you sure?",
      message: "Your data cannot be recovered after deletion.",
      confirmLabel: "Delete My Account",
      destructive: true,
    });
    if (!second) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setDeletingAccount(true);
    try {
      await deleteAccount();
    } catch (e) {
      setDeletingAccount(false);
      Alert.alert("Error", friendlyError(e));
    }
  };

  const notifRows = [
    { field: "notifOnThisDay", label: "On this day", sub: "When a song anniversary comes up" },
    { field: "notifResurfacing", label: "Random memories", sub: "A random moment from your past" },
    { field: "notifMilestones", label: "Streak milestones", sub: "Celebrate hitting a new streak" },
    { field: "notifStreak", label: "Streak reminders", sub: "Keep your logging streak going" },
    { field: "notifPrompts", label: "Journal prompts", sub: "Occasional nudges to capture a moment" },
  ] as const;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton name="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.eyebrow}>Account</Text>
        <Row label="Edit profile" onPress={() => router.push("/profile-edit")} styles={styles} theme={theme} />
        <Row label="Invite a friend" onPress={handleInvite} styles={styles} theme={theme} last />

        <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>Journal</Text>
        <Row
          label="Notifications"
          detail={notifPermission !== "granted" ? "Off" : undefined}
          expanded={showNotifications}
          onPress={() => setShowNotifications((v) => !v)}
          styles={styles}
          theme={theme}
        />
        {showNotifications && (
          <View style={styles.expandBody}>
            {notifPermission !== "granted" ? (
              <TouchableOpacity style={styles.notifSettingsRow} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
                <Ionicons name="notifications-off-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.notifSettingsText}>Notifications are off for Soundtracks</Text>
                <Text style={styles.notifSettingsLink}>Open Settings</Text>
              </TouchableOpacity>
            ) : (
              notifRows.map(({ field, label, sub }, idx) => (
                <View key={field} style={[styles.notifRow, idx > 0 && styles.notifRowBorder]}>
                  <View style={styles.notifRowText}>
                    <Text style={styles.notifRowLabel}>{label}</Text>
                    <Text style={styles.notifRowSub}>{sub}</Text>
                  </View>
                  <Switch
                    value={notifValue(field)}
                    onValueChange={(v) => handleNotifToggle(field, v)}
                    disabled={pendingNotif !== null || !profile}
                    trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
              ))
            )}
          </View>
        )}
        <Row
          label="Prompts"
          expanded={showPrompts}
          onPress={() => setShowPrompts((v) => !v)}
          styles={styles}
          theme={theme}
          last={!showPrompts}
        />
        {showPrompts && (
          <View style={styles.expandBody}>
            <PromptsSection
              customCategories={profile?.customPromptCategories ?? []}
              onSave={saveCustomPromptCategory}
              onDelete={deleteCustomPromptCategory}
            />
          </View>
        )}

        <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>Support</Text>
        <Row label="Help" onPress={() => router.push("/help")} styles={styles} theme={theme} />
        <Row
          label="Share feedback"
          onPress={() => {
            Haptics.selectionAsync();
            Linking.openURL("mailto:founder@soundtracks.app?subject=Soundtracks%20Feedback");
          }}
          styles={styles}
          theme={theme}
          last
        />

        {signOutError ? <Text style={styles.signOutErrorText}>{signOutError}</Text> : null}
        <TouchableOpacity
          style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={signingOut || deletingAccount}
          activeOpacity={0.7}
        >
          {signingOut ? (
            <ActivityIndicator color={theme.colors.textSecondary} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteAccountButton, deletingAccount && styles.buttonDisabled]}
          onPress={handleDeleteAccount}
          disabled={signingOut || deletingAccount}
          activeOpacity={0.7}
        >
          {deletingAccount ? (
            <ActivityIndicator color={theme.colors.textSecondary} />
          ) : (
            <Text style={styles.deleteAccountText}>Delete account</Text>
          )}
        </TouchableOpacity>
        {user?.email ? <Text style={styles.signedInAs}>Signed in as {user.email}</Text> : null}
        <Text style={styles.signedInAs}>{versionLine()}</Text>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  detail,
  expanded,
  onPress,
  last,
  styles,
  theme,
}: {
  label: string;
  detail?: string;
  expanded?: boolean;
  onPress: () => void;
  last?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const icon = expanded === undefined ? "chevron-forward" : expanded ? "chevron-up" : "chevron-down";
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        <Ionicons name={icon} size={16} color={theme.colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginLeft: theme.spacing.xs,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
    },
    eyebrow: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: theme.spacing.xs,
    },
    eyebrowSpaced: {
      marginTop: 28,
    },
    row: {
      height: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    rowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowDetail: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    expandBody: {
      paddingBottom: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
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
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    notifSettingsLink: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    notifRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: theme.spacing.md,
    },
    notifRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    notifRowText: {
      flex: 1,
    },
    notifRowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    notifRowSub: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    signOutErrorText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.lg,
      textAlign: "center",
    },
    signOutButton: {
      marginTop: 36,
      height: 48,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    signOutText: {
      color: theme.colors.text,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    deleteAccountButton: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: theme.spacing.sm,
    },
    deleteAccountText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
    },
    signedInAs: {
      marginTop: theme.spacing.sm,
      textAlign: "center",
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
  });
}
