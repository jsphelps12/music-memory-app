"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../host.module.css";

type Mode = "link" | "password";
type State = { kind: "idle" } | { kind: "busy" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function SignInForm({ next, linkFailed }: { next: string; linkFailed: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>(
    linkFailed ? { kind: "error", message: "That sign-in link has expired or was already used. Send a new one." } : { kind: "idle" }
  );
  const ids = { email: useId(), password: useId() };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return setState({ kind: "error", message: "That email doesn't look right." });
    }
    setState({ kind: "busy" });
    const supabase = getBrowserSupabase();

    if (mode === "link") {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          emailRedirectTo: `${window.location.origin}/host/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        return setState({
          kind: "error",
          message: error.status === 429 ? "Too many links sent. Wait a minute and try again." : "We couldn't send the link. Try again.",
        });
      }
      return setState({ kind: "sent", email: address });
    }

    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error) return setState({ kind: "error", message: "That email and password don't match." });
    router.replace(next);
    router.refresh();
  }

  if (state.kind === "sent") {
    return (
      <div className={h.panel} role="status">
        <p className={s.title}>Check your email</p>
        <p className={s.body}>
          We sent a sign-in link to {state.email}. Open it on this device; it works once.
        </p>
        <button type="button" className={s.quietButton} onClick={() => setState({ kind: "idle" })}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${s.form} ${h.signIn}`} noValidate>
      <div className={s.field}>
        <label htmlFor={ids.email} className={s.label}>
          Email
        </label>
        <input
          id={ids.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          className={s.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {mode === "password" ? (
        <div className={s.field}>
          <label htmlFor={ids.password} className={s.label}>
            Password
          </label>
          <input
            id={ids.password}
            type="password"
            autoComplete="current-password"
            className={s.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p className={s.error} role="alert">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className={s.button} disabled={state.kind === "busy"} aria-busy={state.kind === "busy"}>
        {state.kind === "busy" ? "One moment…" : mode === "link" ? "Email me a sign-in link" : "Sign in"}
      </button>
      <button
        type="button"
        className={s.quietButton}
        onClick={() => {
          setMode(mode === "link" ? "password" : "link");
          setState({ kind: "idle" });
        }}
      >
        {mode === "link" ? "Use my Soundtracks password instead" : "Email me a link instead"}
      </button>
    </form>
  );
}
