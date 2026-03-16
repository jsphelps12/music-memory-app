import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import ContributeHub from "./ContributeHub";
import type { MomentItem } from "@/components/CollectionMomentList";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ invite_code: string }>;
  searchParams: Promise<{ success?: string }>;
}

export default async function ContributePage({ params, searchParams }: PageProps) {
  const { invite_code } = await params;
  const { success } = await searchParams;

  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name, user_id, cover_photo_url, events_tier_unlocked")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) {
    notFound();
  }

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

  // Fetch display names for non-guest contributors
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

  const profileRows =
    contributorIds.length > 0
      ? (
          await getSupabase()
            .from("profiles")
            .select("id, display_name")
            .in("id", contributorIds)
        ).data ?? []
      : [];

  const profileMap = new Map(
    profileRows.map((p: { id: string; display_name: string | null }) => [p.id, p.display_name])
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
      const contributorName =
        m.guest_uuid && m.guest_name
          ? m.guest_name
          : (profileMap.get(r.added_by_user_id as string) ?? null);
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

  return (
    <ContributeHub
      collectionName={collection.name}
      inviteCode={invite_code}
      moments={moments}
      justSubmitted={success === "1"}
    />
  );
}
