// Export your journal, the device half: fetch every moment, print the
// book (lib/journalExport.ts builds it) to PDF with expo-print, and share.

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { YEAR_REVIEW_COLUMNS } from "@/lib/momentColumns";
import { getPublicPhotoUrl } from "@/lib/storage";
import { buildJournalHtml, type ExportMoment, type ExportOptions } from "@/lib/journalExport";

const PAGE = 500;

/** Every moment the user owns, with people, place and photos. */
export async function fetchAllForExport(userId: string): Promise<ExportMoment[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("moments")
      .select(YEAR_REVIEW_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      // A unique tiebreak, so pages never overlap or skip a row when two
      // moments share a created_at.
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(mapRowToMoment).map((mo) => ({
    id: mo.id,
    songTitle: mo.songTitle,
    songArtist: mo.songArtist,
    songAlbumName: mo.songAlbumName,
    songArtworkUrl: mo.songArtworkUrl,
    reflectionText: mo.reflectionText ?? "",
    moods: mo.moods ?? [],
    people: mo.people ?? [],
    location: mo.location ?? null,
    momentDate: mo.momentDate,
    createdAt: mo.createdAt,
    // Pre-resized thumbnails when present; full size for older moments.
    photoUrls: (mo.photoThumbnails?.length ? mo.photoThumbnails : mo.photoUrls ?? []).map(getPublicPhotoUrl),
  }));
}

/**
 * Builds the PDF and opens the share sheet (Save to Files, Mail, AirDrop…).
 * Resolves with the number of moments exported.
 */
export async function exportJournalPdf(userId: string, opts: ExportOptions): Promise<number> {
  const moments = await fetchAllForExport(userId);
  const html = buildJournalHtml(moments, opts);
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  // A readable name instead of the printer's random one.
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const named = new File(Paths.cache, `Soundtracks journal ${stamp}.pdf`);
  try {
    if (named.exists) named.delete();
    await new File(uri).move(named);
  } catch {
    // Keep the printer's file if the rename fails.
  }
  const target = named.exists ? named.uri : uri;
  await Sharing.shareAsync(target, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Your journal" });
  return moments.length;
}
