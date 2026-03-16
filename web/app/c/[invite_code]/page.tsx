import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import CollectionMomentList, { type MomentItem } from "@/components/CollectionMomentList";
import InviteCTA from "@/components/InviteCTA";

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
        guest_name,
        guest_uuid
      )
    `)
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: false });

  // Collect non-guest contributor IDs to fetch their display names
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
        guest_name: string | null;
        guest_uuid: string | null;
      } | null;
      if (!m) return null;
      const photoUrls = (m.photo_urls ?? []).map(
        (path) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
      );
      const contributorName = m.guest_uuid && m.guest_name
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
        contributorName,
      };
    })
    .filter(Boolean) as MomentItem[];

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
        <InviteCTA inviteCode={invite_code} />
      </div>
    </div>
  );
}
