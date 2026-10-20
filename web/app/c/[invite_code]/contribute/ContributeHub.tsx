"use client";

import { useState, useEffect, useRef } from "react";
import AlbumMomentList, { type MomentItem } from "@/components/AlbumMomentList";
import Link from "next/link";
import { APP_STORE_URL, TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

interface Props {
  collectionName: string;
  inviteCode: string;
  moments: MomentItem[];
  justSubmitted: boolean;
}

const POLL_INTERVAL_MS = 30_000;

export default function ContributeHub({ collectionName, inviteCode, moments: initialMoments, justSubmitted }: Props) {
  const [moments, setMoments] = useState<MomentItem[]>(initialMoments);
  // Tracks the most recent added_at we've seen — poll only fetches newer than this
  const latestAddedAtRef = useRef<string | null>(null);
  const seenIdsRef = useRef(new Set(initialMoments.map((m) => m.id)));

  useEffect(() => {
    const poll = async () => {
      try {
        const params = new URLSearchParams({ inviteCode });
        if (latestAddedAtRef.current) {
          params.set("after", latestAddedAtRef.current);
        }
        const res = await fetch(`/api/collection-moments?${params}`);
        if (!res.ok) return;
        const { moments: newMoments, latestAddedAt } = await res.json();

        // Update baseline timestamp regardless of whether there are new moments
        if (latestAddedAt) {
          latestAddedAtRef.current = latestAddedAt;
        }

        // Only prepend moments we haven't seen yet
        const trulyNew = (newMoments as MomentItem[]).filter((m) => !seenIdsRef.current.has(m.id));
        if (trulyNew.length > 0) {
          trulyNew.forEach((m) => seenIdsRef.current.add(m.id));
          setMoments((prev) => [...trulyNew, ...prev]);
        }
      } catch {
        // Silently ignore poll failures
      }
    };

    // First poll immediately to establish the latestAddedAt baseline,
    // then continue on interval
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [inviteCode]);

  const count = moments.length;

  return (
    <main className={s.page}>
      <div className={s.column}>
        <TopBar />

        {justSubmitted && (
          <p className={s.notice} role="status">
            <span className={s.dot} aria-hidden="true" />
            Your song is in. Thank you.
          </p>
        )}

        <header className={s.albumHead}>
          <h1 className={s.headline}>{collectionName}</h1>
          <p className={s.meta}>
            {count} {count === 1 ? "song" : "songs"} so far
          </p>
        </header>

        {count === 0 ? (
          <p className={`${s.empty} ${s.tracklist}`}>No songs yet. Yours could be the first.</p>
        ) : (
          <AlbumMomentList moments={moments} />
        )}

        <div className={s.dockSpacer} />
      </div>

      {/* Adding a song is why a guest is here, so it stays in reach. */}
      <div className={s.dock}>
        <div className={s.dockInner}>
          <Link href={`/c/${inviteCode}/contribute/new`} className={s.button}>
            {justSubmitted ? "Add another song" : "Add your song"}
          </Link>
          {justSubmitted && (
            <a href={APP_STORE_URL} className={`${s.meta} ${s.textLink}`}>
              Keep your own songs in Soundtracks
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
