// Questions for pairings, made ahead of a tap and kept on the phone, so
// opening capture never waits on the model. See lib/nudgeQuestion.ts.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { askQuestion, canAsk } from "@/modules/on-device-ai";
import { factsText, templateQuestion, validQuestion, type QuestionFacts } from "@/lib/nudgeQuestion";

const KEY = "nudge_questions_v1";
const MAX = 300;

let memory: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;
const inFlight = new Set<string>();

async function load(): Promise<Record<string, string>> {
  if (memory) return memory;
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => (raw ? (JSON.parse(raw) as Record<string, string>) : {}))
    .catch(() => ({}));
  memory = await loading;
  return memory;
}

async function save(): Promise<void> {
  if (!memory) return;
  const keys = Object.keys(memory);
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete memory[k];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(memory));
  } catch {}
}

/** The question for a pairing now: the model's if ready, else the template. */
export function questionFor(key: string, facts: QuestionFacts): string {
  return memory?.[key] ?? templateQuestion(facts);
}

/**
 * Asks the on-device model for these pairings' questions in the background,
 * one at a time, keeping only answers that pass the checks. No-op without
 * Apple Intelligence.
 */
export async function prewarmQuestions(items: { key: string; facts: QuestionFacts }[]): Promise<void> {
  const cache = await load();
  if (!canAsk()) return;
  let added = false;
  for (const { key, facts } of items) {
    if (cache[key] || inFlight.has(key)) continue;
    inFlight.add(key);
    try {
      const q = validQuestion(await askQuestion(factsText(facts)), facts);
      if (q) {
        cache[key] = q;
        added = true;
      }
    } finally {
      inFlight.delete(key);
    }
  }
  if (added) await save();
}
