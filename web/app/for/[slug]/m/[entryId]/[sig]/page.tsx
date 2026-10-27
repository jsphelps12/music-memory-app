import type { Metadata } from "next";
import { cache } from "react";
import { MomentView } from "@/components/MomentView";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { momentWhen } from "@/lib/occasionBook";
import { formatEventDate } from "@/lib/occasionGuest";
import { fetchSharedMoment } from "@/lib/sharedMoment";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; entryId: string; sig: string }>;
}

// One lookup per request, shared by the metadata and the page.
const load = cache(fetchSharedMoment);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, entryId, sig } = await params;
  const shared = await load(slug, entryId, sig);
  const title = shared ? `${shared.moment.guestName} picked ${shared.moment.title}` : "Soundtracks";
  return {
    title,
    description: shared ? `From ${shared.occasion.names}'s guest book.` : undefined,
    // Only for the people it was sent to.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, siteName: "Soundtracks" },
    twitter: { card: "summary_large_image", title },
  };
}

/**
 * One guest's moment, shared on its own: the photo, the song, their words.
 * The link opens this moment only, never the rest of the guest book.
 */
export default async function SharedMomentPage({ params }: PageProps) {
  const { slug, entryId, sig } = await params;
  const shared = await load(slug, entryId, sig);

  if (!shared) {
    return (
      <main className={s.page}>
        <div className={`${s.column} ${s.narrow}`}>
          <TopBar />
          <h1 className={s.headline}>This moment isn&rsquo;t here</h1>
          <p className={`${s.body} ${s.lede}`}>
            The link may be incomplete, or the couple may have taken it down or kept their guest book just for the two
            of them.
          </p>
        </div>
      </main>
    );
  }

  const { occasion, moment } = shared;
  return (
    <MomentView
      names={occasion.names}
      when={[formatEventDate(occasion.eventDate), occasion.city].filter(Boolean).join(" · ")}
      moment={{ ...moment, when: momentWhen(moment.createdAt, occasion.eventDate, occasion.timeZone) }}
    />
  );
}
