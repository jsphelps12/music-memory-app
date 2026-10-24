import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { getHostSupabase } from "@/lib/supabase/server";
import h from "../../host.module.css";
import { SetupForm, type ExistingOccasion } from "../../new/SetupForm";

export const metadata: Metadata = { title: "Edit your wedding" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  time_zone: string;
  guest_estimate: number | null;
  slug: string;
  status: ExistingOccasion["status"];
  suggested_songs: { appleMusicId: string; title: string; artist: string; artworkUrl: string | null }[];
};

export default async function EditOccasion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const { data, error } = await supabase
    .from("occasions")
    .select("id, names, event_date, city, time_zone, guest_estimate, slug, status, suggested_songs")
    .eq("id", id)
    .maybeSingle<Row>();
  if (error) throw error;
  if (!data) notFound();

  const existing: ExistingOccasion = {
    id: data.id,
    names: data.names,
    eventDate: data.event_date,
    city: data.city,
    timeZone: data.time_zone,
    guestEstimate: data.guest_estimate,
    slug: data.slug,
    status: data.status,
    suggestedSongs: (data.suggested_songs ?? []).map((t) => ({ ...t, artworkUrl: t.artworkUrl ?? null, album: null })),
  };

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <Link href={`/host/${data.id}`} className={s.quietButton}>
            Back
          </Link>
        </TopBar>
        <h1 className={s.headline}>Edit your wedding</h1>
        {data.status === "collecting" ? (
          <p className={`${s.body} ${s.lede}`}>
            Moving the date moves when your guest book closes, two weeks after the new day.
          </p>
        ) : null}
        <div className={h.after}>
          <SetupForm existing={existing} />
        </div>
      </div>
    </main>
  );
}
