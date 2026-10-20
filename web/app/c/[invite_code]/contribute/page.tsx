import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import ContributeHub from "./ContributeHub";
import { fetchAlbumMomentItems } from "@/lib/albumMoments";

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

  // Newest first: the hub prepends polled-in songs above these.
  const { moments } = await fetchAlbumMomentItems(getSupabase(), collection.id, { order: "desc" });

  return (
    <ContributeHub
      collectionName={collection.name}
      inviteCode={invite_code}
      moments={moments}
      justSubmitted={success === "1"}
    />
  );
}
