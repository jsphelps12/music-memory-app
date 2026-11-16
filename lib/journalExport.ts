// Export your journal as a PDF (1.4, native: expo-print). The journal is set
// as a small book: a title page, then every moment oldest first under year
// and month heads, each with its artwork, the song, when/where/who, moods as
// words, any photos, and the user's own words in a reading serif.
//
// buildJournalHtml is pure and tested (lib/__tests__/journalExport.test.ts);
// exportJournalPdf does the fetching, printing and sharing.

export interface ExportMoment {
  songTitle: string;
  songArtist: string;
  songAlbumName?: string;
  songArtworkUrl: string;
  reflectionText: string;
  moods: string[];
  people: string[];
  location: string | null;
  momentDate: string | null;
  createdAt: string;
  /** Ready-to-load image URLs (thumbnails), already resolved. */
  photoUrls: string[];
}

export interface ExportOptions {
  /** "Sam" → "Sam's soundtrack". */
  ownerName?: string | null;
  /** Mood value → display word ("joyful"); unknown values pass through. */
  moodLabel?: (value: string) => string | null;
  /** When the export was made, for the title page. */
  now?: Date;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Paragraphs from a reflection: blank lines split them, single newlines become <br>. */
export function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function dayOf(m: Pick<ExportMoment, "momentDate" | "createdAt">): string {
  return (m.momentDate ?? m.createdAt).slice(0, 10);
}

function longDate(day: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function monthHead(day: string): string {
  const [y, mo] = day.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long" });
}

/** "With Maya, Ben and Ali". */
function withPeople(people: string[]): string | null {
  const p = people.map((x) => x.trim()).filter(Boolean);
  if (p.length === 0) return null;
  if (p.length === 1) return `With ${p[0]}`;
  return `With ${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`;
}

/** Larger artwork from an iTunes artwork URL (…/200x200bb.jpg → 300x300). */
function artAt(url: string, size: number): string {
  return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
}

/** The whole journal as one printable HTML document, oldest moment first. */
export function buildJournalHtml(moments: ExportMoment[], opts: ExportOptions = {}): string {
  const now = opts.now ?? new Date();
  const sorted = [...moments].sort((a, b) => {
    const d = dayOf(a).localeCompare(dayOf(b));
    return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
  });
  const label = (v: string) => (opts.moodLabel ? opts.moodLabel(v) : v);

  const title = opts.ownerName?.trim() ? `${opts.ownerName.trim()}’s soundtrack` : "My soundtrack";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span =
    first && last
      ? `${longDate(dayOf(first)).replace(/^\w+, /, "")} – ${longDate(dayOf(last)).replace(/^\w+, /, "")}`
      : "";
  const exported = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let body = "";
  let year = "";
  let month = "";
  for (const m of sorted) {
    const day = dayOf(m);
    const y = day.slice(0, 4);
    const mo = day.slice(0, 7);
    if (y !== year) {
      year = y;
      month = "";
      body += `<h2 class="year">${escapeHtml(y)}</h2>`;
    }
    if (mo !== month) {
      month = mo;
      body += `<h3 class="month">${escapeHtml(monthHead(day))}</h3>`;
    }
    const meta = [longDate(day), m.location?.trim() || null, withPeople(m.people)].filter(Boolean) as string[];
    const moods = m.moods.map(label).filter((x): x is string => !!x);
    const moodLine = moods.length
      ? moods.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase())).join(" · ")
      : "";
    const art = m.songArtworkUrl
      ? `<img class="art" src="${escapeHtml(artAt(m.songArtworkUrl, 300))}" alt="">`
      : `<div class="art blank"></div>`;
    const photos = m.photoUrls.length
      ? `<div class="photos">${m.photoUrls
          .slice(0, 4)
          .map((u) => `<img src="${escapeHtml(u)}" alt="">`)
          .join("")}</div>`
      : "";
    body += `
<article class="moment">
  <div class="head">
    ${art}
    <div class="song">
      <div class="title">${escapeHtml(m.songTitle)}</div>
      <div class="artist">${escapeHtml(m.songArtist)}</div>
      <div class="meta">${meta.map(escapeHtml).join(" · ")}</div>
      ${moodLine ? `<div class="moods">${escapeHtml(moodLine)}</div>` : ""}
    </div>
  </div>
  ${m.reflectionText.trim() ? `<div class="words">${paragraphs(m.reflectionText)}</div>` : ""}
  ${photos}
</article>`;
  }

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=DM+Serif+Display&family=Newsreader:opsz,wght@6..72,400&display=swap" rel="stylesheet">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter; margin: 0.75in 0.8in; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #23222B; background: #FBF7F2; font-family: "DM Sans", -apple-system, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; }
  .cover { height: 9in; display: flex; flex-direction: column; justify-content: flex-end; page-break-after: always; }
  .cover h1 { font-family: "DM Serif Display", Georgia, serif; font-weight: 400; font-size: 44pt; line-height: 1.02; letter-spacing: -0.5pt; margin: 0 0 14pt; }
  .cover .sub { color: #5E5C66; font-size: 11pt; }
  .cover .mark { margin-top: 36pt; font-family: "DM Serif Display", Georgia, serif; font-size: 13pt; color: #736A63; }
  h2.year { font-family: "DM Serif Display", Georgia, serif; font-weight: 400; font-size: 30pt; margin: 0 0 6pt; padding-top: 4pt; border-top: 2pt solid #23222B; page-break-before: always; page-break-after: avoid; }
  h2.year:first-of-type { page-break-before: auto; }
  h3.month { font-size: 10pt; font-weight: 600; color: #5E5C66; margin: 20pt 0 4pt; page-break-after: avoid; }
  .moment { padding: 14pt 0; border-bottom: 0.5pt solid #E0D8CF; page-break-inside: avoid; }
  .head { display: flex; gap: 12pt; align-items: flex-start; }
  .art { width: 64pt; height: 64pt; border-radius: 5pt; object-fit: cover; flex: none; }
  .art.blank { background: #E5DDD4; }
  .title { font-weight: 600; font-size: 12pt; }
  .artist { color: #5E5C66; }
  .meta { color: #5E5C66; font-size: 9pt; margin-top: 3pt; }
  .moods { color: #736A63; font-size: 9pt; margin-top: 2pt; }
  .words { font-family: "Newsreader", Georgia, serif; font-size: 12.5pt; line-height: 1.55; margin-top: 10pt; }
  .words p { margin: 0 0 7pt; }
  .photos { display: flex; gap: 6pt; margin-top: 10pt; }
  .photos img { width: 96pt; height: 96pt; object-fit: cover; border-radius: 4pt; }
</style></head>
<body>
<section class="cover">
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">${sorted.length} ${sorted.length === 1 ? "moment" : "moments"}${span ? ` · ${escapeHtml(span)}` : ""}</div>
  <div class="sub">Exported ${escapeHtml(exported)}</div>
  <div class="mark">Soundtracks</div>
</section>
${body}
</body></html>`;
}
