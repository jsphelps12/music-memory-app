"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export async function submitContribution(formData: FormData): Promise<void> {
  const inviteCode = formData.get("inviteCode") as string;
  const name = formData.get("name") as string;
  const songJson = formData.get("song") as string;
  const reflection = formData.get("reflection") as string;
  const photo = formData.get("photo") as File;

  if (!inviteCode || !name || !songJson || !reflection || !photo) {
    throw new Error("All fields are required.");
  }

  const song = JSON.parse(songJson) as {
    trackId: number;
    trackName: string;
    artistName: string;
    collectionName: string;
    artworkUrl100: string;
    previewUrl?: string;
  };

  const supabase = getSupabase();

  // Validate invite code + get collection
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id, guest_user_id, events_tier_unlocked, invite_code")
    .eq("invite_code", inviteCode)
    .eq("is_public", true)
    .single();

  if (collectionError || !collection) {
    throw new Error("Collection not found.");
  }

  if (!collection.events_tier_unlocked) {
    throw new Error("Guest contributions are not enabled for this collection.");
  }

  // Lazily provision guest user if not yet created (e.g. collection converted before feature shipped)
  let guestUserId = collection.guest_user_id as string | null;
  if (!guestUserId) {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: `guest-${collection.id}@guests.soundtracks.app`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (createError || !newUser.user) {
      throw new Error("Failed to set up guest contributions. Please try again.");
    }
    guestUserId = newUser.user.id;
    await supabase
      .from("collections")
      .update({ guest_user_id: guestUserId })
      .eq("id", collection.id);
  }

  // Generate per-submission UUID for claim flow
  const guestUuid = crypto.randomUUID();

  // Fetch iTunes preview URL
  let previewUrl: string | null = song.previewUrl ?? null;
  if (!previewUrl) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${song.trackId}`,
        { next: { revalidate: 0 } }
      );
      const json = await res.json();
      previewUrl = json.results?.[0]?.previewUrl ?? null;
    } catch {
      // Non-fatal: preview URL is nice-to-have
    }
  }

  // Build artwork URL at higher resolution (replace 100x100 with 600x600)
  const artworkUrl = song.artworkUrl100.replace("100x100", "600x600");

  // Upload photo
  const photoBuffer = await photo.arrayBuffer();
  const photoExt = photo.type === "image/png" ? "png" : "jpg";
  const photoPath = `guest/${guestUuid}/${crypto.randomUUID()}.${photoExt}`;

  const { error: uploadError } = await supabase.storage
    .from("moment-photos")
    .upload(photoPath, photoBuffer, {
      contentType: photo.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Failed to upload photo. Please try again.");
  }

  // Insert the moment
  const today = new Date().toISOString().slice(0, 10);

  const { data: moment, error: momentError } = await supabase
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
    throw new Error("Failed to save your memory. Please try again.");
  }

  // Link moment to collection
  const { error: cmError } = await supabase
    .from("collection_moments")
    .insert({
      collection_id: collection.id,
      moment_id: moment.id,
      added_by_user_id: guestUserId,
    });

  if (cmError) {
    // Non-fatal if the link fails — the moment is saved
    console.error("Failed to link moment to collection:", cmError);
  }

  redirect(`/c/${inviteCode}/contribute?success=1`);
}
