/**
 * The one mapping from what the capture and edit screens collect to the
 * `moments` columns they write. Create (lib/saveMoment.ts saveMoment) and edit
 * (updateMoment) both build their row here, so a column added to one can't be
 * forgotten in the other. Pure: no I/O, importable from vitest.
 */
import type { Song } from "@/types";
import type { GeoResult } from "@/lib/geocoding";
import { dateToStr } from "@/lib/dateUtils";

export interface MomentFieldsInput {
  song: Song;
  reflection: string;
  moods: string[];
  people: string[];
  locationResult: GeoResult | null;
  momentDate: Date | null;
}

/**
 * Artwork worth persisting: a remote URL. Older now-playing binaries hand the
 * picker a `data:` URI (the rendered artwork itself, often hundreds of KB),
 * and a local `file:` URI only means something on this device; storing either
 * bloats every timeline fetch and breaks link previews.
 */
export function persistableArtworkUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** The columns both create and edit write, from the form state. */
export function momentRowFields(input: MomentFieldsInput, fetchedAlbumName: string | null = null) {
  const { song } = input;
  return {
    song_title: song.title,
    song_artist: song.artistName,
    song_album_name: song.albumName || fetchedAlbumName || null,
    song_artwork_url: persistableArtworkUrl(song.artworkUrl),
    song_provider: song.provider,
    song_apple_music_id: song.appleMusicId ?? null,
    song_spotify_id: song.spotifyId ?? null,
    reflection_text: input.reflection.trim(),
    // Dual-write during the multi-mood transition: binaries <= build 22 read
    // only the single mood column, so it carries the first selected mood.
    mood: input.moods[0] ?? null,
    moods: input.moods,
    people: input.people,
    // Name and coordinates always move together: a renamed or cleared place
    // must not keep pinning the old spot on the map.
    location: input.locationResult?.name.trim() || null,
    location_lat: input.locationResult?.name.trim() ? input.locationResult.lat ?? null : null,
    location_lng: input.locationResult?.name.trim() ? input.locationResult.lng ?? null : null,
    moment_date: input.momentDate ? dateToStr(input.momentDate) : null,
  };
}

type SongIdentity = Pick<Song, "title" | "artistName" | "provider" | "appleMusicId" | "spotifyId">;

/**
 * Whether the edited song is a different recording from the stored one, which
 * is the only time the stored preview URL needs replacing.
 */
export function songIdentityChanged(before: SongIdentity, after: SongIdentity): boolean {
  return (
    before.provider !== after.provider ||
    (before.appleMusicId ?? null) !== (after.appleMusicId ?? null) ||
    (before.spotifyId ?? null) !== (after.spotifyId ?? null) ||
    before.title !== after.title ||
    before.artistName !== after.artistName
  );
}

/**
 * Photo paths in `before` that `after` no longer references: the storage
 * objects to delete once the row stops pointing at them.
 */
export function removedPaths(before: string[], after: string[]): string[] {
  const kept = new Set(after);
  return before.filter((p) => !kept.has(p));
}
