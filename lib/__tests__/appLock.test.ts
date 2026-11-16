import { describe, expect, it } from "vitest";
import { LOCK_GRACE_MS, lockMethodLabel, parseLockSetting, shouldLockOnReturn } from "../appLock";

describe("shouldLockOnReturn", () => {
  const t0 = 1_000_000;

  it("never locks when the lock is off", () => {
    expect(shouldLockOnReturn(false, t0, t0 + 10 * LOCK_GRACE_MS)).toBe(false);
  });

  it("doesn't lock without a recorded trip to the background", () => {
    expect(shouldLockOnReturn(true, null, t0)).toBe(false);
  });

  it("lets a quick trip to Apple Music and back through", () => {
    expect(shouldLockOnReturn(true, t0, t0 + LOCK_GRACE_MS - 1)).toBe(false);
  });

  it("locks once the grace period has passed", () => {
    expect(shouldLockOnReturn(true, t0, t0 + LOCK_GRACE_MS)).toBe(true);
    expect(shouldLockOnReturn(true, t0, t0 + 60 * 60_000)).toBe(true);
  });

  it("takes a custom grace period", () => {
    expect(shouldLockOnReturn(true, t0, t0 + 1, 0)).toBe(true);
  });
});

describe("parseLockSetting", () => {
  it("is on only for the stored flag", () => {
    expect(parseLockSetting("1")).toBe(true);
    expect(parseLockSetting(null)).toBe(false);
    expect(parseLockSetting("0")).toBe(false);
    expect(parseLockSetting("true")).toBe(false);
  });
});

describe("lockMethodLabel", () => {
  it("names the unlock method", () => {
    expect(lockMethodLabel("face")).toBe("Face ID");
    expect(lockMethodLabel("touch")).toBe("Touch ID");
    expect(lockMethodLabel("passcode")).toBe("Passcode");
  });
});
