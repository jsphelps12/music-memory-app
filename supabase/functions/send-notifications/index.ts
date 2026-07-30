import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  selectNotifications,
  type EligibleUser,
  type ExpoPushMessage,
  type MomentRow,
  type UserMomentRow,
} from "./selectNotifications.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

/**
 * A single entry in Expo's push-send response. The `data` array is positionally
 * aligned with the request array — index N of the response describes index N of
 * the batch we posted.
 */
interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
}

/**
 * POST messages to Expo in batches of 100 and inspect the resulting tickets.
 *
 * Returns the push tokens Expo reported as DeviceNotRegistered (app uninstalled
 * or notification permission revoked) so the caller can null them out. Left
 * unreaped, dead tokens accumulate forever and eventually get the whole project
 * rate-limited. Returning them instead of writing them here keeps this function
 * free of the supabase client, and therefore testable.
 *
 * FOLLOW-UP: this reads send *tickets*, which only catch failures Expo knows
 * about immediately. Delivery *receipts* (GET /push/getReceipts, polled 15+
 * minutes after a send) surface DeviceNotRegistered cases that are only
 * discovered at delivery time. That needs a second scheduled function to
 * persist ticket ids and poll them later — deliberately out of scope here.
 */
async function sendBatch(messages: ExpoPushMessage[]): Promise<string[]> {
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch),
    });

    // A 4xx/5xx from Expo means there are no usable tickets in the body. Log and
    // move on to the next batch rather than throwing — one rejected batch
    // shouldn't abort the run and skip the cooldown stamping that follows.
    if (!res.ok) {
      const detail = await res.text().catch(() => "<unreadable body>");
      console.error(
        `[expo-push] HTTP ${res.status} for batch at offset ${i} (${batch.length} messages): ${detail.slice(0, 500)}`
      );
      continue;
    }

    let body: ExpoPushResponse;
    try {
      body = await res.json();
    } catch (err) {
      console.error(`[expo-push] unparseable response for batch at offset ${i}:`, err);
      continue;
    }

    const tickets = body?.data ?? [];
    if (tickets.length !== batch.length) {
      console.error(
        `[expo-push] ticket count mismatch for batch at offset ${i}: ${tickets.length} tickets for ${batch.length} messages`
      );
    }

    for (let j = 0; j < tickets.length; j++) {
      const ticket = tickets[j];
      if (!ticket || ticket.status === "ok") continue;

      const token = batch[j]?.to;
      const code = ticket.details?.error;

      if (code === "DeviceNotRegistered") {
        // Uninstalled, or notifications revoked. Clear it so we stop sending.
        if (token) deadTokens.push(token);
        continue;
      }

      // MessageTooBig, MessageRateExceeded, InvalidCredentials, etc. These used
      // to be silently discarded; surface them so they're actionable in logs.
      console.error(
        `[expo-push] ticket error (${code ?? "unknown"}) for token ${token ?? "<unknown>"}: ${ticket.message ?? ""}`
      );
    }
  }

  return deadTokens;
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

Deno.serve(async (req) => {
  // Only allow calls from the pg_cron job, which sends the service role key
  // in the Authorization header. Reject anything else to prevent external
  // callers from triggering mass notifications.
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey
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
      "id, push_token, notif_on_this_day, notif_streak, notif_prompts, notif_resurfacing, notif_milestones, created_at, timezone, last_reengagement_at"
    )
    .not("push_token", "is", null);

  if (tokenErr || !tokenUsers || tokenUsers.length === 0) {
    return new Response(JSON.stringify({ sent: 0, error: tokenErr?.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter to users whose local hour is 10
  const eligibleUsers: EligibleUser[] = tokenUsers.filter((u) => {
    const localHour = getLocalHour(now, u.timezone || "UTC");
    return localHour === 10;
  });

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
  const momentRows = (allMoments ?? []) as UserMomentRow[];
  const momentsByUser: Record<string, MomentRow[]> = {};
  const loggedYesterdayByUser = new Map<string, string>(); // userId -> song_title
  const loggedTodaySet = new Set<string>();

  for (const row of momentRows) {
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

  // Step 3: the 7-priority cascade — pure, see selectNotifications.ts
  const { messages, reengagedUserIds } = selectNotifications({
    eligibleUsers,
    momentsByUser,
    loggedYesterdayByUser,
    loggedTodaySet,
    allMoments: momentRows,
    now,
    todayStr,
    todayYear,
    todayMM,
    todayDD,
    todayDow,
    daySeed,
    prefsByUserId,
    tokenByUserId,
  });

  // Step 4: send, then reap every token Expo told us is dead.
  let deadTokensCleared = 0;
  if (messages.length > 0) {
    const deadTokens = [...new Set(await sendBatch(messages))];
    if (deadTokens.length > 0) {
      const { error: reapError } = await supabase
        .from("profiles")
        .update({ push_token: null })
        .in("push_token", deadTokens);
      if (reapError) {
        console.error("Failed to clear dead push tokens:", reapError.message);
      } else {
        deadTokensCleared = deadTokens.length;
        console.log(`Cleared ${deadTokens.length} dead push token(s)`);
      }
    }
  }

  // Stamp the cooldown only for users who actually got a re-engagement push.
  // Done after sending so a send failure doesn't silently suppress the next one.
  if (reengagedUserIds.length > 0) {
    const { error: stampError } = await supabase
      .from("profiles")
      .update({ last_reengagement_at: now.toISOString() })
      .in("id", reengagedUserIds);
    if (stampError) {
      console.error("Failed to stamp last_reengagement_at:", stampError.message);
    }
  }

  return new Response(JSON.stringify({ sent: messages.length, deadTokensCleared }), {
    headers: { "Content-Type": "application/json" },
  });
});
