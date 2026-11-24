import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

/**
 * Go back to the tabs from a screen opened on top of them (a friend link, an
 * album invite, a notification, the end of onboarding).
 *
 * Never `router.replace("/(tabs)")` from such a screen: replace swaps only
 * the top of the stack, so with the tabs already underneath it stacks a
 * SECOND tab navigator, whose Journal never draws (a blank screen with only
 * the tab bar and +; 2026-11-20, after accepting a friend link and joining an
 * album). When the tabs are below, dismiss down to them; only when nothing
 * is below (a cold start from a link) replace. design-lint rejects the raw
 * replace anywhere else.
 */
export function goHome(router: Router): void {
  if (router.canDismiss()) router.dismissTo("/(tabs)");
  else router.replace("/(tabs)"); // design-lint-ignore: the one sanctioned replace to the tabs
}
