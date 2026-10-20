"use server";

import { redirect } from "next/navigation";

// Errors are returned, not thrown: Next redacts the message of an error thrown
// from a server action in production builds, so the guest would only ever see
// a generic failure. The checks mirror the submit-guest-contribution edge
// function, which requires every field below, a note and a photo included.
export type SubmitContributionResult = { error: string };

export async function submitContribution(
  formData: FormData
): Promise<SubmitContributionResult | void> {
  const inviteCode = formData.get("inviteCode");
  const name = formData.get("name");
  const songJson = formData.get("song");
  const reflection = formData.get("reflection");
  const photo = formData.get("photo");

  if (typeof inviteCode !== "string" || !inviteCode) {
    return { error: "This invite link is incomplete. Open it again from the message you were sent." };
  }
  if (typeof name !== "string" || !name.trim()) return { error: "Please add your name." };
  if (typeof songJson !== "string" || !songJson) return { error: "Please pick a song." };
  if (typeof reflection !== "string" || !reflection.trim()) {
    return { error: "Please write a few words about the song." };
  }
  if (!(photo instanceof File) || photo.size === 0) return { error: "Please add a photo." };
  if (name.length > 100) return { error: "Name must be 100 characters or fewer." };
  if (reflection.length > 5000) return { error: "Your note must be 5000 characters or fewer." };
  if (photo.size > 20 * 1024 * 1024) return { error: "Photo must be under 20 MB." };

  let song: { trackId: number; trackName: string; artistName: string };
  try {
    song = JSON.parse(songJson);
  } catch {
    return { error: "Please pick the song again." };
  }
  if (!song.trackId || !song.trackName || !song.artistName) {
    return { error: "Please pick the song again." };
  }

  // Forward to edge function — service role stays inside Supabase
  const edgeFormData = new FormData();
  edgeFormData.set("inviteCode", inviteCode);
  edgeFormData.set("name", name.trim());
  edgeFormData.set("songJson", songJson);
  edgeFormData.set("reflection", reflection.trim());
  edgeFormData.set("photo", photo);

  let res: Response;
  try {
    res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-guest-contribution`,
      {
        method: "POST",
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: edgeFormData,
      }
    );
  } catch {
    return { error: "Couldn't reach Soundtracks. Check your connection and try again." };
  }

  if (!res.ok) {
    let message = "Failed to submit. Please try again.";
    try {
      const body = await res.json();
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      // ignore parse failure
    }
    return { error: message };
  }

  redirect(`/c/${inviteCode}/contribute?success=1`);
}
