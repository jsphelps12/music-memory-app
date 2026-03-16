"use client";

import { useState, useEffect, useRef } from "react";
import CollectionMomentList, { type MomentItem } from "@/components/CollectionMomentList";
import Link from "next/link";

interface Props {
  collectionName: string;
  inviteCode: string;
  moments: MomentItem[];
  justSubmitted: boolean;
}

const APP_STORE_URL = "https://apps.apple.com/us/app/soundtracks/id6759203604";
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
    <div className="min-h-screen pb-36" style={{ backgroundColor: "#FBF6F1" }}>
      {/* Success banner */}
      {justSubmitted && (
        <div
          className="px-6 py-3 text-center text-sm font-semibold"
          style={{ backgroundColor: "#22863A", color: "#fff" }}
        >
          ✓ Memory added — thank you!
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-10 pb-6 max-w-xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#E8825C" }}>
          Guest Book
        </p>
        <h1 className="text-3xl font-bold" style={{ color: "#2C2C3A" }}>
          {collectionName}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#999" }}>
          {count} {count === 1 ? "memory" : "memories"} so far
        </p>
      </div>

      {/* Moment feed */}
      <div className="px-6 max-w-xl mx-auto">
        {moments.length === 0 ? (
          <p className="text-center py-12" style={{ color: "#bbb" }}>
            No memories yet — be the first!
          </p>
        ) : (
          <CollectionMomentList moments={moments} />
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 py-4"
        style={{ backgroundColor: "#FBF6F1", borderTop: "1px solid #E8D8CC" }}
      >
        <div className="max-w-xl mx-auto flex flex-col gap-2">
          {justSubmitted ? (
            <>
              <Link
                href={`/c/${inviteCode}/contribute/new`}
                className="block text-center py-3 rounded-full font-semibold text-base transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#2C2C3A", color: "#fff" }}
              >
                Add Another Memory
              </Link>
              <a
                href={APP_STORE_URL}
                className="block text-center py-3 rounded-full font-semibold text-base transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#E8825C", color: "#fff" }}
              >
                Download Soundtracks
              </a>
            </>
          ) : (
            <Link
              href={`/c/${inviteCode}/contribute/new`}
              className="block text-center py-3 rounded-full font-semibold text-base transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#E8825C", color: "#fff" }}
            >
              Add Your Memory →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
