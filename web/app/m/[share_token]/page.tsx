import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { GiftClipboardWriter } from "./GiftClipboardWriter";

const MOODS: Record<string, { emoji: string; label: string }> = {
  nostalgic:   { emoji: "🕰️", label: "Nostalgic" },
  joyful:      { emoji: "😊", label: "Joyful" },
  melancholy:  { emoji: "🌧️", label: "Melancholy" },
  energetic:   { emoji: "⚡", label: "Energetic" },
  peaceful:    { emoji: "🌿", label: "Peaceful" },
  romantic:    { emoji: "💕", label: "Romantic" },
  rebellious:  { emoji: "🔥", label: "Rebellious" },
  hopeful:     { emoji: "🌅", label: "Hopeful" },
  bittersweet: { emoji: "🍂", label: "Bittersweet" },
  empowered:   { emoji: "💪", label: "Empowered" },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ share_token: string }>;
}

async function fetchMomentData(share_token: string) {
  const { data: row } = await getSupabase()
    .from("moments")
    .select(
      "id, song_title, song_artist, song_album_name, song_artwork_url, song_preview_url, reflection_text, photo_urls, moment_date, mood, location, user_id"
    )
    .eq("share_token", share_token)
    .single();
  if (!row) return null;

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("display_name")
    .eq("id", row.user_id)
    .single();

  return { row, senderName: profile?.display_name ?? "Someone" };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { share_token } = await params;
  const result = await fetchMomentData(share_token);
  if (!result) return { title: "A Memory on Soundtracks" };

  const { row, senderName } = result;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const ogImage = row.photo_urls?.[0]
    ? `${supabaseUrl}/storage/v1/object/public/moment-photos/${row.photo_urls[0]}`
    : row.song_artwork_url ?? undefined;

  const title = `${senderName} shared a memory`;
  const songLine = [row.song_title, row.song_artist].filter(Boolean).join(" · ");
  const reflection = row.reflection_text
    ? ` — "${row.reflection_text.length > 120 ? row.reflection_text.slice(0, 120) + "…" : row.reflection_text}"`
    : "";
  const description = songLine ? `${songLine}${reflection}` : "A memory on Soundtracks";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 1200 }] : [],
      type: "website",
      siteName: "Soundtracks",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function GiftedMomentPage({ params }: PageProps) {
  const { share_token } = await params;
  const result = await fetchMomentData(share_token);
  if (!result) notFound();
  const { row, senderName } = result;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const photoUrls: string[] = (row.photo_urls ?? []).map(
    (path: string) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
  );

  const heroUrl = photoUrls[0] ?? row.song_artwork_url ?? null;
  const remainingPhotos = photoUrls.slice(1);

  // moment_date is a bare YYYY-MM-DD; parsed alone it becomes UTC midnight and
  // renders a day off in western timezones. T00:00:00 matches the app's parse.
  const formattedDate = row.moment_date
    ? new Date(row.moment_date + "T00:00:00")
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        .toUpperCase()
    : null;

  const moodDef = row.mood ? MOODS[row.mood] : null;

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "var(--bg)" }}
    >
      <GiftClipboardWriter shareToken={share_token} />
      <div style={{ width: "100%", maxWidth: 390, padding: "40px 20px 140px" }}>

        {/* Sender label */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            textAlign: "center",
            marginBottom: 16,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          {senderName} shared a memory with you
        </p>

        {/* The artifact — same cream keepsake the app exports: photo printed
            clean, everything written on the mat below, never on the image. */}
        <div className="artifact-card">
          {heroUrl && (
            <div style={{ aspectRatio: "4/3", width: "100%", backgroundColor: "var(--artifact-deep)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          )}

          {/* The mat */}
          <div style={{ padding: "18px 22px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {row.song_artwork_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.song_artwork_url}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <p
                  className="artifact-serif"
                  style={{
                    fontSize: 24,
                    lineHeight: 1.15,
                    color: "var(--artifact-ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    margin: 0,
                  }}
                >
                  {row.song_title}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--artifact-ink-soft)",
                    margin: "2px 0 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.song_artist}
                </p>
              </div>
            </div>

            {row.reflection_text && (
              <p
                className="artifact-serif"
                style={{
                  fontStyle: "italic",
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: "var(--artifact-ink)",
                  margin: "14px 0 0",
                }}
              >
                &ldquo;{row.reflection_text}&rdquo;
              </p>
            )}

            {/* One quiet meta line + wordmark */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderTop: "1px solid var(--artifact-hairline)",
                paddingTop: 12,
                marginTop: 14,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  color: "var(--artifact-ink-soft)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {moodDef ? `${moodDef.emoji}  ` : ""}
                {[formattedDate, row.location].filter(Boolean).join("  ·  ")}
              </span>
              <span className="artifact-wordmark">SOUNDTRACKS</span>
            </div>
          </div>
        </div>

        {/* Preview player */}
        {row.song_preview_url && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
            <PreviewPlayer url={row.song_preview_url} />
          </div>
        )}

        {/* Additional photos */}
        {remainingPhotos.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {remainingPhotos.map((url, i) => (
              <div key={i} style={{ borderRadius: 16, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 20px 20px",
          backgroundColor: "var(--bg)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 390, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* Apple App Store badge */}
          <a href="https://apps.apple.com/us/app/soundtracks/id6759203604" style={{ display: "inline-block" }}>
            <svg height="40" viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg" aria-label="Download on the App Store">
              <rect width="120" height="40" rx="8" fill="#fff" />
              <text x="38" y="13" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="8" fill="#0F0D0B" fontWeight="400">Download on the</text>
              <text x="32" y="27" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="14" fill="#0F0D0B" fontWeight="600">App Store</text>
              <path d="M16 8.8c-.5.6-1.3.9-2 .9-.1-.8.3-1.6.8-2.1.5-.6 1.4-1 2.1-1 .1.9-.2 1.7-.9 2.2zm.9 1.3c-1.1-.1-2.1.6-2.6.6-.5 0-1.3-.6-2.2-.6-1.1 0-2.2.7-2.7 1.7-1.2 2-.3 5 .8 6.6.6.8 1.2 1.7 2.1 1.7.8 0 1.1-.5 2.1-.5s1.2.5 2.1.5c.9 0 1.5-.9 2-1.7.4-.6.6-1.1.8-1.7-.8-.4-1.4-1.2-1.4-2.2 0-.9.5-1.7 1.2-2.1-.5-.7-1.3-1.3-2.2-1.3z" fill="#0F0D0B" />
            </svg>
          </a>
          <a
            href="https://apps.apple.com/us/app/soundtracks/id6759203604"
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              padding: "13px 20px",
              borderRadius: 14,
              backgroundColor: "#E8825C",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Capture your own memories in Soundtracks
          </a>
        </div>
      </div>
    </div>
  );
}
