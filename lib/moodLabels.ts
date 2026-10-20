// Display names for stored mood values. Pure, so the card and the Rediscover
// mood strip share one rule and it can be tested.

export interface MoodLabelDefinition {
  value: string;
  label: string;
}

const CUSTOM_MOOD_ID = /^custom_/i;

/**
 * The label for a stored mood value, or null when it shouldn't be shown.
 *
 * Custom moods are stored as generated ids (`custom_<timestamp>`). Once the
 * definition is deleted from the profile, the id is all that's left on old
 * moments, and showing it as text reads as a bug. Unknown plain words (older
 * built-in moods) are still shown as they are.
 */
export function moodLabel(value: string, allMoods: readonly MoodLabelDefinition[]): string | null {
  if (!value) return null;
  const def = allMoods.find((m) => m.value === value);
  if (def) return def.label;
  return CUSTOM_MOOD_ID.test(value) ? null : value;
}

/** Up to `max` labels in stored order, joined for the card's quiet mood line. */
export function moodWords(
  moods: readonly string[],
  allMoods: readonly MoodLabelDefinition[],
  max = 3
): string {
  return moods
    .map((value) => moodLabel(value, allMoods))
    .filter((label): label is string => !!label)
    .slice(0, max)
    .join(" · ")
    .toUpperCase();
}
