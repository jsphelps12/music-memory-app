import Image from "next/image";

interface MomentCardProps {
  artworkUrl: string | null;
  songTitle: string;
  songArtist: string;
  reflection: string | null;
  contributorName: string | null;
  momentDate: string | null;
  photoUrls: string[];
  expanded: boolean;
  isPlaying: boolean;
  hasPreview: boolean;
  onToggle: () => void;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function MomentCard({
  artworkUrl,
  songTitle,
  songArtist,
  reflection,
  contributorName,
  momentDate,
  photoUrls,
  expanded,
  isPlaying,
  hasPreview,
  onToggle,
}: MomentCardProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left rounded-2xl transition-all duration-200"
      style={{ backgroundColor: expanded ? "#EDE4DA" : "#F3EDE6" }}
    >
      {/* Top row — always visible */}
      <div className="flex gap-4 p-4">
        {/* Album artwork */}
        <div className="shrink-0 relative">
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt={`${songTitle} artwork`}
              width={56}
              height={56}
              className="rounded-lg object-cover"
              unoptimized
            />
          ) : (
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl"
              style={{ backgroundColor: "#E8825C22" }}
            >
              🎵
            </div>
          )}
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              <span className="text-white text-base">▶</span>
            </div>
          )}
        </div>

        {/* Song info + collapsed reflection */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate" style={{ color: "#2C2C3A" }}>
            {songTitle}
          </p>
          <p className="text-sm truncate" style={{ color: "#999" }}>
            {songArtist}
          </p>
          {!expanded && reflection && (
            <p
              className="mt-1 text-sm leading-snug"
              style={{
                color: "#2C2C3A",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties}
            >
              {reflection}
            </p>
          )}
        </div>

        {/* Chevron */}
        <div
          className="shrink-0 self-center transition-transform duration-200"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="#999"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Full reflection */}
          {reflection && (
            <p className="text-sm leading-relaxed" style={{ color: "#2C2C3A" }}>
              {reflection}
            </p>
          )}

          {/* Photos */}
          {photoUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photoUrls.map((url, i) => (
                <div key={i} className="shrink-0">
                  <Image
                    src={url}
                    alt={`Photo ${i + 1}`}
                    width={160}
                    height={160}
                    className="rounded-xl object-cover"
                    style={{ width: 160, height: 160 }}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 text-xs" style={{ color: "#999" }}>
            {contributorName && <span>{contributorName}</span>}
            {contributorName && momentDate && <span>·</span>}
            {momentDate && <span>{formatDate(momentDate)}</span>}
            {hasPreview && (
              <>
                <span>·</span>
                <span style={{ color: "#E8825C" }}>
                  {isPlaying ? "♪ Playing preview" : "♪ Preview available"}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
