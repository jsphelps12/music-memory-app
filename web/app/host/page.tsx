import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { formatEventDate } from "@/lib/occasionGuest";
import { getHostSupabase } from "@/lib/supabase/server";
import { signOut } from "./actions";
import h from "./host.module.css";

export const metadata: Metadata = { title: "Your weddings" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "Not open yet",
  collecting: "Collecting songs",
  curating: "Closed, ready for you to look over",
  revealed: "Revealed",
};

export default async function HostHome() {
  const supabase = await getHostSupabase();
  const [{ data: occasions, error }, { data: reservations }] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, slug, status")
      .order("event_date", { ascending: true }),
    supabase.rpc("my_wedding_reservations"),
  ]);
  if (error) throw error;

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <form action={signOut}>
            <button type="submit" className={s.quietButton}>
              Sign out
            </button>
          </form>
        </TopBar>
        <h1 className={s.headline}>Your weddings</h1>

        {(reservations ?? []).length > 0 ? (
          <section className={h.panel} aria-labelledby="reserved-title">
            <h2 id="reserved-title" className={s.title}>
              You reserved a date
            </h2>
            {(reservations ?? []).map((r: { id: string; couple_names: string; wedding_date: string }) => (
              <p key={r.id} className={s.body}>
                {r.couple_names}, {formatEventDate(r.wedding_date)}.{" "}
                <Link className={s.textLink} href={`/host/new?reservation=${r.id}`}>
                  Set it up
                </Link>
              </p>
            ))}
          </section>
        ) : null}

        {(occasions ?? []).length > 0 ? (
          <ul className={h.list}>
            {(occasions ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/host/${o.id}`} className={h.row}>
                  <span className={s.title}>{o.names}</span>
                  <span className={s.meta}>
                    {formatEventDate(o.event_date)} · {STATUS[o.status] ?? o.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${s.body} ${s.lede}`}>
            Set up your guest book: your names and date, a few songs to suggest, and your guests&rsquo; link.
          </p>
        )}

        <Link href="/host/new" className={`${s.button} ${h.newButton}`}>
          Set up a wedding
        </Link>
      </div>
    </main>
  );
}
