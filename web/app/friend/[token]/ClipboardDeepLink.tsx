"use client";

import { useEffect } from "react";

export function ClipboardDeepLink({ token }: { token: string }) {
  useEffect(() => {
    // Write deferred deep link to clipboard so the app can recover on first install
    try {
      navigator.clipboard.writeText(`soundtracks-friend:${token}`).catch(() => {});
    } catch {}
  }, [token]);

  return null;
}
