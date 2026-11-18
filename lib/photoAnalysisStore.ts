// Photo analyses (modules/on-device-ai), kept on the phone so a photo is
// looked at once. A few thousand small entries; oldest dropped first.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzePhotos, type PhotoAnalysis } from "@/modules/on-device-ai";
import { interest, isBoring } from "@/lib/photoInterest";

export const PHOTO_ANALYSIS_KEY = "photo_analysis_v1";
const KEY = PHOTO_ANALYSIS_KEY;
const MAX_ENTRIES = 4000;
const BATCH = 24;

let memory: Record<string, PhotoAnalysis> | null = null;
let loading: Promise<Record<string, PhotoAnalysis>> | null = null;
/** Bumped by clearPhotoAnalysisStore(), so reads and writes already under way don't bring data back. */
let generation = 0;

async function readStored(gen: number): Promise<Record<string, PhotoAnalysis>> {
  let read: Record<string, PhotoAnalysis>;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    read = raw ? (JSON.parse(raw) as Record<string, PhotoAnalysis>) : {};
  } catch {
    read = {};
  }
  if (gen === generation) {
    memory = read;
    loading = null;
  }
  return read;
}

/** One read shared by everyone asking at once. */
function load(): Promise<Record<string, PhotoAnalysis>> {
  if (memory) return Promise.resolve(memory);
  loading ??= readStored(generation);
  return loading;
}

async function save(all: Record<string, PhotoAnalysis>): Promise<void> {
  // A copy from before clearPhotoAnalysisStore() is never written back.
  if (all !== memory) return;
  const ids = Object.keys(all);
  if (ids.length > MAX_ENTRIES) for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete all[id];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

/**
 * Analyses for these photo ids, from the cache or freshly made. Ids the
 * phone couldn't analyse (iCloud-only, deleted) are simply absent. Null when
 * this build has no analysis module.
 */
export async function analysesFor(ids: string[]): Promise<Map<string, PhotoAnalysis> | null> {
  const all = await load();
  const missing = ids.filter((id) => !all[id]);
  for (let i = 0; i < missing.length; i += BATCH) {
    const fresh = await analyzePhotos(missing.slice(i, i + BATCH));
    if (fresh === null) {
      if (i === 0 && Object.keys(all).length === 0) return null;
      break;
    }
    for (const a of fresh) all[a.id] = { ...a, labels: a.labels.slice(0, 5) };
  }
  if (missing.length) await save(all);
  const out = new Map<string, PhotoAnalysis>();
  for (const id of ids) if (all[id]) out.set(id, all[id]);
  return out;
}

/**
 * Drops the photos already known to be boring (homework, receipts,
 * documents), without analysing anything new, so a list never waits on the
 * models. Order is kept. Also says which photos haven't been looked at yet
 * (up to `cap`), for warmAnalyses to do in the background.
 */
export async function keepInterestingCached<T extends { id: string }>(
  photos: T[],
  cap = 250
): Promise<{ kept: T[]; unanalyzed: string[] }> {
  const all = await load();
  const kept = photos.filter((p) => !all[p.id] || !isBoring(all[p.id]));
  const unanalyzed = photos.slice(0, cap).filter((p) => !all[p.id]).map((p) => p.id);
  return { kept, unanalyzed };
}

/** Analyses these photos in the background (cached for next time). */
export async function warmAnalyses(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false;
  const done = await analysesFor(ids);
  return done !== null;
}

/** The same photos, most interesting first, boring ones dropped. */
export async function bestFirst<T extends { id: string }>(photos: T[], cap = 24): Promise<T[]> {
  const analyses = await analysesFor(photos.slice(0, cap).map((p) => p.id));
  if (!analyses) return photos;
  const score = (p: T) => {
    const a = analyses.get(p.id);
    return a ? interest(a) : 0;
  };
  return photos.filter((p) => {
    const a = analyses.get(p.id);
    return !a || !isBoring(a);
  }).sort((a, b) => score(b) - score(a));
}

/** Signing out: forget every analysis, in memory and stored. */
export async function clearPhotoAnalysisStore(): Promise<void> {
  generation++;
  memory = null;
  loading = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
