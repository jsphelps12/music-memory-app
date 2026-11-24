import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { isMissingRpcError } from "@/lib/sharedMomentLink";
import type { Moment } from "@/types";

/**
 * The shared view (docs/ROADMAP.md, "Sharing work, in order"). Everyone but a
 * moment's owner reads it through the server's `get_moment_view` /
 * `get_shared_with_me` / album and link RPCs, all shaped by
 * `moment_view_for`: no place, no people's names, no share link token. Only
 * the owner can pass a moment on (link, share card, send, add to album).
 */

/** Only the owner can share a moment onward. */
export function canPassOn(
  moment: { userId?: string | null } | null | undefined,
  userId: string | null | undefined
): boolean {
  return !!moment && !!userId && moment.userId === userId;
}

/**
 * What a non-owner may see of a moment, applied on the device too: the server
 * already shapes these fields, but an app running ahead of the migration (or a
 * cached row) must not show them either. The owner's moment passes through.
 */
export function shapeForViewer<T extends Partial<Moment> & { userId?: string | null }>(
  moment: T,
  viewerId: string | null | undefined
): T {
  if (canPassOn(moment, viewerId)) return moment;
  return {
    ...moment,
    location: null,
    locationLat: null,
    locationLng: null,
    people: [],
    shareToken: null,
  };
}

/**
 * A row from the shaped view as a Moment, for this viewer. A non-owner's row
 * carries the owner's display name, which attributes the moment ("From …")
 * when nothing more specific (a guest's own name) already does.
 */
export function mapMomentView(row: any, viewerId: string | null | undefined): Moment {
  const moment = shapeForViewer(mapRowToMoment(row), viewerId);
  if (moment.contributorName || canPassOn(moment, viewerId)) return moment;
  const owner = typeof row?.owner_display_name === "string" ? row.owner_display_name : null;
  return owner ? { ...moment, contributorName: owner } : moment;
}

/**
 * One moment for the detail screen, or null when it doesn't exist or this
 * user can't see it. Throws on a failed request.
 *
 * `own` is what the screen already knows: a moment it has on hand that is the
 * viewer's own is re-read from the table as before. Anything else goes
 * through `get_moment_view`, which returns the owner's full row to the owner
 * too. On a server without that RPC yet (an OTA ahead of the migration) it
 * falls back to the table read, shaped on the device.
 */
export async function fetchMomentForViewer(
  id: string,
  viewerId: string | null | undefined,
  own: boolean
): Promise<Moment | null> {
  if (!own) {
    const { data, error } = await supabase.rpc("get_moment_view", { p_moment_id: id });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapMomentView(row, viewerId) : null;
    }
    if (!isMissingRpcError(error)) throw error;
  }

  const { data, error } = await supabase.from("moments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapMomentView(data, viewerId) : null;
}
