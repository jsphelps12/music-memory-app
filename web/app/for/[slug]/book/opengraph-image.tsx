import { ImageResponse } from "next/og";
import { OG, OG_SIZE, RecordMark, namesSize, ogFonts } from "@/lib/ogImage";
import { formatEventDate, parseGuestOccasion } from "@/lib/occasionGuest";
import { getSupabase } from "@/lib/supabase";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Their guest book: every song, photo and word from the night";

/**
 * The card a group chat shows for the keepsake link. This image is fetched
 * without the link's token, so it can't check who may open the book: it
 * shows only what the public guest page shows (names and date), never a
 * guest's photo or words.
 */
export default async function KeepsakeLinkImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await getSupabase().rpc("get_occasion_for_guests", { p_slug: slug });
  const occasion = parseGuestOccasion(data);
  const when = occasion ? [formatEventDate(occasion.eventDate), occasion.city].filter(Boolean).join(" · ") : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: OG.night, padding: "64px 72px", fontFamily: "Sans", color: OG.nightText }}>
        <RecordMark size={84} disc="#2A2422" letter={OG.nightText} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, color: OG.nightSoft, marginBottom: 10 }}>The guest book of</div>
          <div style={{ fontFamily: "Serif", fontSize: namesSize(occasion?.names ?? "Soundtracks"), lineHeight: 1.02, maxWidth: 1000 }}>
            {occasion?.names ?? "Soundtracks"}
          </div>
          <div style={{ fontSize: 28, color: OG.nightSoft, marginTop: 20 }}>{when}</div>
        </div>
        <div style={{ fontSize: 26, color: OG.nightSoft }}>Every song their guests picked, with the photos and the words. Press play.</div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
