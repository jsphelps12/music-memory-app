import { useState } from "react";
import { Image, ImageProps } from "expo-image";
import * as Sentry from "@sentry/react-native";

/**
 * Drop-in replacement for expo-image's `Image` that reports load failures.
 *
 * Plain `<Image>` renders an empty box when a URL fails, with no error state
 * and nothing logged. That is how every moment-card thumbnail in production
 * could 403 for months without a single report — the UI looked merely empty,
 * not broken. Anything loading a remote URL should use this instead.
 *
 * Failures are reported once per component instance (not per retry) so a
 * screen full of broken images can't flood Sentry.
 */
export function AppImage({ onError, ...props }: ImageProps) {
  const [reported, setReported] = useState(false);

  return (
    <Image
      {...props}
      onError={(event) => {
        if (!reported) {
          setReported(true);
          const uri =
            typeof props.source === "object" && props.source && "uri" in props.source
              ? String(props.source.uri)
              : undefined;
          // Strip the query string: signed/transform params add noise and can
          // carry tokens we don't want in an error report.
          const safeUri = uri?.split("?")[0];
          Sentry.captureMessage("image_load_failed", {
            level: "warning",
            extra: { uri: safeUri, error: event?.error },
          });
        }
        onError?.(event);
      }}
    />
  );
}
