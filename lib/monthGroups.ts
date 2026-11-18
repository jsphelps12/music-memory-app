// Month grouping for the Journal list and calendar. Pure, tested in
// lib/__tests__/monthGroups.test.ts.
//
// toLocaleDateString is slow on Hermes (Intl), and grouping used to call it
// once per moment on every list change. Here the key comes from the date
// string itself and each month's label is formatted once, then remembered.

/** Section title for moments without a moment date. */
export const NO_DATE_TITLE = "No Date";

const labelCache = new Map<string, string>();

/** "2026-02" for "2026-02-14"; null for a missing or malformed date. */
export function monthKeyOf(momentDate: string | null | undefined): string | null {
  if (!momentDate || !/^\d{4}-\d{2}/.test(momentDate)) return null;
  return momentDate.slice(0, 7);
}

/** "February 2026" for "2026-02". Formatted once per key. */
export function monthLabel(key: string): string {
  let label = labelCache.get(key);
  if (label === undefined) {
    const [y, m] = key.split("-").map(Number);
    label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    labelCache.set(key, label);
  }
  return label;
}

export interface MonthSection<T> {
  title: string;
  data: T[];
}

/**
 * Moments grouped into month sections, in the order the months first appear
 * (the list is already newest first), undated ones under "No Date".
 */
export function groupMomentsByMonth<T extends { momentDate: string | null }>(
  moments: readonly T[]
): MonthSection<T>[] {
  const groups = new Map<string, T[]>();
  for (const m of moments) {
    const key = monthKeyOf(m.momentDate) ?? NO_DATE_TITLE;
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  const sections: MonthSection<T>[] = [];
  for (const [key, data] of groups) {
    sections.push({ title: key === NO_DATE_TITLE ? key : monthLabel(key), data });
  }
  return sections;
}

export interface CalendarMonth<T> {
  /** "2026-02" */
  key: string;
  year: number;
  /** 0-based, as Date takes it. */
  month: number;
  label: string;
  /** Moments by day of month (1-31), in the order they came in. */
  days: Map<number, T[]>;
}

/**
 * The calendar's months: only those with a dated moment, newest first, each
 * with its moments by day. Undated moments come back separately.
 */
export function buildCalendarMonths<T extends { momentDate: string | null }>(
  moments: readonly T[]
): { months: CalendarMonth<T>[]; undated: T[] } {
  const byKey = new Map<string, CalendarMonth<T>>();
  const undated: T[] = [];
  for (const m of moments) {
    if (!m.momentDate) {
      undated.push(m);
      continue;
    }
    const key = monthKeyOf(m.momentDate);
    const day = Number(m.momentDate.slice(8, 10));
    // A malformed date has no cell to go in.
    if (!key || !(day >= 1 && day <= 31)) continue;
    let month = byKey.get(key);
    if (!month) {
      const [y, mo] = key.split("-").map(Number);
      month = { key, year: y, month: mo - 1, label: monthLabel(key), days: new Map() };
      byKey.set(key, month);
    }
    const list = month.days.get(day);
    if (list) list.push(m);
    else month.days.set(day, [m]);
  }
  const months = [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  return { months, undated };
}
