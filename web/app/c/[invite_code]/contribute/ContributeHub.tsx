"use client";

import CollectionMomentList, { type MomentItem } from "@/components/CollectionMomentList";
import Link from "next/link";

interface Props {
  collectionName: string;
  inviteCode: string;
  moments: MomentItem[];
  justSubmitted: boolean;
}

const APP_STORE_URL = "https://apps.apple.com/us/app/soundtracks/id6759203604";

export default function ContributeHub({ collectionName, inviteCode, moments, justSubmitted }: Props) {
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
          {moments.length} {moments.length === 1 ? "memory" : "memories"} so far
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
