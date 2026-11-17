// "Last week is ready" (1.4 notification choices): one local notification on
// Sunday at 6pm, when the week's recap opens (lib/lastWeek.ts), and only for
// a week that already has songs or photos in it. Local because everything it
// knows (the library, the photos) stays on the phone.
//
// Re-planned when the app opens (throttled) and when the setting changes:
// on if Settings → Notifications → "Last week is ready" is on, "How often"
// isn't Off, Last week has access, and the week wasn't dismissed. Opening the
// app only on Sundays after 6pm means no reminder that week: it's already
// on the Journal.

import * as Notifications from "expo-notifications";
import { currentWeek, RECAP_HOUR_SUNDAY } from "@/lib/lastWeek";
import { isWeekDismissed, weekSoFarHasContent } from "@/lib/lastWeekData";
import type { UserProfile } from "@/types";

const ID = "last-week-ready";
const EVERY_MS = 6 * 60 * 60 * 1000;
let lastRunAt = 0;

export const LAST_WEEK_READY_TITLE = "Last week is ready";
export const LAST_WEEK_READY_BODY = "The songs and photos from your week, ready to become moments.";

/** Sunday 6pm of the week containing `now`, or null once it has passed. */
export function recapReminderAt(now: Date): Date | null {
  const end = new Date(currentWeek(now.getTime()).end); // next Monday 00:00
  const at = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, RECAP_HOUR_SUNDAY, 0, 0, 0);
  return at.getTime() > now.getTime() ? at : null;
}

/** The setting as Settings shows it: on unless switched off or "How often" is Off. */
export function lastWeekReadyOn(profile: Pick<UserProfile, "notifLastWeek" | "notifFrequency"> | null): boolean {
  return !!profile && profile.notifLastWeek !== false && profile.notifFrequency !== "off";
}

async function cancel(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
  } catch {}
}

/**
 * Brings the reminder in line with the settings and the week so far. Safe
 * to call often: without `force` it does the work at most every 6 hours.
 */
export async function refreshLastWeekReady(
  profile: Pick<UserProfile, "notifLastWeek" | "notifFrequency"> | null,
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {}
): Promise<void> {
  if (!lastWeekReadyOn(profile)) {
    lastRunAt = 0;
    return cancel();
  }
  if (!force && now.getTime() - lastRunAt < EVERY_MS) return;
  lastRunAt = now.getTime();

  const at = recapReminderAt(now);
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (
      !at ||
      status !== "granted" ||
      (await isWeekDismissed(currentWeek(now.getTime()))) ||
      !(await weekSoFarHasContent(now.getTime()))
    ) {
      return cancel();
    }
    await Notifications.scheduleNotificationAsync({
      identifier: ID, // one at a time: scheduling again replaces it
      content: {
        title: LAST_WEEK_READY_TITLE,
        body: LAST_WEEK_READY_BODY,
        data: { type: "last_week" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch {}
}

/** Signing out: nothing for the next account. */
export async function clearLastWeekReady(): Promise<void> {
  lastRunAt = 0;
  await cancel();
}
