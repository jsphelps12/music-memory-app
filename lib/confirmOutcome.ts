// What the /confirm screen says when exchanging the email link's code fails.
//
// Supabase confirms the email before it redirects to /confirm?code=…, so by
// the time the app has a code the address is confirmed. The exchange then only
// signs this device in, and it fails for reasons that don't undo that: no PKCE
// verifier here (reinstalled, signed up on another device or in the browser),
// or the code was already used (the link opened twice). Telling those people
// to sign up again sent them into "already registered".

import { friendlyError } from "@/lib/errors";

export type ConfirmFailure =
  | { kind: "already_confirmed" }
  | { kind: "failed"; message: string };

/** Errors meaning the email is confirmed but this device holds no session. */
const CONFIRMED_CODES = new Set([
  "pkce_code_verifier_not_found",
  "bad_code_verifier",
  "flow_state_not_found",
  "flow_state_expired",
]);

export const ALREADY_CONFIRMED_MESSAGE = "This email is already confirmed. Sign in to continue.";
export const CONFIRM_FAILED_MESSAGE =
  "Confirmation failed. The link may have expired, so try signing up again.";

const NO_CONNECTION = friendlyError(new Error("Network request failed"));

export function confirmFailure(err: unknown): ConfirmFailure {
  const e = (typeof err === "object" && err !== null ? err : {}) as { code?: unknown; name?: unknown };
  if (
    (typeof e.code === "string" && CONFIRMED_CODES.has(e.code)) ||
    e.name === "AuthPKCECodeVerifierMissingError"
  ) {
    return { kind: "already_confirmed" };
  }
  // No connection: say so (lib/errors.ts) rather than blame the link.
  const friendly = friendlyError(err);
  if (friendly === NO_CONNECTION) return { kind: "failed", message: friendly };
  return { kind: "failed", message: CONFIRM_FAILED_MESSAGE };
}
