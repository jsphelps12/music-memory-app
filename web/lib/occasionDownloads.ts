// The couple's downloads (docs/OCCASIONS.md, P1.6): every photo as a zip and
// every note as a printable page. Pure helpers; tested in
// web/lib/__tests__/occasionDownloads.test.ts.

/** A file name any OS accepts: no path or reserved characters, no control characters. */
export function safeFileName(raw: string, max = 120): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    // "." and ".." on their own mean something to a file system.
    .replace(/(^|\s)\.+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || "photo").slice(0, max).trim();
}

/** The photo's extension from its (signed) URL: jpg, png or webp. */
export function photoExtension(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  const ext = path.slice(path.lastIndexOf(".") + 1);
  return ext === "png" || ext === "webp" || ext === "jpg" ? ext : "jpg";
}

/**
 * "007 Alex Rivera - Mr. Brightside.jpg": numbered in the order the night
 * went, so the zip sorts the way the keepsake plays.
 */
export function photoFileName(position: number, total: number, guestName: string, title: string, url: string): string {
  const width = Math.max(3, String(total).length);
  const base = safeFileName(`${guestName} - ${title}`);
  return `${String(position).padStart(width, "0")} ${base}.${photoExtension(url)}`;
}
