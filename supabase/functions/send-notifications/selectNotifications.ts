// Pure notification-selection logic for the send-notifications edge function.
//
// This file deliberately contains NO Deno APIs, no URL imports and no I/O — it
// is plain TypeScript so it can be unit tested with vitest from the app repo
// (`supabase/functions/**` is excluded from tsconfig and eslint, but vitest
// picks up the co-located test file). Everything the cascade needs is passed in,
// including `random`, so a test can make priority 7 deterministic.
//
// index.ts owns: auth, fetching, map building, sending, cooldown stamping.
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
  last_reengagement_at?: string | null;
  notif_on_this_day?: boolean | null;
  notif_streak?: boolean | null;
  notif_prompts?: boolean | null;
  notif_resurfacing?: boolean | null;
  notif_milestones?: boolean | null;
}

export interface SelectNotificationsInput {
  eligibleUsers: EligibleUser[];
  momentsByUser: Record<string, MomentRow[]>;
  /** userId -> song_title of the most recent moment logged yesterday */
  loggedYesterdayByUser: Map<string, string>;
  /** userIds who logged a moment today */
  loggedTodaySet: Set<string>;
  allMoments: UserMomentRow[] | null;
  now: Date;
  todayStr: string;
  todayYear: number;
  todayMM: string;
  todayDD: string;
  /** 0=Sun … 6=Sat, in the users' local timezone (see buildSelectionInputs) */
  todayDow: number;
  /** deterministic copy-variant selector (local day of month) */
  daySeed: number;
  prefsByUserId: Record<string, EligibleUser | undefined>;
  tokenByUserId: Record<string, string>;
  /** injectable for deterministic tests; defaults to Math.random */
  random?: () => number;
}

export interface SelectNotificationsResult {
  messages: ExpoPushMessage[];
  /** users who received a priority-5 re-engagement push; caller stamps their cooldown */
  reengagedUserIds: string[];
}

export const STREAK_MILESTONES = new Set([5, 10, 25, 50]);

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

/**
 * The 7-priority cascade. Each user receives at most one notification per run:
 * once a user is added to `assignedUserIds` every later priority skips them.
 * Priority order is load-bearing — earlier priorities are more timely/personal.
 */
