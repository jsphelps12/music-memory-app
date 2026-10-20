import Link from "next/link";
import s from "./share.module.css";
import { HandoffLink } from "./HandoffLink";

export const APP_STORE_URL = "https://apps.apple.com/us/app/soundtracks/id6759203604";

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className={s.topbar}>
      <Link href="/" className={s.wordmark}>
        Soundtracks
      </Link>
      {children}
    </header>
  );
}

/**
 * `handoff` is a deferred deep link (e.g. `soundtracks-gift:{token}`) copied to
 * the clipboard when the badge is tapped, so the app can pick it up on first
 * launch after install. See HandoffLink.
 */
export function AppStoreBadge({ handoff }: { handoff?: string }) {
  const badge = (
    <>
      {/* Apple's official badge artwork, unmodified. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/badges/app-store-black.svg" alt="" width={150} height={50} />
    </>
  );
  const label = "Download Soundtracks on the App Store";
  return handoff ? (
    <HandoffLink handoff={handoff} className={s.badge} href={APP_STORE_URL} aria-label={label}>
      {badge}
    </HandoffLink>
  ) : (
    <a className={s.badge} href={APP_STORE_URL} aria-label={label}>
      {badge}
    </a>
  );
}

// Moods are words (DESIGN.md), matching the app's MoodSelector labels.
const MOOD_LABELS: Record<string, string> = {
  nostalgic: "Nostalgic",
  joyful: "Joyful",
  melancholy: "Melancholy",
  energetic: "Energetic",
  peaceful: "Peaceful",
  romantic: "Romantic",
  rebellious: "Rebellious",
  hopeful: "Hopeful",
  bittersweet: "Bittersweet",
  empowered: "Empowered",
};

export function moodLabel(mood: string | null | undefined): string | null {
  return mood ? (MOOD_LABELS[mood] ?? null) : null;
}

// moment_date is a bare YYYY-MM-DD; parsed alone it becomes UTC midnight and
// renders a day off in western timezones. T00:00:00 matches the app's parse.
export function formatMomentDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function PlayIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

export function PauseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
