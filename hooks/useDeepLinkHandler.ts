import { useEffect } from "react";
import { Linking } from "react-native";
import { handleAuthDeepLink } from "@/lib/auth-linking";

export function useDeepLinkHandler() {
  useEffect(() => {
    // Cold start: app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });

    // Warm start: app was already running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleAuthDeepLink(url);
    });

    return () => subscription.remove();
  }, []);
}
