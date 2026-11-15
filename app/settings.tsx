import { useCallback, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Share,
  Switch,
  Linking,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { friendInviteUrl } from "@/lib/momentShares";

/**
 * "1.2.0 (27) · update Oct 17, 3:40 PM": which binary and which OTA bundle
 * this is, so "I can't see the changes" can be answered from the phone.
 * The embedded bundle (no OTA applied yet) says so.
 */
const FEEDBACK_EMAIL = "founder@soundtracks.app";
const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=Soundtracks%20Feedback`;

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
  const [feedbackSheetVisible, setFeedbackSheetVisible] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

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

  // "Share feedback" used to call openURL bare: with no Mail app (the
  // simulator, or a phone that deleted Mail) it rejected silently and the
  // row did nothing. Try Mail; if it can't open, show the address to copy.
  // No canOpenURL pre-check: "mailto" isn't in LSApplicationQueriesSchemes,
  // so iOS would answer false even when Mail is there (adding it is a
  // native change).
  const handleFeedback = async () => {
    Haptics.selectionAsync();
    try {
      await Linking.openURL(FEEDBACK_MAILTO);
    } catch {
      setAddressCopied(false);
      setFeedbackSheetVisible(true);
    }
  };

  const handleCopyAddress = async () => {
    try {
      await Clipboard.setStringAsync(FEEDBACK_EMAIL);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddressCopied(true);
    } catch {
      // The address is on screen and selectable; nothing else to do.
    }
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
      title: "Delete account",
      message:
        "This will permanently delete your account and all your moments, photos, and collections. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!first) return;
    const second = await confirmSheet({
      title: "Are you sure?",
      message: "Your data cannot be recovered after deletion.",
      confirmLabel: "Delete my account",
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

  // Ink, not terracotta, for an "on" switch (theme.colors.switchOn).
  const switchTrack = { false: theme.colors.border, true: theme.colors.switchOn };

  const notifRows = [
    { field: "notifOnThisDay", label: "On this day", sub: "When a song anniversary comes up" },
    { field: "notifResurfacing", label: "Random memories", sub: "A random moment from your past" },
    { field: "notifMilestones", label: "Streak milestones", sub: "Celebrate hitting a new streak" },
    { field: "notifStreak", label: "Streak reminders", sub: "Keep your logging streak going" },
    { field: "notifPrompts", label: "Journal prompts", sub: "Occasional nudges to capture a moment" },
  ] as const;

  return (
    <View style={styles.container}>
      <ScreenHeader leading="back" title="Settings" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["4xl"] }]}>
        <SectionLabel style={styles.groupLabel}>Account</SectionLabel>
        <View style={styles.list}>
          <Row label="Edit profile" onPress={() => router.push("/profile-edit")} styles={styles} theme={theme} />
          <Row label="Invite a friend" onPress={handleInvite} styles={styles} theme={theme} />
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Journal</SectionLabel>
        <View style={styles.list}>
          <Row
            label="Notifications"
            detail={notifPermission !== "granted" ? "Off" : undefined}
            expanded={showNotifications}
            onPress={() => setShowNotifications((v) => !v)}
            styles={styles}
            theme={theme}
            flush={showNotifications}
          />
          {showNotifications && (
            <View style={styles.expandBody}>
              {notifPermission !== "granted" ? (
                <TouchableOpacity
                  style={styles.notifSettingsRow}
                  onPress={() => Linking.openSettings()}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
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
                      trackColor={switchTrack}
                      ios_backgroundColor={theme.colors.border}
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
            flush={showPrompts}
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
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Support</SectionLabel>
        <View style={styles.list}>
          <Row label="Help" onPress={() => router.push("/help")} styles={styles} theme={theme} />
          <Row label="Share feedback" onPress={handleFeedback} styles={styles} theme={theme} />
        </View>

        {signOutError ? <Text style={styles.signOutErrorText}>{signOutError}</Text> : null}
        <Button
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          loading={signingOut}
          disabled={deletingAccount}
          style={styles.signOutButton}
        />
        <Button
          label="Delete account"
          variant="text"
          tone="destructive"
          fullWidth
          onPress={handleDeleteAccount}
          loading={deletingAccount}
          disabled={signingOut}
          style={styles.deleteAccountButton}
        />
        {user?.email ? <Text style={styles.signedInAs}>Signed in as {user.email}</Text> : null}
        <Text style={styles.signedInAs}>{versionLine()}</Text>
      </ScrollView>

      <BottomSheet
        visible={feedbackSheetVisible}
        onClose={() => setFeedbackSheetVisible(false)}
        title="Share feedback"
      >
        <View style={styles.feedbackBody}>
          <Text style={styles.feedbackText}>
            Mail isn&apos;t set up on this phone. Send a note from any email app to:
          </Text>
          <Text style={styles.feedbackAddress} selectable>
            {FEEDBACK_EMAIL}
          </Text>
          <Text style={styles.feedbackText}>
            Bugs, ideas, a song that should be in here: it all gets read.
          </Text>
          <Button
            label={addressCopied ? "Copied" : "Copy address"}
            icon={addressCopied ? "checkmark" : "copy-outline"}
            onPress={handleCopyAddress}
            style={styles.copyButton}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function Row({
  label,
  detail,
  expanded,
  onPress,
  flush,
  styles,
  theme,
}: {
  label: string;
  detail?: string;
  expanded?: boolean;
  onPress: () => void;
  /** No bottom rule: an expanded body follows and draws its own. */
  flush?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const icon = expanded === undefined ? "chevron-forward" : expanded ? "chevron-up" : "chevron-down";
  return (
    <TouchableOpacity
      style={[styles.row, !flush && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
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
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
    },
    groupLabel: {
      marginBottom: theme.spacing.xs,
    },
    groupLabelSpaced: {
      marginTop: theme.spacing["3xl"],
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
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
      ...theme.typography.body,
      color: theme.colors.text,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs + 2,
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
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.lg,
      textAlign: "center",
    },
    signOutButton: {
      marginTop: theme.spacing["3xl"],
    },
    deleteAccountButton: {
      marginTop: theme.spacing.xs,
    },
    signedInAs: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      marginTop: theme.spacing.sm,
      textAlign: "center",
      color: theme.colors.textSecondary,
    },
    feedbackBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    feedbackText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    feedbackAddress: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.lg,
      color: theme.colors.text,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    copyButton: {
      marginTop: theme.spacing.xl,
    },
  });
}
