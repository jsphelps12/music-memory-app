"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const { data, error } = await getBrowserSupabase().rpc("accept_cohost_invite", { p_token: token });
    if (error || typeof data !== "string") {
      setBusy(false);
      return setError(
        error?.code === "P0002"
          ? "This invite was used or has expired. If you just joined, the wedding is in Your weddings; otherwise ask for a new link."
          : "That didn't work. Try again."
      );
    }
    router.push(`/host/${data}`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`${s.button} ${s.lede}`} onClick={join} disabled={busy} aria-busy={busy}>
        {busy ? "Joining…" : "Join"}
      </button>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
