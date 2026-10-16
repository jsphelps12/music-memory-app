import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

const MILESTONE_COUNTS = [25, 50, 100, 250, 500, 1000];

export type PushRegistrationStep = "register" | "ask" | "skip";

/**
 * Pure decision, exported for tests. Asking and registering are separate
 * questions: `mayAsk` only controls whether the iOS permission dialog may be
 * shown right now. Once permission is granted, registering is always right,
 * whoever granted it and however.
 *
 * They used to be fused, so the launch path registered only for users who
 * were also eligible to be asked. That missed anyone who declined at the
 * celebration screen and later turned notifications on in iOS Settings, and
 * any device whose first-moment flag was never written (it is only set on
 * sign-in from the auth screens). Those users never got a token at all.
 * Found on a beta device on 2026-10-16.
 */
export function pushRegistrationStep(permission: string, mayAsk: boolean): PushRegistrationStep {
  if (permission === "granted") return "register";
  return mayAsk ? "ask" : "skip";
}

export async function registerForPushNotifications(
  userId: string,
  { mayAsk = true }: { mayAsk?: boolean } = {}
): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const step = pushRegistrationStep(existingStatus, mayAsk);
  if (step === "skip") return;

  if (step === "ask") {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await supabase.from("profiles").update({ push_token: token, timezone }).eq("id", userId);
}

export async function checkAndNotifyMilestone(userId: string): Promise<void> {
  const { count, error } = await supabase
    .from("moments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  if (count === null) return;

  if (!MILESTONE_COUNTS.includes(count)) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎉 Milestone reached!",
      body: `${count} moments! You're building something special.`,
    },
    trigger: null,
  });
}
