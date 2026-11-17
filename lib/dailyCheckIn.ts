// The daily check-in (Phase 2, "Pull"): one question, "What song did you
// listen to today?", at a time you choose. Local notifications only: the
// phone schedules them, no server involved (decided 2026-11-16).
//
// - Opt-in: Settings → Notifications, or a one-time offer in the Journal.
// - On the days you pick (every day by default, 1.4).
// - Skips days you already logged: the next two weeks are scheduled as
//   individual reminders, and saving a moment cancels today's.
// - Refreshed every time the app opens, so it quietly stops after two weeks
//   away rather than pinging someone who left (ROADMAP principle: never
//   notify on absence).
//
// Settings live on the device (AsyncStorage), per user.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";

export interface CheckInSettings {
  enabled: boolean;
  hour: number;
  minute: number;
  /** Weekdays to ask on, 0 = Sunday … 6 = Saturday, sorted. Never empty. */
  days: number[];
}

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_CHECK_IN: CheckInSettings = { enabled: false, hour: 21, minute: 0, days: EVERY_DAY };
/** How far ahead reminders are scheduled; also how long they outlast an absence. */
export const CHECK_IN_DAYS = 14;

const ID_PREFIX = "daily-checkin-";
const settingsKey = (userId: string) => `daily_checkin_v1_${userId}`;
const offerKey = (userId: string) => `daily_checkin_offer_done_v1_${userId}`;

export const CHECK_IN_TITLE = "What song did you listen to today?";
export const CHECK_IN_BODY = "Save it before the day's gone.";

// ── Pure ────────────────────────────────────────────────────────────────

/** YYYY-MM-DD in local time. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The reminder times to schedule: the next `days` days at hour:minute,
 * leaving out today when it was already logged or the time has passed.
 */
export function planCheckIns(
  now: Date,
  hour: number,
  minute: number,
  loggedToday: boolean,
  days = CHECK_IN_DAYS,
  weekdays: number[] = EVERY_DAY
): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (!weekdays.includes(at.getDay())) continue;
    if (i === 0 && (loggedToday || at.getTime() <= now.getTime())) continue;
    out.push(at);
  }
  return out;
}

/** "9:00 PM". */
export function formatCheckInTime(hour: number, minute: number): string {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Valid weekdays, deduplicated and sorted; every day for anything unusable. */
export function normalizeDays(days: unknown): number[] {
  if (!Array.isArray(days)) return EVERY_DAY;
  const valid = [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return valid.length ? valid : EVERY_DAY;
}

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "Every day", "Weekdays", "Weekends", or "Mondays, Wednesdays". */
export function describeDays(days: number[]): string {
  const d = normalizeDays(days);
  if (d.length === 7) return "Every day";
  if (d.join() === "1,2,3,4,5") return "Weekdays";
  if (d.join() === "0,6") return "Weekends";
  // Week order starting Monday reads more naturally.
  return [...d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => DAY_NAMES[x]).join(", ");
}

/** A parsed settings value, or the default when missing or malformed. */
export function parseCheckInSettings(raw: string | null): CheckInSettings {
  if (!raw) return DEFAULT_CHECK_IN;
  try {
    const v = JSON.parse(raw) as Partial<CheckInSettings>;
    const hour = Number(v.hour);
    const minute = Number(v.minute);
    if (
      typeof v.enabled !== "boolean" ||
      !Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59
    ) {
      return DEFAULT_CHECK_IN;
    }
    return { enabled: v.enabled, hour, minute, days: normalizeDays(v.days) };
  } catch {
    return DEFAULT_CHECK_IN;
  }
}

// ── Storage ─────────────────────────────────────────────────────────────

export async function readCheckInSettings(userId: string): Promise<CheckInSettings> {
  try {
    return parseCheckInSettings(await AsyncStorage.getItem(settingsKey(userId)));
  } catch {
    return DEFAULT_CHECK_IN;
  }
}

export async function writeCheckInSettings(userId: string, settings: CheckInSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(settingsKey(userId), JSON.stringify(settings));
  } catch {}
}

/** Whether the Journal's one-time offer was already answered (either way). */
export async function checkInOfferDone(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(offerKey(userId))) === "1";
  } catch {
    return true; // can't remember a dismissal: don't risk showing it forever
  }
}

export async function markCheckInOfferDone(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(offerKey(userId), "1");
  } catch {}
}

export async function clearCheckInData(userId: string): Promise<void> {
  await cancelAllCheckIns();
  try {
    await AsyncStorage.multiRemove([settingsKey(userId), offerKey(userId)]);
  } catch {}
}

// ── Scheduling ──────────────────────────────────────────────────────────

async function cancelAllCheckIns(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((n) => n.identifier.startsWith(ID_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {}
}

/** Did this user save a moment since local midnight? */
async function loggedSinceMidnight(userId: string, now: Date): Promise<boolean> {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { count, error } = await supabase
    .from("moments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", midnight.toISOString());
  // On a failed check, assume not logged: one extra reminder beats none.
  return !error && (count ?? 0) > 0;
}

/**
 * Brings the scheduled reminders in line with the settings: clears ours,
 * then (if on and allowed) schedules the next two weeks. Safe to call often.
 */
export async function refreshCheckIns(userId: string, now = new Date()): Promise<void> {
  const settings = await readCheckInSettings(userId);
  await cancelAllCheckIns();
  if (!settings.enabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const logged = await loggedSinceMidnight(userId, now);
  const times = planCheckIns(now, settings.hour, settings.minute, logged, CHECK_IN_DAYS, settings.days);
  for (const at of times) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${localDayKey(at)}`,
        content: {
          title: CHECK_IN_TITLE,
          body: CHECK_IN_BODY,
          data: { type: "create", source: "daily_checkin" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    } catch {}
  }
}

/** After saving a moment: today's reminder has nothing left to ask. */
export async function cancelTodaysCheckIn(now = new Date()): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`${ID_PREFIX}${localDayKey(now)}`);
  } catch {}
}

/**
 * Turns the check-in on or off (asking for notification permission when
 * turning it on). Resolves to the settings actually in force, so a denied
 * permission comes back as off.
 */
export async function setCheckIn(
  userId: string,
  next: CheckInSettings
): Promise<{ settings: CheckInSettings; permission: "granted" | "denied" }> {
  let permission: "granted" | "denied" = "granted";
  if (next.enabled) {
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      if (asked.status !== "granted") permission = "denied";
    }
  }
  const settings = permission === "granted" ? next : { ...next, enabled: false };
  await writeCheckInSettings(userId, settings);
  await refreshCheckIns(userId);
  return { settings, permission };
}
