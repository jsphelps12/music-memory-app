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

  const formattedDate = row.moment_date
    ? new Date(row.moment_date)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        .toUpperCase()
    : null;

  const moodDef = row.mood ? MOODS[row.mood] : null;

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#0F0D0B" }}
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
            color: "rgba(255,255,255,0.35)",
          }}
        >
          {senderName} shared a memory with you
        </p>

        {/* Card */}
        <div
          style={{
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            backgroundColor: "#0F0D0B",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Hero — 3:2 with gradient fade */}
          {heroUrl && (
            <div style={{ position: "relative", aspectRatio: "3/2", width: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {/* Date + location eyebrow */}
              {(formattedDate || row.location) && (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    left: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {formattedDate && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: "rgba(255,255,255,0.9)",
                        textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                      }}
                    >
                      {formattedDate}
                    </span>
                  )}
                  {row.location && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.7)",
                        textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                      }}
                    >
                      📍 {row.location}
                    </span>
                  )}
                </div>
              )}
              {/* Gradient fade into card bg */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "50%",
                  background: "linear-gradient(to bottom, transparent 0%, #0F0D0B 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>
          )}

          {/* Content */}
          <div style={{ padding: "14px 18px 18px" }}>
            {/* Song row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
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
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: "#fff",
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
                    fontSize: 12,
                    color: "rgba(255,255,255,0.55)",
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

            {/* Reflection — DM Serif Display italic */}
            {row.reflection_text && (
              <p
                style={{
                  fontFamily: "'DM Serif Display', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.85)",
                  margin: "0 0 14px",
                }}
              >
                &ldquo;{row.reflection_text}&rdquo;
              </p>
            )}

            {/* Footer: mood chip or date + wordmark */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 12,
                marginTop: row.reflection_text ? 0 : 4,
              }}
            >
              {moodDef ? (
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {moodDef.emoji} {moodDef.label}
                </span>
              ) : formattedDate ? (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>
                  {formattedDate}
                </span>
              ) : (
                <span />
              )}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "#E8825C",
                }}
              >
                SOUNDTRACKS
              </span>
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
          backgroundColor: "#0F0D0B",
          borderTop: "1px solid rgba(255,255,255,0.08)",
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
