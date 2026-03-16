import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

const STREAK_MILESTONES = new Set([5, 10, 25, 50]);

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendBatch(messages: ExpoPushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch),
    });
    const json = await res.json();
    console.log("Expo push response:", JSON.stringify(json));
  }
}

function computeStreak(momentDates: string[], todayStr: string): number {
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

function getLocalHour(utcDate: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(utcDate);
    return parseInt(parts.find(p => p.type === "hour")!.value, 10);
  } catch {
    return utcDate.getUTCHours();
  }
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayYear = now.getUTCFullYear();
  const todayMM = String(now.getUTCMonth() + 1).padStart(2, "0");
  const todayDD = String(now.getUTCDate()).padStart(2, "0");
  const todayDow = now.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const daySeed = now.getUTCDate(); // deterministic copy variant selector

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Step 1: get all users with a push token + their notification prefs
  const { data: tokenUsers, error: tokenErr } = await supabase
    .from("profiles")
    .select(
      "id, push_token, notif_on_this_day, notif_streak, notif_prompts, notif_resurfacing, notif_milestones, created_at, timezone"
    )
    .not("push_token", "is", null);

  console.log("tokenUsers count:", tokenUsers?.length ?? 0);
  if (tokenErr) console.log("tokenErr:", tokenErr.message);

  if (tokenErr || !tokenUsers || tokenUsers.length === 0) {
    return new Response(JSON.stringify({ sent: 0, error: tokenErr?.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter to users whose local hour is 10
  const eligibleUsers = tokenUsers.filter((u) => {
    const localHour = getLocalHour(now, u.timezone || "UTC");
    return localHour === 10;
  });

  console.log("eligibleUsers count:", eligibleUsers.length);

  if (eligibleUsers.length === 0) {
    return new Response(JSON.stringify({ sent: 0, skipped: tokenUsers.length }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const userIds = eligibleUsers.map((u) => u.id);
  const tokenByUserId = Object.fromEntries(eligibleUsers.map((u) => [u.id, u.push_token as string]));
  const prefsByUserId = Object.fromEntries(eligibleUsers.map((u) => [u.id, u]));

  // Step 2: fetch all moments for eligible users in one query.
  // Order by created_at so streak/re-engagement is based on when you logged, not
  // the date of the memory — logging an old memory today still counts as activity.
  const { data: allMoments } = await supabase
    .from("moments")
    .select("id, user_id, moment_date, song_title, song_artist, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });

  // Build per-user data maps from the single moments fetch
  type MomentRow = { id: string; moment_date: string; song_title: string; song_artist: string; created_at: string };
  const momentsByUser: Record<string, MomentRow[]> = {};
  const loggedYesterdayByUser = new Map<string, string>(); // userId -> song_title
  const loggedTodaySet = new Set<string>();

  for (const row of allMoments ?? []) {
    if (!momentsByUser[row.user_id]) momentsByUser[row.user_id] = [];
    momentsByUser[row.user_id].push({
      id: row.id,
      moment_date: row.moment_date,
      song_title: row.song_title,
      song_artist: row.song_artist,
      created_at: row.created_at,
    });
    const loggedDate = (row.created_at as string).slice(0, 10);
    if (loggedDate === yesterdayStr && !loggedYesterdayByUser.has(row.user_id)) {
      loggedYesterdayByUser.set(row.user_id, row.song_title);
    }
    if (loggedDate === todayStr) loggedTodaySet.add(row.user_id);
  }

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

    const dates = (momentsByUser[userId] ?? []).map(m => m.created_at.slice(0, 10));
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
  for (const { id: userId } of eligibleUsers) {
    if (assignedUserIds.has(userId)) continue;
    if (prefsByUserId[userId]?.notif_prompts === false) continue;

    const lastMoment = (momentsByUser[userId] ?? [])[0] ?? null;
    if (!lastMoment) continue; // No moments yet — lifecycle or prompt will handle

    const daysSince = Math.floor(
      (now.getTime() - new Date(lastMoment.created_at).getTime()) / 86400000
    );
    if (daysSince < 7) continue;

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

      const randomMoment = userMoments[Math.floor(Math.random() * userMoments.length)];
      messages.push({
        to: tokenByUserId[userId],
        title: "Remember this? 🎵",
        body: resurfaceCopyFn(randomMoment.song_title, randomMoment.song_artist),
        data: { momentId: randomMoment.id },
      });
      assignedUserIds.add(userId);
    }
  }

  console.log("messages to send:", JSON.stringify(messages));

  if (messages.length > 0) {
    await sendBatch(messages);
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
