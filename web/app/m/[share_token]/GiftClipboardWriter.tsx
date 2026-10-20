"use client";

import { useEffect } from "react";

export function GiftClipboardWriter({ shareToken }: { shareToken: string }) {
  // Best effort only. iOS rejects a clipboard write without a user gesture,
  // so the reliable write happens when the App Store badge or open-in-app
  // button is tapped (components/HandoffLink.tsx).
  useEffect(() => {
    try {
      navigator.clipboard.writeText(`soundtracks-gift:${shareToken}`).catch(() => {});
    } catch {}
  }, [shareToken]);

  return null;
}
