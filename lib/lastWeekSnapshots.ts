// Last week's play-count snapshots (1.4): each song's lifetime play count at
// the start of a week, so "played 14 times" can mean this week. One storage
// key per week, holding only songs that have been played (a missing song
// counts as 0), and only the two weeks Last week can need: the week being
// recapped and the one after it (its start is the recap's end).
//
// Before this, every week lived in one key ("lastweek_playcounts_v1", five
// weeks of the whole library) that was parsed on every read. It's moved over
// once: the newest weeks are written to their own keys first and the old key
// is removed only after that worked, so this week's baseline is never lost.

import type { PlayCounts } from "@/lib/lastWeek";

export const LEGACY_SNAPSHOTS_KEY = "lastweek_playcounts_v1";
export const SNAPSHOT_KEY_PREFIX = "lastweek_playcounts_v2:";
const PREFIX = SNAPSHOT_KEY_PREFIX;
export const SNAPSHOT_WEEKS = 2;

/** The storage key for a week's snapshot (week key = its Monday, "2026-11-09"). */
export function snapshotKey(weekKey: string): string {
  return `${PREFIX}${weekKey}`;
}

/** The week key in a snapshot storage key, or null for any other key. */
export function weekOfSnapshotKey(key: string): string | null {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : null;
}

/** Play counts as stored: songs never played are left out (they read as 0). */
export function compactCounts(counts: PlayCounts): PlayCounts {
  const out: PlayCounts = {};
  for (const [id, n] of Object.entries(counts)) if (n > 0) out[id] = n;
  return out;
}

/** Counts for library songs, compacted. */
export function countsFromLibrary(songs: { persistentId: string; playCount: number }[]): PlayCounts {
  const out: PlayCounts = {};
  for (const s of songs) if (s.playCount > 0) out[s.persistentId] = s.playCount;
  return out;
}

/** The weeks to drop so only the newest `keep` remain (week keys sort by date). */
export function weeksToDrop(weekKeys: string[], keep = SNAPSHOT_WEEKS): string[] {
  const sorted = [...new Set(weekKeys)].sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

/** The newest `keep` weeks of an old all-in-one value, compacted. Garbage in, {} out. */
export function legacyWeeksToKeep(legacy: unknown, keep = SNAPSHOT_WEEKS): Record<string, PlayCounts> {
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return {};
  const all = legacy as Record<string, unknown>;
  const weeks = Object.keys(all)
    .filter((k) => all[k] && typeof all[k] === "object" && !Array.isArray(all[k]))
    .sort()
    .slice(-keep);
  return Object.fromEntries(weeks.map((k) => [k, compactCounts(all[k] as PlayCounts)]));
}

/** The part of AsyncStorage this uses (a fake in tests). */
export interface SnapshotStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export interface SnapshotStore {
  /** Whether a week's snapshot exists (without reading it). Throws if storage can't say. */
  has(weekKey: string): Promise<boolean>;
  /** A week's snapshot, or null when there isn't one (or it can't be read). */
  read(weekKey: string): Promise<PlayCounts | null>;
  /** Stores a week's snapshot and drops all but the newest weeks. */
  write(weekKey: string, counts: PlayCounts): Promise<void>;
}

export function createSnapshotStore(storage: SnapshotStorage, keep = SNAPSHOT_WEEKS): SnapshotStore {
  let migration: Promise<boolean> | null = null;

  async function migrate(): Promise<void> {
    const raw = await storage.getItem(LEGACY_SNAPSHOTS_KEY);
    if (raw === null) return;
    let legacy: unknown = null;
    try {
      legacy = JSON.parse(raw);
    } catch {}
    const existing = new Set(await storage.getAllKeys());
    for (const [week, counts] of Object.entries(legacyWeeksToKeep(legacy, keep))) {
      // A week already moved over (or recorded since) is newer: keep it.
      if (!existing.has(snapshotKey(week))) await storage.setItem(snapshotKey(week), JSON.stringify(counts));
    }
    // Only now, with the weeks safely in their own keys.
    await storage.removeItem(LEGACY_SNAPSHOTS_KEY);
  }

  /**
   * Once per launch; a failed move is retried on the next call. False while
   * the old key hasn't been moved over: nothing may be written then, or a
   * new baseline could shadow the one still waiting in the old key.
   */
  function ready(): Promise<boolean> {
    migration ??= migrate().then(
      () => true,
      () => {
        migration = null;
        return false;
      }
    );
    return migration;
  }

  async function readLegacyWeek(weekKey: string): Promise<PlayCounts | null> {
    try {
      const raw = await storage.getItem(LEGACY_SNAPSHOTS_KEY);
      return raw ? (legacyWeeksToKeep(JSON.parse(raw), Infinity)[weekKey] ?? null) : null;
    } catch {
      return null;
    }
  }

  return {
    async has(weekKey) {
      if (!(await ready())) throw new Error("snapshots not moved over yet");
      return (await storage.getAllKeys()).includes(snapshotKey(weekKey));
    },
    async read(weekKey) {
      try {
        if (!(await ready())) return await readLegacyWeek(weekKey);
        const raw = await storage.getItem(snapshotKey(weekKey));
        if (!raw) return null;
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === "object" && !Array.isArray(v) ? (v as PlayCounts) : null;
      } catch {
        return null;
      }
    },
    async write(weekKey, counts) {
      if (!(await ready())) throw new Error("snapshots not moved over yet");
      await storage.setItem(snapshotKey(weekKey), JSON.stringify(compactCounts(counts)));
      const weeks = (await storage.getAllKeys()).map(weekOfSnapshotKey).filter((w): w is string => w !== null);
      for (const w of weeksToDrop(weeks, keep)) {
        try {
          await storage.removeItem(snapshotKey(w));
        } catch {}
      }
    },
  };
}
