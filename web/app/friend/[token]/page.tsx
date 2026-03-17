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
    <div className="min-h-screen flex flex-col items-center" style={{ backgroundColor: "#0D0D0F" }}>
      {/* Deferred clipboard deep link — written on mount so cold installs can recover the token */}
      <ClipboardDeepLink token={token} />

      <div className="w-full max-w-sm px-4 pt-12 pb-40">

        {/* Avatar + identity */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: "#2A2A30",
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
              <span style={{ fontSize: 36, fontWeight: "700", color: "rgba(255,255,255,0.3)" }}>
                {displayName[0]?.toUpperCase()}
              </span>
            )}
          </div>

          <p style={{ color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center" }}>
            {displayName}
          </p>
          {profile.username && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, marginTop: 4 }}>
              @{profile.username}
            </p>
          )}
        </div>

        {/* Headline */}
        <p style={{ color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 10 }}>
          {firstName} wants to be your friend on Soundtracks
        </p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, textAlign: "center", lineHeight: "1.5", marginBottom: 36 }}>
          Soundtracks is where you capture music-linked memories — songs tied to real moments in your life. Friends can tag each other in shared memories.
        </p>

      </div>

      {/* Sticky CTAs */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-5"
        style={{ backgroundColor: "#0D0D0F", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="max-w-sm mx-auto flex flex-col gap-3">
          <a
            href={deepLink}
            className="block text-center py-3.5 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#E8825C" }}
          >
            Open in Soundtracks
          </a>
          <a
            href={appStoreUrl}
            className="block text-center py-3.5 rounded-full font-semibold text-base transition-opacity hover:opacity-80"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
          >
            Download Soundtracks
          </a>
        </div>
      </div>
    </div>
  );
}
