import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { getSupabase } from "@/lib/supabase";
import { formatEventDate, parseGuestOccasion } from "@/lib/occasionGuest";
import { GuestBook, SavedMomentsSection } from "./GuestBook";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// One lookup per request, shared by the metadata and the page.
const loadOccasion = cache(async (slug: string) => {
  const { data, error } = await getSupabase().rpc("get_occasion_for_guests", { p_slug: slug });
  if (error) throw error;
  return parseGuestOccasion(data);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const occasion = await loadOccasion(slug);
  const title = occasion ? `Pick a song for ${occasion.names}` : "Soundtracks";
  return {
    title,
    description: "Add a song, a photo from tonight and your name to their guest book.",
    // A wedding's guest page is for the people with the link, not search.
    robots: { index: false, follow: false },
    openGraph: { title, siteName: "Soundtracks" },
  };
}

export default async function GuestPage({ params }: PageProps) {
  const { slug } = await params;
  const occasion = await loadOccasion(slug);
  if (!occasion) notFound();

  const when = [formatEventDate(occasion.eventDate), occasion.city].filter(Boolean).join(" · ");

  if (!occasion.accepting) {
    return (
      <main className={s.page}>
        <div className={`${s.column} ${s.narrow}`}>
          <TopBar />
          <h1 className={s.headline}>{occasion.names}</h1>
          <p className={`${s.meta} ${s.lede}`}>{when}</p>
          {occasion.bookToken ? (
            <>
              <p className={`${s.body} ${s.lede}`}>
                Their guest book is out: every song their guests picked, with the photos and the words.
              </p>
              <Link className={`${s.button} ${s.lede}`} href={`/for/${occasion.slug}/book?k=${occasion.bookToken}`}>
                Open the guest book
              </Link>
            </>
          ) : (
            <p className={`${s.body} ${s.lede}`}>
              Their guest book has closed. Thank you for being part of it.
            </p>
          )}
          <SavedMomentsSection slug={occasion.slug} />
        </div>
      </main>
    );
  }

  return <GuestBook occasion={occasion} when={when} />;
}
