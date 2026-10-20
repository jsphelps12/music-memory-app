import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { removeAllUnder } from "./storage.ts";
import { isUuid } from "./uuid.ts";

export { isUuid };

// Guest contributions (submit-guest-contribution) are owned by a per-album
// guest auth user and store their photo under guest/{guest_uuid}/. Neither is
// reachable with the album owner's own session, so cleanup runs here with the
// service role, after the caller has been checked against the album.

const PAGE = 500;

/** The email create-guest-user gives an album's guest auth user. */
export function guestEmailFor(collectionId: string): string {
  return `guest-${collectionId}@guests.soundtracks.app`;
}

/**
 * True only when `userId` is the guest auth user create-guest-user made for
 * this album. Guards every destructive step: guest_user_id is a plain column,
 * so it is never trusted on its own.
 */
export async function isAlbumGuestUser(
  admin: SupabaseClient,
  userId: string,
  collectionId: string
): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  return data.user.email?.toLowerCase() === guestEmailFor(collectionId).toLowerCase();
}

/**
 * Remove the storage objects of one guest moment. The folder is the moment's
 * own guest_uuid, validated as a uuid so a bad value can never widen the
 * prefix to all of guest/. Returns the number of objects that failed.
 */
export async function removeGuestMomentPhotos(
  admin: SupabaseClient,
  guestUuid: string | null
): Promise<number> {
  if (!isUuid(guestUuid)) return 0;
  const { failed } = await removeAllUnder(admin, `guest/${guestUuid}`);
  return failed;
}

/**
 * Delete everything an album's guest user owns: each guest moment's photos,
 * then the guest auth user itself (its moments cascade). Clears the album's
 * guest_user_id so create-guest-user can make a fresh one if the album lives
 * on. Leaves the guest user in place when any photo failed to delete, so a
 * retry still finds the moments that point at them.
 */
export async function purgeAlbumGuestContent(
  admin: SupabaseClient,
  collection: { id: string; guest_user_id: string | null }
): Promise<{ ok: boolean; moments: number }> {
  const guestUserId = collection.guest_user_id;
  if (!guestUserId) return { ok: true, moments: 0 };
  if (!(await isAlbumGuestUser(admin, guestUserId, collection.id))) {
    // Not this album's guest user (or already deleted): touch nothing.
    console.warn(`[guest] guest_user_id on ${collection.id} is not its guest user; skipped`);
    return { ok: true, moments: 0 };
  }

  let failed = 0;
  let count = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("moments")
      .select("id, guest_uuid")
      .eq("user_id", guestUserId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[guest] listing guest moments failed:", error.message);
      return { ok: false, moments: count };
    }
    const rows = data ?? [];
    for (const row of rows) {
      failed += await removeGuestMomentPhotos(admin, row.guest_uuid);
    }
    count += rows.length;
    if (rows.length < PAGE) break;
  }
  if (failed > 0) return { ok: false, moments: count };

  const { error: deleteError } = await admin.auth.admin.deleteUser(guestUserId);
  if (deleteError) {
    console.error("[guest] deleting guest user failed:", deleteError.message);
    return { ok: false, moments: count };
  }

  await admin.from("collections").update({ guest_user_id: null }).eq("id", collection.id);
  return { ok: true, moments: count };
}
