"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/Share";
import m from "./moment.module.css";

// A failed request (not a missing moment): say so and offer a retry, rather
// than claiming the link is dead.
export default function SharedMomentError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      // refresh() fetches the server page again; reset() clears this boundary.
      router.refresh();
      reset();
    });

  return (
    <main className={m.page}>
      <div className={`${m.frame} ${m.frameNarrow}`}>
        <TopBar />
        <h1 className={m.calmTitle}>Couldn&rsquo;t open this song</h1>
        <p className={m.calmBody}>Something went wrong while loading it. Try again in a moment.</p>
        <button type="button" onClick={retry} className={m.retry}>
          Try again
        </button>
      </div>
    </main>
  );
}
