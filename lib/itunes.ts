/**
 * The iTunes Search API as a no-auth fallback catalog.
 *
 * It needs no Apple Music permission, no subscription and no token, so it is
 * what we fall back to when the user's own provider can't answer:
 *   - Spotify songs have no preview clip of their own (Spotify stopped
 *     returning preview_url to new apps), so their 30-second preview comes
 *     from the matching iTunes track. Without it a Spotify moment is silent
 *     for every recipient, every free account, and the web page.
 *   - When Spotify search fails, results come from here so capture never
 *     dead-ends.
 *
 * No native imports: this file must stay importable from vitest and from the
 * Spotify fallback path when the native module is missing.
 */
import type { Song } from "@/types";

const SEARCH_URL = "https://itunes.apple.com/search";
const TIMEOUT_MS = 5000;

export interface ItunesTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

/** Lowercase, drop "(feat. …)" / "- Remastered" style suffixes and punctuation. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that make a title a different recording: "(Justice Remix)", "- Live",
// "[Acoustic]", "Radio Edit", "Taylor's Version". "Remastered" and "feat." are
// absent on purpose: those are the same recording.
const VERSION_WORDS =
  /\b(remix|mix|live|acoustic|demo|instrumental|edit|version|sped up|slowed|reverb|unplugged|rework|bootleg|dub|karaoke)\b/;

/**
 * The version descriptors in a title, normalized and sorted: "" for the
 * original recording, "justice remix" for "Electric Feel (Justice Remix)" or
 * "Electric Feel - Justice Remix". Pure, exported for tests.
 */
export function versionKey(s: string): string {
  const segments = [
    ...[...s.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1]),
    ...(s.match(/\s+-\s+(.*)$/)?.[1].split(/\s+-\s+/) ?? []),
  ];
  return segments
    .map((seg) => seg.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim())
    .filter((seg) => VERSION_WORDS.test(seg))
    .sort()
    .join(" | ");
}

/**
 * Pick the iTunes track that is the same recording as `title` by `artist`, or
 * null. Pure, exported for tests. Deliberately strict: a wrong preview (a
 * cover, a different song with the same name, the remix when you picked the
 * original or the other way round) is worse than no preview.
 */
export function pickItunesMatch(
  tracks: ItunesTrack[],
  title: string,
  artist: string
): ItunesTrack | null {
  const wantTitle = normalizeTitle(title);
  // Spotify joins multiple artists with ", "; any one of them matching counts.
  const wantArtists = artist
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (!wantTitle) return null;
  const wantVersion = versionKey(title);

  const candidates = tracks.filter((t) => t.trackId && t.trackName);
  const artistMatches = (t: ItunesTrack) => {
    const got = (t.artistName ?? "").toLowerCase();
    return wantArtists.length === 0 || wantArtists.some((a) => got.includes(a) || a.includes(got));
  };

  return (
    candidates.find(
      (t) =>
        normalizeTitle(t.trackName!) === wantTitle &&
        versionKey(t.trackName!) === wantVersion &&
        artistMatches(t)
    ) ?? null
  );
}

export function itunesTrackToSong(t: ItunesTrack): Song {
  return {
    id: String(t.trackId),
    title: t.trackName ?? "",
    artistName: t.artistName ?? "",
    albumName: t.collectionName ?? "",
    artworkUrl: t.artworkUrl100?.replace("100x100", "600x600") ?? "",
    provider: "apple_music",
    appleMusicId: String(t.trackId),
    spotifyId: null,
    durationMs: t.trackTimeMillis ?? 0,
  };
}

async function searchTracks(term: string, limit: number): Promise<ItunesTrack[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ term, entity: "song", limit: String(limit) });
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`itunes_search_${res.status}`);
    const json = await res.json();
    return (json.results ?? []) as ItunesTrack[];
  } finally {
    clearTimeout(timeout);
  }
}

/** Catalog search with no auth. Throws on network/HTTP failure. */
export async function searchItunes(query: string, limit = 20): Promise<Song[]> {
  if (!query.trim()) return [];
  const tracks = await searchTracks(query, limit);
  return tracks.filter((t) => t.trackId && t.trackName).map(itunesTrackToSong);
}

/** The 30-second preview of the same recording on iTunes, or null. Never throws. */
export async function findItunesPreview(title: string, artist: string): Promise<string | null> {
  try {
    const firstArtist = artist.split(",")[0]?.trim() ?? "";
    const tracks = await searchTracks([title, firstArtist].filter(Boolean).join(" "), 10);
    return pickItunesMatch(tracks, title, artist)?.previewUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * The same Apple artwork at `size` px square. Apple's image CDN renders any
 * size from the template in the path (`.../600x600bb.jpg`), so list rows can
 * ask for what they draw instead of the 600px detail image. Any other URL
 * (Spotify, a local file) comes back unchanged. Pure, exported for tests.
 */
export function artworkUrlAtSize<T extends string | null | undefined>(url: T, size: number): T {
  if (!url || !/^https:\/\/[^/]*mzstatic\.com\//.test(url)) return url;
  return url.replace(/\/\d+x\d+(bb|cc)?\.(jpg|jpeg|png|webp)$/i, `/${size}x${size}bb.$2`) as T;
}

/** The catalog song for an Apple Music id, or null. Never throws. */
export async function lookupItunesSong(appleMusicId: string): Promise<Song | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleMusicId)}&entity=song`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const track = ((json.results ?? []) as ItunesTrack[]).find((t) => t.trackId && t.trackName);
    return track ? itunesTrackToSong(track) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
