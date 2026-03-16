"use client";

import { useState, useRef, useCallback } from "react";
import { submitContribution } from "./actions";
import Image from "next/image";

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSong) {
      setError("Please select a song.");
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
      await submitContribution(formData);
    } catch (err: unknown) {
      // Next.js redirect() throws a special error — re-throw it so the router handles navigation
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: "#FBF6F1" }}>
      {/* Header */}
      <div className="px-6 pt-10 pb-6 max-w-xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#E8825C" }}>
          {collectionName}
        </p>
        <h1 className="text-2xl font-bold" style={{ color: "#2C2C3A" }}>
          Add Your Memory
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#999" }}>
          Share a song that reminds you of this moment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="px-6 max-w-xl mx-auto space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#2C2C3A" }}>
            Your name <span style={{ color: "#E8825C" }}>*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: "#EDE4DA",
              color: "#2C2C3A",
              border: "none",
            }}
          />
        </div>

        {/* Song search */}
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#2C2C3A" }}>
            Song <span style={{ color: "#E8825C" }}>*</span>
          </label>

          {selectedSong ? (
            /* Selected song chip */
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ backgroundColor: "#EDE4DA" }}
            >
              <Image
                src={selectedSong.artworkUrl100}
                alt=""
                width={40}
                height={40}
                className="rounded-lg object-cover shrink-0"
                unoptimized
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#2C2C3A" }}>
                  {selectedSong.trackName}
                </p>
                <p className="text-xs truncate" style={{ color: "#999" }}>
                  {selectedSong.artistName}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearSong}
                className="shrink-0 text-sm font-semibold"
                style={{ color: "#E8825C" }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={songQuery}
                onChange={handleSongQueryChange}
                placeholder="Search for a song..."
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: "#EDE4DA",
                  color: "#2C2C3A",
                  border: "none",
                }}
              />
              {searching && (
                <p className="text-xs mt-1" style={{ color: "#999" }}>Searching…</p>
              )}
              {songResults.length > 0 && (
                <div
                  className="mt-1 rounded-xl overflow-hidden"
                  style={{ backgroundColor: "#EDE4DA", border: "1px solid #DDD0C5" }}
                >
                  {songResults.map((song) => (
                    <button
                      key={song.trackId}
                      type="button"
                      onClick={() => handleSelectSong(song)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                      style={{ borderBottom: "1px solid #DDD0C5" }}
                    >
                      <Image
                        src={song.artworkUrl100}
                        alt=""
                        width={36}
                        height={36}
                        className="rounded-lg object-cover shrink-0"
                        unoptimized
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#2C2C3A" }}>
                          {song.trackName}
                        </p>
                        <p className="text-xs truncate" style={{ color: "#999" }}>
                          {song.artistName}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reflection */}
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#2C2C3A" }}>
            Your reflection <span style={{ color: "#E8825C" }}>*</span>
          </label>
          <textarea
            required
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What does this song mean to you, or what does it remind you of?"
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
            style={{
              backgroundColor: "#EDE4DA",
              color: "#2C2C3A",
              border: "none",
            }}
          />
        </div>

        {/* Photo */}
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#2C2C3A" }}>
            Photo <span style={{ color: "#E8825C" }}>*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                type="button"
                onClick={() => {
                  setPhotoPreview(null);
                  setPhotoFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-2 right-2 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl flex flex-col items-center justify-center gap-2 py-10 transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#EDE4DA", border: "2px dashed #C8B8AC" }}
            >
              <span className="text-2xl">📷</span>
              <span className="text-sm font-medium" style={{ color: "#999" }}>
                Tap to add a photo
              </span>
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm font-medium" style={{ color: "#E53E3E" }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !name.trim() || !selectedSong || !reflection.trim() || !photoFile}
          className="w-full py-4 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#E8825C" }}
        >
          {submitting ? "Submitting…" : "Share Memory"}
        </button>
      </form>
    </div>
  );
}
