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
      mood,
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

  const formattedDate = row.moment_date
    ? new Date(row.moment_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FBF6F1" }}>
      <div className="max-w-lg mx-auto px-6 pt-12 pb-36">

        {/* Header */}
        <p className="text-sm font-medium mb-6" style={{ color: "#999" }}>
          {senderName} gifted you a memory
        </p>

        {/* Artwork */}
        {row.song_artwork_url && (
          <div className="mb-6 rounded-2xl overflow-hidden shadow-lg" style={{ aspectRatio: "1", width: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.song_artwork_url}
              alt={row.song_title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        {/* Song info */}
        <h1 className="text-2xl font-bold" style={{ color: "#2C2C3A" }}>
          {row.song_title}
        </h1>
        <p className="text-base mt-1" style={{ color: "#666" }}>
          {row.song_artist}
          {row.song_album_name ? ` · ${row.song_album_name}` : ""}
        </p>
        {formattedDate && (
          <p className="text-sm mt-1" style={{ color: "#999" }}>{formattedDate}</p>
        )}
        {row.song_preview_url && <PreviewPlayer url={row.song_preview_url} />}

        {/* Reflection */}
        {row.reflection_text && (
          <p
            className="mt-6 text-base leading-relaxed italic"
            style={{ color: "#444" }}
          >
            &ldquo;{row.reflection_text}&rdquo;
          </p>
        )}

        {/* Photos */}
        {photoUrls.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {photoUrls.map((url, i) => (
              <div key={i} className="rounded-2xl overflow-hidden shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{ width: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-4"
        style={{ backgroundColor: "#FBF6F1", borderTop: "1px solid #E8D8CC" }}
      >
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          <p className="text-xs text-center" style={{ color: "#999" }}>
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
