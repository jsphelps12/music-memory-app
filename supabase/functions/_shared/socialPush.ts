// Friends' pushes (1.4 notification choices): whether to send one, and how.
// Pure, so vitest covers it (socialPush.test.ts); notify-social and
// accept-friend-invite use it.
//
// - notif_social false: don't send.
// - notif_quiet_hours (default on): between 10pm and 8am in the recipient's
//   timezone the push still arrives, silently (iOS "passive": no sound, no
//   lit screen, waits in Notification Center). Never dropped.

export interface SocialRecipient {
  push_token?: string | null;
  notif_social?: boolean | null;
  notif_quiet_hours?: boolean | null;
  timezone?: string | null;
}

export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;

/** The hour (0–23) at `now` in `timezone`, or UTC's for a missing/unknown zone. */
export function localHour(now: Date, timezone: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/**
 * The delivery fields for a friend's push, or null when it shouldn't be sent
 * (no token, or friends' notifications are off).
 */
export function socialDelivery(
  recipient: SocialRecipient | null | undefined,
  now: Date
): { to: string; sound?: "default"; interruptionLevel?: "passive" } | null {
  if (!recipient?.push_token) return null;
  if (recipient.notif_social === false) return null;
  const quiet = recipient.notif_quiet_hours !== false && isQuietHour(localHour(now, recipient.timezone));
  return quiet
    ? { to: recipient.push_token, interruptionLevel: "passive" }
    : { to: recipient.push_token, sound: "default" };
}
