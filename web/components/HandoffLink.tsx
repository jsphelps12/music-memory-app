"use client";

import type { AnchorHTMLAttributes } from "react";

// Deferred deep link: before someone without the app leaves for the App Store,
// put a prefixed token on the clipboard. The app reads it once, on its first
// launch (hooks/useDeepLinkHandler.ts), and picks up the gift or friend link.
//
// Safari and every other iOS browser only allow a clipboard write during a
// user gesture, so it has to happen inside the click handler. writeText is
// called synchronously here and the navigation is left alone: the App Store
// and the app open over the page rather than unloading it, so the write still
// completes.
export function writeHandoff(text: string) {
  try {
    navigator.clipboard?.writeText(text).catch(() => {});
  } catch {
    // Clipboard unavailable (insecure context, old browser): nothing to recover.
  }
}

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { handoff: string };

export function HandoffLink({ handoff, onClick, ...anchor }: Props) {
  return (
    <a
      {...anchor}
      onClick={(e) => {
        writeHandoff(handoff);
        onClick?.(e);
      }}
    />
  );
}
