import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import ContributeForm from "./ContributeForm";

interface PageProps {
  params: Promise<{ invite_code: string }>;
}

export default async function ContributeFormPage({ params }: PageProps) {
  const { invite_code } = await params;

  const { data: collection } = await getSupabase()
    .from("collections")
    .select("id, name, events_tier_unlocked")
    .eq("invite_code", invite_code)
    .eq("is_public", true)
    .single();

  if (!collection) {
    notFound();
  }

  if (!collection.events_tier_unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FBF6F1" }}>
        <div className="max-w-sm text-center">
          <p className="text-2xl font-bold mb-2" style={{ color: "#2C2C3A" }}>
            Guest Contributions Unavailable
          </p>
          <p className="text-sm" style={{ color: "#999" }}>
            The collection owner hasn't enabled guest contributions for this event.
          </p>
        </div>
      </div>
    );
  }

  return <ContributeForm collectionName={collection.name} inviteCode={invite_code} />;
}
