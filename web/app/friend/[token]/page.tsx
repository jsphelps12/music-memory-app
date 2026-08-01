import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { ClipboardDeepLink } from "./ClipboardDeepLink";

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
  const appStoreUrl = "https://apps.apple.com/us/app/soundtracks/id6759203604";

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ backgroundColor: "var(--bg)" }}>
      {/* Deferred clipboard deep link — written on mount so cold installs can recover the token */}
      <ClipboardDeepLink token={token} />

      <div className="w-full max-w-sm px-4 pt-12 pb-40">

        {/* The friend card — the same cream keepsake every Soundtracks share
            arrives as; here the person is the artifact. */}
        <div className="artifact-card" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px 0" }}>
            <div style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: "var(--artifact-deep)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="artifact-serif" style={{ fontSize: 40, color: "var(--artifact-ink-faint)" }}>
                  {displayName[0]?.toUpperCase()}
                </span>
              )}
            </div>

            <p className="artifact-serif" style={{ color: "var(--artifact-ink)", fontSize: 28, lineHeight: 1.15, textAlign: "center", margin: 0 }}>
              {displayName}
            </p>
            {profile.username && (
              <p style={{ color: "var(--artifact-ink-soft)", fontSize: 14, fontWeight: 500, margin: "4px 0 0" }}>
                @{profile.username}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderTop: "1px solid var(--artifact-hairline)",
              margin: "24px 22px 0",
              padding: "12px 0 18px",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.1em", color: "var(--artifact-ink-soft)" }}>
              FRIEND INVITE
            </span>
            <span className="artifact-wordmark">SOUNDTRACKS</span>
          </div>
        </div>

        {/* Headline */}
        <p className="artifact-serif" style={{ color: "var(--text)", fontSize: 22, lineHeight: 1.3, textAlign: "center", marginBottom: 10 }}>
          {firstName} invited you to connect
        </p>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, textAlign: "center", lineHeight: "1.5", marginBottom: 36 }}>
          Soundtracks is where you capture music-linked memories — songs tied to real moments in your life. Open the invite and you&rsquo;re instantly connected: friends can send moments straight to each other.
        </p>

      </div>

      {/* Sticky CTAs */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-5"
        style={{ backgroundColor: "var(--bg)", borderTop: "1px solid var(--border)" }}
      >
        <div className="max-w-sm mx-auto flex flex-col gap-3">
          <a
            href={deepLink}
            className="block text-center py-3.5 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Open in Soundtracks
          </a>
          <a
            href={appStoreUrl}
            className="block text-center py-3.5 rounded-full font-semibold text-base transition-opacity hover:opacity-80"
            style={{ backgroundColor: "var(--chip-bg)", color: "var(--chip-text)" }}
          >
            Download Soundtracks
          </a>
        </div>
      </div>
    </div>
  );
}
