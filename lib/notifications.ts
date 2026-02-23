import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

const MILESTONE_COUNTS = [25, 50, 100, 250, 500, 1000];

export async function registerForPushNotifications(userId: string): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  await supabase.from("profiles").update({ push_token: token }).eq("id", userId);
}

export async function checkAndNotifyMilestone(userId: string): Promise<void> {
  const { count, error } = await supabase
    .from("moments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error || count === null) return;

  if (!MILESTONE_COUNTS.includes(count)) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎉 Milestone reached!",
      body: `${count} moments! You're building something special.`,
    },
    trigger: null,
  });
}
