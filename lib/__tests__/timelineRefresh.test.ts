/**
 * The onboarding bug (2026-11-13): a new user saved two moments in onboarding,
 * tapped "Go to my timeline", and saw "No moments yet". The timeline prefetch
 * had fired at sign-up, before the moments existed; the Journal tab mounted for
 * the first time after onboarding, consumed the stale flag onboarding set, and
 * still painted the empty prefetch. planFocusFetch makes that flag count on the
 * first load too.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  planFocusFetch,
  markTimelineStale,
  consumeTimelineStale,
  resetTimelineRefresh,
  markTimelineDeleted,
  lastTimelineMarkAt,
  setListNotice,
  consumeListNotice,
} from "../timelineRefresh";

const COOLDOWN = 30_000;

describe("planFocusFetch", () => {
  it("bypasses the prefetch on first load when the timeline was marked stale (onboarding)", () => {
    expect(planFocusFetch({ hasFetched: false, stale: true, elapsedMs: 0, cooldownMs: COOLDOWN })).toBe(
      "initial_fresh"
    );
  });

  it("uses the prefetch on a plain first load", () => {
    expect(planFocusFetch({ hasFetched: false, stale: false, elapsedMs: 0, cooldownMs: COOLDOWN })).toBe(
      "initial"
    );
  });

  it("refreshes when stale, even inside the cooldown", () => {
    expect(planFocusFetch({ hasFetched: true, stale: true, elapsedMs: 1_000, cooldownMs: COOLDOWN })).toBe(
      "refresh"
    );
  });

  it("refreshes once the cooldown has elapsed", () => {
    expect(
      planFocusFetch({ hasFetched: true, stale: false, elapsedMs: COOLDOWN, cooldownMs: COOLDOWN })
    ).toBe("refresh");
  });

  it("does nothing inside the cooldown when nothing changed", () => {
    expect(
      planFocusFetch({ hasFetched: true, stale: false, elapsedMs: COOLDOWN - 1, cooldownMs: COOLDOWN })
    ).toBe("none");
  });
});

describe("timeline stale flag", () => {
  beforeEach(() => resetTimelineRefresh());

  it("reads once, then resets", () => {
    markTimelineStale();
    expect(consumeTimelineStale().stale).toBe(true);
    expect(consumeTimelineStale().stale).toBe(false);
  });
});

describe("lastTimelineMarkAt (prefetch age check)", () => {
  beforeEach(() => resetTimelineRefresh());

  it("is 0 until something is marked", () => {
    expect(lastTimelineMarkAt()).toBe(0);
  });

  it("records the time of the last mark or delete, and survives consuming", () => {
    const before = Date.now();
    markTimelineStale();
    expect(lastTimelineMarkAt()).toBeGreaterThanOrEqual(before);
    consumeTimelineStale();
    expect(lastTimelineMarkAt()).toBeGreaterThanOrEqual(before);

    resetTimelineRefresh();
    markTimelineDeleted("x");
    expect(lastTimelineMarkAt()).toBeGreaterThanOrEqual(before);
  });

  it("is cleared on sign-out", () => {
    markTimelineStale();
    resetTimelineRefresh();
    expect(lastTimelineMarkAt()).toBe(0);
  });
});

describe("list notice", () => {
  beforeEach(() => resetTimelineRefresh());

  it("is consumed once", () => {
    setListNotice("Saved on your phone.");
    expect(consumeListNotice()).toBe("Saved on your phone.");
    expect(consumeListNotice()).toBeNull();
  });

  it("is dropped on sign-out (resetTimelineRefresh)", () => {
    setListNotice("Saved on your phone.");
    resetTimelineRefresh();
    expect(consumeListNotice()).toBeNull();
  });

  it("doesn't touch the stale flag", () => {
    setListNotice("x");
    expect(consumeTimelineStale().stale).toBe(false);
  });
});
