import { searchSongs } from "@/lib/musickit";
import type { Song } from "@/types";

interface ParsedMusicUrl {
  service: "apple-music" | "spotify";
  id: string;
}

export interface SongLookupResult {
  song: Song | null;
  candidates?: Song[];
}

/**
 * Extract service and track ID from an Apple Music or Spotify URL.
 * Returns null for non-music URLs.
 */
export function parseMusicUrl(url: string): ParsedMusicUrl | null {
  try {
    const parsed = new URL(url);

    // Apple Music: music.apple.com/us/album/name/albumId?i=songId
    // Apple Music direct: music.apple.com/us/song/name/songId
    if (
      parsed.hostname === "music.apple.com" ||
      parsed.hostname === "geo.music.apple.com"
    ) {
      // Song ID from ?i= query param (album link with specific song)
      const songIdParam = parsed.searchParams.get("i");
      if (songIdParam) {
        return { service: "apple-music", id: songIdParam };
      }

      // Direct song URL: /us/song/song-name/1234567
      const songMatch = parsed.pathname.match(/\/song\/[^/]+\/(\d+)/);
      if (songMatch) {
        return { service: "apple-music", id: songMatch[1] };
      }

      // Album URL without ?i= — try to get the album ID at least
      const albumMatch = parsed.pathname.match(/\/album\/[^/]+\/(\d+)/);
      if (albumMatch) {
        return { service: "apple-music", id: albumMatch[1] };
      }

      return null;
    }

    // Spotify: open.spotify.com/track/trackId or /intl-xx/track/trackId
    if (parsed.hostname === "open.spotify.com") {
      const trackMatch = parsed.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
      if (trackMatch) {
        return { service: "spotify", id: trackMatch[1] };
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Look up an Apple Music song by its iTunes/Apple Music ID.
 */
async function lookupAppleMusicSong(id: string): Promise<Song | null> {
  try {
    const response = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
    const json = await response.json();
    const result = json.results?.[0];
    if (!result) return null;

    return {
      id: String(result.trackId ?? result.collectionId),
      title: result.trackName ?? result.collectionName ?? "",
      artistName: result.artistName ?? "",
      albumName: result.collectionName ?? "",
      artworkUrl: result.artworkUrl100?.replace("100x100", "600x600") ?? "",
      appleMusicId: String(result.trackId ?? result.collectionId),
      durationMs: result.trackTimeMillis ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Look up a Spotify track via oEmbed, then cross-search Apple Music.
 * Returns the best match or multiple candidates if ambiguous.
 */
async function lookupSpotifySong(
  spotifyId: string
): Promise<SongLookupResult> {
  try {
    const spotifyUrl = `https://open.spotify.com/track/${spotifyId}`;
    const oembedResponse = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    );

    if (!oembedResponse.ok) {
      return { song: null };
    }

    const oembed = await oembedResponse.json();
    // oEmbed title format is typically "Song Name" by "Artist Name"
    // The title field contains the track name
    const title: string = oembed.title ?? "";

    // Extract artist — oEmbed doesn't always have a separate artist field,
    // but the HTML embed includes it. Try parsing from the title or use
    // the provider's author field.
    const artist: string = oembed.author_name ?? "";

    if (!title) {
      return { song: null };
    }

    const query = artist ? `${title} ${artist}` : title;
    const results = await searchSongs(query);

    if (results.length === 0) {
      return { song: null };
    }

    // Check for a strong match (title matches closely)
    const titleLower = title.toLowerCase();
    const exactMatch = results.find(
      (s) => s.title.toLowerCase() === titleLower
    );

    if (exactMatch) {
      return { song: exactMatch };
    }

    // If no exact match, return first as best guess + candidates
    if (results.length === 1) {
      return { song: results[0] };
    }

    return { song: results[0], candidates: results.slice(0, 5) };
  } catch {
    return { song: null };
  }
}

/**
 * Resolve a shared music URL to a Song object.
 * For Spotify URLs, cross-searches Apple Music via oEmbed metadata.
 */
export async function lookupSongFromUrl(
  url: string
): Promise<SongLookupResult> {
  const parsed = parseMusicUrl(url);
  if (!parsed) {
    return { song: null };
  }

  if (parsed.service === "apple-music") {
    const song = await lookupAppleMusicSong(parsed.id);
    return { song };
  }

  return lookupSpotifySong(parsed.id);
}

/**
 * Try to extract a music URL from free-form text.
 * Looks for Apple Music or Spotify URLs within the text.
 */
export function extractMusicUrl(text: string): string | null {
  const urlPattern =
    /https?:\/\/(music\.apple\.com|geo\.music\.apple\.com|open\.spotify\.com)\S+/i;
  const match = text.match(urlPattern);
  return match ? match[0] : null;
}
