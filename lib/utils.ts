/** Returns the most frequent non-null value in an array, or null if empty. */
export function topValue(items: (string | null | undefined)[]): string | null {
  const freq = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    freq.set(item, (freq.get(item) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [val, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = val;
    }
  }
  return best;
}
