"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AppStoreBadge } from "@/components/Share";
import { HandoffLink } from "@/components/HandoffLink";
import m from "./moment.module.css";

const noSubscribe = () => () => {};

// iPadOS Safari asks for desktop sites and sends a Mac user agent, so the
// server can't see it; a Mac with touch points is an iPad.
function isIPadAsMac() {
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

/**
 * After the memory, never before it and never sticky. On iOS: a quiet way
 * into the app for people who have it, and the App Store badge for people who
 * don't. Everywhere else: one line saying what Soundtracks is, and no ask.
 *
 * "Open in Soundtracks" uses the app's scheme, not the https link: iOS keeps
 * a tap on a link to the same site in Safari, so the universal link can't
 * open the app from this page. (The Smart App Banner in the page's metadata
 * covers the same case natively.) Both links leave the token on the
 * clipboard, so a first launch after installing opens this moment.
 */
export function AppHandoff({ token, serverIOS }: { token: string; serverIOS: boolean }) {
  const ios = useSyncExternalStore(noSubscribe, () => serverIOS || isIPadAsMac(), () => serverIOS);
  const handoff = `soundtracks-gift:${token}`;

  if (!ios) {
    return (
      <footer className={m.colophon}>
        <p className={m.colophonText}>
          Shared from{" "}
          <Link href="/" prefetch={false} className={m.textLink}>
            Soundtracks
          </Link>
          , a journal for the songs that mark your days.
        </p>
      </footer>
    );
  }

  return (
    <footer className={m.handoff}>
      <p className={m.colophonText}>Soundtracks is a journal for the songs that mark your days.</p>
      <div className={m.handoffActions}>
        <HandoffLink href={`soundtracks://m/${token}`} handoff={handoff} className={m.openLink}>
          Open in Soundtracks
        </HandoffLink>
        <AppStoreBadge handoff={handoff} />
      </div>
    </footer>
  );
}
