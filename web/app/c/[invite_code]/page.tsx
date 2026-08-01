import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import AlbumMomentList, { type MomentItem } from "@/components/AlbumMomentList";

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
    .from("profiles")
    .select("display_name")
    .eq("id", collection.user_id)
    .single();

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
    .from("profiles")
    .select("display_name")
    .eq("id", collection.user_id)
    .single();

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
          await getSupabase()
            .from("profiles")
            .select("id, display_name")
            .in("id", contributorIds)
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
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (from && to) return `${fmt(from)} – ${fmt(to)}`;
    if (from) return `From ${fmt(from)}`;
    return `Until ${fmt(to!)}`;
  }

  const dateRange = formatDateRange(collection.date_from, collection.date_to);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>

      {/* Album header — the same cream keepsake card every Soundtracks share
          arrives as: cover printed clean, title written on the mat below it. */}
      <div style={{ padding: "24px 16px 0", maxWidth: 600, margin: "0 auto" }}>
        <div className="artifact-card">
          <div style={{ aspectRatio: "16/9", width: "100%", backgroundColor: "var(--artifact-deep)" }}>
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg, rgba(232,130,92,0.35) 0%, rgba(107,95,140,0.35) 100%)",
                }}
              />
            )}
          </div>

          <div style={{ padding: "18px 22px 18px" }}>
            <h1
              className="artifact-serif"
              style={{
                fontSize: "clamp(1.6rem, 5vw, 2.1rem)",
                color: "var(--artifact-ink)",
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {collection.name}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderTop: "1px solid var(--artifact-hairline)",
                paddingTop: 12,
                marginTop: 14,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  color: "var(--artifact-ink-soft)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {[
                  ownerName ? `BY ${ownerName.toUpperCase()}` : null,
                  `${moments.length} ${moments.length === 1 ? "MOMENT" : "MOMENTS"}`,
                  dateRange?.toUpperCase(),
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </span>
              <span className="artifact-wordmark">SOUNDTRACKS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Moment list */}
      <div style={{ padding: "16px 16px 140px", maxWidth: 600, margin: "0 auto" }}>
        {moments.length === 0 ? (
          <p style={{ textAlign: "center", padding: "48px 0", color: "var(--text-tertiary)" }}>
            No moments yet.
          </p>
        ) : (
          <AlbumMomentList moments={moments} />
        )}
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 20px 20px",
          backgroundColor: "var(--bg)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12, textAlign: "center", color: "var(--text-tertiary)", margin: 0 }}>
            Remember a song that takes you back?
          </p>
          <a
            href="https://apps.apple.com/us/app/soundtracks/id6759203604"
            style={{
              display: "block",
              textAlign: "center",
              padding: "13px 20px",
              borderRadius: 14,
              backgroundColor: "#E8825C",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Capture your own memories in Soundtracks
          </a>
          <a
            href={`soundtracks://join?inviteCode=${invite_code}`}
            style={{
              display: "block",
              textAlign: "center",
              padding: "8px",
              fontSize: 13,
              color: "var(--text-tertiary)",
              textDecoration: "none",
            }}
          >
            Already have the app? Open in Soundtracks
          </a>
        </div>
      </div>
    </div>
  );
}
