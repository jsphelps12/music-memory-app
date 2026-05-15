import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

export async function extractPhotoMetadata(assets: ImagePicker.ImagePickerAsset[]) {
  let earliestDate: Date | undefined;

  for (const asset of assets) {
    const exif = asset.exif as Record<string, any> | undefined;
    if (!exif) continue;
    const raw = exif.DateTimeOriginal ?? exif.DateTime;
    if (raw) {
      const normalized = (raw as string).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      const d = new Date(normalized);
      if (!isNaN(d.getTime()) && (!earliestDate || d < earliestDate)) {
        earliestDate = d;
      }
    }
  }

  let suggestedLocation: string | undefined;
  let capturedLat: number | undefined;
  let capturedLng: number | undefined;
  for (const asset of assets) {
    const exif = asset.exif as Record<string, any> | undefined;
    if (!exif?.GPSLatitude || !exif?.GPSLongitude) continue;
    const lat = exif.GPSLatitude * (exif.GPSLatitudeRef === "S" ? -1 : 1);
    const lon = exif.GPSLongitude * (exif.GPSLongitudeRef === "W" ? -1 : 1);
    capturedLat = lat;
    capturedLng = lon;
    try {
      const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (result) {
        suggestedLocation = [result.city, result.region].filter(Boolean).join(", ") || undefined;
      }
    } catch {
      // Geocoding failed — skip location suggestion
    }
    break; // Only geocode the first photo with GPS
  }

  return { date: earliestDate, location: suggestedLocation, lat: capturedLat, lng: capturedLng };
}

// ─── Minimal JPEG EXIF parser (no external deps) ────────────────────────────

function _u16(b: Uint8Array, o: number, le: boolean) {
  return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
}
function _u32(b: Uint8Array, o: number, le: boolean) {
  return le
    ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)
    : b[o] * 0x1000000 | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}
function _str(b: Uint8Array, o: number, len: number) {
  let s = "";
  for (let i = 0; i < len && b[o + i]; i++) s += String.fromCharCode(b[o + i]);
  return s;
}
function _rational(b: Uint8Array, o: number, le: boolean) {
  const n = _u32(b, o, le), d = _u32(b, o + 4, le);
  return d ? n / d : 0;
}

type _IFDEntry = { tag: number; count: number; valOff: number };
function _readIFD(b: Uint8Array, base: number, ifdStart: number, le: boolean): _IFDEntry[] {
  if (ifdStart + 2 > b.length) return [];
  const count = _u16(b, ifdStart, le);
  const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  const entries: _IFDEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = ifdStart + 2 + i * 12;
    if (e + 12 > b.length) break;
    const tag = _u16(b, e, le);
    const type = _u16(b, e + 2, le);
    const cnt = _u32(b, e + 4, le);
    const sz = (sizes[type] || 1) * cnt;
    // valOff is TIFF-relative; inline values live at e+8 in the buffer
    const valOff = sz <= 4 ? e + 8 - base : _u32(b, e + 8, le);
    entries.push({ tag, count: cnt, valOff });
  }
  return entries;
}

function _parseJpegExif(bytes: Uint8Array): { date?: Date; lat?: number; lon?: number } {
  let p = 2; // skip SOI FF D8
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xFF) break;
    const marker = bytes[p + 1];
    const segLen = (bytes[p + 2] << 8) | bytes[p + 3];
    if (marker === 0xDA) break; // start of scan — no more metadata
    if (marker === 0xE1 && segLen > 6 && _str(bytes, p + 4, 4) === "Exif") {
      const base = p + 10; // skip FF E1, length(2), "Exif\0\0"(6)
      const le = bytes[base] === 0x49;
      if (_u16(bytes, base + 2, le) !== 0x002A) break;
      const ifd0 = _readIFD(bytes, base, base + _u32(bytes, base + 4, le), le);

      let dateStr: string | undefined;
      let exifOff: number | undefined;
      let gpsOff: number | undefined;
      for (const e of ifd0) {
        if (e.tag === 0x0132) dateStr = _str(bytes, base + e.valOff, e.count);
        // Sub-IFD pointers are 4-byte LONG values — read the value, not store the location
        if (e.tag === 0x8769) exifOff = _u32(bytes, base + e.valOff, le);
        if (e.tag === 0x8825) gpsOff = _u32(bytes, base + e.valOff, le);
      }

      // DateTimeOriginal overrides DateTime
      if (exifOff != null) {
        for (const e of _readIFD(bytes, base, base + exifOff, le)) {
          if (e.tag === 0x9003) dateStr = _str(bytes, base + e.valOff, e.count);
        }
      }

      let date: Date | undefined;
      if (dateStr) {
        const d = new Date(dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
        if (!isNaN(d.getTime())) date = d;
      }

      let lat: number | undefined, lon: number | undefined;
      if (gpsOff != null) {
        let latRef = "N", lonRef = "E", latRaw: number | undefined, lonRaw: number | undefined;
        for (const e of _readIFD(bytes, base, base + gpsOff, le)) {
          if (e.tag === 0x0001) latRef = _str(bytes, base + e.valOff, 1);
          if (e.tag === 0x0003) lonRef = _str(bytes, base + e.valOff, 1);
          if (e.tag === 0x0002 && e.count === 3) {
            const d = _rational(bytes, base + e.valOff, le);
            const m = _rational(bytes, base + e.valOff + 8, le);
            const s = _rational(bytes, base + e.valOff + 16, le);
            latRaw = d + m / 60 + s / 3600;
          }
          if (e.tag === 0x0004 && e.count === 3) {
            const d = _rational(bytes, base + e.valOff, le);
            const m = _rational(bytes, base + e.valOff + 8, le);
            const s = _rational(bytes, base + e.valOff + 16, le);
            lonRaw = d + m / 60 + s / 3600;
          }
        }
        if (latRaw != null) lat = latRaw * (latRef === "S" ? -1 : 1);
        if (lonRaw != null) lon = lonRaw * (lonRef === "W" ? -1 : 1);
      }

      return { date, lat, lon };
    }
    p += 2 + segLen;
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────

// Extracts EXIF date + GPS from a bare file path (e.g. shared via share extension).
// Reads only the first 64 KB — EXIF is always in the opening segments of a JPEG.
export async function extractExifFromPath(uri: string): Promise<{ date?: Date; location?: string; lat?: number; lng?: number }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as any,
      position: 0,
      length: 65536,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { date, lat, lon } = _parseJpegExif(bytes);

    let location: string | undefined;
    if (lat != null && lon != null) {
      try {
        const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (result) location = [result.city, result.region].filter(Boolean).join(", ") || undefined;
      } catch {
        // Geocoding failed — skip location
      }
    }

    return { date, location, lat: lat ?? undefined, lng: lon ?? undefined };
  } catch {
    return {};
  }
}
