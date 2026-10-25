"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../host.module.css";
import { CopyButton, functionErrorMessage } from "./HostActions";

export type Hosts = {
  hostEmail: string | null;
  cohostEmail: string | null;
  youAreHost: boolean;
  invitePending: boolean;
};

/**
 * Your partner: invite them with a single-use link (7 days), see who's in,
 * remove them, or (as the partner) leave. The link is shown once; only its
 * hash is kept, so a lost link is replaced with a new one.
 */
export function Partner({ occasionId, hosts }: { occasionId: string; hosts: Hosts }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    const { data, error } = await getBrowserSupabase().rpc("create_cohost_invite", { p_occasion_id: occasionId });
    setBusy(false);
    if (error || typeof data !== "string") return setError("That didn't work. Try again.");
    setLink(`${window.location.origin}/host/join/${data}`);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().rpc("remove_cohost", { p_occasion_id: occasionId });
    setBusy(false);
    // 42501: it already happened (they left, or you were removed). Show where things are now.
    if (error && error.code !== "42501") return setError("That didn't work. Try again.");
    if (hosts.youAreHost) {
      setConfirming(false);
      setLink(null);
      router.refresh();
    } else {
      router.push("/host");
      router.refresh();
    }
  }

  if (hosts.cohostEmail) {
    const other = hosts.youAreHost ? hosts.cohostEmail : hosts.hostEmail;
    return (
      <div className={h.ownership}>
        <p className={s.body}>
          {other} can manage this wedding with you.
        </p>
        {confirming ? (
          <div className={h.actions}>
            <button type="button" className={`${s.button} ${h.inline}`} onClick={remove} disabled={busy} aria-busy={busy}>
              {busy ? "…" : hosts.youAreHost ? "Remove them" : "Leave"}
            </button>
            <button type="button" className={s.quietButton} onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={s.quietButton} onClick={() => setConfirming(true)}>
            {hosts.youAreHost ? "Remove your partner" : "Leave this wedding"}
          </button>
        )}
        {error ? <p className={s.error} role="alert">{error}</p> : null}
      </div>
    );
  }

  if (!hosts.youAreHost) return null;

  return (
    <div className={h.ownership}>
      <p className={s.body}>Invite your partner to manage this with you.</p>
      {link ? (
        <>
          <p className={h.link}>{link}</p>
          <div className={h.actions}>
            <CopyButton text={link} />
          </div>
          <p className={s.meta}>
            Send it only to your partner: anyone with this link can manage your wedding. It works once, for 7 days.
          </p>
        </>
      ) : (
        <>
          <button type="button" className={`${s.button} ${h.inline}`} onClick={invite} disabled={busy} aria-busy={busy}>
            {busy ? "Making a link…" : hosts.invitePending ? "Make a new invite link" : "Invite your partner"}
          </button>
          {hosts.invitePending ? (
            <p className={s.meta}>An invite is waiting. A new link replaces it.</p>
          ) : null}
        </>
      )}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * Deletes the wedding: every song, photo and word. The primary host types
 * DELETE to confirm; the edge function removes the photos before the row.
 */
export function DeleteWedding({ occasionId, paid }: { occasionId: string; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().functions.invoke("occasion-host", {
      body: { action: "delete-wedding", occasionId },
    });
    if (error) {
      setBusy(false);
      return setError(await functionErrorMessage(error));
    }
    router.push("/host");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className={`${s.quietButton} ${h.danger}`} onClick={() => setOpen(true)}>
        Delete this wedding
      </button>
    );
  }
  return (
    <div className={h.confirm} role="group" aria-label="Delete this wedding">
      <p className={s.body}>
        This deletes every song, photo and word your guests left, your photographer&rsquo;s photos, and the guest book
        link. Your partner loses access too. It can&rsquo;t be undone.
        {paid ? " Deleting doesn't refund what you paid." : ""}
      </p>
      <label htmlFor={id} className={s.meta}>
        Type DELETE to confirm
      </label>
      <input
        id={id}
        className={s.input}
        autoComplete="off"
        autoCapitalize="characters"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className={h.actions}>
        <button
          type="button"
          className={`${s.button} ${h.inline} ${h.dangerButton}`}
          onClick={remove}
          disabled={busy || typed.trim() !== "DELETE"}
          aria-busy={busy}
        >
          {busy ? "Deleting…" : "Delete it"}
        </button>
        <button type="button" className={s.quietButton} onClick={() => setOpen(false)} disabled={busy}>
          Keep it
        </button>
      </div>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
