// The keepsake (docs/OCCASIONS.md, the keepsake page): the data the player
// and its tracklist work with, from the occasion-book edge function (guests)
// or the host's own session (the preview). No React; tested in
// web/lib/__tests__/occasionBook.test.ts.

import { formatEventDate } from "./occasionGuest";

export type BookMoment = {
  id: string;
  guestName: string;
  words: string | null;
  appleMusicId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  photoUrl: string | null;
  createdAt: string;
};

export type Book = {
  occasion: { names: string; eventDate: string; city: string | null; timeZone: string };
  /** Oldest first: the order the night went. */
  moments: BookMoment[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const https = (v: unknown): string | null => {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
};

/** The occasion-book response, checked. Malformed moments are dropped. */
export function parseBook(raw: unknown): Book | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { occasion?: Record<string, unknown>; moments?: unknown };
  const o = r.occasion;
  const names = str(o?.names);
  const eventDate = str(o?.eventDate);
  const timeZone = str(o?.timeZone);
  if (!o || !names || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !timeZone) return null;
  const moments = Array.isArray(r.moments) ? r.moments : [];
  return {
    occasion: { names, eventDate, city: str(o.city), timeZone },
    moments: moments.flatMap((m): BookMoment[] => {
      const x = (m ?? {}) as Record<string, unknown>;
      const id = str(x.id);
      const guestName = str(x.guestName);
      const title = str(x.title);
      const artist = str(x.artist);
      const createdAt = str(x.createdAt);
      if (!id || !guestName || !title || !artist || !createdAt || Number.isNaN(Date.parse(createdAt))) return [];
      return [{
        id,
        guestName,
        words: str(x.words),
        appleMusicId: str(x.appleMusicId) ?? "",
        title,
        artist,
        album: str(x.album),
        artworkUrl: https(x.artworkUrl),
        previewUrl: https(x.previewUrl),
        photoUrl: https(x.photoUrl),
        createdAt,
      }];
    }),
  };
}

/** Bigger album art: Apple's URLs carry their size ("…/600x600bb.jpg"). */
export function artworkAt(url: string | null, px: number): string | null {
  return url ? url.replace(/\/\d+x\d+bb\./, `/${px}x${px}bb.`) : null;
}

type Song = { appleMusicId: string; title: string; artist: string; artworkUrl?: string | null };

export type Picked = { appleMusicId: string; title: string; artist: string; artworkUrl: string | null; count: number };

/** Songs more than one guest picked, most picked first (ties: first picked first). */
export function mostPicked(songs: Song[], min = 2): Picked[] {
  const byId = new Map<string, Picked & { first: number }>();
  songs.forEach((s, i) => {
    const key = s.appleMusicId || `${s.title}\u0000${s.artist}`.toLowerCase();
    const seen = byId.get(key);
    if (seen) seen.count += 1;
    else byId.set(key, { appleMusicId: s.appleMusicId, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl ?? null, count: 1, first: i });
  });
  return [...byId.values()]
    .filter((p) => p.count >= min)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((p) => ({ appleMusicId: p.appleMusicId, title: p.title, artist: p.artist, artworkUrl: p.artworkUrl, count: p.count }));
}

/** "37 songs from 35 people" (people counted by name as written). */
export function bookSummary(moments: Pick<BookMoment, "guestName">[]): string {
  const people = new Set(moments.map((m) => m.guestName.trim().toLowerCase())).size;
  const songs = moments.length === 1 ? "1 song" : `${moments.length} songs`;
  return `${songs} from ${people === 1 ? "1 person" : `${people} people`}`;
}

/**
 * When a moment was added, as the keepsake shows it: just the time on the
 * wedding night (the date, or before 6 the next morning), else the day.
 */
export function momentWhen(createdAtIso: string, eventDate: string, timeZone: string): string {
  const at = new Date(createdAtIso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;
  const nextDay = new Date(Date.parse(eventDate + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  const night = localDay === eventDate || (localDay === nextDay && Number(parts.hour) < 6);
  return night
    ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

export type KeepsakeView = {
  names: string;
  when: string;
  summary: string;
  moments: (BookMoment & { when: string })[];
  picked: Picked[];
};

/**
 * Everything the keepsake renders, with every date already formatted here on
 * the server (so the browser's own date formatting can't disagree with it).
 */
export function keepsakeView(book: Book): KeepsakeView {
  const { occasion, moments } = book;
  return {
    names: occasion.names,
    when: [formatEventDate(occasion.eventDate), occasion.city].filter(Boolean).join(" · "),
    summary: bookSummary(moments),
    moments: moments.map((m) => ({ ...m, when: momentWhen(m.createdAt, occasion.eventDate, occasion.timeZone) })),
    picked: mostPicked(moments),
  };
}
