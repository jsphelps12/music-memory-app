/**
 * State table for the startup routing decision (lib/authRouting.ts).
 *
 * The profileError cases are the reason this file exists: routing an existing
 * user into onboarding after a failed profile fetch let onboarding overwrite
 * their real display name and avatar. Those tests are grouped and named so a
 * future edit that reintroduces the bug fails with an unambiguous message.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAuthRoute,
  ROUTE_WELCOME,
  ROUTE_SIGN_IN,
  ROUTE_ONBOARDING,
  ROUTE_TABS,
  type AuthRouteInput,
} from "../authRouting";

const SESSION = { user: { id: "u1" } };

/** Fully-resolved signed-out user on a normal screen, unless overridden. */
function input(overrides: Partial<AuthRouteInput> = {}): AuthRouteInput {
  return {
    session: null,
    loading: false,
    profileReady: true,
    profileError: false,
    onboardingCompleted: true,
    hasLaunched: true,
    segments: ["(tabs)"],
    ...overrides,
  };
}

describe("unresolved startup state", () => {
  it("shows the overlay and routes nowhere while auth is loading", () => {
    expect(resolveAuthRoute(input({ loading: true }))).toEqual({
      redirect: null,
      showOverlay: true,
      writeHasLaunched: false,
    });
  });

  it("shows the overlay while the has-launched flag is still being read", () => {
    expect(resolveAuthRoute(input({ hasLaunched: null }))).toEqual({
      redirect: null,
      showOverlay: true,
      writeHasLaunched: false,
    });
  });

  it("shows the overlay for a signed-in user whose profile has not settled", () => {
    expect(
      resolveAuthRoute(input({ session: SESSION, profileReady: false }))
    ).toEqual({ redirect: null, showOverlay: true, writeHasLaunched: false });
  });

  it("does not wait on profileReady when there is no session", () => {
    // A signed-out user has no profile to wait for; blocking on profileReady
    // here would pin the overlay up on the sign-in screen forever.
    const decision = resolveAuthRoute(
      input({ session: null, profileReady: false, segments: ["(tabs)"] })
    );
    expect(decision.showOverlay).toBe(false);
    expect(decision.redirect).toBe(ROUTE_SIGN_IN);
  });

  it("never emits a redirect together with the overlay", () => {
    for (const overrides of [
      { loading: true },
      { hasLaunched: null },
      { session: SESSION, profileReady: false },
      { session: SESSION, profileReady: false, segments: ["(auth)"] },
      { loading: true, session: SESSION, segments: ["onboarding"] },
    ]) {
      const decision = resolveAuthRoute(input(overrides));
      expect(decision.showOverlay).toBe(true);
      expect(decision.redirect).toBeNull();
      expect(decision.writeHasLaunched).toBe(false);
    }
  });
});

describe("signed out", () => {
  it("sends a first-time visitor to welcome and writes the has-launched flag", () => {
    expect(resolveAuthRoute(input({ session: null, hasLaunched: false }))).toEqual({
      redirect: ROUTE_WELCOME,
      showOverlay: false,
      writeHasLaunched: true,
    });
  });

  it("sends a returning visitor to sign-in without rewriting the flag", () => {
    expect(resolveAuthRoute(input({ session: null, hasLaunched: true }))).toEqual({
      redirect: ROUTE_SIGN_IN,
      showOverlay: false,
      writeHasLaunched: false,
    });
  });

  it("leaves a signed-out user alone once they are inside the auth group", () => {
    // Without this, every render on the sign-in screen re-issues a replace to
    // it, and the welcome → sign-in navigation can never stick.
    for (const hasLaunched of [true, false]) {
      expect(
        resolveAuthRoute(input({ session: null, hasLaunched, segments: ["(auth)", "sign-in"] }))
      ).toEqual({ redirect: null, showOverlay: false, writeHasLaunched: false });
    }
  });
});

describe("signed in, inside the auth group", () => {
  it("sends a completed user to the tabs", () => {
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: true, segments: ["(auth)", "sign-in"] })
      )
    ).toEqual({ redirect: ROUTE_TABS, showOverlay: false, writeHasLaunched: false });
  });

  it("sends a genuinely new user to onboarding", () => {
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: false, segments: ["(auth)", "sign-up"] })
      )
    ).toEqual({ redirect: ROUTE_ONBOARDING, showOverlay: false, writeHasLaunched: false });
  });

  it("treats an undefined onboardingCompleted as incomplete when the fetch succeeded", () => {
    // No profile row at all (PGRST116) is the real signal for a new user.
    expect(
      resolveAuthRoute(
        input({
          session: SESSION,
          onboardingCompleted: undefined,
          profileError: false,
          segments: ["(auth)", "sign-in"],
        })
      ).redirect
    ).toBe(ROUTE_ONBOARDING);
  });
});

describe("signed in, already on onboarding", () => {
  it("does not re-issue a replace to onboarding", () => {
    // replace("/onboarding") from onboarding remounts the screen and wipes
    // phase/step state mid-flow.
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: false, segments: ["onboarding"] })
      )
    ).toEqual({ redirect: null, showOverlay: false, writeHasLaunched: false });
  });

  it("releases the user to the tabs once onboarding completes", () => {
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: true, segments: ["onboarding"] })
      ).redirect
    ).toBe(ROUTE_TABS);
  });
});

