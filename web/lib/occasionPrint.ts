// Layout for the proofs of what couples can order (docs/OCCASIONS.md, things
// to hold): the tracklist print, thank-you cards and the liner-notes book.
// Pure; tested in web/lib/__tests__/occasionPrint.test.ts.

export type PrintMoment = {
  id: string;
  guestName: string;
  title: string;
  artist: string;
  words: string | null;
  photoUrl: string | null;
  artworkUrl: string | null;
  when: string;
};

// ─── The tracklist print (18 × 24 in) ─────────────────────────────────────

export type TracklistLayout = {
  /** The songs split into sides (columns), in order, labelled A, B, C… */
  sides: { label: string; start: number; tracks: PrintMoment[] }[];
  /** Row height as a share of the sheet's width (cqw), so any count fits. */
  rowCqw: number;
};

// The list's room on the sheet, in cqw (1cqw = 0.18 in on an 18 in sheet):
// the 24 in sheet is 133cqw tall, less the header and the footer.
const LIST_HEIGHT_CQW = 96;
// Rows never grow past this, so a short wedding doesn't look like a menu.
const MAX_ROW_CQW = 4.2;

/** Two sides up to 40 songs, then three, then four. */
export function tracklistLayout(moments: PrintMoment[]): TracklistLayout {
  const n = moments.length;
  const columns = n <= 40 ? 2 : n <= 120 ? 3 : 4;
  const perSide = Math.max(1, Math.ceil(n / columns));
  const sides = Array.from({ length: columns }, (_, i) => ({
    label: String.fromCharCode(65 + i),
    start: i * perSide,
    tracks: moments.slice(i * perSide, (i + 1) * perSide),
  })).filter((s) => s.tracks.length);
  return { sides, rowCqw: Math.min(MAX_ROW_CQW, LIST_HEIGHT_CQW / (perSide + 1)) };
}

// ─── Thank-you cards ──────────────────────────────────────────────────────

/** One card per guest (by name as written): their first song of the night. */
export function cardsByGuest(moments: PrintMoment[]): PrintMoment[] {
  const seen = new Set<string>();
  return moments.filter((m) => {
    const key = m.guestName.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── The liner-notes book (8 × 8 in pages) ────────────────────────────────

export type BookPage =
  | { kind: "moment"; moment: PrintMoment; number: number }
  | { kind: "tracklist"; tracks: { moment: PrintMoment; number: number }[] };

/** Song-only picks per tracklist page. */
export const TRACKS_PER_PAGE = 14;

/**
 * A full page for every moment with a photo or words, numbered in the order
 * the night went; picks that are only a song gather on tracklist pages at
 * the back (decided), keeping their numbers.
 */
export function bookPages(moments: PrintMoment[]): BookPage[] {
  const numbered = moments.map((moment, i) => ({ moment, number: i + 1 }));
  const full = numbered.filter(({ moment }) => moment.photoUrl || moment.words);
  const songOnly = numbered.filter(({ moment }) => !moment.photoUrl && !moment.words);
  const pages: BookPage[] = full.map(({ moment, number }) => ({ kind: "moment", moment, number }));
  for (let i = 0; i < songOnly.length; i += TRACKS_PER_PAGE) {
    pages.push({ kind: "tracklist", tracks: songOnly.slice(i, i + TRACKS_PER_PAGE) });
  }
  return pages;
}

/** Long words get smaller type so a page never overflows. */
export function wordsSize(words: string, hasPhoto: boolean): "large" | "medium" | "small" {
  const n = words.length;
  if (hasPhoto) return n <= 120 ? "medium" : "small";
  return n <= 160 ? "large" : n <= 480 ? "medium" : "small";
}

/** The most a book page sets; longer words end with an ellipsis on the proof. */
export const PAGE_WORDS_MAX = { photo: 420, text: 1100 };

export function fitWords(words: string, hasPhoto: boolean): string {
  const max = hasPhoto ? PAGE_WORDS_MAX.photo : PAGE_WORDS_MAX.text;
  return words.length <= max ? words : `${words.slice(0, max - 1).trimEnd()}…`;
}
