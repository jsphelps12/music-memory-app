import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

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

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date();
  const todayDow = today.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu
  const todayYear = today.getUTCFullYear();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMM = String(today.getUTCMonth() + 1).padStart(2, "0");
  const todayDD = String(today.getUTCDate()).padStart(2, "0");

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Step 1: get all users with a push token
  const { data: tokenUsers, error: tokenErr } = await supabase
    .from("profiles")
    .select("id, push_token")
    .not("push_token", "is", null);

  console.log("tokenUsers:", JSON.stringify(tokenUsers));
  console.log("tokenErr:", tokenErr?.message);

  if (tokenErr || !tokenUsers || tokenUsers.length === 0) {
    return new Response(JSON.stringify({ sent: 0, error: tokenErr?.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const userIds = tokenUsers.map((u) => u.id);
  const tokenByUserId: Record<string, string> = Object.fromEntries(
    tokenUsers.map((u) => [u.id, u.push_token])
  );

  const messages: ExpoPushMessage[] = [];
  const assignedUserIds = new Set<string>();

  // ── Priority 1: On This Day ──────────────────────────────────────────────
  const { data: onThisDay } = await supabase
    .from("moments")
    .select("id, song_title, song_artist, moment_date, user_id")
    .in("user_id", userIds)
    .lte("moment_date", `${todayYear - 1}-12-31`);

  if (onThisDay) {
    // Keep the most-recent matching moment per user
    const byUser = new Map<
      string,
      { momentId: string; songTitle: string; songArtist: string; momentYear: number }
    >();

    for (const row of onThisDay) {
      const [yearStr, month, day] = row.moment_date.split("-");
      if (month === todayMM && day === todayDD) {
        const rowYear = Number(yearStr);
        const existing = byUser.get(row.user_id);
        if (!existing || rowYear > existing.momentYear) {
          byUser.set(row.user_id, {
            momentId: row.id,
            songTitle: row.song_title,
            songArtist: row.song_artist,
            momentYear: rowYear,
          });
        }
      }
    }

    for (const [userId, { momentId, songTitle, songArtist, momentYear }] of byUser) {
      const yearsAgo = todayYear - momentYear;
      messages.push({
        to: tokenByUserId[userId],
        title: "On This Day 🎵",
        body: `${yearsAgo} year${yearsAgo !== 1 ? "s" : ""} ago: ${songTitle} by ${songArtist}`,
        data: { momentId },
      });
      assignedUserIds.add(userId);
    }
  }

  // ── Priority 2: Streak reminder ──────────────────────────────────────────
  // Fetch yesterday's and today's moments for all token users in one query
  const { data: recentMoments } = await supabase
    .from("moments")
    .select("user_id, moment_date")
    .in("user_id", userIds)
    .gte("moment_date", yesterdayStr)
    .lte("moment_date", todayStr);

  console.log("todayStr:", todayStr, "yesterdayStr:", yesterdayStr);
  console.log("recentMoments:", JSON.stringify(recentMoments));

  const loggedYesterday = new Set<string>();
  const loggedToday = new Set<string>();
  for (const row of recentMoments ?? []) {
    if (row.moment_date === yesterdayStr) loggedYesterday.add(row.user_id);
    if (row.moment_date === todayStr) loggedToday.add(row.user_id);
  }

  console.log("loggedYesterday:", [...loggedYesterday]);
  console.log("loggedToday:", [...loggedToday]);

  for (const { id: userId } of tokenUsers) {
    if (assignedUserIds.has(userId)) continue;
    if (loggedYesterday.has(userId) && !loggedToday.has(userId)) {
      messages.push({
        to: tokenByUserId[userId],
        title: "Keep your streak going 🔥",
        body: "You logged yesterday — don't stop now.",
        data: { type: "create" },
      });
      assignedUserIds.add(userId);
    }
  }

  const remaining = tokenUsers.filter((u) => !assignedUserIds.has(u.id));

  // ── Priority 3: Journal prompt (Tue=2 or Thu=4) ──────────────────────────
  if (todayDow === 2 || todayDow === 4) {
    for (const { id: userId } of remaining) {
      messages.push({
        to: tokenByUserId[userId],
        title: "What are you listening to? 🎶",
        body: "Capture a moment before the day gets away.",
        data: { type: "create" },
      });
      assignedUserIds.add(userId);
    }
  }

  // ── Priority 4: Random resurfacing (Mon=1) ───────────────────────────────
  if (todayDow === 1) {
    const randomCandidates = tokenUsers.filter((u) => !assignedUserIds.has(u.id));

    for (const { id: userId } of randomCandidates) {
      const { count: total } = await supabase
        .from("moments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!total || total === 0) continue;

      const offset = Math.floor(Math.random() * total);
      const { data: randomRow } = await supabase
        .from("moments")
        .select("id, song_title, song_artist")
        .eq("user_id", userId)
        .range(offset, offset);

      if (randomRow && randomRow.length > 0) {
        messages.push({
          to: tokenByUserId[userId],
          title: "Remember this? 🎵",
          body: `${randomRow[0].song_title} by ${randomRow[0].song_artist}`,
          data: { momentId: randomRow[0].id },
        });
      }
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
