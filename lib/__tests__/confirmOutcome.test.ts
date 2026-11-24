import { describe, expect, it } from "vitest";
import { ALREADY_CONFIRMED_MESSAGE, CONFIRM_FAILED_MESSAGE, confirmFailure } from "../confirmOutcome";

/** The shape supabase-js returns: an AuthError with a name and a code. */
const authError = (name: string, code?: string, message = "x") =>
  Object.assign(new Error(message), { name, code, __isAuthError: true });

describe("confirmFailure", () => {
  it("treats a missing PKCE verifier as an already-confirmed email", () => {
    // Reinstalled, or signed up on another device: supabase-js throws this
    // before it calls the server.
    expect(confirmFailure(authError("AuthPKCECodeVerifierMissingError", "pkce_code_verifier_not_found"))).toEqual({
      kind: "already_confirmed",
    });
    expect(confirmFailure(authError("AuthPKCECodeVerifierMissingError"))).toEqual({ kind: "already_confirmed" });
  });

  it("treats a used or mismatched code as already confirmed", () => {
    for (const code of ["flow_state_not_found", "flow_state_expired", "bad_code_verifier"]) {
      expect(confirmFailure(authError("AuthApiError", code)).kind).toBe("already_confirmed");
    }
  });

  it("says there's no connection when the request never reached the server", () => {
    const res = confirmFailure(authError("AuthRetryableFetchError", undefined, "Network request failed"));
    expect(res).toEqual({ kind: "failed", message: "No connection. Check your internet and try again." });
  });

  it("keeps the old copy for every other failure", () => {
    expect(confirmFailure(authError("AuthApiError", "unexpected_failure"))).toEqual({
      kind: "failed",
      message: CONFIRM_FAILED_MESSAGE,
    });
    expect(confirmFailure(null)).toEqual({ kind: "failed", message: CONFIRM_FAILED_MESSAGE });
    expect(ALREADY_CONFIRMED_MESSAGE).toMatch(/already confirmed/);
  });
});
