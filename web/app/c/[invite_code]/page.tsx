import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import AlbumMomentList, { type MomentItem } from "@/components/AlbumMomentList";
import { AppStoreBadge, TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ invite_code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { invite_code } = await params;

  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name, user_id")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) return { title: "Shared Album · Soundtracks" };

  const { data: profile } = await getSupabase()
    .rpc("get_public_profiles", { p_ids: [collection.user_id] })
    .maybeSingle<{ display_name: string | null }>();

  const ownerName = profile?.display_name ?? null;

  const { data: firstMoment } = await getSupabase()
    .from("collection_moments")
    .select("moments(song_artwork_url)")
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: true })
    .limit(1)
    .single();

  const ogImage =
    (firstMoment?.moments as { song_artwork_url?: string } | null)?.song_artwork_url ?? undefined;

  const title = collection.name;
  const description = ownerName
    ? `A shared album by ${ownerName} on Soundtracks`
    : "A shared album on Soundtracks";

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
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function AlbumPage({ params }: PageProps) {
  const { invite_code } = await params;

  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name, user_id, cover_photo_url, date_from, date_to")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) notFound();

  const { data: ownerProfile } = await getSupabase()
    .rpc("get_public_profiles", { p_ids: [collection.user_id] })
    .maybeSingle<{ display_name: string | null }>();

  const ownerName = ownerProfile?.display_name ?? null;

  const { data: rows } = await getSupabase()
    .from("collection_moments")
    .select(`
      added_at,
      added_by_user_id,
      moments(
        id,
        song_title,
        song_artist,
        song_artwork_url,
        song_preview_url,
        photo_urls,
        reflection_text,
        moment_date,
        mood,
        guest_name,
        guest_uuid
      )
    `)
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: true });

  const contributorIds = [
    ...new Set(
      (rows ?? [])
        .filter((r) => {
          const m = r.moments as unknown as { guest_uuid?: string | null } | null;
          return r.added_by_user_id && !m?.guest_uuid;
        })
        .map((r) => r.added_by_user_id as string)
    ),
  ];

  const contributorProfiles =
    contributorIds.length > 0
      ? (
          await getSupabase().rpc("get_public_profiles", { p_ids: contributorIds })
        ).data ?? []
      : [];

  const profileMap = new Map(
    contributorProfiles.map((p: { id: string; display_name: string | null }) => [p.id, p.display_name])
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const moments: MomentItem[] = (rows ?? [])
    .map((r) => {
      const m = r.moments as unknown as {
        id: string;
        song_title: string;
        song_artist: string;
        song_artwork_url: string | null;
        song_preview_url: string | null;
        photo_urls: string[] | null;
        reflection_text: string | null;
        moment_date: string | null;
        mood: string | null;
        guest_name: string | null;
        guest_uuid: string | null;
      } | null;
      if (!m) return null;
      const photoUrls = (m.photo_urls ?? []).map(
        (path) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
      );
      const contributorName =
        m.guest_uuid && m.guest_name
          ? m.guest_name
          : (profileMap.get(r.added_by_user_id as string) ?? ownerName);
      return {
        id: m.id,
        songTitle: m.song_title,
        songArtist: m.song_artist,
        artworkUrl: m.song_artwork_url,
        previewUrl: m.song_preview_url,
        photoUrls,
        reflection: m.reflection_text,
        momentDate: m.moment_date,
        mood: m.mood,
        contributorName,
      };
    })
    .filter(Boolean) as MomentItem[];

  // Determine hero image: cover photo > first moment artwork
  const coverImagePath = collection.cover_photo_url;
  const coverImageUrl = coverImagePath
    ? `${supabaseUrl}/storage/v1/object/public/moment-photos/${coverImagePath}`
    : moments[0]?.artworkUrl ?? null;

  function formatDateRange(from: string | null, to: string | null) {
    if (!from && !to) return null;
    // date_from/date_to are bare YYYY-MM-DD; see the T00:00:00 note in MomentCard.
    const fmt = (d: string) =>
      new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (from && to) return `${fmt(from)} – ${fmt(to)}`;
    if (from) return `From ${fmt(from)}`;
    return `Until ${fmt(to!)}`;
  }

  const dateRange = formatDateRange(collection.date_from, collection.date_to);

  const meta = [
    ownerName ? `By ${ownerName}` : null,
    `${moments.length} ${moments.length === 1 ? "song" : "songs"}`,
    dateRange,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className={s.page}>
      <div className={s.column}>
        <TopBar />

        <header className={s.albumHead}>
          {coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverImageUrl} alt="" className={s.cover} />
          )}
          <h1 className={s.headline}>{collection.name}</h1>
          <p className={s.meta}>{meta}</p>
        </header>

        {moments.length === 0 ? (
          <p className={`${s.empty} ${s.tracklist}`}>No songs in this album yet.</p>
        ) : (
          <AlbumMomentList moments={moments} numbered />
        )}

        {/* The ask comes after the album, never over it. */}
        <section className={s.ask}>
          <p className={s.body}>Soundtracks is a journal for the songs that mark your days.</p>
          <div className={s.askActions}>
            <AppStoreBadge />
            <a href={`soundtracks://join?inviteCode=${invite_code}`} className={`${s.meta} ${s.textLink}`}>
              Have the app? Open this album
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
