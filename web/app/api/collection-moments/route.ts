import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { MomentItem } from "@/components/CollectionMomentList";

export async function GET(req: NextRequest) {
  const inviteCode = req.nextUrl.searchParams.get("inviteCode");
  const after = req.nextUrl.searchParams.get("after"); // ISO timestamp

  if (!inviteCode) {
    return NextResponse.json({ moments: [] });
  }

  const supabase = getSupabase();

  const { data: collection } = await supabase
    .from("collections")
    .select("id")
    .eq("invite_code", inviteCode)
    .eq("is_public", true)
    .single();

  if (!collection) {
    return NextResponse.json({ moments: [] });
  }

  let query = supabase
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

  if (after) {
    query = query.gt("added_at", after);
  }

  const { data: rows } = await query;

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
      ? (await supabase.from("profiles").select("id, display_name").in("id", contributorIds)).data ?? []
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

  // Return moments + the latest added_at so the client can use it for the next poll
  const latestAddedAt = rows?.[0]?.added_at ?? null;

  return NextResponse.json({ moments, latestAddedAt });
}
