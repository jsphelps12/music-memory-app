import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAlbumMomentItems } from "@/lib/albumMoments";

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

  try {
    const { moments, latestAddedAt } = await fetchAlbumMomentItems(supabase, collection.id, {
      order: "desc",
      after,
    });
    return NextResponse.json({ moments, latestAddedAt });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't load the album." }, { status: 500 });
  }
}
