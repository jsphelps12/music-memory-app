import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { ClipboardDeepLink } from "./ClipboardDeepLink";
import { AppStoreBadge, TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function FriendInvitePage({ params }: PageProps) {
  const { token } = await params;

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("id, display_name, avatar_url, username")
    .eq("friend_invite_token", token)
    .single();

  if (!profile) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const avatarUrl = profile.avatar_url
    ? `${supabaseUrl}/storage/v1/object/public/moment-photos/${profile.avatar_url}`
    : null;

  const displayName = profile.display_name ?? profile.username ?? "Someone";
  const firstName = displayName.split(" ")[0];
  const deepLink = `soundtracks://friend?token=${token}`;

  return (
    <main className={s.page}>
      {/* Deferred clipboard deep link: written on mount so a cold install can recover the token. */}
      <ClipboardDeepLink token={token} />

      <div className={`${s.column} ${s.narrow}`}>
        <TopBar />

        <div className={s.avatar}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : (
            <span className={s.initial}>{displayName[0]?.toUpperCase()}</span>
          )}
        </div>

        <h1 className={s.headline}>{displayName}</h1>
        {profile.username && <p className={`${s.meta} ${s.handle}`}>@{profile.username}</p>}

        <p className={`${s.body} ${s.lede}`}>
          {firstName} wants to swap songs with you on Soundtracks. Once you&rsquo;re connected, either of you can send
          the other a moment: a song, and what it means.
        </p>

        <section className={s.ask}>
          <div className={s.askActions}>
            <a href={deepLink} className={s.button}>
              Connect with {firstName}
            </a>
            <AppStoreBadge />
          </div>
        </section>
      </div>
    </main>
  );
}
