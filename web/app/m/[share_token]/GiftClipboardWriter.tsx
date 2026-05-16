"use client";

import { useEffect } from "react";

export function GiftClipboardWriter({ shareToken }: { shareToken: string }) {
  useEffect(() => {
    try {
      navigator.clipboard.writeText(`soundtracks-gift:${shareToken}`).catch(() => {});
    } catch {}
  }, [shareToken]);

  return null;
}
