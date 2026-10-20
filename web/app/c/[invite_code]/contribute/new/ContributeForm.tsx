"use client";

import { useState, useRef, useCallback } from "react";
import { submitContribution } from "./actions";
import { compressImage } from "@/lib/compressImage";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

interface SongResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl?: string;
}

interface SelectedSong {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl?: string;
}

interface Props {
  collectionName: string;
  inviteCode: string;
}

export default function ContributeForm({ collectionName, inviteCode }: Props) {
  const [name, setName] = useState("");
  const [reflection, setReflection] = useState("");
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<SelectedSong | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchSongs = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSongResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`
      );
      const json = await res.json();
      setSongResults(json.results ?? []);
    } catch {
      setSongResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSongQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSongQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (selectedSong) setSelectedSong(null);
    searchTimerRef.current = setTimeout(() => searchSongs(value), 400);
  }

  function handleSelectSong(song: SongResult) {
    setSelectedSong({
      trackId: song.trackId,
      trackName: song.trackName,
      artistName: song.artistName,
      collectionName: song.collectionName,
      artworkUrl100: song.artworkUrl100,
      previewUrl: song.previewUrl,
    });
    setSongResults([]);
    setSongQuery("");
  }

  function handleClearSong() {
    setSelectedSong(null);
    setSongQuery("");
    setSongResults([]);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress before upload, not after: a phone photo is several MB and every
    // viewer of the album would download the original on every render.
    try {
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
      setError(null);
    } catch {
      setPhotoFile(null);
      setPhotoPreview(null);
      setError("That image format isn't supported here — please choose a JPEG or PNG.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Every field is required: the server stores the note and the photo with
    // the song and rejects a contribution without them.
    if (!name.trim()) {
      setError("Please add your name.");
      return;
    }
    if (!selectedSong) {
      setError("Please pick a song.");
      return;
    }
    if (!reflection.trim()) {
      setError("Please write a few words about the song.");
      return;
    }
    if (!photoFile) {
      setError("Please add a photo.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const formData = new FormData();
    formData.append("inviteCode", inviteCode);
    formData.append("name", name.trim());
    formData.append("song", JSON.stringify(selectedSong));
    formData.append("reflection", reflection.trim());
    formData.append("photo", photoFile);

    try {
      const result = await submitContribution(formData);
      // On success the action redirects, so a returned value is always an error.
      if (result?.error) {
        setError(result.error);
        setSubmitting(false);
      }
    } catch (err: unknown) {
      // Next.js redirect() throws a special error — re-throw it so the router handles navigation
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const canSubmit = !!name.trim() && !!selectedSong && !!reflection.trim() && !!photoFile;

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar />

        <header className={s.albumHead}>
          <h1 className={s.headline}>Add your song</h1>
          <p className={`${s.body} ${s.lede}`}>
            For {collectionName}. Pick the song this brings to mind, say why, and add a photo.
          </p>
        </header>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.field}>
            <label htmlFor="guest-name" className={s.label}>
              Your name
            </label>
            <input
              id="guest-name"
              type="text"
              required
              maxLength={100}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah"
              className={s.input}
            />
          </div>

          <div className={s.field}>
            <label htmlFor="song-search" className={s.label}>
              Song
            </label>

            {selectedSong ? (
              <div className={s.picked}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedSong.artworkUrl100} alt="" />
                <p className={`${s.resultText} ${s.oneLine}`}>
                  <span className={s.song}>{selectedSong.trackName}</span>{" "}
                  <span className={s.artist}>{selectedSong.artistName}</span>
                </p>
                <button type="button" onClick={handleClearSong} className={s.quietButton}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  id="song-search"
                  type="search"
                  value={songQuery}
                  onChange={handleSongQueryChange}
                  placeholder="Search for a song"
                  autoComplete="off"
                  className={s.input}
                />
                {searching && <p className={s.meta}>Searching…</p>}
                {songResults.length > 0 && (
                  <ul className={s.results}>
                    {songResults.map((song) => (
                      <li key={song.trackId}>
                        <button type="button" onClick={() => handleSelectSong(song)} className={s.result}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={song.artworkUrl100} alt="" />
                          <span className={s.resultText}>
                            <span className={`${s.song} ${s.oneLine} ${s.block}`}>
                              {song.trackName}
                            </span>
                            <span className={`${s.artist} ${s.oneLine} ${s.block}`}>
                              {song.artistName}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className={s.field}>
            <label htmlFor="guest-note" className={s.label}>
              A few words
            </label>
            <textarea
              id="guest-note"
              required
              maxLength={5000}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What does it remind you of?"
              rows={4}
              className={`${s.input} ${s.textarea}`}
            />
          </div>

          <div className={s.field}>
            <span className={s.label}>
              Photo
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={s.hidden}
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <div className={s.photoPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Your photo" />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    setPhotoFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className={s.photoChange}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className={s.photoAdd}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                Add a photo
              </button>
            )}
          </div>

          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting || !canSubmit} className={s.button}>
            {submitting ? "Adding…" : "Add to the album"}
          </button>
        </form>
      </div>
    </main>
  );
}
