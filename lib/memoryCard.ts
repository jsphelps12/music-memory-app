// The memory card (On this day that plays, 2026-11-16): what opens when you
// tap an On this day notification or the On this day hero in Rediscover. A
// full-screen card on night with the song already playing. Pure helpers;
// tested in lib/__tests__/memoryCard.test.ts.

/**
 * "5 years ago today" when the moment's month and day are today's, otherwise
 * "5 years ago" (opened from a notification the day after, say), and
 * "Earlier this year" for a moment from this year. Null without a date.
 */
export function anniversaryLabel(momentDate: string | null, today: Date): string | null {
  if (!momentDate) return null;
  const [y, m, d] = momentDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const years = today.getFullYear() - y;
  const sameDay = today.getMonth() + 1 === m && today.getDate() === d;
  if (years <= 0) return sameDay ? "Today" : "Earlier this year";
  const span = years === 1 ? "1 year ago" : `${years} years ago`;
  return sameDay ? `${span} today` : span;
}

/** "November 14, 2021". */
export function fullDateLabel(momentDate: string | null): string | null {
  if (!momentDate) return null;
  const [y, m, d] = momentDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
