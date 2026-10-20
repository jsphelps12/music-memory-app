import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { ClipboardDeepLink } from "./ClipboardDeepLink";
import { AppStoreBadge, TopBar } from "@/components/Share";
import { HandoffLink } from "@/components/HandoffLink";
import s from "@/components/share.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function FriendInvitePage({ params }: PageProps) {
  const { token } = await params;

  const { data: rows } = await getSupabase().rpc("get_profile_by_invite_token", { p_token: token });
  const profile = (rows as { id: string; display_name: string | null; avatar_url: string | null; username: string | null }[] | null)?.[0];

  if (!profile) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const avatarUrl = profile.avatar_url
    ? `${supabaseUrl}/storage/v1/object/public/moment-photos/${profile.avatar_url}`
    : null;

  const displayName = profile.display_name ?? profile.username ?? "Someone";
  const firstName = displayName.split(" ")[0];
  const deepLink = `soundtracks://friend?token=${token}`;
  const handoff = `soundtracks-friend:${token}`;

  return (
    <main className={s.page}>
      {/* Deferred clipboard deep link. iOS only allows the write on a tap (the
          buttons below do it); this mount-time attempt is a best-effort extra
          for browsers that allow it without one. */}
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
            <HandoffLink href={deepLink} handoff={handoff} className={s.button}>
              Connect with {firstName}
            </HandoffLink>
            <AppStoreBadge handoff={handoff} />
          </div>
        </section>
      </div>
    </main>
  );
}
