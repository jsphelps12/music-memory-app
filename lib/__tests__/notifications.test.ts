/**
 * Asking and registering are separate questions. These pin the split: a
 * granted permission always registers, even when the caller may not ask,
 * because fusing the two left users who enabled notifications later (or whose
 * first-moment flag was never written) without a push token at all.
 */
import { describe, it, expect, vi } from "vitest";

// notifications.ts imports expo-notifications, expo-constants, react-native and
// the supabase client; the pure decision touches none of them.
vi.mock("expo-notifications", () => ({}));
vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { pushRegistrationStep } from "../notifications";

describe("pushRegistrationStep", () => {
  it("registers whenever permission is granted, whether or not it may ask", () => {
    expect(pushRegistrationStep("granted", true)).toBe("register");
    expect(pushRegistrationStep("granted", false)).toBe("register");
  });

  it("asks only when allowed to", () => {
    expect(pushRegistrationStep("undetermined", true)).toBe("ask");
    expect(pushRegistrationStep("undetermined", false)).toBe("skip");
  });

  it("never shows a dialog to a caller that may not ask, whatever the status", () => {
    for (const status of ["undetermined", "denied", "", "unknown"]) {
      expect(pushRegistrationStep(status, false)).not.toBe("ask");
    }
  });
});
