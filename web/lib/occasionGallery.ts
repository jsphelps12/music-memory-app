// Gallery fill (docs/OCCASIONS.md, flow 4): the couple uploads their
// photographer's photos, and each song-only moment from the night gets a
// suggested photo taken closest to when the guest picked their song. The
// couple accepts, swaps or skips each one; nothing is filled on its own.
// Pure helpers; tested in web/lib/__tests__/occasionGallery.test.ts.

// ─── When a photo was taken (EXIF) ────────────────────────────────────────

/** "2027:06:14 22:42:11" plus the camera's UTC offset ("-04:00") if it wrote one. */
export type ExifTime = { wall: string; offset: string | null };

/**
 * DateTimeOriginal (and OffsetTimeOriginal) from a JPEG's EXIF, or null.
 * Read from the original file: re-encoding through a canvas drops EXIF.
 */
export function readExifTime(buf: ArrayBuffer): ExifTime | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p);
    const len = v.getUint16(p + 2);
    if (marker === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) {
      return readTiff(v, p + 10, Math.min(v.byteLength, p + 2 + len));
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda || len < 2) return null;
    p += 2 + len;
  }
  return null;
}

function readTiff(v: DataView, start: number, end: number): ExifTime | null {
  if (start + 8 > end) return null;
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, little);
  const u32 = (o: number) => v.getUint32(start + o, little);
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n && start + o + i < end; i++) {
      const c = v.getUint8(start + o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  // Tag → value from an IFD: ASCII strings and the ExifIFD pointer.
  const readIfd = (offset: number) => {
    const out = new Map<number, string | number>();
    if (offset + 2 > end - start) return out;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (start + e + 12 > end) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if (type === 2) out.set(tag, ascii(count <= 4 ? e + 8 : u32(e + 8), count));
      else if (type === 4) out.set(tag, u32(e + 8));
    }
    return out;
  };
  const ifd0 = readIfd(u32(4));
  const exifPtr = ifd0.get(0x8769);
  const exif = typeof exifPtr === "number" ? readIfd(exifPtr) : new Map<number, string | number>();
  const wall = (exif.get(0x9003) ?? ifd0.get(0x0132)) as string | undefined;
  if (!wall || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(wall)) return null;
  const offset = exif.get(0x9011) as string | undefined;
  return { wall: wall.slice(0, 19), offset: offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : null };
}

/** The instant a wall-clock time in a time zone names (DST-aware). */
export function zonedToUtc(wall: { y: number; mo: number; d: number; h: number; mi: number; s: number }, timeZone: string): Date {
  const guess = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(t))
        .map((x) => [x.type, Number(x.value)])
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  // Two passes settle the offset across a DST change.
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}

/**
 * When the photo was taken, as an instant. Uses the camera's own offset if
 * it wrote one; otherwise reads the clock as the wedding's local time (what
 * a photographer's camera is set to).
 */
export function exifInstant(time: ExifTime, timeZone: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(time.wall);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  if (time.offset) {
    const sign = time.offset[0] === "-" ? -1 : 1;
    const [oh, om] = time.offset.slice(1).split(":").map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - sign * (oh * 60 + om) * 60_000);
  }
  return zonedToUtc({ y, mo, d, h, mi, s }, timeZone);
}

// ─── Matching ─────────────────────────────────────────────────────────────

export type MatchEntry = { id: string; createdAt: string };
export type MatchPhoto = { id: string; takenAt: string | null };
export type Suggestion = {
  entryId: string;
  /** The suggested photo, or null when nothing was taken near enough. */
  photoId: string | null;
  /** Minutes between the photo and the song (photo minus song). */
  minutesApart: number | null;
  /** The nearest photos in time, for "pick another". */
  alternatives: string[];
};

/** A photo farther than this from the song isn't suggested. */
export const MATCH_WINDOW_MINUTES = 45;

/** On the wedding night: the date itself, or before 6 the next morning, in its zone. */
export function onTheNight(iso: string, eventDate: string, timeZone: string): boolean {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value])
  );
  const day = `${p.year}-${p.month}-${p.day}`;
  const next = new Date(Date.parse(eventDate + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  return day === eventDate || (day === next && Number(p.hour) < 6);
}

/**
 * Pairs song-only moments from the night with the closest photos in time,
 * each photo used once, closest pairs first. `clockShiftMinutes` corrects a
 * camera clock that was off (added to every photo's time). Moments added
 * outside the night get no suggestion: when they were added says nothing
 * about the photos.
 */
export function suggestMatches(
  entries: MatchEntry[],
  photos: MatchPhoto[],
  opts: { eventDate: string; timeZone: string; clockShiftMinutes?: number; alternatives?: number; taken?: Set<string> }
): Suggestion[] {
  const shift = (opts.clockShiftMinutes ?? 0) * 60_000;
  const timed = photos
    .filter((p) => p.takenAt && !Number.isNaN(Date.parse(p.takenAt)))
    .map((p) => ({ id: p.id, t: Date.parse(p.takenAt!) + shift }));
  const night = entries.filter((e) => onTheNight(e.createdAt, opts.eventDate, opts.timeZone));
  const used = new Set(opts.taken ?? []);
  const pairs: { e: string; p: string; d: number }[] = [];
  for (const e of night) {
    const te = Date.parse(e.createdAt);
    for (const p of timed) {
      const d = Math.abs(p.t - te);
      if (d <= MATCH_WINDOW_MINUTES * 60_000) pairs.push({ e: e.id, p: p.id, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d || a.e.localeCompare(b.e) || a.p.localeCompare(b.p));
  const chosen = new Map<string, string>();
  for (const { e, p } of pairs) {
    if (chosen.has(e) || used.has(p)) continue;
    chosen.set(e, p);
    used.add(p);
  }
  const k = opts.alternatives ?? 8;
  return night.map((e) => {
    const te = Date.parse(e.createdAt);
    const near = [...timed].sort((a, b) => Math.abs(a.t - te) - Math.abs(b.t - te)).slice(0, k);
    const photoId = chosen.get(e.id) ?? null;
    const p = photoId ? timed.find((x) => x.id === photoId)! : null;
    return {
      entryId: e.id,
      photoId,
      minutesApart: p ? Math.round((p.t - te) / 60_000) : null,
      alternatives: near.map((x) => x.id),
    };
  });
}

/** "4 minutes before they picked it" / "right as they picked it". */
export function apartLabel(minutes: number): string {
  if (Math.abs(minutes) < 1) return "taken right as they picked it";
  const n = Math.abs(minutes);
  return `taken ${n} minute${n === 1 ? "" : "s"} ${minutes < 0 ? "before" : "after"} they picked it`;
}
