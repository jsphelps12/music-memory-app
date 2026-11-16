import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-notifications", () => ({ SchedulableTriggerInputTypes: { DATE: "date" } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  CHECK_IN_DAYS,
  DEFAULT_CHECK_IN,
  formatCheckInTime,
  localDayKey,
  parseCheckInSettings,
  planCheckIns,
} from "../dailyCheckIn";

describe("planCheckIns", () => {
  it("schedules today and the next days when today's time is still ahead", () => {
    const now = new Date(2026, 10, 16, 10, 0);
    const plan = planCheckIns(now, 21, 0, false);
    expect(plan).toHaveLength(CHECK_IN_DAYS);
    expect(plan[0]).toEqual(new Date(2026, 10, 16, 21, 0));
    expect(plan[1]).toEqual(new Date(2026, 10, 17, 21, 0));
  });

  it("skips today when a moment was already saved today", () => {
    const plan = planCheckIns(new Date(2026, 10, 16, 10, 0), 21, 0, true);
    expect(plan).toHaveLength(CHECK_IN_DAYS - 1);
    expect(plan[0]).toEqual(new Date(2026, 10, 17, 21, 0));
  });

  it("skips today when the time has passed", () => {
    const plan = planCheckIns(new Date(2026, 10, 16, 21, 30), 21, 0, false);
    expect(plan[0]).toEqual(new Date(2026, 10, 17, 21, 0));
  });

  it("crosses month and year ends", () => {
    const plan = planCheckIns(new Date(2026, 11, 31, 22, 0), 21, 0, false, 2);
    expect(plan).toEqual([new Date(2027, 0, 1, 21, 0)]);
  });

  it("never schedules anything in the past", () => {
    const now = new Date(2026, 10, 16, 21, 0);
    expect(planCheckIns(now, 21, 0, false).every((d) => d.getTime() > now.getTime())).toBe(true);
  });
});

describe("parseCheckInSettings", () => {
  it("reads a valid value", () => {
    expect(parseCheckInSettings('{"enabled":true,"hour":8,"minute":30}')).toEqual({ enabled: true, hour: 8, minute: 30 });
  });
  it("falls back on missing or malformed values", () => {
    expect(parseCheckInSettings(null)).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings("nope")).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings('{"enabled":"yes","hour":8,"minute":0}')).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings('{"enabled":true,"hour":25,"minute":0}')).toEqual(DEFAULT_CHECK_IN);
  });
  it("defaults to off at 9:00 PM", () => {
    expect(DEFAULT_CHECK_IN).toEqual({ enabled: false, hour: 21, minute: 0 });
  });
});

describe("formatting", () => {
  it("formats the time", () => {
    expect(formatCheckInTime(21, 0)).toBe("9:00 PM");
    expect(formatCheckInTime(8, 5)).toBe("8:05 AM");
  });
  it("keys a day in local time", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
