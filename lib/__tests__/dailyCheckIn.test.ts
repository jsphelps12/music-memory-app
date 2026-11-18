import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-notifications", () => ({ SchedulableTriggerInputTypes: { DATE: "date" } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  CHECK_IN_DAYS,
  checkInPlanSignature,
  checkInRefreshDue,
  CHECK_IN_REFRESH_EVERY_MS,
  createSerialQueue,
  DEFAULT_CHECK_IN,
  describeDays,
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
    expect(parseCheckInSettings('{"enabled":true,"hour":8,"minute":30}')).toEqual({
      enabled: true,
      hour: 8,
      minute: 30,
      days: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(parseCheckInSettings('{"enabled":true,"hour":8,"minute":30,"days":[5,1,1,9]}').days).toEqual([1, 5]);
    expect(parseCheckInSettings('{"enabled":true,"hour":8,"minute":30,"days":[]}').days).toHaveLength(7);
  });
  it("falls back on missing or malformed values", () => {
    expect(parseCheckInSettings(null)).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings("nope")).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings('{"enabled":"yes","hour":8,"minute":0}')).toEqual(DEFAULT_CHECK_IN);
    expect(parseCheckInSettings('{"enabled":true,"hour":25,"minute":0}')).toEqual(DEFAULT_CHECK_IN);
  });
  it("defaults to off at 9:00 PM, every day", () => {
    expect(DEFAULT_CHECK_IN).toEqual({ enabled: false, hour: 21, minute: 0, days: [0, 1, 2, 3, 4, 5, 6] });
  });
});

describe("check-in days (1.4)", () => {
  it("plans only the chosen weekdays", () => {
    // Mon Nov 16 2026, 10am; weekdays only over two weeks = 10 reminders.
    const plan = planCheckIns(new Date(2026, 10, 16, 10, 0), 21, 0, false, 14, [1, 2, 3, 4, 5]);
    expect(plan).toHaveLength(10);
    expect(plan.every((d) => d.getDay() >= 1 && d.getDay() <= 5)).toBe(true);
    const sundays = planCheckIns(new Date(2026, 10, 16, 10, 0), 21, 0, false, 14, [0]);
    expect(sundays.map((d) => d.getDate())).toEqual([22, 29]);
  });
  it("describes the days", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeDays([6, 0])).toBe("Weekends");
    expect(describeDays([0, 3, 1])).toBe("Mondays, Wednesdays, Sundays");
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

describe("createSerialQueue", () => {
  it("runs jobs one at a time, in order, even when an earlier one is slower", async () => {
    const serial = createSerialQueue();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = serial(async () => {
      log.push("a start");
      await gate;
      log.push("a end");
      return "a";
    });
    const b = serial(async () => {
      log.push("b");
      return "b";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["a start"]);
    release();
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(log).toEqual(["a start", "a end", "b"]);
  });

  it("keeps going after a failed job", async () => {
    const serial = createSerialQueue();
    const failed = serial(async () => {
      throw new Error("boom");
    });
    const next = serial(async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    expect(await next).toBe("ok");
  });
});

describe("checkInRefreshDue", () => {
  const now = new Date(2026, 10, 16, 10, 0);
  const on = { ...DEFAULT_CHECK_IN, enabled: true };
  const sig = checkInPlanSignature("u1", now, on, "granted");

  it("re-plans the first time, when forced, or when anything changed", () => {
    expect(checkInRefreshDue(null, sig, now.getTime())).toBe(true);
    expect(checkInRefreshDue({ signature: sig, at: now.getTime() }, sig, now.getTime() + 1000, true)).toBe(true);
    const otherTime = checkInPlanSignature("u1", now, { ...on, hour: 8 }, "granted");
    expect(checkInRefreshDue({ signature: sig, at: now.getTime() }, otherTime, now.getTime() + 1000)).toBe(true);
  });

  it("skips a return to the app soon after the last plan", () => {
    expect(checkInRefreshDue({ signature: sig, at: now.getTime() }, sig, now.getTime() + 60_000)).toBe(false);
    expect(checkInRefreshDue({ signature: sig, at: now.getTime() }, sig, now.getTime() + CHECK_IN_REFRESH_EVERY_MS)).toBe(true);
  });

  it("changes with the account, the day and the permission, not the hour", () => {
    expect(checkInPlanSignature("u2", now, on, "granted")).not.toBe(sig);
    expect(checkInPlanSignature("u1", new Date(2026, 10, 17, 0, 5), on, "granted")).not.toBe(sig);
    expect(checkInPlanSignature("u1", now, on, "denied")).not.toBe(sig);
    expect(checkInPlanSignature("u1", new Date(2026, 10, 16, 23, 0), on, "granted")).toBe(sig);
  });
});
