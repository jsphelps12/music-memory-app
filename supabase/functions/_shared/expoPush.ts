// Expo's push API, shared by every function that sends a push. Pure (no Deno
// APIs) so vitest covers it (expoPush.test.ts); callers pass the token from
// Deno.env.
//
// EXPO_ACCESS_TOKEN (Supabase secret): with Expo's "enhanced security for
// push notifications" turned on for the project, Expo only accepts sends that
// carry this token, so knowing a device's push token is no longer enough to
// push to it. Until the secret is set, sends go out unauthenticated, as
// before; set the secret first, then turn the setting on in Expo.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function expoPushHeaders(accessToken: string | undefined | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (accessToken && accessToken.trim()) headers.Authorization = `Bearer ${accessToken.trim()}`;
  return headers;
}
