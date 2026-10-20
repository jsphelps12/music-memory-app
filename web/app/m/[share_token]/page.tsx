import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { AppStoreBadge, TopBar, formatMomentDate, moodLabel } from "@/components/Share";
import s from "@/components/share.module.css";
import { GiftClipboardWriter } from "./GiftClipboardWriter";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ share_token: string }>;
}

async function fetchMomentData(share_token: string) {
  const { data: row } = await getSupabase()
    .from("moments")
    .select(
      "id, song_title, song_artist, song_album_name, song_artwork_url, song_preview_url, reflection_text, photo_urls, moment_date, mood, location, user_id"
    )
    .eq("share_token", share_token)
    .single();
  if (!row) return null;

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("display_name, friend_invite_token")
    .eq("id", row.user_id)
    .single();

  return {
    row,
    senderName: profile?.display_name ?? "Someone",
    // Powers the relational CTA below. /friend/{token} already handles both
    // cases (deep link if the app is installed, App Store if not), so the
    // page doesn't have to guess.
    senderFriendToken: (profile?.friend_invite_token as string | null) ?? null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { share_token } = await params;
  const result = await fetchMomentData(share_token);
  if (!result) return { title: "A Memory on Soundtracks" };

  const { row, senderName } = result;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const ogImage = row.photo_urls?.[0]
    ? `${supabaseUrl}/storage/v1/object/public/moment-photos/${row.photo_urls[0]}`
    : row.song_artwork_url ?? undefined;

  const title = `${senderName} shared a memory`;
  const songLine = [row.song_title, row.song_artist].filter(Boolean).join(" · ");
  const reflection = row.reflection_text
    ? ` — "${row.reflection_text.length > 120 ? row.reflection_text.slice(0, 120) + "…" : row.reflection_text}"`
    : "";
  const description = songLine ? `${songLine}${reflection}` : "A memory on Soundtracks";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 1200 }] : [],
      type: "website",
      siteName: "Soundtracks",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function GiftedMomentPage({ params }: PageProps) {
  const { share_token } = await params;
  const result = await fetchMomentData(share_token);
  if (!result) notFound();
  const { row, senderName, senderFriendToken } = result;
  const senderFirstName = senderName.split(" ")[0];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const photoUrls: string[] = (row.photo_urls ?? []).map(
    (path: string) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
  );

  // A photo leads when there is one; otherwise the artwork is the picture.
  const heroPhoto = photoUrls[0] ?? null;
  const remainingPhotos = photoUrls.slice(1);

  const meta = [formatMomentDate(row.moment_date), row.location, moodLabel(row.mood)].filter(Boolean);

  return (
    <main className={s.page}>
      <GiftClipboardWriter shareToken={share_token} />
      <div className={s.column}>
        <TopBar />

        <p className={`${s.body} ${s.from}`}>{senderName} shared a moment with you.</p>

        <article>
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroPhoto} alt="" className={s.hero} />
          ) : row.song_artwork_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.song_artwork_url} alt="" className={s.coverArt} />
          ) : null}

          <div className={s.songHead}>
            {heroPhoto && row.song_artwork_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.song_artwork_url} alt="" className={s.thumb} />
            )}
            <div style={{ minWidth: 0 }}>
              <h1 className={s.headline}>{row.song_title}</h1>
              <p className={s.entryArtist}>{row.song_artist}</p>
            </div>
          </div>

          {row.song_preview_url && <PreviewPlayer url={row.song_preview_url} />}

          {row.reflection_text && (
            <div className={s.entryText}>
              <p className={s.reading}>{row.reflection_text}</p>
            </div>
          )}

          <p className={`${s.meta} ${s.entryMeta}`}>
            {[senderName, ...meta].join(" · ")}
          </p>

          {remainingPhotos.length > 0 && (
            <div className={s.photos}>
              {remainingPhotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" loading="lazy" />
              ))}
            </div>
          )}
        </article>

        {/* The ask: below the memory and never sticky. Someone with no app
            and no account (a grandparent) gets the whole thing (words,
            preview, photos) without meeting a wall. */}
        <section className={s.ask}>
          {senderFriendToken ? (
            <>
              <p className={s.body}>
                Add {senderFirstName} back and you&rsquo;ll see each other&rsquo;s moments when a song means
                something.
              </p>
              <div className={s.askActions}>
                <a href={`/friend/${senderFriendToken}`} className={s.button}>
                  Add {senderFirstName} on Soundtracks
                </a>
                <AppStoreBadge />
              </div>
            </>
          ) : (
            <>
              <p className={s.body}>Soundtracks is a journal for the songs that mark your days.</p>
              <AppStoreBadge />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
