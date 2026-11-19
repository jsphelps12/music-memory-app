import { describe, expect, it, vi } from "vitest";

vi.mock("expo-notifications", () => ({}));
vi.mock("@/lib/lastWeekData", () => ({ isWeekDismissed: vi.fn(), weekSoFarHasContent: vi.fn() }));

import { lastWeekReadyOn, recapReminderAt } from "@/lib/lastWeekReady";

describe("Last week is ready", () => {
  it("is Sunday 6pm of this week, until it passes", () => {
    // Wed Nov 18 2026 → Sun Nov 22, 18:00.
    const at = recapReminderAt(new Date(2026, 10, 18, 9, 0));
    expect(at).toEqual(new Date(2026, 10, 22, 18, 0));
    // Sunday before 6pm: today; after: nothing this week.
    expect(recapReminderAt(new Date(2026, 10, 22, 17, 59))).toEqual(new Date(2026, 10, 22, 18, 0));
    expect(recapReminderAt(new Date(2026, 10, 22, 18, 0))).toBeNull();
    // Monday: the coming Sunday.
    expect(recapReminderAt(new Date(2026, 10, 23, 0, 30))).toEqual(new Date(2026, 10, 29, 18, 0));
  });

  it("is on unless switched off or How often is Off", () => {
    expect(lastWeekReadyOn({ notifLastWeek: true, notifFrequency: "few" })).toBe(true);
    expect(lastWeekReadyOn({ notifLastWeek: false, notifFrequency: "daily" })).toBe(false);
    expect(lastWeekReadyOn({ notifLastWeek: true, notifFrequency: "off" })).toBe(false);
    expect(lastWeekReadyOn(null)).toBe(false);
  });
});
