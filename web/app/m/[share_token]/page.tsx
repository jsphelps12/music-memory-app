import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { PreviewPlayer } from "@/components/PreviewPlayer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ share_token: string }>;
}

export default async function GiftedMomentPage({ params }: PageProps) {
  const { share_token } = await params;

  const { data: row } = await getSupabase()
    .from("moments")
    .select(`
      id,
      song_title,
      song_artist,
      song_album_name,
      song_artwork_url,
      song_preview_url,
      reflection_text,
      photo_urls,
      moment_date,
      user_id
    `)
    .eq("share_token", share_token)
    .single();

  if (!row) notFound();

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("display_name")
    .eq("id", row.user_id)
    .single();

  const senderName = profile?.display_name ?? "Someone";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const photoUrls: string[] = (row.photo_urls ?? []).map(
    (path: string) => `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`
  );

  const heroUrl = photoUrls[0] ?? row.song_artwork_url ?? null;
  const remainingPhotos = photoUrls.slice(1);

  const formattedDate = row.moment_date
    ? new Date(row.moment_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ backgroundColor: "#0D0D0F" }}>
      <div className="w-full max-w-sm px-4 pt-10 pb-36">

        {/* Sender label */}
        <p className="text-xs font-medium text-center mb-4 tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
          {senderName} gifted you a memory
        </p>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ backgroundColor: "#1A1A1F" }}>

          {/* Hero — photo if available, otherwise artwork */}
          {heroUrl && (
            <div style={{ aspectRatio: "4/3", width: "100%", position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          )}

          {/* Content */}
          <div className="px-5 pt-4 pb-5">
            {/* Song row: artwork thumbnail + title/artist */}
            <div className="flex items-center gap-3 mb-3">
              {row.song_artwork_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.song_artwork_url}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <p className="font-bold text-sm leading-tight truncate" style={{ color: "#fff" }}>
                  {row.song_title}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {row.song_artist}
                </p>
              </div>
            </div>

            {/* Reflection */}
            {row.reflection_text && (
              <p className="text-sm leading-relaxed italic mb-3" style={{ color: "rgba(255,255,255,0.75)" }}>
                &ldquo;{row.reflection_text}&rdquo;
              </p>
            )}

            {/* Footer: date + wordmark */}
            <div className="flex items-center justify-between">
              {formattedDate ? (
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{formattedDate}</p>
              ) : <span />}
              <p className="text-sm font-bold tracking-wide" style={{ color: "#E8825C" }}>Tracks</p>
            </div>
          </div>
        </div>

        {/* Preview player */}
        {row.song_preview_url && (
          <div className="mt-4 flex justify-center">
            <PreviewPlayer url={row.song_preview_url} />
          </div>
        )}

        {/* Additional photos */}
        {remainingPhotos.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {remainingPhotos.map((url, i) => (
              <div key={i} className="rounded-2xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-4"
        style={{ backgroundColor: "#0D0D0F", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="max-w-sm mx-auto flex flex-col gap-2">
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            Remember a song that takes you back?
          </p>
          {/* TODO: replace href with real App Store URL once live */}
          <a
            href="https://music-memory-app.vercel.app"
            className="block text-center py-3 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#E8825C" }}
          >
            Capture your own memories in Tracks
          </a>
        </div>
      </div>
    </div>
  );
}
