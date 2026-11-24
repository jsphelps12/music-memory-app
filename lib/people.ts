// Pure helpers for lists of people: friends in the pickers (PersonPicker) and
// the free-text "who was there" names (PeopleInput). No I/O here, so the
// ordering, search and name rules are tested in lib/__tests__/people.test.ts.

/** Ids per `in.(...)` filter: 100 UUIDs keep the request URL near 4 KB. */
export const ID_BATCH_SIZE = 100;

/** Split a list into runs of at most `size`, in order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * For matching only: trimmed, single-spaced, lower case, with accents
 * dropped, so "  José " and "jose" compare equal. Never shown.
 */
export function normalizeName(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identity of a typed name: case and spacing ignored, accents kept (the
 * owner's rule is "ignoring case"). "Sam" and " sam" are one person; "Zoë"
 * and "Zoe" stay two spellings, though a search for one finds both.
 */
export function nameKey(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/** Whitespace tidied, case kept: what a typed name is saved as. */
export function tidyName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Word-prefix search: "sa" finds "Sam Kim" and "Lisa Sanders" (second word)
 * but not "Lisa". A leading "@" searches handles the same way. Accents and
 * case are ignored. An empty query matches everyone.
 */
export function matchesQuery(fields: readonly (string | null | undefined)[], query: string): boolean {
  const q = normalizeName(query).replace(/^@+/, "");
  if (!q) return true;
  return fields.some((field) => {
    const f = normalizeName(field);
    if (!f) return false;
    if (f.startsWith(q)) return true;
    // Each word start: after a space, hyphen, dot or underscore.
    return f.split(/[\s\-._]+/).some((_, i, words) => words.slice(i).join(" ").startsWith(q));
  });
}

/** The fields a picker row is identified by. */
export interface PersonLike {
  id: string;
  displayName: string | null;
  username?: string | null;
}

/** One label for a person everywhere: their name, else their @handle, else "Someone". */
export function personLabel(person: { displayName: string | null; username?: string | null }): string {
  const name = person.displayName?.trim();
  if (name) return name;
  const handle = person.username?.trim();
  return handle ? `@${handle}` : "Someone";
}

const collator = typeof Intl !== "undefined" ? new Intl.Collator(undefined, { sensitivity: "base" }) : null;

/** A–Z by name, accents and case ignored; nameless people last; id breaks ties. */
export function compareByName(a: PersonLike, b: PersonLike): number {
  const an = a.displayName?.trim() || a.username?.trim() || "";
  const bn = b.displayName?.trim() || b.username?.trim() || "";
  if (!an !== !bn) return an ? -1 : 1;
  const byName = collator ? collator.compare(an, bn) : normalizeName(an).localeCompare(normalizeName(bn));
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Picker order: the people you sent to most recently first (newest send on
 * top), then everyone else A–Z. `lastSentAt` maps a person id to an ISO time.
 */
export function rankPeople<T extends PersonLike>(
  people: readonly T[],
  lastSentAt?: ReadonlyMap<string, string>
): T[] {
  const recent: T[] = [];
  const rest: T[] = [];
  for (const person of people) {
    if (lastSentAt?.has(person.id)) recent.push(person);
    else rest.push(person);
  }
  recent.sort((a, b) => {
    const at = lastSentAt!.get(a.id)!;
    const bt = lastSentAt!.get(b.id)!;
    return at < bt ? 1 : at > bt ? -1 : compareByName(a, b);
  });
  rest.sort(compareByName);
  return [...recent, ...rest];
}

/** The people matching a search, keeping the order given. */
export function filterPeople<T extends PersonLike>(people: readonly T[], query: string): T[] {
  if (!normalizeName(query).replace(/^@+/, "")) return [...people];
  return people.filter((p) => matchesQuery([p.displayName, p.username], query));
}

/**
 * Ids of people whose name is shared with someone else on the list, so the
 * row can show their @handle to tell them apart.
 */
export function idsNeedingHandle(people: readonly PersonLike[]): Set<string> {
  const byName = new Map<string, string[]>();
  for (const p of people) {
    const key = normalizeName(p.displayName);
    if (!key) continue;
    const ids = byName.get(key);
    if (ids) ids.push(p.id);
    else byName.set(key, [p.id]);
  }
  const out = new Set<string>();
  for (const ids of byName.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

/**
 * One row per other person. Two people opening each other's links at the same
 * time can leave both A→B and B→A rows; the oldest one wins.
 */
export function dedupeByOtherUser<T extends { otherUserId: string; createdAt: string; id: string }>(
  rows: readonly T[]
): T[] {
  const kept = new Map<string, T>();
  for (const row of rows) {
    const prev = kept.get(row.otherUserId);
    if (!prev || row.createdAt < prev.createdAt || (row.createdAt === prev.createdAt && row.id < prev.id)) {
      kept.set(row.otherUserId, row);
    }
  }
  // Keep the input order of the survivors.
  return rows.filter((row) => kept.get(row.otherUserId) === row);
}

// ── "Who was there" names ──────────────────────────────────────────────

/** A name the person could mean, with how they've used it. */
export interface KnownName {
  /** The spelling to use (the most used one, else the friend's own). */
  name: string;
  key: string;
  /** Moments it's on. */
  count: number;
  /** Latest moment date it's on (YYYY-MM-DD), or "" for none. */
  lastUsed: string;
  /** A friend's display name (whether or not it's on a moment yet). */
  friend: boolean;
}

/**
 * Every name the person has written on a moment plus their friends' display
 * names, one entry per `nameKey`. Spelling variants ("Sam" ×12, "sam" ×3)
 * merge into the most used spelling, so suggestions stop the drift.
 */
export function buildKnownNames(
  moments: readonly { people: readonly string[]; momentDate: string | null }[],
  friendNames: readonly (string | null | undefined)[] = []
): KnownName[] {
  // key -> spelling -> {count, lastUsed}
  const spellings = new Map<string, Map<string, { count: number; lastUsed: string }>>();
  for (const m of moments) {
    const seen = new Set<string>();
    for (const raw of m.people) {
      const name = tidyName(raw);
      const key = nameKey(name);
      if (!key || seen.has(`${key}\u0000${name}`)) continue;
      seen.add(`${key}\u0000${name}`);
      let byKey = spellings.get(key);
      if (!byKey) spellings.set(key, (byKey = new Map()));
      const s = byKey.get(name) ?? { count: 0, lastUsed: "" };
      s.count += 1;
      const date = m.momentDate ?? "";
      if (date > s.lastUsed) s.lastUsed = date;
      byKey.set(name, s);
    }
  }

  const out = new Map<string, KnownName>();
  for (const [key, byKey] of spellings) {
    let best: [string, { count: number; lastUsed: string }] | null = null;
    let count = 0;
    let lastUsed = "";
    for (const entry of byKey) {
      count += entry[1].count;
      if (entry[1].lastUsed > lastUsed) lastUsed = entry[1].lastUsed;
      if (
        !best ||
        entry[1].count > best[1].count ||
        (entry[1].count === best[1].count && entry[1].lastUsed > best[1].lastUsed)
      ) {
        best = entry;
      }
    }
    out.set(key, { name: best![0], key, count, lastUsed, friend: false });
  }

  for (const raw of friendNames) {
    if (!raw) continue;
    const name = tidyName(raw);
    const key = nameKey(name);
    if (!key) continue;
    const existing = out.get(key);
    if (existing) existing.friend = true;
    else out.set(key, { name, key, count: 0, lastUsed: "", friend: true });
  }
  return [...out.values()];
}

/** Whether `names` already holds this name, ignoring case and spacing. */
export function hasName(names: readonly string[], name: string): boolean {
  const key = nameKey(name);
  return !!key && names.some((n) => nameKey(n) === key);
}

/**
 * The spelling to save for a typed name: the known spelling when it matches
 * one ignoring case ("sam" becomes "Sam"), else the tidied text as typed.
 */
export function resolveName(typed: string, known: readonly KnownName[]): string {
  const key = nameKey(typed);
  const match = key ? known.find((k) => k.key === key) : undefined;
  return match ? match.name : tidyName(typed);
}

/**
 * Suggestions for what's typed: known names matching it (word prefix, accents
 * and case ignored) that aren't on the moment yet. An exact match comes
 * first, then names that start with the text, then the rest; within each, the
 * most used, then the most recent, then A–Z.
 */
export function suggestNames(
  known: readonly KnownName[],
  query: string,
  exclude: readonly string[],
  limit = 5
): KnownName[] {
  const q = normalizeName(query);
  if (!q) return [];
  const excluded = new Set(exclude.map(nameKey));
  const tier = (k: KnownName) => {
    const n = normalizeName(k.name);
    return n === q ? 0 : n.startsWith(q) ? 1 : 2;
  };
  return known
    .filter((k) => !excluded.has(k.key) && matchesQuery([k.name], query))
    .sort(
      (a, b) =>
        tier(a) - tier(b) ||
        b.count - a.count ||
        (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0) ||
        compareByName({ id: a.key, displayName: a.name }, { id: b.key, displayName: b.name })
    )
    .slice(0, limit);
}

/** Names used most recently on a moment (friends never used yet are left out). */
export function recentNames(known: readonly KnownName[], exclude: readonly string[], limit = 6): KnownName[] {
  const excluded = new Set(exclude.map(nameKey));
  return known
    .filter((k) => k.count > 0 && !excluded.has(k.key))
    .sort((a, b) => (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : b.count - a.count))
    .slice(0, limit);
}

/** A friend as a "Who was there" suggestion. */
export interface FriendCandidate extends PersonLike {
  avatarPath?: string | null;
  /** Names the owner has linked to this friend before, most used first. */
  linkedNames?: readonly string[];
  /** Moments this friend is linked on. */
  linkCount?: number;
}

/**
 * One suggestion under "Who was there": a friend's account (drawn with
 * PersonRow; picking links the name) or a free-text name.
 */
export type PeopleSuggestion =
  | {
      kind: "name";
      /** Stable React key. */
      key: string;
      /** What's added to the moment when picked. */
      label: string;
    }
  | {
      kind: "friend";
      key: string;
      label: string;
      friend: FriendCandidate;
    };

/** Suggestions for what's typed, as rows to render (see `suggestNames`). */
export function peopleSuggestions(
  known: readonly KnownName[],
  query: string,
  exclude: readonly string[],
  limit = 5
): PeopleSuggestion[] {
  return suggestNames(known, query, exclude, limit).map((k) => ({
    kind: "name",
    key: `name:${k.key}`,
    label: k.name,
  }));
}

/**
 * Friends matching what's typed, by name, @handle or a name the owner linked
 * to them before ("Sammy" finds Sam Kim if Sam was linked as Sammy). Friends
 * already linked on the moment are left out. An exact match first, then a
 * prefix, then the rest; within each, the friend linked on the most moments,
 * then A–Z.
 */
export function suggestFriends<T extends FriendCandidate>(
  friends: readonly T[],
  query: string,
  excludeIds: readonly string[] = [],
  limit = 4
): T[] {
  const q = normalizeName(query).replace(/^@+/, "");
  if (!q) return [];
  const excluded = new Set(excludeIds);
  const fields = (f: T) => [f.displayName, f.username, ...(f.linkedNames ?? [])];
  const tier = (f: T) => {
    const all = fields(f).map(normalizeName).filter(Boolean);
    if (all.some((n) => n === q)) return 0;
    if (all.some((n) => n.startsWith(q))) return 1;
    return 2;
  };
  return friends
    .filter((f) => !excluded.has(f.id) && matchesQuery(fields(f), query))
    .sort((a, b) => tier(a) - tier(b) || (b.linkCount ?? 0) - (a.linkCount ?? 0) || compareByName(a, b))
    .slice(0, limit);
}

/**
 * Everything to show under "Who was there" for what's typed: matching
 * friends first, then past names (a friend's display name isn't offered as a
 * plain name unless it's already on a moment).
 */
export function whoWasThereSuggestions(input: {
  known: readonly KnownName[];
  query: string;
  people: readonly string[];
  friends: readonly FriendCandidate[];
  linkedFriendIds: readonly string[];
  friendLimit?: number;
  nameLimit?: number;
}): PeopleSuggestion[] {
  const friendRows: PeopleSuggestion[] = suggestFriends(
    input.friends,
    input.query,
    input.linkedFriendIds,
    input.friendLimit ?? 4
  ).map((f) => ({ kind: "friend", key: `friend:${f.id}`, label: personLabel(f), friend: f }));
  return [...friendRows, ...peopleSuggestions(input.known, input.query, input.people, input.nameLimit ?? 5)];
}

/**
 * Whether to offer "Add 'x'" for what's typed: not when it's empty, already
 * on the moment, or one of the name suggestions (ignoring case). A friend
 * with that name doesn't hide it: "Add 'Sam' as a name" stays plain text.
 */
export function offerAddTyped(
  query: string,
  people: readonly string[],
  suggestions: readonly PeopleSuggestion[]
): boolean {
  const key = nameKey(query);
  if (!key || hasName(people, query)) return false;
  return !suggestions.some((s) => s.kind === "name" && nameKey(s.label) === key);
}

// ── Names linked to friends ─────────────────────────────────────────────

/** A link with its moment (StoredPersonLink fits). */
interface LinkLike {
  momentId: string;
  name: string;
  friendId: string;
}

/**
 * Per friend, the names the owner linked to them (most used first, then
 * A–Z) and how many moments they're linked on.
 */
export function linkedNamesByFriend(links: readonly LinkLike[]): Map<string, { names: string[]; count: number }> {
  const counts = new Map<string, Map<string, number>>();
  const moments = new Map<string, Set<string>>();
  for (const l of links) {
    let byName = counts.get(l.friendId);
    if (!byName) counts.set(l.friendId, (byName = new Map()));
    const name = tidyName(l.name);
    byName.set(name, (byName.get(name) ?? 0) + 1);
    let ids = moments.get(l.friendId);
    if (!ids) moments.set(l.friendId, (ids = new Set()));
    ids.add(l.momentId);
  }
  const out = new Map<string, { names: string[]; count: number }>();
  for (const [friendId, byName] of counts) {
    const names = [...byName.entries()]
      .sort((a, b) => b[1] - a[1] || compareByName({ id: a[0], displayName: a[0] }, { id: b[0], displayName: b[0] }))
      .map(([name]) => name);
    out.set(friendId, { names, count: moments.get(friendId)!.size });
  }
  return out;
}

/**
 * The name to put on the moment when a friend is picked, and whether it's a
 * chip already there (which then gets linked rather than added). Tries the
 * name the owner usually links to them, then their display name, then their
 * @handle (spelled as a past name when one matches, ignoring case). A name
 * already on the moment and linked to someone else is skipped, so two Sams
 * stay two chips. Null only for a friend with no name at all.
 */
export function nameForFriend(input: {
  friend: FriendCandidate;
  people: readonly string[];
  links: readonly { name: string; friendId: string }[];
  known: readonly KnownName[];
}): { name: string; existing: boolean } | null {
  const { friend, people, links, known } = input;
  const display = friend.displayName ? tidyName(friend.displayName) : "";
  const handle = friend.username ? tidyName(friend.username) : "";
  const candidates = [friend.linkedNames?.[0] ?? "", display, handle].filter(Boolean);
  if (display && handle) candidates.push(`${display} (@${handle})`);
  for (const candidate of candidates) {
    const key = nameKey(candidate);
    const onMoment = people.find((p) => nameKey(p) === key);
    if (onMoment) {
      const linked = links.find((l) => nameKey(l.name) === key);
      if (!linked || linked.friendId === friend.id) return { name: onMoment, existing: true };
      continue;
    }
    return { name: resolveName(candidate, known), existing: false };
  }
  return null;
}

/**
 * Friends to offer when linking a name already on a moment: those whose name,
 * @handle or past linked names match it first, then the order given.
 */
export function friendsForName<T extends FriendCandidate>(friends: readonly T[], name: string): T[] {
  const first = suggestFriends(friends, tidyName(name), [], friends.length);
  const firstIds = new Set(first.map((f) => f.id));
  return [...first, ...friends.filter((f) => !firstIds.has(f.id))];
}

/** One person in Rediscover: a friend (every name linked to them) or a name. */
export interface PersonGroup {
  /** `friend:<id>` or `name:<the name as written>`. */
  key: string;
  /** The name the owner writes most for them. */
  label: string;
  friendId: string | null;
  /** The names written for them, most used first. */
  names: string[];
  /** Their moments, in the order given. */
  momentIds: string[];
}

/**
 * Rediscover's People, grouped by the real person. A name linked to a friend
 * on a moment counts for that friend, so "Sam" and "Samuel" linked to the
 * same friend are one person. A plain name that has only ever been linked to
 * one friend counts for them too (older moments say "Sam" with no link); a
 * name linked to two different friends stays text wherever it isn't linked.
 * Anything else is grouped by the name as written, as before. Pass
 * `friendIds` (current friends) to ignore links to someone no longer a
 * friend. Most moments first; ties keep the order first seen.
 */
export function groupPeopleByPerson(
  moments: readonly { id: string; people: readonly string[] }[],
  links: readonly LinkLike[],
  friendIds?: ReadonlySet<string>
): PersonGroup[] {
  const live = friendIds ? links.filter((l) => friendIds.has(l.friendId)) : links;
  const linkAt = new Map<string, string>();
  const friendsByKey = new Map<string, Set<string>>();
  for (const l of live) {
    const key = nameKey(l.name);
    linkAt.set(`${l.momentId}\u0000${key}`, l.friendId);
    let ids = friendsByKey.get(key);
    if (!ids) friendsByKey.set(key, (ids = new Set()));
    ids.add(l.friendId);
  }

  const groups = new Map<string, { group: PersonGroup; nameCounts: Map<string, number>; seen: Set<string> }>();
  for (const m of moments) {
    for (const raw of m.people) {
      const key = nameKey(raw);
      if (!key) continue;
      const only = friendsByKey.get(key);
      const friendId = linkAt.get(`${m.id}\u0000${key}`) ?? (only?.size === 1 ? [...only][0] : null);
      const groupKey = friendId ? `friend:${friendId}` : `name:${raw}`;
      let entry = groups.get(groupKey);
      if (!entry) {
        entry = {
          group: { key: groupKey, label: raw, friendId, names: [], momentIds: [] },
          nameCounts: new Map(),
          seen: new Set(),
        };
        groups.set(groupKey, entry);
      }
      entry.nameCounts.set(raw, (entry.nameCounts.get(raw) ?? 0) + 1);
      if (!entry.seen.has(m.id)) {
        entry.seen.add(m.id);
        entry.group.momentIds.push(m.id);
      }
    }
  }

  const out: PersonGroup[] = [];
  for (const { group, nameCounts } of groups.values()) {
    // Most used first; a tie keeps the first seen (Map order, stable sort).
    const names = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    out.push({ ...group, names, label: names[0] ?? group.label });
  }
  return out.sort((a, b) => b.momentIds.length - a.momentIds.length);
}

/**
 * The group a Rediscover link means: by friend id when given, else the group
 * holding that name (a friend's group when the name is linked to them).
 */
export function findPersonGroup(
  groups: readonly PersonGroup[],
  target: { friendId?: string | null; name?: string | null }
): PersonGroup | undefined {
  if (target.friendId) {
    const byFriend = groups.find((g) => g.friendId === target.friendId);
    if (byFriend) return byFriend;
  }
  const name = target.name ?? "";
  if (!name) return undefined;
  return groups.find((g) => g.key === `name:${name}`) ?? groups.find((g) => g.names.includes(name));
}

/**
 * The share picker's order with the friends linked on this moment first
 * ("Was there"), each part keeping the order given.
 */
export function wasThereFirst<T extends { id: string }>(
  people: readonly T[],
  linkedIds: ReadonlySet<string>
): { people: T[]; wasThereCount: number } {
  const first = people.filter((p) => linkedIds.has(p.id));
  const rest = people.filter((p) => !linkedIds.has(p.id));
  return { people: [...first, ...rest], wasThereCount: first.length };
}
