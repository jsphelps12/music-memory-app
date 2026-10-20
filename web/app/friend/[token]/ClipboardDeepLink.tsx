"use client";

import { useEffect } from "react";

export function ClipboardDeepLink({ token }: { token: string }) {
  // Best effort only. iOS rejects a clipboard write without a user gesture,
  // so the reliable write happens when the App Store badge or open-in-app
  // button is tapped (components/HandoffLink.tsx).
  useEffect(() => {
    try {
      navigator.clipboard.writeText(`soundtracks-friend:${token}`).catch(() => {});
    } catch {}
  }, [token]);

  return null;
}
