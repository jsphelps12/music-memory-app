// Pure notification-selection logic for the send-notifications edge function.
//
// This file deliberately contains NO Deno APIs, no URL imports and no I/O — it
// is plain TypeScript so it can be unit tested with vitest from the app repo
// (`supabase/functions/**` is excluded from tsconfig and eslint, but vitest
// picks up the co-located test file). Everything the cascade needs is passed in,
// including `random`, so a test can make the random memory deterministic.
//
// index.ts owns: auth, fetching, sending, stamping last_notified_at.
// This file owns: deciding who gets which notification.

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** A moment row as stored per-user in `momentsByUser` (sorted created_at desc). */
export interface MomentRow {
  id: string;
  moment_date: string;
  song_title: string;
  song_artist: string;
  created_at: string;
  /**
   * created_at as a YYYY-MM-DD date in the owner's timezone. Set by
   * buildSelectionInputs; when absent, the UTC date is used.
   */
  local_created_date?: string;
}

/** A moment row as it comes back from the single cross-user moments query. */
export interface UserMomentRow extends MomentRow {
  user_id: string;
}

/** A `profiles` row for a user eligible to receive a push right now. */
export interface EligibleUser {
  id: string;
  push_token?: string | null;
  created_at?: string | null;
  timezone?: string | null;
  notif_on_this_day?: boolean | null;
  notif_resurfacing?: boolean | null;
  notif_milestones?: boolean | null;
  /** "daily" | "few" | "weekly" | "off"; anything else reads as "few". */
  notif_frequency?: string | null;
  /** When this function last sent the user anything (the spacing). */
  last_notified_at?: string | null;
}

export interface SelectNotificationsInput {
  eligibleUsers: EligibleUser[];
  momentsByUser: Record<string, MomentRow[]>;
  /** userIds who logged a moment today */
  loggedTodaySet: Set<string>;
  allMoments: UserMomentRow[] | null;
  now: Date;
  todayStr: string;
  todayYear: number;
  todayMM: string;
  todayDD: string;
  prefsByUserId: Record<string, EligibleUser | undefined>;
  tokenByUserId: Record<string, string>;
  /** injectable for deterministic tests; defaults to Math.random */
  random?: () => number;
}

export interface SelectNotificationsResult {
  messages: ExpoPushMessage[];
  /** everyone who got a push this run; the caller stamps last_notified_at */
  notifiedUserIds: string[];
}

export const STREAK_MILESTONES = new Set([5, 10, 25, 50]);

// ── How often (1.4) ──────────────────────────────────────────────────────────
// One setting, "How often", spaces out memories coming back (On this day,
// random memories): at least this many days between them. "off" sends
// nothing from here at all. Friends' pushes and the user's own check-in are
// elsewhere and not counted.

export type NotifFrequency = "daily" | "few" | "weekly" | "off";
export const DEFAULT_FREQUENCY: NotifFrequency = "few";
export const FREQUENCY_GAP_DAYS: Record<Exclude<NotifFrequency, "off">, number> = {
  daily: 1,
  few: 3,
  weekly: 7,
};
/** Runs land near 10am local but not to the minute; don't lose a day to that. */
const GAP_SLACK_MS = 3 * 3600000;
/** A random memory is at least this old: it should feel like it came back. */
export const RANDOM_MEMORY_MIN_AGE_DAYS = 30;

export function frequencyOf(user: EligibleUser | undefined): NotifFrequency {
  const f = user?.notif_frequency;
  return f === "daily" || f === "few" || f === "weekly" || f === "off" ? f : DEFAULT_FREQUENCY;
}

/** Whether enough time has passed since the last push for this user's setting. */
export function spacingAllows(user: EligibleUser | undefined, now: Date): boolean {
  const f = frequencyOf(user);
  if (f === "off") return false;
  const last = user?.last_notified_at ? Date.parse(user.last_notified_at) : NaN;
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= FREQUENCY_GAP_DAYS[f] * 86400000 - GAP_SLACK_MS;
}

