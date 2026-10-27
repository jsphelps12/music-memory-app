import { ImageResponse } from "next/og";
import { artworkAt } from "@/lib/occasionBook";
import { OG, OG_SIZE, RecordMark, ogFonts } from "@/lib/ogImage";
import { fetchSharedMoment } from "@/lib/sharedMoment";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A moment from a wedding guest book";

/**
 * The card a shared moment unfurls as: the guest's photo (or the cover), the
 * song, a line of what they wrote, and whose wedding. The signature is in
 * the path, so this image checks it exactly as the page does; holding the
 * link is what lets anyone see the moment at all.
 */
export default async function MomentImage({ params }: { params: Promise<{ slug: string; entryId: string; sig: string }> }) {
  const { slug, entryId, sig } = await params;
  const shared = await fetchSharedMoment(slug, entryId, sig).catch(() => null);
  const fonts = await ogFonts();
  if (!shared) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: OG.night, padding: "64px 72px", color: OG.nightText, fontFamily: "Sans" }}>
          <RecordMark size={84} disc="#2A2422" letter={OG.nightText} />
          <div style={{ fontFamily: "Serif", fontSize: 96 }}>A guest book that plays</div>
          <div style={{ fontSize: 26, color: OG.nightSoft }}>soundtracks.app</div>
        </div>
      ),
      { ...OG_SIZE, fonts }
    );
  }
  const { occasion, moment } = shared;
  const image = moment.photoUrl ?? artworkAt(moment.artworkUrl, 600);
  const words = moment.words && moment.words.length > 150 ? `${moment.words.slice(0, 147).trimEnd()}…` : moment.words;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.night, color: OG.nightText, fontFamily: "Sans" }}>
        {image ? (
          <img src={image} width={560} height={630} alt="" style={{ width: 560, height: 630, objectFit: "cover" }} />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "56px 60px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Serif", fontSize: 60, lineHeight: 1.05 }}>{moment.title}</div>
            <div style={{ fontSize: 28, color: OG.nightSoft, marginTop: 10 }}>{moment.artist}</div>
            {words ? <div style={{ fontFamily: "Reading", fontSize: 30, lineHeight: 1.4, marginTop: 30 }}>{words}</div> : null}
          </div>
          <div style={{ fontSize: 24, color: OG.nightSoft }}>{`${moment.guestName}, at ${occasion.names}'s wedding`}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts }
  );
}
