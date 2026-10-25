import { ImageResponse } from "next/og";
import { OG, OG_SIZE, RecordMark, namesSize, ogFonts } from "@/lib/ogImage";
import { formatEventDate, parseGuestOccasion } from "@/lib/occasionGuest";
import { getSupabase } from "@/lib/supabase";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Pick a song for their guest book";

/**
 * The card a group chat shows for a guest link: who it's for, when, and the
 * couple's suggested songs. Only what the guest page itself shows.
 */
export default async function GuestLinkImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await getSupabase().rpc("get_occasion_for_guests", { p_slug: slug });
  const occasion = parseGuestOccasion(data);
  const covers = (occasion?.suggestedSongs ?? [])
    .map((s) => s.artworkUrl?.replace(/\/\d+x\d+bb\./, "/400x400bb."))
    .filter((u): u is string => !!u && u.startsWith("https://"))
    .slice(0, 3);
  const when = occasion ? [formatEventDate(occasion.eventDate), occasion.city].filter(Boolean).join(" · ") : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.paper, padding: "64px 72px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <RecordMark size={84} />
          {occasion ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, color: OG.graphite, marginBottom: 10 }}>Pick a song for</div>
              <div style={{ fontFamily: "Serif", fontSize: namesSize(occasion.names), lineHeight: 1.02, color: OG.ink, maxWidth: covers.length ? 620 : 1000 }}>
                {occasion.names}
              </div>
              <div style={{ fontSize: 28, color: OG.graphite, marginTop: 20 }}>{when}</div>
            </div>
          ) : (
            <div style={{ fontFamily: "Serif", fontSize: 96, color: OG.ink }}>A guest book that plays</div>
          )}
          <div style={{ fontSize: 24, fontWeight: 500, color: OG.umber }}>{occasion ? `soundtracks.app/for/${slug}` : "soundtracks.app"}</div>
        </div>
        {covers.length ? (
          <div style={{ display: "flex", position: "relative", width: 420, alignItems: "center", justifyContent: "center" }}>
            {covers.map((src, i) => (
              <img
                key={src}
                src={src}
                width={300}
                height={300}
                alt=""
                style={{
                  position: "absolute",
                  top: 70 + i * 40,
                  left: 20 + i * 50,
                  borderRadius: 14,
                  transform: `rotate(${(i - 1) * 5}deg)`,
                  boxShadow: "0 18px 30px rgba(0,0,0,0.25)",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
