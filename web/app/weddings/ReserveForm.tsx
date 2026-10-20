"use client";

import { useActionState } from "react";
import { reserveDate, type ReserveState } from "./actions";
import s from "./weddings.module.css";

const INITIAL: ReserveState = { status: "idle" };

function longDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ReserveForm() {
  const [state, action, pending] = useActionState(reserveDate, INITIAL);

  if (state.status === "reserved") {
    return (
      <div className={s.reserved} role="status">
        <p className={s.reservedTitle}>{state.names}, you&rsquo;re on the list.</p>
        <p className={s.body}>
          {longDate(state.date)} is held. We&rsquo;ll email you when setup opens, well before the day, with your table
          cards and your guest link. Nothing is charged until then.
        </p>
      </div>
    );
  }

  const v = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className={s.form} noValidate>
      <div className={s.fieldWide}>
        <label htmlFor="names" className={s.label}>
          Your names
        </label>
        <input id="names" name="names" className={s.input} placeholder="Sam & Priya" autoComplete="off" maxLength={120} defaultValue={v?.names} required />
      </div>
      <div className={s.field}>
        <label htmlFor="date" className={s.label}>
          Wedding date
        </label>
        <input id="date" name="date" type="date" className={s.input} defaultValue={v?.date} required />
      </div>
      <div className={s.field}>
        <label htmlFor="guests" className={s.label}>
          Guests, roughly
        </label>
        <input id="guests" name="guests" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" className={s.input} placeholder="120" defaultValue={v?.guests} required />
      </div>
      <div className={s.fieldWide}>
        <label htmlFor="email" className={s.label}>
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" className={s.input} placeholder="you@example.com" defaultValue={v?.email} required />
      </div>

      <fieldset className={s.fieldWide}>
        <legend className={s.label}>
          Thinking about <span className={s.optional}>(optional, change it any time)</span>
        </legend>
        <div className={s.checks}>
          <label className={s.check}>
            <input type="checkbox" name="interests" value="print" defaultChecked={v?.interests.includes("print")} /> The tracklist print
          </label>
          <label className={s.check}>
            <input type="checkbox" name="interests" value="cards" defaultChecked={v?.interests.includes("cards")} /> Thank-you cards
          </label>
          <label className={s.check}>
            <input type="checkbox" name="interests" value="book" defaultChecked={v?.interests.includes("book")} /> The liner-notes book
          </label>
        </div>
      </fieldset>

      {/* Hidden from people; bots fill it in. */}
      <div className={s.trap} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={s.submitRow}>
        <button type="submit" className={s.button} disabled={pending}>
          {pending ? "Reserving…" : "Reserve your date"}
        </button>
        <p className={s.fine}>Nothing to pay now.</p>
      </div>
      {state.status === "error" && (
        <p className={s.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
