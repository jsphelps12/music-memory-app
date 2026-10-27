"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import a from "./admin.module.css";

/** Runs the close-and-reveal job now, rather than waiting up to ten minutes. */
export function RunTick({ lastRun }: { lastRun: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function run() {
    setBusy(true);
    setResult(null);
    const { data, error } = await getBrowserSupabase().functions.invoke("occasion-admin", { body: { action: "tick" } });
    setBusy(false);
    if (error || !data) return setResult("That didn't run. Check the function logs.");
    setResult(`Closed ${data.closed}, revealed ${data.revealed}.`);
    startRefresh(() => router.refresh());
  }

  return (
    <div className={a.tick}>
      <button type="button" className={s.quietButton} onClick={run} disabled={busy || refreshing} aria-busy={busy}>
        {busy ? "Running…" : "Run the close-and-reveal job now"}
      </button>
      <p className={s.meta} aria-live="polite">
        {result ?? `Last scheduled run: ${lastRun}`}
      </p>
    </div>
  );
}
