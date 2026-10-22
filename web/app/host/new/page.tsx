import type { Metadata } from "next";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { getHostSupabase } from "@/lib/supabase/server";
import h from "../host.module.css";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Set up your wedding" };
export const dynamic = "force-dynamic";

type Reservation = { id: string; couple_names: string; wedding_date: string; guest_count: number };

export default async function NewOccasion({ searchParams }: { searchParams: Promise<{ reservation?: string }> }) {
  const { reservation: reservationId } = await searchParams;
  const supabase = await getHostSupabase();
  const { data } = await supabase.rpc("my_wedding_reservations");
  // Only the signed-in couple's own reservation can prefill the form.
  const reservation = ((data ?? []) as Reservation[]).find((r) => r.id === reservationId) ?? null;

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar />
        <h1 className={s.headline}>Set up your wedding</h1>
        <p className={`${s.body} ${s.lede}`}>
          A couple of minutes. You can change the details later; the link is set once your guest book opens.
        </p>
        <div className={h.after}>
          <SetupForm reservation={reservation} />
        </div>
      </div>
    </main>
  );
}