export function computeStreak(momentDates: string[], todayStr: string): number {
  if (!momentDates.length) return 0;
  const dates = [...new Set(momentDates.map(d => d.slice(0, 10)))].sort().reverse();
  if (dates[0] !== todayStr) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "June 2019" from "2019-06-03"; empty for anything unparseable. */
export function monthYear(momentDate: string): string {
  const [y, m] = momentDate.split("-");
  const name = MONTHS[Number(m) - 1];
  return name && y ? `${name} ${y}` : "";
}

/**
 * The cascade (1.4). Each user receives at most one notification per run;
 * earlier priorities are more timely or personal.
 *
 * 1. Lifecycle (days 1, 3, 7 after signing up): getting started. Not spaced.
 * 2. Streak milestone, on a day you logged: earned, so not spaced.
 * 3. On this day: spaced by "How often".
 * 4. A random memory at least a month old: spaced by "How often".
 *
 * "How often: Off" stops all of them. Retired in 1.4 (principle 3, never
 * notify about absence): streak reminders, "still there?" re-engagement,
 * the day-7/day-14 "we miss you" lifecycle pushes, and the Tue/Thu journal
 * prompts (the daily check-in, which people choose, replaces them).
 * Notifications never carry the user's own words: a push can show on the
 * Lock Screen.
 */
export function selectNotifications(input: SelectNotificationsInput): SelectNotificationsResult {
  const {
    eligibleUsers,
    momentsByUser,
    loggedTodaySet,
    allMoments,
    now,
    todayStr,
    todayYear,
    todayMM,
    todayDD,
    prefsByUserId,
    tokenByUserId,
    random = Math.random,
  } = input;

  const messages: ExpoPushMessage[] = [];
  const assigned = new Set<string>();
  const send = (userId: string, message: Omit<ExpoPushMessage, "to">) => {
    messages.push({ to: tokenByUserId[userId], ...message });
    assigned.add(userId);
  };
  const isOff = (userId: string) => frequencyOf(prefsByUserId[userId]) === "off";

  // ── 1: LIFECYCLE ───────────────────────────────────────────────────────────
  for (const { id: userId, created_at } of eligibleUsers) {
    if (!created_at || isOff(userId)) continue;
    const accountAgeDays = Math.floor((now.getTime() - new Date(created_at).getTime()) / 86400000);
    const momentCount = (momentsByUser[userId] ?? []).length;

    if (accountAgeDays === 1 && momentCount < 1) {
      send(userId, {
        title: "Start your story 🎵",
        body: "What are you listening to right now? Log your first moment — takes 30 seconds.",
        data: { type: "create" },
      });
    } else if (accountAgeDays === 3 && momentCount < 5) {
      send(userId, {
        title: "3 days in 🎶",
        body: "Keep the story going — what's been in your ears?",
        data: { type: "create" },
      });
    } else if (accountAgeDays === 7 && momentCount >= 1) {
      send(userId, {
        title: "One week! 🎉",
        body: `You've saved ${momentCount} moment${momentCount !== 1 ? "s" : ""}. Keep it coming.`,
        data: { type: "tabs" },
      });
    }
  }

  // ── 2: STREAK MILESTONE ────────────────────────────────────────────────────
  const milestoneCopyMap: Record<number, string> = {
    5: "5-day streak 🔥 — Your music story is taking shape.",
    10: "10 days straight. You're on a roll.",
    25: "25-day streak — your timeline is something worth looking back on.",
    50: "50 days. That's real dedication.",
  };

  for (const { id: userId } of eligibleUsers) {
    if (assigned.has(userId) || isOff(userId)) continue;
    if (prefsByUserId[userId]?.notif_milestones === false) continue;
    // Streak can only be non-zero if user logged today
    if (!loggedTodaySet.has(userId)) continue;

    const dates = (momentsByUser[userId] ?? []).map(
      m => m.local_created_date ?? m.created_at.slice(0, 10)
    );
    const streak = computeStreak(dates, todayStr);
    if (!STREAK_MILESTONES.has(streak)) continue;

    send(userId, {
      title: `${streak}-Day Streak 🔥`,
      body: milestoneCopyMap[streak],
      data: { type: "tabs", streak },
    });
  }

  // ── 3: ON THIS DAY ─────────────────────────────────────────────────────────
  // The title is the anniversary, the body is the song, and a tap opens the
  // memory card (type "memory"), where the song is already playing. Binaries
  // without the card fall back to momentId.
  const byUserOnThisDay = new Map<
    string,
    { momentId: string; songTitle: string; songArtist: string; momentYear: number }
  >();

  for (const row of allMoments ?? []) {
    if (assigned.has(row.user_id)) continue;
    if (!row.moment_date) continue;
    const [yearStr, month, day] = row.moment_date.split("-");
    const rowYear = Number(yearStr);
    if (month === todayMM && day === todayDD && rowYear < todayYear) {
      const existing = byUserOnThisDay.get(row.user_id);
      if (!existing || rowYear > existing.momentYear) {
        byUserOnThisDay.set(row.user_id, {
          momentId: row.id,
          songTitle: row.song_title,
          songArtist: row.song_artist,
          momentYear: rowYear,
        });
      }
    }
  }

  for (const [userId, { momentId, songTitle, songArtist, momentYear }] of byUserOnThisDay) {
    if (prefsByUserId[userId]?.notif_on_this_day === false) continue;
    if (!spacingAllows(prefsByUserId[userId], now)) continue;
    const yearsAgo = todayYear - momentYear;
    send(userId, {
      title: `${yearsAgo === 1 ? "1 year" : `${yearsAgo} years`} ago today`,
      body: `${songTitle}, ${songArtist}`,
      data: { momentId, type: "memory" },
    });
  }

  // ── 4: A RANDOM MEMORY ─────────────────────────────────────────────────────
  // Whenever "How often" allows and nothing above was sent: one moment saved
  // at least a month ago, opened on the memory card like On this day.
  const oldEnough = now.getTime() - RANDOM_MEMORY_MIN_AGE_DAYS * 86400000;
  for (const { id: userId } of eligibleUsers) {
    if (assigned.has(userId)) continue;
    if (prefsByUserId[userId]?.notif_resurfacing === false) continue;
    if (!spacingAllows(prefsByUserId[userId], now)) continue;
    const pool = (momentsByUser[userId] ?? []).filter(
      (m) => new Date(m.created_at).getTime() <= oldEnough
    );
    if (pool.length === 0) continue;

    const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    const when = monthYear(pick.moment_date);
    send(userId, {
      title: "Remember this? 🎵",
      body: `${pick.song_title}, ${pick.song_artist}${when ? ` · ${when}` : ""}`,
      data: { momentId: pick.id, type: "memory" },
    });
  }

  return { messages, notifiedUserIds: [...assigned] };
}

// ── Local-day inputs ─────────────────────────────────────────────────────────
// Users are picked when it is 10am in their own timezone, so "today" and On
// This Day must use that zone's calendar too, not the UTC one (for UTC+10 the
// 10am run happens on the previous UTC day).

/** The calendar day in one timezone at a given instant. */
export interface LocalDay {
  dateStr: string; // YYYY-MM-DD
  yesterdayStr: string; // YYYY-MM-DD (kept for callers that need it)
  year: number;
  mm: string;
  dd: string;
  dow: number; // 0=Sun … 6=Sat
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** A usable IANA timezone, falling back to UTC for missing or unknown ones. */
export function normalizeTimezone(timezone: string | null | undefined): string {
  if (!timezone) return "UTC";
  try {
    formatterFor(timezone);
    return timezone;
  } catch {
    return "UTC";
  }
}

function parts(instant: Date, timezone: string) {
  const out: Record<string, string> = {};
  for (const p of formatterFor(timezone).formatToParts(instant)) out[p.type] = p.value;
  return out;
}

/** YYYY-MM-DD of `instant` in `timezone` (pass a normalized timezone). */
export function localDateStr(instant: Date, timezone: string): string {
  const p = parts(instant, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localDay(instant: Date, timezone: string): LocalDay {
  const p = parts(instant, timezone);
  const dateStr = `${p.year}-${p.month}-${p.day}`;
  const y = new Date(`${dateStr}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  return {
    dateStr,
    yesterdayStr: y.toISOString().slice(0, 10),
    year: Number(p.year),
    mm: p.month,
    dd: p.day,
    dow: WEEKDAYS[p.weekday] ?? 0,
  };
}

/**
 * Turn the eligible users and their moments (sorted created_at desc) into one
 * selectNotifications input per local calendar day. Users at their local 10am
 * can still be on different dates (UTC-10 and UTC+14), so each group gets its
 * own today and MM-DD, and every moment's "logged on" date is
 * taken in its owner's timezone.
 */
export function buildSelectionInputs(
  eligibleUsers: EligibleUser[],
  momentRows: UserMomentRow[],
  now: Date,
  random?: () => number
): SelectNotificationsInput[] {
  const tzByUser = new Map<string, string>();
  const dayByUser = new Map<string, LocalDay>();
  const groups = new Map<string, { day: LocalDay; users: EligibleUser[] }>();

  for (const u of eligibleUsers) {
    const tz = normalizeTimezone(u.timezone);
    const day = localDay(now, tz);
    tzByUser.set(u.id, tz);
    dayByUser.set(u.id, day);
    const g = groups.get(day.dateStr) ?? { day, users: [] };
    g.users.push(u);
    groups.set(day.dateStr, g);
  }

  const momentsByUser: Record<string, MomentRow[]> = {};
  const rowsByUser = new Map<string, UserMomentRow[]>();
  const loggedTodaySet = new Set<string>();

  for (const row of momentRows) {
    const tz = tzByUser.get(row.user_id);
    const day = dayByUser.get(row.user_id);
    if (!tz || !day) continue;
    const loggedDate = localDateStr(new Date(row.created_at), tz);
    (momentsByUser[row.user_id] ??= []).push({
      id: row.id,
      moment_date: row.moment_date,
      song_title: row.song_title,
      song_artist: row.song_artist,
      created_at: row.created_at,
      local_created_date: loggedDate,
    });
    const list = rowsByUser.get(row.user_id) ?? [];
    list.push(row);
    rowsByUser.set(row.user_id, list);
    if (loggedDate === day.dateStr) loggedTodaySet.add(row.user_id);
  }

  const inputs: SelectNotificationsInput[] = [];
  for (const { day, users } of groups.values()) {
    const ids = new Set(users.map((u) => u.id));
    inputs.push({
      eligibleUsers: users,
      momentsByUser: Object.fromEntries(
        Object.entries(momentsByUser).filter(([id]) => ids.has(id))
      ),
      loggedTodaySet: new Set([...loggedTodaySet].filter((id) => ids.has(id))),
      allMoments: users.flatMap((u) => rowsByUser.get(u.id) ?? []),
      now,
      todayStr: day.dateStr,
      todayYear: day.year,
      todayMM: day.mm,
      todayDD: day.dd,
      prefsByUserId: Object.fromEntries(users.map((u) => [u.id, u])),
      tokenByUserId: Object.fromEntries(users.map((u) => [u.id, u.push_token as string])),
      ...(random ? { random } : {}),
    });
  }
  return inputs;
}
