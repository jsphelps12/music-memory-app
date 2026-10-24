"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * The edge function's own words when it answered with an error (its body is
 * {error}), else a generic line. supabase-js puts the Response on .context.
 */
async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = (await context.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof body?.error === "string") return body.error;
  }
  return "That didn't work. Try again.";
}

/** Staging only: opens the guest book without a charge (Stripe replaces this). */
export function ActivateButton({ occasionId }: { occasionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().functions.invoke("occasion-host", {
      body: { action: "dev-activate", occasionId },
    });
    setBusy(false);
    if (error) return setError(await functionErrorMessage(error));
    router.refresh();
  }

  return (
    <>
      <button type="button" className={s.button} onClick={activate} disabled={busy} aria-busy={busy}>
        {busy ? "Opening…" : "Open it (test mode, no charge)"}
      </button>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={s.quietButton}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the link is on screen to copy by hand.
        }
      }}
      aria-live="polite"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
