import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import CollectionMomentList, { type MomentItem } from "@/components/CollectionMomentList";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ invite_code: string }>;
}

export default async function CollectionPage({ params }: PageProps) {
  const { invite_code } = await params;

  // Fetch the collection (must be public)
  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name, user_id, cover_photo_url, date_from, date_to")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) {
    notFound();
  }

  // Fetch owner display name separately (collections.user_id → auth.users, not profiles)
  const { data: ownerProfile } = await getSupabase()
    .from("profiles")
    .select("display_name")
    .eq("id", collection.user_id)
    .single();

  const ownerName = ownerProfile?.display_name ?? null;

  // Fetch moments in this collection
  const { data: rows } = await getSupabase()
    .from("collection_moments")
    .select(`
      added_at,
      moments(
        id,
        song_title,
        song_artist,
        song_artwork_url,
        song_preview_url,
        photo_urls,
        reflection_text,
        moment_date
      )
    `)
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: false });

  const moments: MomentItem[] = (rows ?? [])
    .map((r) => r.moments)
    .filter(Boolean)
    .map((m) => {
      const moment = m as unknown as {
        id: string;
        song_title: string;
        song_artist: string;
        song_artwork_url: string | null;
        song_preview_url: string | null;
        photo_urls: string[] | null;
        reflection_text: string | null;
        moment_date: string | null;
      };
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const photoUrls = (moment.photo_urls ?? []).map(
        (path) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
      );
      return {
        id: moment.id,
        songTitle: moment.song_title,
        songArtist: moment.song_artist,
        artworkUrl: moment.song_artwork_url,
        previewUrl: moment.song_preview_url,
        photoUrls,
        reflection: moment.reflection_text,
        momentDate: moment.moment_date,
        contributorName: ownerName,
      };
    });

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
    <div className="min-h-screen" style={{ backgroundColor: "#FBF6F1" }}>
      {/* Header */}
      <div className="px-6 pt-12 pb-6 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold" style={{ color: "#2C2C3A" }}>
          {collection.name}
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm" style={{ color: "#999" }}>
          {ownerName && <span>by {ownerName}</span>}
          {ownerName && (moments.length > 0 || dateRange) && <span>·</span>}
          <span>{moments.length} {moments.length === 1 ? "moment" : "moments"}</span>
          {dateRange && (
            <>
              <span>·</span>
              <span>{dateRange}</span>
            </>
          )}
        </div>
      </div>

      {/* Moment list */}
      <div className="px-6 pb-32 max-w-xl mx-auto">
        {moments.length === 0 ? (
          <p className="text-center py-12" style={{ color: "#999" }}>
            No moments yet.
          </p>
        ) : (
          <CollectionMomentList moments={moments} />
        )}
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-4 flex justify-center"
        style={{ backgroundColor: "#FBF6F1", borderTop: "1px solid #E8D8CC" }}
      >
        <a
          href={`tracks://join/${invite_code}`}
          className="w-full max-w-xl block text-center py-3 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#E8825C" }}
        >
          Open in Tracks
        </a>
      </div>
    </div>
  );
}
