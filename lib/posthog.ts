import PostHog from "posthog-react-native";

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const isConfigured = Boolean(apiKey);

export const posthog = new PostHog(apiKey || "placeholder_key", {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  flushAt: 20,
  flushInterval: 10000,
});

// Both app variants share one PostHog project, so without this beta-tester
// events are indistinguishable from real user events. Registered as a super
// property, so it rides along on every event for filtering/breakdowns.
posthog.register({ app_env: process.env.EXPO_PUBLIC_APP_ENV ?? "production" });
