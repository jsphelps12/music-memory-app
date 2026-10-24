// Guest capture for occasions (docs/OCCASIONS.md): the data the /for/{slug}
// page works with, song search, what the guest's phone remembers, and the
// calls to the occasion-entry edge function. No React here, so it's tested
// in web/lib/__tests__/occasionGuest.test.ts.

export type SuggestedSong = {
  appleMusicId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

export type GuestOccasion = {
  slug: string;
  names: string;
  eventDate: string;
  city: string | null;
  accepting: boolean;
  suggestedSongs: SuggestedSong[];
  /** Only once the couple has revealed the keepsake and left it shared. */
  bookToken: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The get_occasion_for_guests result, checked. Anything malformed is null. */
export function parseGuestOccasion(raw: unknown): GuestOccasion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const slug = str(o.slug);
  const names = str(o.names);
  const eventDate = str(o.eventDate);
  if (!slug || !names || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const songs = Array.isArray(o.suggestedSongs) ? o.suggestedSongs : [];
  return {
    slug,
    names,
    eventDate,
    city: str(o.city),
    accepting: o.accepting === true,
    bookToken: typeof o.bookToken === "string" && /^[0-9a-f]{32}$/.test(o.bookToken) ? o.bookToken : null,
    suggestedSongs: songs.flatMap((s): SuggestedSong[] => {
      const song = s as Record<string, unknown>;
      const id = song.appleMusicId == null ? null : String(song.appleMusicId);
      const title = str(song.title);
      const artist = str(song.artist);
      if (!id || !/^\d{1,15}$/.test(id) || !title || !artist) return [];
      return [{ appleMusicId: id, title, artist, artworkUrl: str(song.artworkUrl) }];
    }),
  };
}

/** "Saturday, June 14, 2027", in the date's own calendar day (no UTC shift). */
export function formatEventDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const STARTERS = ["The night we met…", "You two in…", "Every summer…", "I'll never forget…"];

const starterBase = (starter: string) => starter.replace(/…$/, "").trimEnd();

/**
 * Puts a starter at the front of what's written, ready to continue. Tapping
 * another starter swaps it for the one already there instead of stacking.
 */
export function applyStarter(current: string, starter: string): string {
  let rest = current.trim();
  for (const s of STARTERS) {
    const b = starterBase(s);
    if (rest === b || rest.startsWith(b + " ")) {
      rest = rest.slice(b.length).trim();
      break;
    }
  }
  const base = starterBase(starter);
  return rest ? `${base} ${rest}` : `${base} `;
}

// ─── Song search (Apple's public catalog, from the browser) ───────────────

export type SongResult = SuggestedSong & { album: string | null };

export function parseSearch(json: unknown): SongResult[] {
  const results = (json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  return results.flatMap((r): SongResult[] => {
    const t = r as Record<string, unknown>;
    if (t.kind !== "song" || t.trackId == null) return [];
    const id = String(t.trackId);
    const title = str(t.trackName);
    const artist = str(t.artistName);
    if (!title || !artist || seen.has(id)) return [];
    seen.add(id);
    const art = str(t.artworkUrl100);
    return [{
      appleMusicId: id,
      title,
      artist,
      album: str(t.collectionName),
      artworkUrl: art ? art.replace(/\/\d+x\d+bb\./, "/200x200bb.") : null,
    }];
  });
}

export async function searchSongs(term: string, signal: AbortSignal): Promise<SongResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term: q,
    entity: "song",
    limit: "12",
    country: "US",
  })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return parseSearch(await res.json());
}

// ─── What this phone remembers ────────────────────────────────────────────

export type SavedMoment = {
  entryId: string;
  editToken: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  hasPhoto: boolean;
  savedAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem">;

// localStorage throws in some private modes and embedded browsers; every
// read and write here survives that and just forgets.
function read<T>(store: Store | undefined, key: string, fallback: T): T {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(store: Store | undefined, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Forgetting is fine; the moment itself is already saved.
  }
}

const NAME_KEY = "st.guest.name";
const DEVICE_KEY = "st.guest.device";
const momentsKey = (slug: string) => `st.guest.moments.${slug}`;

export function rememberedName(store?: Store): string {
  const name = read<unknown>(store, NAME_KEY, "");
  return typeof name === "string" ? name : "";
}

export function rememberName(store: Store | undefined, name: string) {
  write(store, NAME_KEY, name);
}

/** A random id for this phone, used only for rate limits. */
export function deviceId(store: Store | undefined, make: () => string): string {
  const existing = read<unknown>(store, DEVICE_KEY, null);
  if (typeof existing === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const fresh = make().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  write(store, DEVICE_KEY, fresh);
  return fresh;
}

export function savedMoments(store: Store | undefined, slug: string): SavedMoment[] {
  const list = read<unknown>(store, momentsKey(slug), []);
  return Array.isArray(list)
    ? list.filter((m): m is SavedMoment => !!m && typeof m.entryId === "string" && typeof m.editToken === "string")
    : [];
}

export function saveMoment(store: Store | undefined, slug: string, moment: SavedMoment) {
  const rest = savedMoments(store, slug).filter((m) => m.entryId !== moment.entryId);
  write(store, momentsKey(slug), [moment, ...rest].slice(0, 50));
}

export function markPhoto(store: Store | undefined, slug: string, entryId: string) {
  write(
    store,
    momentsKey(slug),
    savedMoments(store, slug).map((m) => (m.entryId === entryId ? { ...m, hasPhoto: true } : m))
  );
}

// ─── Calls to the occasion-entry edge function ────────────────────────────

/**
 * A new edit token: 32 random bytes as base64url (43 chars). Made here, on
 * the phone, so a retry of the same moment reuses it and the server returns
 * the entry it already made instead of a duplicate.
 */
export function newEditToken(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const OFFLINE = "That didn't send. Check your signal and try again; nothing you added is lost.";

async function post<T>(form: FormData): Promise<ApiResult<T>> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/occasion-entry`, {
      method: "POST",
      headers: key ? { apikey: key, Authorization: `Bearer ${key}` } : undefined,
      body: form,
    });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) return { ok: false, error: body?.error ?? OFFLINE };
  return { ok: true, data: body };
}

export function createEntry(input: {
  slug: string;
  appleMusicId: string;
  guestName: string;
  words: string;
  deviceId: string;
  editToken: string;
  photo: File | null;
}) {
  const form = new FormData();
  form.set("action", "create");
  form.set("slug", input.slug);
  form.set("editToken", input.editToken);
  form.set("appleMusicId", input.appleMusicId);
  form.set("guestName", input.guestName);
  if (input.words.trim()) form.set("words", input.words);
  form.set("deviceId", input.deviceId);
  if (input.photo) form.set("photo", input.photo);
  return post<{ entryId: string; photoSaved: boolean }>(form);
}

export function updateEntry(input: {
  entryId: string;
  editToken: string;
  photo?: File;
  guestEmail?: string;
}) {
  const form = new FormData();
  form.set("action", "update");
  form.set("entryId", input.entryId);
  form.set("editToken", input.editToken);
  if (input.photo) form.set("photo", input.photo);
  if (input.guestEmail !== undefined) form.set("guestEmail", input.guestEmail);
  return post<{ photoSaved: boolean }>(form);
}
