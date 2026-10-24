// Pure helpers for the occasion-book edge function (docs/OCCASIONS.md, the
// keepsake page). No network, no database: tested in occasionBook_test.ts.

import { sameHex } from "./occasionEntry.ts";

/** book_token is a uuid without dashes: 32 lowercase hex characters. */
export function isBookToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
}

export type BookOccasion = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  time_zone: string;
  status: string;
  share_book_with_guests: boolean;
  book_token: string;
};

/**
 * Whether this link opens the keepsake: the right token, revealed, and not
 * "Just us". Every refusal looks the same to the caller.
 */
export function canOpenBook(o: BookOccasion, token: string): boolean {
  return sameHex(o.book_token, token) && o.status === "revealed" && o.share_book_with_guests;
}

export type BookEntryRow = {
  id: string;
  guest_name: string;
  words: string | null;
  song_apple_id: string;
  song_title: string;
  song_artist: string;
  song_album: string | null;
  song_artwork_url: string | null;
  song_preview_url: string | null;
  photo_source: "guest" | "gallery" | null;
  photo_path: string | null;
  gallery_photo_id: string | null;
  created_at: string;
};

/** The storage path of an entry's photo, if it has one. */
export function photoPathFor(row: BookEntryRow, galleryPaths: Map<string, string>): string | null {
  if (row.photo_source === "guest") return row.photo_path;
  if (row.photo_source === "gallery" && row.gallery_photo_id) return galleryPaths.get(row.gallery_photo_id) ?? null;
  return null;
}

/** One moment as the keepsake page gets it (camelCase, no storage paths). */
export function bookMoment(row: BookEntryRow, photoUrl: string | null) {
  return {
    id: row.id,
    guestName: row.guest_name,
    words: row.words,
    appleMusicId: row.song_apple_id,
    title: row.song_title,
    artist: row.song_artist,
    album: row.song_album,
    artworkUrl: row.song_artwork_url,
    previewUrl: row.song_preview_url,
    photoUrl,
    createdAt: row.created_at,
  };
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
