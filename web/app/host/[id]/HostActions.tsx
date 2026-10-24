"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../host.module.css";

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

/**
 * While a guest book is open, checks every 30 seconds the page is visible
 * for new moments, and reloads the list only when the count moved. (A
 * reload signs every photo URL again, so the photos would download again.)
 */
export function AutoRefresh({ occasionId, known, seconds = 30 }: { occasionId: string; known: number; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const { count, error } = await getBrowserSupabase()
        .from("occasion_entries")
        .select("id", { count: "exact", head: true })
        .eq("occasion_id", occasionId);
      if (!error && count !== null && count !== known) router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, occasionId, known, seconds]);
  return null;
}

/** "Just us": whether guests can open the finished guest book. */
export function JustUsSwitch({ occasionId, initial }: { occasionId: string; initial: boolean }) {
  const router = useRouter();
  const [shared, setShared] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function change(next: boolean) {
    setShared(next);
    setError(null);
    const { data, error } = await getBrowserSupabase()
      .from("occasions")
      .update({ share_book_with_guests: next })
      .eq("id", occasionId)
      .select("id");
    if (error || !data?.length) {
      setShared(!next);
      setError("That didn't save. Try again.");
      return;
    }
    // The reveal panel's link and message depend on this.
    router.refresh();
  }

  return (
    <div className={h.switchRow}>
      <label htmlFor={id} className={h.switchLabel}>
        <span className={s.song}>Guests can open the finished guest book</span>
        <span className={s.meta}>
          {shared ? "Everyone who added a song gets the link when you reveal it." : "Just us: only you two will see it."}
        </span>
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={h.switch}
        checked={shared}
        onChange={(e) => change(e.target.checked)}
      />
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Close collection now. Asks once more, because guests can't add songs after. */
export function CloseCollecting({ occasionId }: { occasionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().rpc("close_occasion", { p_occasion_id: occasionId });
    setBusy(false);
    if (error) {
      // Already closed (by the other host, or in another tab): show where it is now.
      if (error.code === "42501") return router.refresh();
      return setError("That didn't work. Try again.");
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" className={s.quietButton} onClick={() => setConfirming(true)}>
        Close it to new songs now
      </button>
    );
  }
  return (
    <div className={h.confirm} role="group" aria-label="Close the guest book">
      <p className={s.body}>Guests won&rsquo;t be able to add songs or photos after this. It can&rsquo;t be undone.</p>
      <div className={h.actions}>
        <button type="button" className={`${s.button} ${h.inline}`} onClick={close} disabled={busy} aria-busy={busy}>
          {busy ? "Closing…" : "Close it"}
        </button>
        <button type="button" className={s.quietButton} onClick={() => setConfirming(false)} disabled={busy}>
          Keep it open
        </button>
      </div>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Reveal the keepsake. Asks once more, because it can't be taken back. */
export function RevealButton({ occasionId, disabled = false }: { occasionId: string; disabled?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().rpc("reveal_occasion", { p_occasion_id: occasionId });
    setBusy(false);
    if (error) {
      // Already revealed (by the other host, or in another tab): show where it is now.
      if (error.code === "42501") return router.refresh();
      return setError("That didn't work. Try again.");
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" className={`${s.button} ${h.inline}`} onClick={() => setConfirming(true)} disabled={disabled}>
        Reveal it
      </button>
    );
  }
  return (
    <div className={h.confirm} role="group" aria-label="Reveal the guest book">
      <p className={s.body}>
        Reveal it now? It can&rsquo;t be taken back, but you can still hide moments or turn on Just us afterwards.
      </p>
      <div className={h.actions}>
        <button type="button" className={`${s.button} ${h.inline}`} onClick={reveal} disabled={busy} aria-busy={busy}>
          {busy ? "Revealing…" : "Reveal it"}
        </button>
        <button type="button" className={s.quietButton} onClick={() => setConfirming(false)} disabled={busy}>
          Not yet
        </button>
      </div>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
