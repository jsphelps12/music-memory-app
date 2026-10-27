import type { Metadata } from "next";
import Link from "next/link";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { getHostSupabase } from "@/lib/supabase/server";
import a from "./admin.module.css";
import { RunTick } from "./RunTick";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

type Occasion = {
  id: string;
  names: string;
  slug: string;
  status: "draft" | "collecting" | "curating" | "revealed";
  eventDate: string;
  createdAt: string;
  payment: "dev" | "stripe" | null;
  closesAt: string | null;
  revealedAt: string | null;
  shared: boolean;
  hostEmail: string | null;
  cohostEmail: string | null;
  moments: number;
  hidden: number;
  withPhoto: number;
  gallery: number;
  lastMomentAt: string | null;
  attention: string[];
};
type Reservation = { id: string; names: string; weddingDate: string; guests: number; email: string; interests: string[]; createdAt: string };
type Job = { job: string; schedule: string; active: boolean; status: string | null; message: string | null; startedAt: string | null };
type Deletion = { slug: string; paid: boolean; deletedAt: string };
type Overview = { occasions: Occasion[]; reservations: Reservation[]; jobs: Job[]; deletions: Deletion[]; generatedAt: string };

const date = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

const STATUS: Record<Occasion["status"], string> = { draft: "Draft", collecting: "Open", curating: "Closed", revealed: "Out" };

/**
 * Every occasion, what looks stuck, the reservations to follow up and whether
 * the scheduled jobs ran. Only for app_admins: occasion-admin answers anyone
 * else with a 404, and so does this page.
 */
export default async function AdminPage() {
  const supabase = await getHostSupabase();
  const { data, error } = await supabase.functions.invoke("occasion-admin", { body: { action: "overview" } });
  if (error) {
    // Only the function's own answer for "not an admin" is a 404 here. A
    // broken deploy or database must look broken, not like lost access.
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status;
      if (status === 401) redirect("/host/sign-in?next=/host/admin");
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      if (status === 404 && body?.error === "Not found.") notFound();
    }
    throw error;
  }
  if (!data) throw new Error("occasion-admin returned nothing");
  const o = data as Overview;
  const now = Date.parse(o.generatedAt);
  const attention = o.occasions.filter((x) => x.attention.length);
  const tickJob = o.jobs.find((j) => j.job === "occasions-tick");

  return (
    <main className={s.page}>
      <div className={`${s.column} ${a.wide}`}>
        <TopBar>
          <Link href="/host" className={s.quietButton}>
            Your weddings
          </Link>
        </TopBar>
        <h1 className={s.headline}>Admin</h1>
        <p className={s.meta}>
          {o.occasions.length} {o.occasions.length === 1 ? "wedding" : "weddings"} · {o.reservations.length}{" "}
          {o.reservations.length === 1 ? "reservation" : "reservations"} to set up · as of {ago(o.generatedAt, now)}
        </p>

        <section className={a.section} aria-labelledby="attention-title">
          <h2 id="attention-title" className={s.title}>
            Needs attention
          </h2>
          {attention.length ? (
            <ul className={a.rows}>
              {attention.map((x) => (
                <li key={x.id} className={a.row}>
                  <div>
                    <p className={a.name}>{x.names}</p>
                    <p className={s.meta}>
                      {STATUS[x.status]} · {date(x.eventDate)} · {x.hostEmail}
                    </p>
                  </div>
                  <p className={a.flag}>{x.attention.join(", ")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.body}>Nothing stuck.</p>
          )}
          <RunTick lastRun={tickJob ? `${tickJob.status ?? "no runs yet"} · ${ago(tickJob.startedAt, now)}` : "not scheduled here"} />
        </section>

        <section className={a.section} aria-labelledby="leads-title">
          <h2 id="leads-title" className={s.title}>
            Reservations to set up
          </h2>
          {o.reservations.length ? (
            <ul className={a.rows}>
              {o.reservations.map((r) => (
                <li key={r.id} className={a.row}>
                  <div>
                    <p className={a.name}>{r.names}</p>
                    <p className={s.meta}>
                      {date(r.weddingDate)} · {r.guests} guests{r.interests.length ? ` · wants ${r.interests.join(", ")}` : ""}
                    </p>
                  </div>
                  <p className={a.num}>
                    {/* Encoded: the address came from a public form, and ?, & or , would
                        add recipients or a subject to the mail. */}
                    <a className={s.textLink} href={`mailto:${encodeURIComponent(r.email)}`}>
                      {r.email}
                    </a>
                    <br />
                    <span className={s.meta}>reserved {ago(r.createdAt, now)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.body}>None waiting.</p>
          )}
        </section>

        <section className={a.section} aria-labelledby="weddings-title">
          <h2 id="weddings-title" className={s.title}>
            Weddings
          </h2>
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead>
                <tr>
                  <th scope="col">Wedding</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                  <th scope="col" className={a.numCol}>Moments</th>
                  <th scope="col" className={a.numCol}>Photos</th>
                  <th scope="col" className={a.numCol}>Gallery</th>
                  <th scope="col">Last moment</th>
                  <th scope="col">Paid</th>
                </tr>
              </thead>
              <tbody>
                {o.occasions.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.status === "draft" ? (
                        <span className={a.name}>{x.names}</span>
                      ) : (
                        <a className={a.name} href={`/for/${x.slug}`} target="_blank" rel="noopener">
                          {x.names}
                        </a>
                      )}
                      <span className={a.sub}>
                        {x.hostEmail}
                        {x.cohostEmail ? ` + ${x.cohostEmail}` : ""}
                      </span>
                    </td>
                    <td>
                      {STATUS[x.status]}
                      {x.status === "revealed" && !x.shared ? <span className={a.sub}>Just us</span> : null}
                    </td>
                    <td>{date(x.eventDate)}</td>
                    <td className={a.numCol}>
                      {x.moments}
                      {x.hidden ? <span className={a.sub}>{x.hidden} hidden</span> : null}
                    </td>
                    <td className={a.numCol}>{x.withPhoto}</td>
                    <td className={a.numCol}>{x.gallery}</td>
                    <td>{x.lastMomentAt ? ago(x.lastMomentAt, now) : "–"}</td>
                    <td>{x.payment === "stripe" ? "Stripe" : x.payment === "dev" ? "Staging" : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={a.section} aria-labelledby="jobs-title">
          <h2 id="jobs-title" className={s.title}>
            Scheduled jobs
          </h2>
          {o.jobs.length ? (
            <ul className={a.rows}>
              {o.jobs.map((j) => (
                <li key={`${j.job}-${j.schedule}`} className={a.row}>
                  <div>
                    <p className={a.name}>{j.job || "(unnamed job)"}</p>
                    <p className={s.meta}>
                      <code>{j.schedule}</code>
                      {j.active ? "" : " · paused"}
                    </p>
                  </div>
                  <p className={j.status && j.status !== "succeeded" ? a.flag : a.num}>
                    {j.status ?? "no runs yet"} · {ago(j.startedAt, now)}
                    {j.status && j.status !== "succeeded" && j.message ? <span className={a.sub}>{j.message}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.body}>No scheduler on this project.</p>
          )}
        </section>

        {o.deletions.length ? (
          <section className={a.section} aria-labelledby="deleted-title">
            <h2 id="deleted-title" className={s.title}>
              Recently deleted
            </h2>
            <ul className={a.rows}>
              {o.deletions.map((d) => (
                <li key={d.slug + d.deletedAt} className={a.row}>
                  <p className={a.name}>{d.slug}</p>
                  <p className={a.num}>
                    {d.paid ? "paid · " : ""}
                    {ago(d.deletedAt, now)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
