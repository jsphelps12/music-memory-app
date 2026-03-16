import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import QRDisplay from "./QRDisplay";

interface PageProps {
  params: Promise<{ invite_code: string }>;
}

export default async function QRPage({ params }: PageProps) {
  const { invite_code } = await params;

  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) {
    notFound();
  }

  const contributeUrl = `https://soundtracks.app/c/${invite_code}/contribute`;

  return (
    <QRDisplay url={contributeUrl} collectionName={collection.name} />
  );
}
