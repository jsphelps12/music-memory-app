import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSelectionInputs,
  selectNotifications,
  type EligibleUser,
  type ExpoPushMessage,
  type UserMomentRow,
} from "./selectNotifications.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const PAGE_SIZE = 1000; // matches PostgREST's default max_rows
const USER_CHUNK = 100;

/**
 * Read every row of a query, one range at a time, until an empty page comes
 * back. Advances by the rows actually returned, so a server max_rows below
 * PAGE_SIZE can't skip anything. The query must have a stable order.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    const batch = (data ?? []) as T[];
    if (batch.length === 0) return { rows, error: null };
    rows.push(...batch);
    from += batch.length;
  }
}

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

  // Step 1: get all users with a push token + their notification prefs.
  // Paged: PostgREST caps a single response at max_rows (1000 by default),
  // service role included.
  const { rows: tokenUsers, error: tokenErr } = await fetchAllPages<EligibleUser>((from, to) =>
    supabase
      .from("profiles")
      .select(
        "id, push_token, notif_on_this_day, notif_streak, notif_prompts, notif_resurfacing, notif_milestones, created_at, timezone, last_reengagement_at"
      )
      .not("push_token", "is", null)
      .order("id")
      .range(from, to)
  );

  if (tokenErr) {
    console.error("Failed to load profiles:", tokenErr);
    return new Response(JSON.stringify({ sent: 0, error: tokenErr }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (tokenUsers.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
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

  // Step 2: fetch all moments for eligible users, paged, in chunks of users
  // (keeps the `in` filter's URL short). Order by created_at so
  // streak/re-engagement is based on when you logged, not the date of the
  // memory — logging an old memory today still counts as activity.
  // A failed fetch aborts the run: treating users as having no moments would
  // send them the wrong notifications.
  const userIds = eligibleUsers.map((u) => u.id);
  const momentRows: UserMomentRow[] = [];
  for (let i = 0; i < userIds.length; i += USER_CHUNK) {
    const chunk = userIds.slice(i, i + USER_CHUNK);
    const { rows, error } = await fetchAllPages<UserMomentRow>((from, to) =>
      supabase
        .from("moments")
        .select("id, user_id, moment_date, song_title, song_artist, created_at")
        .in("user_id", chunk)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
    if (error) {
      console.error("Failed to load moments:", error);
      return new Response(JSON.stringify({ sent: 0, error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    momentRows.push(...rows);
  }
  // Chunks are each sorted; the cascade expects one created_at-desc list.
  momentRows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  // Step 3: the 7-priority cascade — pure, see selectNotifications.ts. Run
  // once per local calendar day, so today/yesterday/On This Day/weekday are
  // the user's own, not UTC's.
  const messages: ExpoPushMessage[] = [];
  const reengagedUserIds: string[] = [];
  for (const input of buildSelectionInputs(eligibleUsers, momentRows, now)) {
    const result = selectNotifications(input);
    messages.push(...result.messages);
    reengagedUserIds.push(...result.reengagedUserIds);
  }

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
