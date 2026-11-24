/**
 * "Who was there" names linked to friends (moment_people_links, migration
 * 20261121000000). `moments.people` keeps the names; a link says which
 * friend's account a name on one moment is. Private to the owner: RLS lets
 * only the owner read or write their rows, and nothing shared reads them.
 *
 * The app can reach people (over the air) before the migration is applied,
 * so every read and write here treats a missing table as "linking isn't
 * available yet": reads return `available: false` and writes are skipped, and
 * the app behaves exactly as it did before links existed.
 */
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { nameKey } from "@/lib/people";
import type { PersonLink, StoredPersonLink } from "@/types";

export const PEOPLE_LINKS_TABLE = "moment_people_links";

/**
 * Whether an error says the table doesn't exist: Postgres `42P01`
 * (undefined_table) or PostgREST `PGRST205` ("Could not find the table
 * 'public.moment_people_links' in the schema cache").
 */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01" || code === "PGRST205") return true;
  if (typeof message !== "string") return false;
  return /relation .* does not exist/i.test(message) || /could not find the table/i.test(message);
}

export interface PeopleLinksResult {
  /** False when the table isn't there yet: behave as before links existed. */
  available: boolean;
  links: StoredPersonLink[];
}

/** `["peopleLinks", userId]`: every link the owner has made. */
export function peopleLinksQueryKey(userId: string | undefined) {
  return ["peopleLinks", userId] as const;
}

function toStored(row: { moment_id: string; name: string; friend_id: string }): StoredPersonLink {
  return { momentId: row.moment_id, name: row.name, friendId: row.friend_id };
}

/** Every link the owner made, paged past the 1000-row cap. */
export async function fetchPeopleLinks(ownerId: string): Promise<PeopleLinksResult> {
  try {
    const rows = await fetchAllRows<{ moment_id: string; name: string; friend_id: string }>((from, to) =>
      supabase
        .from(PEOPLE_LINKS_TABLE)
        .select("moment_id, name, friend_id")
        .eq("owner_id", ownerId)
        // The primary key: a stable, unique order for paging.
        .order("moment_id", { ascending: true })
        .order("friend_id", { ascending: true })
        .range(from, to)
    );
    return { available: true, links: rows.map(toStored) };
  } catch (e) {
    if (isMissingRelationError(e)) return { available: false, links: [] };
    throw e;
  }
}

/** The links on one moment (the editor loads these fresh). */
export async function fetchMomentPeopleLinks(
  momentId: string,
  ownerId: string
): Promise<{ available: boolean; links: PersonLink[] }> {
  const { data, error } = await supabase
    .from(PEOPLE_LINKS_TABLE)
    .select("moment_id, name, friend_id")
    .eq("moment_id", momentId)
    .eq("owner_id", ownerId);
  if (error) {
    if (isMissingRelationError(error)) return { available: false, links: [] };
    throw error;
  }
  return {
    available: true,
    links: ((data ?? []) as { moment_id: string; name: string; friend_id: string }[]).map((r) => ({
      name: r.name,
      friendId: r.friend_id,
    })),
  };
}

/** The links on one moment, from the owner's whole set. */
export function linksForMoment(all: readonly StoredPersonLink[], momentId: string): PersonLink[] {
  return all.filter((l) => l.momentId === momentId).map(({ name, friendId }) => ({ name, friendId }));
}

/**
 * The links worth keeping for these names: each link's name must be on the
 * moment (matched ignoring case and spacing, saved in the moment's spelling),
 * and each friend and each name is linked at most once (the first wins).
 */
export function normalizeLinks(people: readonly string[], links: readonly PersonLink[]): PersonLink[] {
  const byKey = new Map<string, string>();
  for (const name of people) {
    const key = nameKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  const seenFriends = new Set<string>();
  const seenNames = new Set<string>();
  const out: PersonLink[] = [];
  for (const link of links) {
    const key = nameKey(link.name);
    const name = byKey.get(key);
    if (!name || !link.friendId || seenFriends.has(link.friendId) || seenNames.has(key)) continue;
    seenFriends.add(link.friendId);
    seenNames.add(key);
    out.push({ name, friendId: link.friendId });
  }
  return out;
}

/** The link on this name, if any (ignoring case and spacing). */
export function linkForName(links: readonly PersonLink[], name: string): PersonLink | undefined {
  const key = nameKey(name);
  return key ? links.find((l) => nameKey(l.name) === key) : undefined;
}

/**
 * What to write to go from `before` (what's stored) to `after`: rows to
 * upsert (new friends, or a friend now on a different name) and friend ids
 * whose rows to delete.
 */
export function diffPeopleLinks(
  before: readonly PersonLink[],
  after: readonly PersonLink[]
): { upsert: PersonLink[]; remove: string[] } {
  const prev = new Map(before.map((l) => [l.friendId, l.name]));
  const next = new Map(after.map((l) => [l.friendId, l.name]));
  const remove = [...prev.keys()].filter((id) => !next.has(id));
  const upsert = after.filter((l) => prev.get(l.friendId) !== l.name);
  return { upsert, remove };
}

export type SyncOutcome = "saved" | "unchanged" | "unavailable";

/**
 * Write a moment's links after the moment row is saved. `before` is what's
 * stored (empty for a new moment); `after` is the editor's links, kept only
 * where the name is still on the moment. Returns "unavailable" when the table
 * isn't there yet; throws any other error (the caller logs it, the save
 * itself has already landed).
 */
export async function syncMomentPeopleLinks(input: {
  momentId: string;
  ownerId: string;
  people: readonly string[];
  before: readonly PersonLink[];
  after: readonly PersonLink[];
}): Promise<SyncOutcome> {
  const desired = normalizeLinks(input.people, input.after);
  const { upsert, remove } = diffPeopleLinks(input.before, desired);
  if (upsert.length === 0 && remove.length === 0) return "unchanged";

  if (remove.length) {
    const { error } = await supabase
      .from(PEOPLE_LINKS_TABLE)
      .delete()
      .eq("moment_id", input.momentId)
      .eq("owner_id", input.ownerId)
      .in("friend_id", remove);
    if (error) {
      if (isMissingRelationError(error)) return "unavailable";
      throw error;
    }
  }

  if (upsert.length) {
    const { error } = await supabase.from(PEOPLE_LINKS_TABLE).upsert(
      upsert.map((l) => ({
        moment_id: input.momentId,
        owner_id: input.ownerId,
        name: l.name,
        friend_id: l.friendId,
      })),
      { onConflict: "moment_id,friend_id" }
    );
    if (error) {
      if (isMissingRelationError(error)) return "unavailable";
      throw error;
    }
  }
  return "saved";
}
