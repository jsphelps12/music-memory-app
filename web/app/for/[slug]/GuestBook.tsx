"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { compressImage } from "@/lib/compressImage";
import {
  applyStarter,
  createEntry,
  deviceId,
  newEditToken,
  markPhoto,
  rememberedName,
  rememberName,
  saveMoment,
  savedMoments,
  searchSongs,
  STARTERS,
  updateEntry,
  type GuestOccasion,
  type SavedMoment,
  type SongResult,
  type SuggestedSong,
} from "@/lib/occasionGuest";
import g from "./guest.module.css";

type Song = SuggestedSong | SongResult;
type Photo = { file: File; url: string };
type SearchState = "idle" | "searching" | "error";
type Done = { entryId: string; editToken: string; song: Song; words: string; name: string; photo: Photo | null; photoSaved: boolean };

const storage = () => (typeof window === "undefined" ? undefined : window.localStorage);

// What this phone saved for this guest book, read with useSyncExternalStore
// so the server render (nothing saved) and the first client render agree.
// Same-tab writes don't fire "storage", so writers call notifySaved().
const savedListeners = new Set<() => void>();
function notifySaved() {
  savedListeners.forEach((l) => l());
}
function subscribeSaved(listener: () => void) {
  savedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    savedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function useSavedMoments(slug: string): SavedMoment[] {
  const snapshot = useSyncExternalStore(
    subscribeSaved,
    () => JSON.stringify(savedMoments(storage(), slug)),
    () => "[]"
  );
  return useMemo(() => JSON.parse(snapshot) as SavedMoment[], [snapshot]);
}

/** Scrolls to an element, without animation for people who asked for less motion. */
function reveal(el: HTMLElement | null) {
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

async function preparePhoto(file: File): Promise<Photo | string> {
  try {
    const compressed = await compressImage(file);
    return { file: compressed, url: URL.createObjectURL(compressed) };
  } catch {
    return "That photo couldn't be opened here. Try another one.";
  }
}

export function GuestBook({ occasion, when }: { occasion: GuestOccasion; when: string }) {
  const [song, setSong] = useState<Song | null>(null);
  const [query, setQuery] = useState("");
  // Results remember which query they answer, so "No songs found" never shows
  // for a query that hasn't been searched yet.
  const [found, setFound] = useState<{ query: string; items: SongResult[] }>({ query: "", items: [] });
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // The name field only renders after a song is picked, so reading the phone's
  // memory here can't cause a hydration mismatch.
  const [name, setName] = useState(() => rememberedName(storage()));
  const [words, setWords] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const saved = useSavedMoments(occasion.slug);

  const photoInput = useRef<HTMLInputElement>(null);
  const photoSection = useRef<HTMLDivElement>(null);
  const wordsInput = useRef<HTMLTextAreaElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // One token per moment: retries of the same moment reuse it (so a lost
  // response can't create a duplicate); a new moment gets a new one.
  const draftToken = useRef<string | null>(null);
  // Changing the moment after a failed try makes it a different moment: if
  // that try did save, a duplicate beats silently dropping the edit.
  useEffect(() => {
    draftToken.current = null;
  }, [song, photo, name, words]);
  const ids = { search: useId(), name: useId(), words: useId(), photo: useId() };

  // Search as they type, dropping answers to questions they've stopped asking.
  const searching = query.trim().length >= 2;
  const results = searching ? found.items : [];
  const answered = found.query === query.trim();
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchState("searching");
      searchSongs(query, controller.signal)
        .then((items) => {
          setFound({ query: query.trim(), items });
          setSearchState("idle");
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") setSearchState("error");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Object URLs hold the image in memory until revoked.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  function pickSong(next: Song) {
    setSong(next);
    setQuery("");
    setError(null);
    requestAnimationFrame(() => reveal(photoSection.current));
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const prepared = await preparePhoto(file);
    if (typeof prepared === "string") {
      setPhotoError(prepared);
      return;
    }
    setPhotoError(null);
    setPhoto(prepared);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!song) return setError("Pick a song first.");
    if (!name.trim()) return setError("Add your name, so they know who picked it.");
    setSubmitting(true);
    setError(null);
    draftToken.current ??= newEditToken();
    const editToken = draftToken.current;
    const result = await createEntry({
      slug: occasion.slug,
      appleMusicId: song.appleMusicId,
      guestName: name,
      words,
      deviceId: deviceId(storage(), () => crypto.randomUUID()),
      editToken,
      photo: photo?.file ?? null,
    });
    setSubmitting(false);
    if (!result.ok) return setError(result.error);

    const { entryId, photoSaved } = result.data;
    draftToken.current = null;
    rememberName(storage(), name.trim());
    const record: SavedMoment = {
      entryId,
      editToken,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      hasPhoto: photoSaved,
      savedAt: new Date().toISOString(),
    };
    saveMoment(storage(), occasion.slug, record);
    notifySaved();
    setDone({ entryId, editToken, song, words: words.trim(), name: name.trim(), photo, photoSaved });
    requestAnimationFrame(() => reveal(topRef.current));
  }

  function addAnother() {
    // The done view keeps showing the old photo until here; let it go now.
    setDone(null);
    setSong(null);
    setPhoto(null);
    setWords("");
    setError(null);
    requestAnimationFrame(() => reveal(topRef.current));
  }

  if (done) {
    return (
      <main className={s.page}>
        <div ref={topRef} className={`${s.column} ${s.narrow}`}>
          <TopBar />
          <DoneView
            occasion={occasion}
            done={done}
            saved={saved}
            onSaved={notifySaved}
            onPhotoRetried={() => setDone({ ...done, photoSaved: true })}
            onAnother={addAnother}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div ref={topRef} className={`${s.column} ${s.narrow}`}>
        <TopBar />
        <header className={g.head}>
          <h1 className={s.headline}>{occasion.names}</h1>
          <p className={`${s.meta} ${g.when}`}>{when}</p>
          <p className={`${s.body} ${s.lede}`}>
            Pick a song for them, add a photo from tonight and your name. It goes in their guest book.
          </p>
        </header>

        <form onSubmit={submit} className={s.form} noValidate>
          <section className={s.field} aria-labelledby={`${ids.search}-label`}>
            <h2 id={`${ids.search}-label`} className={g.step}>A song for them</h2>
            {song ? (
              <div className={s.picked}>
                <Artwork url={song.artworkUrl} />
                <p className={`${s.resultText} ${s.oneLine}`}>
                  <span className={s.song}>{song.title}</span> <span className={s.artist}>{song.artist}</span>
                </p>
                <button type="button" className={s.quietButton} onClick={() => setSong(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                {occasion.suggestedSongs.length > 0 && !query ? (
                  <>
                    <p className={g.hint}>{occasion.names} suggest</p>
                    <ul className={s.results}>
                      {occasion.suggestedSongs.map((t) => (
                        <li key={t.appleMusicId}>
                          <SongButton song={t} onPick={pickSong} />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <label htmlFor={ids.search} className={g.srOnly}>
                  Search for a song
                </label>
                <input
                  id={ids.search}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  className={`${s.input} ${g.search}`}
                  placeholder={occasion.suggestedSongs.length ? "Or search for any song" : "Search for a song"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <p className={s.meta} aria-live="polite">
                  {searching && searchState === "searching" ? "Searching…" : null}
                  {searching && searchState === "error" ? "Search isn't working right now. Try again in a moment." : null}
                  {searching && answered && searchState === "idle" && results.length === 0 ? "No songs found." : null}
                </p>
                {searching && results.length > 0 ? (
                  <ul className={s.results}>
                    {results.map((t) => (
                      <li key={t.appleMusicId}>
                        <SongButton song={t} onPick={pickSong} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          {song ? (
            <>
              <section ref={photoSection} className={`${s.field} ${g.scrollTarget}`} aria-labelledby={`${ids.photo}-label`}>
                <h2 id={`${ids.photo}-label`} className={g.step}>
                  A photo from tonight <span className={s.optional}>(if you have one)</span>
                </h2>
                <input
                  ref={photoInput}
                  id={ids.photo}
                  type="file"
                  accept="image/*"
                  className={s.hidden}
                  onChange={onPhoto}
                />
                {photo ? (
                  <div className={s.photoPreview}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="Your photo" />
                    <button type="button" className={s.photoChange} onClick={() => setPhoto(null)}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <button type="button" className={s.photoAdd} onClick={() => photoInput.current?.click()}>
                    <CameraIcon />
                    Add a photo
                  </button>
                )}
                {photoError ? <p className={s.error} role="alert">{photoError}</p> : null}
              </section>

              <div className={s.field}>
                <label htmlFor={ids.name} className={g.step}>
                  Your name
                </label>
                <input
                  id={ids.name}
                  className={s.input}
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  maxLength={80}
                  placeholder="First and last"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className={s.field}>
                <label htmlFor={ids.words} className={g.step}>
                  A few words <span className={s.optional}>(optional)</span>
                </label>
                <div className={g.starters}>
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      className={g.starter}
                      onClick={() => {
                        setWords((w) => applyStarter(w, starter));
                        requestAnimationFrame(() => {
                          const el = wordsInput.current;
                          if (!el) return;
                          el.focus();
                          el.setSelectionRange(el.value.length, el.value.length);
                        });
                      }}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={wordsInput}
                  id={ids.words}
                  className={`${s.input} ${s.textarea}`}
                  rows={4}
                  maxLength={2000}
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                />
              </div>

              {error ? <p className={s.error} role="alert">{error}</p> : null}

              <div className={g.submitBar}>
                <button type="submit" className={s.button} disabled={submitting || !name.trim()} aria-busy={submitting}>
                  {submitting ? "Adding…" : "Add my song"}
                </button>
              </div>
            </>
          ) : null}
        </form>

        {saved.length > 0 ? <YourMoments slug={occasion.slug} saved={saved} /> : null}
      </div>
    </main>
  );
}

/** Album art, or a blank tile if there's none or the link has gone dead. */
function Artwork({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className={g.artBlank} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={44} height={44} loading="lazy" onError={() => setFailed(true)} />
  );
}

function SongButton({ song, onPick }: { song: Song; onPick: (s: Song) => void }) {
  return (
    <button type="button" className={s.result} onClick={() => onPick(song)}>
      <Artwork url={song.artworkUrl} />
      <span className={s.resultText}>
        <span className={`${s.song} ${s.oneLine} ${s.block}`}>{song.title}</span>
        <span className={`${s.artist} ${s.oneLine} ${s.block}`}>{song.artist}</span>
      </span>
    </button>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function DoneView({
  occasion,
  done,
  saved,
  onSaved,
  onPhotoRetried,
  onAnother,
}: {
  occasion: GuestOccasion;
  done: Done;
  saved: SavedMoment[];
  onSaved: () => void;
  onPhotoRetried: () => void;
  onAnother: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "saving" | "saved">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the confirmation so screen readers announce it.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  async function retryPhoto() {
    if (!done.photo) return;
    setRetrying(true);
    setRetryError(null);
    const r = await updateEntry({ entryId: done.entryId, editToken: done.editToken, photo: done.photo.file });
    setRetrying(false);
    if (!r.ok) return setRetryError(r.error);
    markPhoto(storage(), occasion.slug, done.entryId);
    onSaved();
    onPhotoRetried();
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailState("saving");
    setEmailError(null);
    // One email covers every moment this phone added to this guest book.
    const results = await Promise.all(
      saved.map((m) => updateEntry({ entryId: m.entryId, editToken: m.editToken, guestEmail: email }))
    );
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      setEmailState("idle");
      return setEmailError(failed.error);
    }
    setEmailState("saved");
  }

  return (
    <section aria-labelledby="done-title" className={g.done}>
      <h1 id="done-title" ref={heading} className={`${s.headline} ${g.focusTarget}`} tabIndex={-1}>
        Your song is in.
      </h1>
      <p className={`${s.body} ${s.lede}`}>It&rsquo;s in {occasion.names}&rsquo;s guest book.</p>

      <article className={g.card}>
        {done.photo && done.photoSaved ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={g.cardPhoto} src={done.photo.url} alt="" />
        ) : null}
        <div className={g.cardSong}>
          <Artwork url={done.song.artworkUrl} />
          <p className={`${s.resultText} ${s.oneLine}`}>
            <span className={s.song}>{done.song.title}</span> <span className={s.artist}>{done.song.artist}</span>
          </p>
        </div>
        {done.words ? <p className={g.cardWords}>{done.words}</p> : null}
        <p className={s.meta}>{done.name}</p>
      </article>

      {done.photo && !done.photoSaved ? (
        <div className={g.notice} role="status">
          <p className={s.body}>Your song is saved, but the photo didn&rsquo;t upload.</p>
          <button type="button" className={s.button} onClick={retryPhoto} disabled={retrying} aria-busy={retrying}>
            {retrying ? "Uploading…" : "Try the photo again"}
          </button>
          {retryError ? <p className={s.error} role="alert">{retryError}</p> : null}
        </div>
      ) : null}

      <form onSubmit={saveEmail} className={g.emailForm} noValidate>
        <label htmlFor={emailId} className={g.step}>
          Get the finished guest book <span className={s.optional}>(optional)</span>
        </label>
        <p className={s.meta}>
          We&rsquo;ll email you once: a reminder to add photos from the night, then the guest book when it&rsquo;s ready.
        </p>
        {emailState === "saved" ? (
          <p className={s.body} role="status">Thanks. We&rsquo;ll email {email.trim()}.</p>
        ) : (
          <div className={g.emailRow}>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              className={s.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className={`${s.button} ${g.emailButton}`} disabled={emailState === "saving" || !email.trim()}>
              {emailState === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {emailError ? <p className={s.error} role="alert">{emailError}</p> : null}
      </form>

      <button type="button" className={`${s.button} ${g.another}`} onClick={onAnother}>
        Add another song
      </button>
    </section>
  );
}

function YourMoments({ slug, saved }: { slug: string; saved: SavedMoment[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const moment = saved.find((m) => m.entryId === target);
    if (!file || !moment) return;
    setBusy(moment.entryId);
    setError(null);
    const prepared = await preparePhoto(file);
    if (typeof prepared === "string") {
      setBusy(null);
      return setError(prepared);
    }
    const r = await updateEntry({ entryId: moment.entryId, editToken: moment.editToken, photo: prepared.file });
    URL.revokeObjectURL(prepared.url);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    markPhoto(storage(), slug, moment.entryId);
    notifySaved();
  }

  return (
    <section className={g.yours} aria-labelledby="yours-title">
      <h2 id="yours-title" className={g.step}>Your songs</h2>
      <input ref={input} type="file" accept="image/*" className={s.hidden} onChange={onFile} tabIndex={-1} aria-hidden="true" />
      <ul className={s.results}>
        {saved.map((m) => (
          <li key={m.entryId} className={g.yourRow}>
            <Artwork url={m.artworkUrl} />
            <p className={`${s.resultText} ${s.oneLine}`}>
              <span className={s.song}>{m.title}</span> <span className={s.artist}>{m.artist}</span>
            </p>
            {m.hasPhoto ? (
              <span className={s.meta}>Photo added</span>
            ) : (
              <button
                type="button"
                className={s.quietButton}
                disabled={busy === m.entryId}
                onClick={() => {
                  setTarget(m.entryId);
                  input.current?.click();
                }}
              >
                {busy === m.entryId ? "Adding…" : "Add a photo"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </section>
  );
}
