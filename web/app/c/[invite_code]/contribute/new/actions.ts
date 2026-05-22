"use server";

import { redirect } from "next/navigation";

export async function submitContribution(formData: FormData): Promise<void> {
  const inviteCode = formData.get("inviteCode") as string;
  const name = formData.get("name") as string;
  const songJson = formData.get("song") as string;
  const reflection = formData.get("reflection") as string;
  const photo = formData.get("photo") as File;

  // Fast early-fail validation before calling the edge function
  if (!inviteCode || !name || !songJson || !reflection || !photo) {
    throw new Error("All fields are required.");
  }
  if (name.length > 100) throw new Error("Name must be 100 characters or fewer.");
  if (reflection.length > 5000) throw new Error("Reflection must be 5000 characters or fewer.");
  if (photo.size > 20 * 1024 * 1024) throw new Error("Photo must be under 20 MB.");

  let song: { trackId: number; trackName: string; artistName: string };
  try {
    song = JSON.parse(songJson);
  } catch {
    throw new Error("Invalid song data.");
  }
  if (!song.trackId || !song.trackName || !song.artistName) {
    throw new Error("Invalid song data.");
  }

  // Forward to edge function — service role stays inside Supabase
  const edgeFormData = new FormData();
  edgeFormData.set("inviteCode", inviteCode);
  edgeFormData.set("name", name);
  edgeFormData.set("songJson", songJson);
  edgeFormData.set("reflection", reflection);
  edgeFormData.set("photo", photo);

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-guest-contribution`,
    {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: edgeFormData,
    }
  );

  if (!res.ok) {
    let message = "Failed to submit. Please try again.";
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  redirect(`/c/${inviteCode}/contribute?success=1`);
}
