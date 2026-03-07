"use client";

import { useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/soundtracks/id6759203604";
const CLIPBOARD_PREFIX = "soundtracks-invite:";

interface Props {
  inviteCode: string;
}

export default function InviteCTA({ inviteCode }: Props) {
  const [attempted, setAttempted] = useState(false);

  async function handleOpen() {
    // Try to open the app via URI scheme
    window.location.href = `soundtracks://join?inviteCode=${inviteCode}`;

    // After a short delay, if we're still here the app isn't installed — offer download
    setTimeout(() => setAttempted(true), 1500);
  }

  async function handleDownload() {
    try {
      await navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${inviteCode}`);
    } catch {
      // Clipboard write failed (e.g. non-HTTPS or permissions) — proceed anyway
    }
    window.location.href = APP_STORE_URL;
  }

  if (attempted) {
    return (
      <div className="w-full max-w-xl flex flex-col gap-2">
        <button
          onClick={handleDownload}
          className="w-full block text-center py-3 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#E8825C" }}
        >
          Download Soundtracks
        </button>
        <button
          onClick={handleOpen}
          className="w-full block text-center py-3 rounded-full font-semibold text-base transition-opacity hover:opacity-90"
          style={{ color: "#E8825C" }}
        >
          Try opening app again
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleOpen}
      className="w-full max-w-xl block text-center py-3 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
      style={{ backgroundColor: "#E8825C" }}
    >
      Open in Soundtracks
    </button>
  );
}