describe("signed in, inside the app", () => {
  it("stays put for a completed user on a normal screen", () => {
    expect(resolveAuthRoute(input({ session: SESSION, segments: ["(tabs)"] }))).toEqual({
      redirect: null,
      showOverlay: false,
      writeHasLaunched: false,
    });
  });

  it("pulls an incomplete user into onboarding", () => {
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: false, segments: ["(tabs)"] })
      ).redirect
    ).toBe(ROUTE_ONBOARDING);
  });

  it("backfills the has-launched flag for a user already signed in on first open", () => {
    expect(
      resolveAuthRoute(input({ session: SESSION, hasLaunched: false, segments: ["(tabs)"] }))
    ).toEqual({ redirect: null, showOverlay: false, writeHasLaunched: true });
  });

  it("leaves the onboarding-adjacent screens alone mid-flow", () => {
    // create / song-search / celebration are opened *by* onboarding. Redirecting
    // an incomplete user off them throws away the moment they are writing.
    for (const segment of ["create", "song-search", "celebration"]) {
      expect(
        resolveAuthRoute(
          input({ session: SESSION, onboardingCompleted: false, segments: [segment] }),

        ),
        `${segment} should not be redirected`
      ).toEqual({ redirect: null, showOverlay: false, writeHasLaunched: false });
    }
  });

  it("does not backfill the has-launched flag from an onboarding-adjacent screen", () => {
    for (const segment of ["create", "song-search", "celebration"]) {
      expect(
        resolveAuthRoute(input({ session: SESSION, hasLaunched: false, segments: [segment] }))
          .writeHasLaunched,
        `${segment} should not write the flag`
      ).toBe(false);
    }
  });
});

describe("profileError never routes to onboarding", () => {
  // THE BUG. A failed or timed-out profile fetch left profileError unset, so
  // AuthGate read `onboardingCompleted === undefined` as "new user" and walked
  // an existing user into onboarding — which then overwrote their real display
  // name and avatar. profileError means "we don't know", and "don't know" must
  // never take the destructive branch.
  const brokenProfile = {
    session: SESSION,
    profileError: true,
    onboardingCompleted: undefined,
  } as const;

  it("sends them to the tabs from the auth group, not onboarding", () => {
    const decision = resolveAuthRoute(input({ ...brokenProfile, segments: ["(auth)", "sign-in"] }));
    expect(decision.redirect).toBe(ROUTE_TABS);
    expect(decision.redirect).not.toBe(ROUTE_ONBOARDING);
  });

  it("releases them out of onboarding rather than pinning them there", () => {
    expect(
      resolveAuthRoute(input({ ...brokenProfile, segments: ["onboarding"] })).redirect
    ).toBe(ROUTE_TABS);
  });

  it("leaves them where they are inside the app", () => {
    expect(resolveAuthRoute(input({ ...brokenProfile, segments: ["(tabs)"] }))).toEqual({
      redirect: null,
      showOverlay: false,
      writeHasLaunched: false,
    });
  });

  it("holds for onboardingCompleted false as well as undefined", () => {
    // A stale/partial profile object with the flag explicitly false is just as
    // untrustworthy when the fetch errored.
    for (const segments of [["(tabs)"], ["(auth)", "sign-in"], ["onboarding"], ["browse"]]) {
      const decision = resolveAuthRoute(
        input({
          session: SESSION,
          profileError: true,
          onboardingCompleted: false,
          segments,
        })
      );
      expect(decision.redirect, `segments=${segments.join("/")}`).not.toBe(ROUTE_ONBOARDING);
    }
  });

  it("never returns the onboarding route for any profileError combination", () => {
    // Exhaustive sweep of the remaining axes, so a new branch added to
    // resolveAuthRoute can't quietly reopen the hole.
    for (const onboardingCompleted of [undefined, false, true]) {
      for (const hasLaunched of [true, false]) {
        for (const segments of [
          ["(tabs)"],
          ["(auth)", "sign-in"],
          ["onboarding"],
          ["create"],
          ["moment", "[id]"],
          [],
        ]) {
          const decision = resolveAuthRoute(
            input({
              session: SESSION,
              profileError: true,
              onboardingCompleted,
              hasLaunched,
              segments,
            })
          );
          expect(
            decision.redirect,
            `profileError + onboardingCompleted=${onboardingCompleted} ` +
              `hasLaunched=${hasLaunched} segments=${segments.join("/") || "(root)"}`
          ).not.toBe(ROUTE_ONBOARDING);
        }
      }
    }
  });

  it("still lets a signed-out user reach the auth screens", () => {
    // profileError is meaningless without a session and must not change the
    // signed-out routing at all.
    expect(resolveAuthRoute(input({ session: null, profileError: true })).redirect).toBe(
      ROUTE_SIGN_IN
    );
    expect(
      resolveAuthRoute(input({ session: null, profileError: true, hasLaunched: false })).redirect
    ).toBe(ROUTE_WELCOME);
  });
});

describe("segments edge cases", () => {
  it("treats an empty segments array as being inside the app", () => {
    // The root route on cold start, before any navigation has happened.
    expect(resolveAuthRoute(input({ session: SESSION, segments: [] }))).toEqual({
      redirect: null,
      showOverlay: false,
      writeHasLaunched: false,
    });
    expect(resolveAuthRoute(input({ session: null, segments: [] })).redirect).toBe(ROUTE_SIGN_IN);
  });

  it("only inspects the first segment", () => {
    expect(
      resolveAuthRoute(
        input({ session: SESSION, onboardingCompleted: false, segments: ["(auth)", "welcome", "x"] })
      ).redirect
    ).toBe(ROUTE_ONBOARDING);
  });
});