export function selectNotifications(input: SelectNotificationsInput): SelectNotificationsResult {
  const {
    eligibleUsers,
    momentsByUser,
    loggedYesterdayByUser,
    loggedTodaySet,
    allMoments,
    now,
    todayStr,
    todayYear,
    todayMM,
    todayDD,
    todayDow,
    daySeed,
    prefsByUserId,
    tokenByUserId,
    random = Math.random,
  } = input;

  const messages: ExpoPushMessage[] = [];
  const assignedUserIds = new Set<string>();

  // ── Priority 1: LIFECYCLE ──────────────────────────────────────────────────
  // Fires on exactly the Nth day after account creation. No pref toggle.
  for (const { id: userId, created_at } of eligibleUsers) {
    if (!created_at) continue;
    const accountAgeDays = Math.floor(
      (now.getTime() - new Date(created_at).getTime()) / 86400000
    );

    const userMoments = momentsByUser[userId] ?? [];
    const momentCount = userMoments.length;
    const lastMoment = userMoments[0] ?? null; // sorted desc, so first = most recent

    let notification: ExpoPushMessage | null = null;

    if (accountAgeDays === 1 && momentCount < 1) {
      notification = {
        to: tokenByUserId[userId],
        title: "Start your story 🎵",
        body: "What are you listening to right now? Log your first moment — takes 30 seconds.",
        data: { type: "create" },
      };
    } else if (accountAgeDays === 3 && momentCount < 5) {
      notification = {
        to: tokenByUserId[userId],
        title: "3 days in 🎶",
        body: "Keep the story going — what's been in your ears?",
        data: { type: "create" },
      };
    } else if (accountAgeDays === 7 && momentCount >= 1) {
      notification = {
        to: tokenByUserId[userId],
        title: "One week! 🎉",
        body: `You've saved ${momentCount} moment${momentCount !== 1 ? "s" : ""}. Keep it coming.`,
        data: { type: "tabs" },
      };
    } else if (accountAgeDays === 7 && momentCount < 1) {
      notification = {
        to: tokenByUserId[userId],
        title: "One week in",
        body: "Your musical story is still waiting to start.",
        data: { type: "create" },
      };
    } else if (accountAgeDays === 14 && lastMoment) {
      const daysSinceLast = Math.floor(
        (now.getTime() - new Date(lastMoment.moment_date + "T00:00:00Z").getTime()) / 86400000
      );
      if (daysSinceLast > 7) {
        notification = {
          to: tokenByUserId[userId],
          title: "We miss your story",
          body: `${lastMoment.song_title} was your last. Add another?`,
          data: { momentId: lastMoment.id },
        };
      }
    }

    if (notification) {
      messages.push(notification);
      assignedUserIds.add(userId);
    }
  }

  // ── Priority 2: STREAK MILESTONE ──────────────────────────────────────────
  const milestoneCopyMap: Record<number, string> = {
    5: "5-day streak 🔥 — Your music story is taking shape.",
    10: "10 days straight. You're on a roll.",
    25: "25-day streak — your timeline is something worth looking back on.",
    50: "50 days. That's real dedication.",
  };

  for (const { id: userId } of eligibleUsers) {
    if (assignedUserIds.has(userId)) continue;
    if (prefsByUserId[userId]?.notif_milestones === false) continue;
    // Streak can only be non-zero if user logged today
    if (!loggedTodaySet.has(userId)) continue;

    const dates = (momentsByUser[userId] ?? []).map(
      m => m.local_created_date ?? m.created_at.slice(0, 10)
    );
    const streak = computeStreak(dates, todayStr);
    if (!STREAK_MILESTONES.has(streak)) continue;

    messages.push({
      to: tokenByUserId[userId],
      title: `${streak}-Day Streak 🔥`,
      body: milestoneCopyMap[streak],
      data: { type: "tabs", streak },
    });
    assignedUserIds.add(userId);
  }

  // ── Priority 3: ON THIS DAY ────────────────────────────────────────────────
  const onThisDayCopies: Array<(n: number, song: string, artist: string) => string> = [
    (n, song, artist) => `${n} year${n !== 1 ? "s" : ""} ago: ${song} by ${artist}`,
    (n, song, _artist) => `This memory found you ${n} year${n !== 1 ? "s" : ""} ago → ${song}`,
    (n, song, _artist) => `${n} year${n !== 1 ? "s" : ""} back, you saved ${song}. Does it still sound the same?`,
  ];

  const byUserOnThisDay = new Map<
    string,
    { momentId: string; songTitle: string; songArtist: string; momentYear: number }
  >();

  for (const row of allMoments ?? []) {
    if (assignedUserIds.has(row.user_id)) continue;
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
    const yearsAgo = todayYear - momentYear;
    const copyFn = onThisDayCopies[daySeed % onThisDayCopies.length];
    messages.push({
      to: tokenByUserId[userId],
      title: "On This Day 🎵",
      body: copyFn(yearsAgo, songTitle, songArtist),
      data: { momentId },
    });
    assignedUserIds.add(userId);
  }

  // ── Priority 4: STREAK REMINDER ───────────────────────────────────────────
  const streakReminderCopies: Array<(song: string) => string> = [
    (_song) => "You logged yesterday. Keep it going — what are you hearing today?",
    (_song) => "Don't break it. What song describes today?",
    (song) => `${song} was yesterday. Add today's.`,
  ];

  for (const { id: userId } of eligibleUsers) {
    if (assignedUserIds.has(userId)) continue;
    if (prefsByUserId[userId]?.notif_streak === false) continue;
    if (!loggedYesterdayByUser.has(userId) || loggedTodaySet.has(userId)) continue;

    const yesterdaySong = loggedYesterdayByUser.get(userId)!;
    const copyFn = streakReminderCopies[daySeed % streakReminderCopies.length];
    messages.push({
      to: tokenByUserId[userId],
      title: "Keep your streak going 🔥",
      body: copyFn(yesterdaySong),
      data: { type: "create" },
    });
    assignedUserIds.add(userId);
  }

  // ── Priority 5: RE-ENGAGEMENT ─────────────────────────────────────────────
  // Grouped with notif_prompts toggle (both are about creating).
  //
  // Cooldown is essential here: this branch matches on "hasn't posted in N
  // days", which stays true indefinitely once someone goes dormant. Without a
  // gap, every dormant user got "Still there?" every single day forever, which
  // drives uninstalls rather than returns. Longer gaps for longer-dormant
  // users — someone silent for a month doesn't want a weekly reminder either.
  const reengagedUserIds: string[] = [];
  for (const { id: userId, last_reengagement_at } of eligibleUsers) {
    if (assignedUserIds.has(userId)) continue;
    if (prefsByUserId[userId]?.notif_prompts === false) continue;

    const lastMoment = (momentsByUser[userId] ?? [])[0] ?? null;
    if (!lastMoment) continue; // No moments yet — lifecycle or prompt will handle

    const daysSince = Math.floor(
      (now.getTime() - new Date(lastMoment.created_at).getTime()) / 86400000
    );
    if (daysSince < 7) continue;

    const cooldownDays = daysSince >= 30 ? 30 : daysSince >= 14 ? 14 : 7;
    if (last_reengagement_at) {
      const daysSinceLastNudge = Math.floor(
        (now.getTime() - new Date(last_reengagement_at as string).getTime()) / 86400000
      );
      if (daysSinceLastNudge < cooldownDays) continue;
    }

    let body: string;
    let notifData: Record<string, unknown>;

    if (daysSince >= 30) {
      body = "Still there? Even one song keeps the story alive.";
      notifData = { type: "create" };
    } else if (daysSince >= 14) {
      body = `${lastMoment.song_title} was your last moment. What's playing now?`;
      notifData = { momentId: lastMoment.id };
    } else {
      const copies = [
        "It's been a week. What's been in your ears?",
        "What song describes this week?",
      ];
      body = copies[daySeed % copies.length];
      notifData = { type: "create" };
    }

    messages.push({
      to: tokenByUserId[userId],
      title: "Your music story is waiting 🎶",
      body,
      data: notifData,
    });
    assignedUserIds.add(userId);
    reengagedUserIds.push(userId);
  }

  // ── Priority 6: JOURNAL PROMPT (Tue=2 or Thu=4) ───────────────────────────
  if (todayDow === 2 || todayDow === 4) {
    const promptCopies = [
      { title: "What are you listening to? 🎶", body: "Log it before you forget." },
      { title: "A song is playing somewhere 🎵", body: "What does it remind you of?" },
      { title: "Quick capture ⚡", body: "What are you listening to? Drop a moment." },
    ];
    const promptCopy = promptCopies[daySeed % promptCopies.length];

    for (const { id: userId } of eligibleUsers) {
      if (assignedUserIds.has(userId)) continue;
      if (prefsByUserId[userId]?.notif_prompts === false) continue;
      messages.push({
        to: tokenByUserId[userId],
        title: promptCopy.title,
        body: promptCopy.body,
        data: { type: "create" },
      });
      assignedUserIds.add(userId);
    }
  }

  // ── Priority 7: RANDOM RESURFACING (Mon=1) ────────────────────────────────
  if (todayDow === 1) {
    const resurfaceCopies: Array<(song: string, artist: string) => string> = [
      (song, _artist) => `Remember when you saved ${song}?`,
      (song, artist) => `${song} by ${artist} — you logged this.`,
      (song, artist) => `This came up in your history: ${song} by ${artist}`,
    ];
    const resurfaceCopyFn = resurfaceCopies[daySeed % resurfaceCopies.length];

    for (const { id: userId } of eligibleUsers) {
      if (assignedUserIds.has(userId)) continue;
      if (prefsByUserId[userId]?.notif_resurfacing === false) continue;
      const userMoments = momentsByUser[userId] ?? [];
      if (userMoments.length === 0) continue;

      const randomMoment = userMoments[Math.floor(random() * userMoments.length)];
      messages.push({
        to: tokenByUserId[userId],
        title: "Remember this? 🎵",
        body: resurfaceCopyFn(randomMoment.song_title, randomMoment.song_artist),
        data: { momentId: randomMoment.id },
      });
      assignedUserIds.add(userId);
    }
  }

  return { messages, reengagedUserIds };
}

