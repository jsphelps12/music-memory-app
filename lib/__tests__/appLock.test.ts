import { describe, expect, it } from "vitest";
import {
  decideToggle,
  decideUnlock,
  LOCK_GRACE_MS,
  LOCK_TURNED_OFF_MESSAGE,
  lockMethodLabel,
  NEEDS_PASSCODE_MESSAGE,
  needsDeviceCheck,
  parseLockSetting,
  shouldLockOnReturn,
} from "../appLock";

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

  it("fails closed on an impossible elapsed time", () => {
    expect(shouldLockOnReturn(true, t0, t0 - 5_000)).toBe(true);
    expect(shouldLockOnReturn(true, t0, Number.NaN)).toBe(true);
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

const fail = (error: string) => ({ success: false, error });

describe("decideUnlock", () => {
  it("unlocks on success", () => {
    expect(decideUnlock({ success: true }, "Face ID")).toEqual({ kind: "unlock" });
  });

  it("leaves the lock up quietly when the prompt is cancelled", () => {
    for (const e of ["user_cancel", "system_cancel", "app_cancel", "user_fallback"]) {
      expect(decideUnlock(fail(e), "Face ID")).toEqual({ kind: "stay_locked", message: null });
    }
  });

  it("turns the lock off when the passcode was removed", () => {
    expect(decideUnlock(fail("passcode_not_set"), "Passcode")).toEqual({
      kind: "turn_off",
      message: LOCK_TURNED_OFF_MESSAGE,
    });
    // The device check agrees, or couldn't be made: same answer.
    expect(decideUnlock(fail("passcode_not_set"), "Passcode", false).kind).toBe("turn_off");
    expect(decideUnlock(fail("passcode_not_set"), "Passcode", null).kind).toBe("turn_off");
  });

  it("turns the lock off when nothing is enrolled", () => {
    expect(decideUnlock(fail("not_enrolled"), "Face ID").kind).toBe("turn_off");
  });

  it("keeps the lock when the device says it can still authenticate", () => {
    expect(decideUnlock(fail("not_enrolled"), "Face ID", true)).toEqual({
      kind: "stay_locked",
      message: NEEDS_PASSCODE_MESSAGE,
    });
  });

  it("stays locked and explains a lockout", () => {
    const d = decideUnlock(fail("lockout"), "Face ID");
    expect(d.kind).toBe("stay_locked");
    expect(d.kind === "stay_locked" ? d.message : null).toMatch(/Too many tries/);
  });

  it("never fails open on a lockout or a failed match, whatever the device check says", () => {
    expect(decideUnlock(fail("lockout"), "Face ID", false).kind).toBe("stay_locked");
    expect(decideUnlock(fail("authentication_failed"), "Face ID", false).kind).toBe("stay_locked");
  });

  it("stays locked with a retry line for an unknown error or a thrown call", () => {
    expect(decideUnlock(fail("unknown: -1000, something"), "Face ID")).toEqual({
      kind: "stay_locked",
      message: "Couldn't check Face ID. Try again.",
    });
    expect(decideUnlock(fail("exception"), "Touch ID")).toEqual({
      kind: "stay_locked",
      message: "Couldn't check Touch ID. Try again.",
    });
    expect(decideUnlock({ success: false }, "Face ID").kind).toBe("stay_locked");
  });
});

describe("needsDeviceCheck", () => {
  it("only asks the device about the no-passcode errors", () => {
    expect(needsDeviceCheck(fail("passcode_not_set"))).toBe(true);
    expect(needsDeviceCheck(fail("not_enrolled"))).toBe(true);
    expect(needsDeviceCheck(fail("lockout"))).toBe(false);
    expect(needsDeviceCheck(fail("user_cancel"))).toBe(false);
    expect(needsDeviceCheck({ success: true })).toBe(false);
  });
});

describe("decideToggle", () => {
  it("applies either way after a successful prompt", () => {
    expect(decideToggle(true, { success: true }, "Face ID")).toEqual({ kind: "apply" });
    expect(decideToggle(false, { success: true }, "Face ID")).toEqual({ kind: "apply" });
  });

  it("does nothing, quietly, when cancelled", () => {
    expect(decideToggle(true, fail("user_cancel"), "Face ID")).toEqual({ kind: "refuse", message: null });
    expect(decideToggle(false, fail("user_cancel"), "Face ID")).toEqual({ kind: "refuse", message: null });
  });

  it("won't turn on without a passcode, and says why", () => {
    expect(decideToggle(true, fail("passcode_not_set"), "Passcode")).toEqual({
      kind: "refuse",
      message: NEEDS_PASSCODE_MESSAGE,
    });
    expect(decideToggle(true, fail("not_enrolled"), "Face ID").kind).toBe("refuse");
  });

  it("lets it turn off when the phone can't authenticate anyone", () => {
    expect(decideToggle(false, fail("passcode_not_set"), "Passcode")).toEqual({ kind: "apply" });
    expect(decideToggle(false, fail("not_enrolled"), "Face ID", false)).toEqual({ kind: "apply" });
  });

  it("still asks to turn off when the phone can authenticate", () => {
    expect(decideToggle(false, fail("not_enrolled"), "Face ID", true).kind).toBe("refuse");
    expect(decideToggle(false, fail("lockout"), "Face ID").kind).toBe("refuse");
    expect(decideToggle(false, fail("unknown"), "Face ID")).toEqual({
      kind: "refuse",
      message: "Couldn't check Face ID. Try again.",
    });
  });
});
