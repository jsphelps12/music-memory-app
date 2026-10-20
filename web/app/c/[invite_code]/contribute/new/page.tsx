import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import ContributeForm from "./ContributeForm";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

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
      <main className={s.page}>
        <div className={`${s.column} ${s.narrow}`}>
          <TopBar />
          <h1 className={s.headline}>{collection.name}</h1>
          <p className={`${s.body} ${s.lede}`}>
            Guest songs aren&rsquo;t turned on for this album yet. Ask whoever sent you the link to switch them on.
          </p>
        </div>
      </main>
    );
  }

  return <ContributeForm collectionName={collection.name} inviteCode={invite_code} />;
}
