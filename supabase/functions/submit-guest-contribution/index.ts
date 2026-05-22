import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "multipart/form-data required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();

    const inviteCode = formData.get("inviteCode") as string | null;
    const name = formData.get("name") as string | null;
    const songJson = formData.get("songJson") as string | null;
    const reflection = formData.get("reflection") as string | null;
    const photo = formData.get("photo") as File | null;

    if (!inviteCode || !name || !songJson || !reflection || !photo) {
      return new Response(JSON.stringify({ error: "All fields are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (name.length > 100) {
      return new Response(JSON.stringify({ error: "Name must be 100 characters or fewer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reflection.length > 5000) {
      return new Response(JSON.stringify({ error: "Reflection must be 5000 characters or fewer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (photo.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Photo must be under 20 MB." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let song: {
      trackId: number;
      trackName: string;
      artistName: string;
      collectionName: string;
      artworkUrl100: string;
      previewUrl?: string;
    };
    try {
      song = JSON.parse(songJson);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid song data." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!song.trackId || !song.trackName || !song.artistName) {
      return new Response(JSON.stringify({ error: "Invalid song data." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate invite code + fetch collection
    const { data: collection, error: collectionError } = await adminClient
      .from("collections")
      .select("id, guest_user_id, events_tier_unlocked")
      .eq("invite_code", inviteCode)
      .eq("is_public", true)
      .single();

    if (collectionError || !collection) {
      return new Response(JSON.stringify({ error: "Collection not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!collection.events_tier_unlocked) {
      return new Response(JSON.stringify({ error: "Guest contributions are not enabled for this collection." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const guestUserId = collection.guest_user_id as string | null;
    if (!guestUserId) {
      return new Response(JSON.stringify({ error: "Guest contributions are not fully set up yet. Ask the collection owner to open the collection in the Soundtracks app first." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guestUuid = crypto.randomUUID();

    // Fetch iTunes preview URL (non-fatal)
    let previewUrl: string | null = song.previewUrl ?? null;
    if (!previewUrl) {
      try {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${song.trackId}`);
        const json = await res.json();
        previewUrl = json.results?.[0]?.previewUrl ?? null;
      } catch {
        // non-fatal
      }
    }

    const artworkUrl = song.artworkUrl100.replace("100x100", "600x600");

    // Upload photo
    const photoBuffer = await photo.arrayBuffer();
    const photoExt = photo.type === "image/png" ? "png" : "jpg";
    const photoPath = `guest/${guestUuid}/${crypto.randomUUID()}.${photoExt}`;

    const { error: uploadError } = await adminClient.storage
      .from("moment-photos")
      .upload(photoPath, photoBuffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Photo upload failed:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload photo. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert moment
    const today = new Date().toISOString().slice(0, 10);
    const { data: moment, error: momentError } = await adminClient
      .from("moments")
      .insert({
        user_id: guestUserId,
        guest_name: name,
        guest_uuid: guestUuid,
        song_title: song.trackName,
        song_artist: song.artistName,
        song_album_name: song.collectionName,
        song_artwork_url: artworkUrl,
        song_preview_url: previewUrl,
        song_apple_music_id: String(song.trackId),
        reflection_text: reflection,
        photo_urls: [photoPath],
        moment_date: today,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (momentError || !moment) {
      console.error("Moment insert failed:", JSON.stringify(momentError));
      return new Response(JSON.stringify({ error: "Failed to save your memory. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Link moment to collection (non-fatal if it fails)
    const { error: cmError } = await adminClient
      .from("collection_moments")
      .insert({
        collection_id: collection.id,
        moment_id: moment.id,
        added_by_user_id: guestUserId,
      });

    if (cmError) {
      console.error("Failed to link moment to collection:", cmError);
    }

    return new Response(JSON.stringify({ success: true, inviteCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
