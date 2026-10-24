import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { formatEventDate } from "@/lib/occasionGuest";
import { getHostSupabase } from "@/lib/supabase/server";
import { JoinButton } from "./JoinButton";

export const metadata: Metadata = { title: "Join a wedding", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * A partner's invite link. proxy.ts has already made them sign in. They see
 * whose wedding it is and join with a tap (a GET never joins anything, so a
 * link preview can't use up the invite).
 */
export default async function JoinWedding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await getHostSupabase();
  const { data } = valid ? await supabase.rpc("peek_cohost_invite", { p_token: token }) : { data: null };
  const invite = data as { names?: string; eventDate?: string; city?: string | null; isHost?: boolean } | null;

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <Link href="/host" className={s.quietButton}>
            Your weddings
          </Link>
        </TopBar>
        {invite?.names ? (
          <>
            <h1 className={s.headline}>{invite.names}</h1>
            <p className={`${s.meta} ${s.lede}`}>
              {[invite.eventDate ? formatEventDate(invite.eventDate) : null, invite.city].filter(Boolean).join(" · ")}
            </p>
            {invite.isHost ? (
              <p className={`${s.body} ${s.lede}`}>
                This is your own invite link. Send it to your partner so they can join.
              </p>
            ) : (
              <>
                <p className={`${s.body} ${s.lede}`}>
                  You&rsquo;ve been invited to manage this wedding&rsquo;s guest book: see every moment, share the link,
                  and reveal it together.
                </p>
                <JoinButton token={token} />
              </>
            )}
          </>
        ) : (
          <>
            <h1 className={s.headline}>This invite doesn&rsquo;t work</h1>
            <p className={`${s.body} ${s.lede}`}>
              It may have been used already or expired (invites last 7 days). Ask for a new link.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