// ── Local-day inputs ─────────────────────────────────────────────────────────
// Users are picked when it is 10am in their own timezone, so "today",
// "yesterday", On This Day and the weekday prompts must use that zone's
// calendar too, not the UTC one (for UTC+10 the 10am run happens on the
// previous UTC day).

/** The calendar day in one timezone at a given instant. */
export interface LocalDay {
  dateStr: string; // YYYY-MM-DD
  yesterdayStr: string; // YYYY-MM-DD
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
 * own today/yesterday/MM-DD/weekday, and every moment's "logged on" date is
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
  const loggedYesterdayByUser = new Map<string, string>();
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
    if (loggedDate === day.yesterdayStr && !loggedYesterdayByUser.has(row.user_id)) {
      loggedYesterdayByUser.set(row.user_id, row.song_title);
    }
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
      loggedYesterdayByUser: new Map([...loggedYesterdayByUser].filter(([id]) => ids.has(id))),
      loggedTodaySet: new Set([...loggedTodaySet].filter((id) => ids.has(id))),
      allMoments: users.flatMap((u) => rowsByUser.get(u.id) ?? []),
      now,
      todayStr: day.dateStr,
      todayYear: day.year,
      todayMM: day.mm,
      todayDD: day.dd,
      todayDow: day.dow,
      daySeed: Number(day.dd),
      prefsByUserId: Object.fromEntries(users.map((u) => [u.id, u])),
      tokenByUserId: Object.fromEntries(users.map((u) => [u.id, u.push_token as string])),
      ...(random ? { random } : {}),
    });
  }
  return inputs;
}
