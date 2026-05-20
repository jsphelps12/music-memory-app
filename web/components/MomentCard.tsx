import Image from "next/image";

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

interface MomentCardProps {
  artworkUrl: string | null;
  songTitle: string;
  songArtist: string;
  reflection: string | null;
  contributorName: string | null;
  momentDate: string | null;
  photoUrls: string[];
  mood: string | null;
  isPlaying: boolean;
  hasPreview: boolean;
  onPlayPause: () => void;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function MomentCard({
  artworkUrl,
  songTitle,
  songArtist,
  reflection,
  contributorName,
  momentDate,
  photoUrls,
  mood,
  isPlaying,
  hasPreview,
  onPlayPause,
}: MomentCardProps) {
  const moodDef = mood ? MOODS[mood] : null;

  return (
    <div
      style={{
        backgroundColor: "#1A1A1F",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Song row */}
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Artwork + play/pause overlay */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt={`${songTitle} artwork`}
              width={48}
              height={48}
              style={{ borderRadius: 8, objectFit: "cover", display: "block" }}
              unoptimized
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                backgroundColor: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              🎵
            </div>
          )}
          {hasPreview && (
            <button
              type="button"
              onClick={onPlayPause}
              style={{
                position: "absolute",
                bottom: -4,
                right: -4,
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.75)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              {isPlaying ? (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                  <rect x="5" y="3" width="4" height="18" rx="1" />
                  <rect x="15" y="3" width="4" height="18" rx="1" />
                </svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Title / artist */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              margin: 0,
            }}
          >
            {songTitle}
          </p>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.55)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              margin: "2px 0 0",
            }}
          >
            {songArtist}
          </p>
        </div>
      </div>

      {/* Reflection */}
      {reflection && (
        <p
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.7)",
            padding: "12px 16px 0",
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {reflection}
        </p>
      )}

      {/* Photo strip */}
      {photoUrls.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 2,
            overflowX: "auto",
            marginTop: 12,
          }}
        >
          {photoUrls.map((url, i) => (
            <div key={i} style={{ flexShrink: 0 }}>
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                width={80}
                height={80}
                style={{ width: 80, height: 80, objectFit: "cover", display: "block" }}
                unoptimized
              />
            </div>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px 12px",
        }}
      >
        {moodDef && (
          <span
            style={{
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {moodDef.emoji} {moodDef.label}
          </span>
        )}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>
          {[contributorName, formatDate(momentDate)].filter(Boolean).join(" · ")}
        </span>
      </div>
    </div>
  );
}
