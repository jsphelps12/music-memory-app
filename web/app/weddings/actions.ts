"use server";

import { after } from "next/server";
import { getSupabase } from "@/lib/supabase";

export type ReserveValues = { names: string; date: string; guests: string; email: string; interests: string[] };

export type ReserveState =
  | { status: "idle" }
  | { status: "error"; error: string; values: ReserveValues }
  | { status: "reserved"; date: string; names: string };

const INTERESTS = new Set(["print", "cards", "book"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Errors are returned, not thrown: Next redacts thrown messages in production.
export async function reserveDate(_prev: ReserveState, formData: FormData): Promise<ReserveState> {
  const names = String(formData.get("names") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const guests = Number(formData.get("guests"));
  const email = String(formData.get("email") ?? "").trim();
  const interests = formData.getAll("interests").map(String).filter((i) => INTERESTS.has(i));
  // React resets the form after an action; send the values back so a fix
  // doesn't mean typing everything again.
  const values: ReserveValues = { names, date, guests: String(formData.get("guests") ?? ""), email, interests };
  const fail = (error: string): ReserveState => ({ status: "error", error, values });

  // Bots fill every field, people never see this one. Pretend it worked.
  if (String(formData.get("website") ?? "")) return { status: "reserved", date, names };

  if (!names) return fail("Add your names, the way you'd want them on the print.");
  if (names.length > 120) return fail("Names need to be 120 characters or fewer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Pick your wedding date.");
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return fail("That date has already passed. Pick your wedding date.");
  if (!Number.isInteger(guests) || guests < 1 || guests > 1000) {
    return fail("Roughly how many guests? A number between 1 and 1,000.");
  }
  if (!EMAIL.test(email) || email.length > 320) {
    return fail("That email doesn't look right. We only use it about your date.");
  }

  const { error } = await getSupabase().from("wedding_reservations").insert({
    couple_names: names,
    wedding_date: date,
    guest_count: guests,
    email,
    interests,
  });
  if (error) {
    return fail("We couldn't save that just now. Try again in a minute.");
  }
  // After the response, so the couple never waits on (or sees) the email.
  after(() => notifyOwner({ names, date, guests, email, interests }));
  return { status: "reserved", date, names };
}

/**
 * Emails the owner about a new reservation through Resend. Both env vars are
 * set in Vercel; without them this does nothing. A failure is logged and
 * never affects the reservation, which is already saved.
 */
async function notifyOwner(r: { names: string; date: string; guests: number; email: string; interests: string[] }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.RESERVATION_NOTIFY_EMAIL;
  if (!key || !to) return;
  const from = process.env.RESERVATION_FROM_EMAIL ?? "Soundtracks <onboarding@resend.dev>";
  const when = new Date(r.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const extras = r.interests.length ? r.interests.join(", ") : "none picked";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        reply_to: r.email,
        subject: `New wedding reservation: ${r.names}, ${when}`,
        text: [
          `${r.names} reserved ${when}.`,
          ``,
          `Guests: about ${r.guests}`,
          `Email: ${r.email} (reply to this email to reach them)`,
          `Thinking about: ${extras}`,
          ``,
          `All reservations: Supabase → production → wedding_reservations.`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("reservation email failed", res.status, await res.text());
  } catch (e) {
    console.error("reservation email failed", e);
  }
}
