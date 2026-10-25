const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;

export class UnsupportedImageError extends Error {
  constructor() {
    super("unsupported_image");
    this.name = "UnsupportedImageError";
  }
}

/**
 * Downscale a user-selected image and re-encode it as JPEG.
 *
 * Guest uploads previously went to storage untouched, which meant two problems:
 * multi-megabyte originals were re-downloaded on every render of the album, and
 * the file's real type was whatever the browser reported — so a HEIC picked on
 * iOS was stored and served as image/heic, which Chrome, Firefox, and Android
 * cannot display (and which broke link previews). Drawing through a canvas
 * fixes both: the output is always a bounded JPEG.
 *
 * Throws UnsupportedImageError if the browser can't decode the file at all
 * (e.g. a HEIC chosen from Files on desktop Chrome) — better to tell the guest
 * than to upload something half their audience can't see.
 */
export async function compressImage(
  file: File,
  { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const [out] = (await compressImageSizes(file, [{ maxDimension, quality }])).files;
  return out;
}

type Size = { maxDimension: number; quality: number };

/**
 * Several sizes from one decode (a gallery photo and its thumbnail). A
 * photographer's original can decode to well over 100MB, so it's decoded
 * once, and each canvas is emptied as soon as it's encoded (Safari holds a
 * canvas's memory until then). width and height are the first size's.
 */
export async function compressImageSizes(
  file: File,
  sizes: Size[]
): Promise<{ files: File[]; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new UnsupportedImageError();
  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  try {
    const files: File[] = [];
    let first = { width: 0, height: 0 };
    for (const [i, size] of sizes.entries()) {
      const scale = Math.min(1, size.maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new UnsupportedImageError();
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", size.quality));
      canvas.width = canvas.height = 0;
      if (!blob) throw new UnsupportedImageError();
      files.push(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
      if (i === 0) first = { width, height };
    }
    return { files, ...first };
  } finally {
    bitmap.close?.();
  }
}
