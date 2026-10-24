"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import s from "@/components/share.module.css";
import { guestLink, isSlugShape, setupProblem, slugify, timeZoneOptions } from "@/lib/occasionHost";
import { searchSongs, type SongResult } from "@/lib/occasionGuest";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../host.module.css";

type Reservation = { id: string; couple_names: string; wedding_date: string; guest_count: number };
type Availability = { slug: string; available: boolean } | null;

const MAX_SONGS = 6;
const noop = () => () => {};

/** The browser's own time zone, read without a hydration mismatch (null on the server). */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null
  );
}

// The full zone list differs between Node and each browser, so the server
// renders only the US zones and the browser adds the rest after hydration.
// A joined string keeps the snapshot stable between reads.
let zoneCache: string | null = null;
function useZoneOptions(): string[] {
  const joined = useSyncExternalStore(
    noop,
    () => (zoneCache ??= timeZoneOptions().join("|")),
    () => timeZoneOptions([]).join("|")
  );
  return useMemo(() => joined.split("|"), [joined]);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** An occasion being edited (the same form, prefilled). */
export type ExistingOccasion = {
  id: string;
  names: string;
  eventDate: string;
  city: string | null;
  timeZone: string;
  guestEstimate: number | null;
  slug: string;
  status: "draft" | "collecting" | "curating" | "revealed";
  suggestedSongs: SongResult[];
};

export function SetupForm({
  reservation = null,
  existing = null,
}: {
  reservation?: Reservation | null;
  existing?: ExistingOccasion | null;
}) {
  const router = useRouter();
  const browserZone = useBrowserTimeZone();
  const zoneList = useZoneOptions();

  const [names, setNames] = useState(existing?.names ?? reservation?.couple_names ?? "");
  const [eventDate, setEventDate] = useState(existing?.eventDate ?? reservation?.wedding_date ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [zone, setZone] = useState<string | null>(existing?.timeZone ?? null);
  const [guests, setGuests] = useState(
    existing?.guestEstimate != null ? String(existing.guestEstimate) : reservation ? String(reservation.guest_count) : ""
  );
  // An existing occasion keeps its link unless the couple changes it.
  const [slugInput, setSlugInput] = useState<string | null>(existing?.slug ?? null);
  const [availability, setAvailability] = useState<Availability>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; items: SongResult[] }>({ query: "", items: [] });
  const [songs, setSongs] = useState<SongResult[]>(existing?.suggestedSongs ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { names: useId(), date: useId(), city: useId(), zone: useId(), guests: useId(), slug: useId(), search: useId() };

  // The link follows the names until the couple edits it themselves. It's
  // fixed once the guest book is open (guests have it on their tables).
  const slug = slugInput ?? slugify(names);
  const slugLocked = !!existing && existing.status !== "draft";
  const ownSlug = !!existing && slug === existing.slug;
  const timeZone = zone ?? browserZone ?? "America/New_York";
  // The selected zone is always an option, even an alias the list lacks.
  const zones = zoneList.includes(timeZone) ? zoneList : [timeZone, ...zoneList];

  // Is the link free? Asked a moment after typing stops; stale answers ignored.
  useEffect(() => {
    if (!isSlugShape(slug) || ownSlug || slugLocked) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await getBrowserSupabase().rpc("occasion_slug_available", { p_slug: slug });
      if (!cancelled && !error) setAvailability({ slug, available: data === true });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, ownSlug, slugLocked]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchSongs(query, controller.signal)
        .then((items) => setFound({ query: query.trim(), items }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const results = query.trim().length >= 2 ? found.items.filter((r) => !songs.some((p) => p.appleMusicId === r.appleMusicId)) : [];
  const slugStatus =
    slugLocked ? "This stays fixed while your guest book is open, so printed cards and shared links keep working."
    : ownSlug ? "Yours."
    : !isSlugShape(slug) ? "Lowercase letters, numbers and dashes."
    : availability?.slug !== slug ? "Checking…"
    : availability.available ? "Free."
    // Only a new wedding gets the dated fallback (create_occasion_draft).
    : existing ? "Taken. Try another."
    : "Taken. We'll add your wedding month and year to it.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // An open book's unchanged date may already be past (editing after the
    // wedding). A draft's can't be: it would open already closed.
    const keptDate = existing && existing.status !== "draft" && eventDate === existing.eventDate;
    const today = keptDate ? "0000-00-00" : todayIso();
    const problem = setupProblem({ names, eventDate, city, timeZone, guestEstimate: guests, slug }, today);
    if (problem) return setError(problem);
    if (existing && !slugLocked && !ownSlug && availability?.slug === slug && !availability.available) {
      return setError("That link is taken. Try another.");
    }
    setBusy(true);
    setError(null);
    const songsJson = songs.map(({ appleMusicId, title, artist, artworkUrl }) => ({ appleMusicId, title, artist, artworkUrl }));

    if (existing) {
      const supabase = getBrowserSupabase();
      // The link first: it's the change that can be refused, and the details
      // shouldn't half-save around it.
      if (!slugLocked && !ownSlug) {
        const { error: slugError } = await supabase.rpc("set_occasion_slug", { p_occasion_id: existing.id, p_slug: slug });
        if (slugError) {
          setBusy(false);
          return setError(slugError.code === "23505" ? "That link is taken. Try another." : "We couldn't change the link.");
        }
      }
      const { error } = await supabase
        .from("occasions")
        .update({
          names: names.trim(),
          event_date: eventDate,
          city: city.trim() || null,
          time_zone: timeZone,
          guest_estimate: guests.trim() ? Number(guests) : null,
          suggested_songs: songsJson,
        })
        .eq("id", existing.id);
      if (error) {
        setBusy(false);
        router.refresh();
        return setError(
          slugLocked || ownSlug
            ? "We couldn't save that. Check the details and try again."
            : "Your new link is saved, but the other changes didn't. Check the details and try again."
        );
      }
      router.push(`/host/${existing.id}`);
      router.refresh();
      return;
    }

    const { data, error } = await getBrowserSupabase()
      .rpc("create_occasion_draft", {
        p_names: names.trim(),
        p_event_date: eventDate,
        p_city: city.trim(),
        p_time_zone: timeZone,
        p_guest_estimate: guests.trim() ? Number(guests) : null,
        p_slug: slug,
        p_suggested_songs: songsJson,
        p_reservation_id: reservation?.id ?? null,
      })
      .single();
    const created = data as { id: string; slug: string } | null;
    if (error || !created) {
      setBusy(false);
      return setError(
        error?.code === "54000"
          ? "You have a few weddings in progress already. Finish or delete one first."
          : "We couldn't save that. Check the details and try again."
      );
    }
    router.push(`/host/${created.id}`);
  }

  return (
    <form onSubmit={submit} className={s.form} noValidate>
      <div className={s.field}>
        <label htmlFor={ids.names} className={s.label}>
          Your names
        </label>
        <input id={ids.names} className={s.input} placeholder="Sam & Priya" maxLength={120} value={names} onChange={(e) => setNames(e.target.value)} />
        <p className={s.meta}>As they&rsquo;ll appear on the guest book and the print.</p>
      </div>

      <div className={h.twoUp}>
        <div className={s.field}>
          <label htmlFor={ids.date} className={s.label}>
            Wedding date
          </label>
          {/* No min attribute: "today" differs between the server and the
              couple's phone; the form checks the date on submit instead. */}
          <input id={ids.date} type="date" className={s.input} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div className={s.field}>
          <label htmlFor={ids.guests} className={s.label}>
            Guests, roughly <span className={s.optional}>(optional)</span>
          </label>
          <input id={ids.guests} className={s.input} inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="120" value={guests} onChange={(e) => setGuests(e.target.value)} />
        </div>
      </div>

      <div className={h.twoUp}>
        <div className={s.field}>
          <label htmlFor={ids.city} className={s.label}>
            City <span className={s.optional}>(optional)</span>
          </label>
          <input id={ids.city} className={s.input} placeholder="Hudson, New York" maxLength={120} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className={s.field}>
          <label htmlFor={ids.zone} className={s.label}>
            Time zone
          </label>
          <select id={ids.zone} className={s.input} value={timeZone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className={s.field} aria-labelledby={`${ids.search}-label`}>
        <h2 id={`${ids.search}-label`} className={s.label}>
          Songs to suggest <span className={s.optional}>(up to {MAX_SONGS}, optional)</span>
        </h2>
        <p className={s.meta}>They sit at the top of your guests&rsquo; list. Anyone can still pick any song.</p>
        {songs.length > 0 ? (
          <ul className={s.results}>
            {songs.map((t) => (
              <li key={t.appleMusicId} className={h.songRow}>
                {t.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.artworkUrl} alt="" width={44} height={44} />
                ) : (
                  <span className={h.artBlank} />
                )}
                <p className={`${s.resultText} ${s.oneLine}`}>
                  <span className={s.song}>{t.title}</span> <span className={s.artist}>{t.artist}</span>
                </p>
                <button type="button" className={s.quietButton} onClick={() => setSongs(songs.filter((p) => p !== t))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {songs.length < MAX_SONGS ? (
          <>
            <label htmlFor={ids.search} className={h.srOnly}>
              Search for a song to suggest
            </label>
            <input
              id={ids.search}
              type="search"
              autoComplete="off"
              className={s.input}
              placeholder="Search for a song"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            {results.length > 0 ? (
              <ul className={s.results}>
                {results.slice(0, 8).map((t) => (
                  <li key={t.appleMusicId}>
                    <button
                      type="button"
                      className={s.result}
                      onClick={() => {
                        setSongs([...songs, t]);
                        setQuery("");
                      }}
                    >
                      {t.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.artworkUrl} alt="" width={44} height={44} loading="lazy" />
                      ) : (
                        <span className={h.artBlank} />
                      )}
                      <span className={s.resultText}>
                        <span className={`${s.song} ${s.oneLine} ${s.block}`}>{t.title}</span>
                        <span className={`${s.artist} ${s.oneLine} ${s.block}`}>{t.artist}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <div className={s.field}>
        <label htmlFor={ids.slug} className={s.label}>
          Your guests&rsquo; link
        </label>
        <div className={h.slugRow}>
          <span className={h.slugPrefix} aria-hidden="true">
            soundtracks.app/for/
          </span>
          <input
            id={ids.slug}
            className={`${s.input} ${h.slugInput}`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={80}
            readOnly={slugLocked}
            value={slug}
            onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            aria-describedby={`${ids.slug}-status`}
          />
        </div>
        <p id={`${ids.slug}-status`} className={s.meta} aria-live="polite">
          {slugLocked ? slugStatus : slug ? `${guestLink(slug)} · ${slugStatus}` : "Add your names first."}
        </p>
      </div>

      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className={s.button} disabled={busy} aria-busy={busy}>
        {busy ? "Saving…" : existing ? "Save" : "Save and continue"}
      </button>
    </form>
  );
}
