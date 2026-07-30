/**
 * The startup routing decision, extracted as a pure function.
 *
 * WHY THIS EXISTS
 * ---------------
 * This logic lives in the `AuthGate` effect in app/_layout.tsx, tangled with
 * three AsyncStorage reads, a router, and a 12-second overlay timer. That is
 * where the worst bug in the app's history lived: a profile fetch that failed
 * or timed out left `profileError` unset, so an existing user was routed into
 * onboarding — and onboarding writes to `profiles`, overwriting the real
 * display name and avatar of someone who had been using the app for months.
 *
 * A decision that destructive should be assertable without a renderer, a
 * navigator, or a mocked auth context. Everything here is inputs → decision;
 * the caller keeps the side effects. Specifically, these stay in AuthGate and
 * are deliberately NOT modelled here:
 *   - writing `first_moment_saved_{userId}` when an existing user signs in from
 *     the auth group;
 *   - reading + clearing the pending invite code and pushing `/join` after the
 *     replace to `/(tabs)`;
 *   - the 12-second overlay escape hatch (a timer, not a routing input) that
 *     ANDs with `showOverlay`.
 *
 * app/_layout.tsx is not yet wired to call this — that swap is a follow-up.
 *
 * The one rule this file exists to enforce: **profileError never routes to
 * onboarding.** A failed fetch means "we don't know whether onboarding is
 * complete", which is not the same as "onboarding is incomplete". When we don't
 * know, we let the user through to the app, where screens show their own
 * loading and error states and nothing overwrites anything.
 */

export interface AuthRouteInput {
  /** Truthy when a supabase session exists. Only its presence is consulted. */
  session: unknown | null;
  /** AuthContext is still restoring the session. */
  loading: boolean;
  /** The profile fetch has settled (successfully or not) for the current session. */
  profileReady: boolean;
  /** The profile fetch failed. Distinct from "profile says onboarding incomplete". */
  profileError: boolean;
  /** `profile?.onboardingCompleted` — undefined when there is no profile yet. */
  onboardingCompleted: boolean | undefined;
  /** The has-launched flag; `null` while the AsyncStorage read is in flight. */
  hasLaunched: boolean | null;
  /** expo-router's `useSegments()`. Only the first segment is significant. */
  segments: readonly string[];
}

export interface AuthRouteDecision {
  /** Route to `router.replace(...)`, or null to stay put. */
  redirect: string | null;
  /** Cover the app with the blocking overlay — startup state is still unresolved. */
  showOverlay: boolean;
  /** Persist the has-launched flag (and set it in state) as part of this decision. */
  writeHasLaunched: boolean;
}

export const ROUTE_WELCOME = "/(auth)/welcome";
export const ROUTE_SIGN_IN = "/(auth)/sign-in";
export const ROUTE_ONBOARDING = "/onboarding";
export const ROUTE_TABS = "/(tabs)";

/**
 * Screens that are legitimately open on top of the app during the onboarding
 * flow. A signed-in user sitting on one of these must not be redirected, or
 * their in-progress moment is thrown away mid-create.
 */
const ONBOARDING_ADJACENT_SEGMENTS = new Set(["create", "song-search", "celebration"]);

const NO_DECISION: AuthRouteDecision = {
  redirect: null,
  showOverlay: false,
  writeHasLaunched: false,
};

export function resolveAuthRoute(input: AuthRouteInput): AuthRouteDecision {
  const {
    session,
    loading,
    profileReady,
    profileError,
    onboardingCompleted,
    hasLaunched,
    segments,
  } = input;

  // Startup state not yet resolved. The overlay and the "don't route yet" guard
  // are the same condition by construction — routing on a half-resolved state is
  // what bounced signed-in users to sign-in when getSession timed out.
  //
  // (app/_layout.tsx additionally forces the overlay down after 12s as an escape
  // hatch. That is a timer, not a routing input, so it stays in the component.)
  const stillResolving = loading || hasLaunched === null || (!!session && !profileReady);
  if (stillResolving) {
    return { redirect: null, showOverlay: true, writeHasLaunched: false };
  }

  const first = segments[0];
  const inAuthGroup = first === "(auth)";
  const inOnboarding = first === "onboarding";
  const inOnboardingAdjacent = inOnboarding || ONBOARDING_ADJACENT_SEGMENTS.has(first ?? "");

  // A failed profile fetch is not evidence that onboarding is incomplete.
  const needsOnboarding = !onboardingCompleted && !profileError;

  if (!session) {
    if (inAuthGroup) return NO_DECISION;
    if (!hasLaunched) {
      return { redirect: ROUTE_WELCOME, showOverlay: false, writeHasLaunched: true };
    }
    return { redirect: ROUTE_SIGN_IN, showOverlay: false, writeHasLaunched: false };
  }

  if (inAuthGroup || inOnboarding) {
    if (needsOnboarding) {
      // Already on onboarding: do nothing. `replace("/onboarding")` from
      // onboarding remounts the screen and wipes phase/step state mid-flow.
      return inOnboarding
        ? NO_DECISION
        : { redirect: ROUTE_ONBOARDING, showOverlay: false, writeHasLaunched: false };
    }
    return { redirect: ROUTE_TABS, showOverlay: false, writeHasLaunched: false };
  }

  if (!inOnboardingAdjacent) {
    if (needsOnboarding) {
      return { redirect: ROUTE_ONBOARDING, showOverlay: false, writeHasLaunched: false };
    }
    if (!hasLaunched) {
      // Backfill for users already signed in on first open, who never hit the
      // !session path that normally writes the flag.
      return { redirect: null, showOverlay: false, writeHasLaunched: true };
    }
  }

  return NO_DECISION;
}
