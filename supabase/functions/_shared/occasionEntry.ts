// Pure helpers for the occasion-entry edge function (docs/OCCASIONS.md, guest
// capture). No network, no database: everything here is unit-tested in
// occasionEntry_test.ts.

export const LIMITS = {
  nameMax: 80,
  wordsMax: 2000,
  emailMax: 320,
  deviceIdMax: 64,
  photoMaxBytes: 8 * 1024 * 1024,
  // Per occasion, per rolling hour.
  perDevicePerHour: 15,
  // Venue wifi puts a whole wedding behind one address, so this is loose.
  perIpPerHour: 300,
  // Per occasion, ever.
  perOccasionTotal: 3000,
} as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/** Collapses runs of whitespace; the name prints exactly as the guest meant it. */
export function cleanName(raw: unknown): Result<string> {
  if (typeof raw !== "string") return fail("Add your name.");
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return fail("Add your name.");
  if (name.length > LIMITS.nameMax) return fail(`Your name needs to be ${LIMITS.nameMax} characters or fewer.`);
  return ok(name);
}

/** Words are optional; empty becomes null. Line breaks are kept. */
export function cleanWords(raw: unknown): Result<string | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw !== "string") return fail("Those words didn't come through. Try again.");
  const words = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!words) return ok(null);
  if (words.length > LIMITS.wordsMax) return fail(`Keep it to ${LIMITS.wordsMax} characters.`);
  return ok(words);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: unknown): Result<string | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw !== "string") return fail("That email doesn't look right.");
  const email = raw.trim().toLowerCase();
  if (!email) return ok(null);
  if (email.length > LIMITS.emailMax || !EMAIL.test(email)) return fail("That email doesn't look right.");
  return ok(email);
}

/** A device id is client-made and only used for rate limits; junk becomes null. */
export function cleanDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null;
}

export function cleanAppleMusicId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const id = String(raw).trim();
  return /^[0-9]{1,15}$/.test(id) ? id : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function cleanSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 80 ? slug : null;
}

export type ImageKind = { contentType: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/**
 * The real type, from the file's first bytes. The browser's claim is never
 * trusted: the client sends JPEG (it re-encodes on the phone), but anything
 * outside these three is refused rather than stored.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

/** 32 random bytes as base64url. Shown to the guest's phone once; never stored. */
export function newEditToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare of two hex digests of equal length. */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** First address in X-Forwarded-For (the client, as the gateway saw it). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || null;
}

export type CanonicalSong = {
  appleMusicId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
};

/**
 * The song as Apple's catalog has it, from an iTunes Lookup response.
 * The client only names a track id; every field we store comes from here.
 */
export function songFromLookup(json: unknown, appleMusicId: string): CanonicalSong | null {
  const results = (json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return null;
  const track = results.find(
    (r) => (r as { wrapperType?: string; kind?: string; trackId?: number }).kind === "song" &&
      String((r as { trackId?: number }).trackId) === appleMusicId
  ) as Record<string, unknown> | undefined;
  if (!track) return null;
  const title = typeof track.trackName === "string" ? track.trackName.slice(0, 300) : "";
  const artist = typeof track.artistName === "string" ? track.artistName.slice(0, 300) : "";
  if (!title || !artist) return null;
  const https = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v : null);
  const artwork = https(track.artworkUrl100);
  return {
    appleMusicId,
    title,
    artist,
    album: typeof track.collectionName === "string" ? track.collectionName.slice(0, 300) : null,
    artworkUrl: artwork ? artwork.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null,
    previewUrl: https(track.previewUrl),
  };
}

/** Which limit, if any, a new entry would break. Counts are for the last hour. */
export function rateLimitError(counts: { device: number; ip: number; total: number }): string | null {
  if (counts.total >= LIMITS.perOccasionTotal) return "This guest book is full.";
  if (counts.device >= LIMITS.perDevicePerHour || counts.ip >= LIMITS.perIpPerHour) {
    return "That's a lot of songs at once. Give it a few minutes and try again.";
  }
  return null;
}
