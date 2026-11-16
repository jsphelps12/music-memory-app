import { useCallback, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  ActivityIndicator,
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
import { Icon } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import { PromptsSection } from "@/components/PromptsSection";
import { confirmSheet } from "@/components/ConfirmSheet";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/Button";
import { ListRow } from "@/components/ListRow";
import { DailyCheckInRow } from "@/components/DailyCheckInRow";
import { AppLockRow } from "@/components/AppLockRow";
import { exportJournalPdf } from "@/lib/journalExportDevice";
import { moodLabel } from "@/lib/moodLabels";
import { MOODS } from "@/constants/Moods";
import { useOnForeground } from "@/lib/appFocus";
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
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Export your journal (1.4): the whole journal as a PDF, then the share
  // sheet (Save to Files, Mail, AirDrop). Your words are yours.
  const handleExport = useCallback(async () => {
    if (!user || exporting) return;
    Haptics.selectionAsync();
    setExporting(true);
    setExportStatus("Making your PDF…");
    try {
      const count = await exportJournalPdf(user.id, {
        ownerName: profile?.displayName,
        moodLabel: (v) => moodLabel(v, [...MOODS, ...(profile?.customMoods ?? [])]),
      });
      posthog.capture("journal_exported", { format: "pdf", moments: count });
      setExportStatus(null);
    } catch (e) {
      setExportStatus(friendlyError(e));
    } finally {
      setExporting(false);
    }
  }, [user, exporting, profile?.displayName, profile?.customMoods, posthog]);
  const [addressCopied, setAddressCopied] = useState(false);

  // Permission can change in iOS Settings while we're away, so read it on
  // every focus and every return to the app (coming back from iOS Settings
  // isn't a focus change); it's a local call.
  const readPermission = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) =>
        setNotifPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined")
      )
      .catch(() => {});
  }, []);
  useFocusEffect(readPermission);
  useOnForeground(readPermission);

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
  // Mail if there's a mail app (mailto is declared in
  // LSApplicationQueriesSchemes since 1.4, so canOpenURL can answer);
  // otherwise, or if opening still fails, the copy-the-address sheet.
  const handleFeedback = async () => {
    Haptics.selectionAsync();
    const showAddress = () => {
      setAddressCopied(false);
      setFeedbackSheetVisible(true);
    };
    try {
      if (!(await Linking.canOpenURL(FEEDBACK_MAILTO))) return showAddress();
      await Linking.openURL(FEEDBACK_MAILTO);
    } catch {
      showAddress();
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
          <ListRow label="Edit profile" onPress={() => router.push("/profile-edit")} />
          <ListRow label="Invite a friend" onPress={handleInvite} />
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Journal</SectionLabel>
        <View style={styles.list}>
          {user ? <DailyCheckInRow userId={user.id} /> : null}
          <ListRow
            label="Notifications"
            detail={notifPermission !== "granted" ? "Off" : undefined}
            accessory="expand"
            expanded={showNotifications}
            onPress={() => setShowNotifications((v) => !v)}
            last={showNotifications}
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
                  <Icon name="notifications-off-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.notifSettingsText}>Notifications are off for Soundtracks</Text>
                  <Text style={styles.notifSettingsLink}>Open Settings</Text>
                </TouchableOpacity>
              ) : (
                notifRows.map(({ field, label, sub }, idx) => (
                  <ListRow
                    key={field}
                    label={label}
                    subtitle={sub}
                    last={idx === notifRows.length - 1}
                    trailing={
                      <Switch
                        value={notifValue(field)}
                        onValueChange={(v) => handleNotifToggle(field, v)}
                        disabled={pendingNotif !== null || !profile}
                        trackColor={switchTrack}
                        ios_backgroundColor={theme.colors.border}
                      />
                    }
                  />
                ))
              )}
            </View>
          )}
          <ListRow
            label="Prompts"
            accessory="expand"
            expanded={showPrompts}
            onPress={() => setShowPrompts((v) => !v)}
            last={showPrompts}
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
          <ListRow
            label="Export your journal"
            subtitle={exportStatus ?? "Every moment and your words, as a PDF"}
            onPress={handleExport}
            disabled={exporting}
            trailing={exporting ? <ActivityIndicator color={theme.colors.textSecondary} /> : undefined}
            last
          />
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Privacy</SectionLabel>
        <View style={styles.list}>
          <AppLockRow last />
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Support</SectionLabel>
        <View style={styles.list}>
          <ListRow label="Help" onPress={() => router.push("/help")} />
          <ListRow label="Share feedback" onPress={handleFeedback} />
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
        {/* Long-press: the photos ↔ music prototype (1.4), hidden on purpose. */}
        <Text style={styles.signedInAs} onLongPress={() => router.push("/dev/library" as any)} suppressHighlighting>
          {versionLine()}
        </Text>
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
