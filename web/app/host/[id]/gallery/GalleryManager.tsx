"use client";
/* eslint-disable @next/next/no-img-element -- signed URLs that expire in an hour; the image optimizer would cache (and bill) each one. */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import s from "@/components/share.module.css";
import { compressImageSizes } from "@/lib/compressImage";
import { apartLabel, exifInstant, onTheNight, readExifTime, suggestMatches } from "@/lib/occasionGallery";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../../host.module.css";
import gm from "./gallery.module.css";

export type GalleryPhoto = { id: string; path: string; takenAt: string | null; thumbUrl: string | null };
export type GalleryEntry = {
  id: string;
  guestName: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  createdAt: string;
  when: string;
  galleryPhotoId: string | null;
};

const BUCKET = "occasion-photos";
// Big enough for a printed book page; the small copy is for grids.
const SIZES = [
  { maxDimension: 2800, quality: 0.86 },
  { maxDimension: 480, quality: 0.72 },
];
// Photos prepared and uploaded at once. Each decodes a full original, which
// can be well over 100MB on a phone.
const PARALLEL = 2;
// EXIF lives in the first segment (at most 64KB); no need to read the whole file.
const EXIF_BYTES = 256 * 1024;
// Fills saved at once by "Use all".
const FILL_PARALLEL = 6;
const CLOCK_SHIFTS = [-180, -120, -60, -30, 0, 30, 60, 120, 180];

type Upload = { done: number; total: number; failed: number; noTime: number } | null;
type Fill = "saved" | "gone" | "error";

export function GalleryManager({
  occasionId,
  eventDate,
  timeZone,
  photos,
  songOnly,
  filled,
  usedByHidden,
}: {
  occasionId: string;
  eventDate: string;
  timeZone: string;
  photos: GalleryPhoto[];
  songOnly: GalleryEntry[];
  filled: GalleryEntry[];
  usedByHidden: string[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload>(null);
  const [shift, setShift] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Actions stay disabled until the refreshed page arrives, so a second tap
  // can't act on rows that already changed.
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());
  const locked = !!busy || refreshing;
  const uploading = !!upload && upload.done < upload.total;

  // Leaving mid-upload would strand a half-added photo.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const inUse = useMemo(
    () => new Set([...filled.map((e) => e.galleryPhotoId).filter((x): x is string => !!x), ...usedByHidden]),
    [filled, usedByHidden]
  );
  const [nightEntries, laterEntries] = useMemo(() => {
    const night = songOnly.filter((e) => onTheNight(e.createdAt, eventDate, timeZone));
    return [night, songOnly.filter((e) => !night.includes(e))];
  }, [songOnly, eventDate, timeZone]);
  // Skipped moments are left out of matching, so their photo is free for others.
  const suggestions = useMemo(
    () =>
      suggestMatches(
        nightEntries.filter((e) => !skipped.has(e.id)).map((e) => ({ id: e.id, createdAt: e.createdAt })),
        photos.map((p) => ({ id: p.id, takenAt: p.takenAt })),
        { eventDate, timeZone, clockShiftMinutes: shift, taken: inUse }
      ),
    [nightEntries, skipped, photos, eventDate, timeZone, shift, inUse]
  );
  const ready = suggestions.filter((x) => x.photoId);
  const skippedEntries = nightEntries.filter((e) => skipped.has(e.id));
  const timed = photos.filter((p) => p.takenAt).length;
  const unsigned = photos.filter((p) => !p.thumbUrl).length;
  const photoTime = (p: GalleryPhoto) =>
    p.takenAt
      ? new Date(p.takenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
      : "with no time";

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    const supabase = getBrowserSupabase();
    const storage = supabase.storage.from(BUCKET);
    let done = 0;
    let failed = 0;
    let noTime = 0;
    setUpload({ done, total: files.length, failed, noTime });
    const one = async (file: File) => {
      try {
        // The time comes from the original; re-encoding drops EXIF.
        const exif = readExifTime(await file.slice(0, EXIF_BYTES).arrayBuffer());
        const taken = exif ? exifInstant(exif, timeZone) : null;
        const {
          files: [full, thumb],
          width,
          height,
        } = await compressImageSizes(file, SIZES);
        const name = crypto.randomUUID();
        const path = `${occasionId}/gallery/${name}.jpg`;
        const thumbPath = `${occasionId}/gallery/${name}_thumb.jpg`;
        const up1 = await storage.upload(path, full, { contentType: "image/jpeg", upsert: false });
        if (up1.error) throw up1.error;
        const up2 = await storage.upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false });
        if (up2.error) {
          await storage.remove([path]);
          throw up2.error;
        }
        const { error } = await supabase
          .from("occasion_gallery_photos")
          .insert({ occasion_id: occasionId, path, taken_at: taken?.toISOString() ?? null, width, height });
        if (error) {
          await storage.remove([path, thumbPath]);
          throw error;
        }
        if (!taken) noTime += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      setUpload({ done, total: files.length, failed, noTime });
    };
    const queue = [...files];
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) await one(f);
      })
    );
    refresh();
  }

  /** "gone": it already has a photo (the other partner, or a double tap). */
  async function fill(entryId: string, photoId: string): Promise<Fill> {
    const { data, error } = await getBrowserSupabase()
      .from("occasion_entries")
      .update({ photo_source: "gallery", gallery_photo_id: photoId })
      .eq("id", entryId)
      .is("photo_source", null)
      .select("id");
    if (error) return "error";
    return data?.length ? "saved" : "gone";
  }

  async function accept(entryId: string, photoId: string) {
    setBusy(entryId);
    setError(null);
    const result = await fill(entryId, photoId);
    setBusy(null);
    setPicking(null);
    if (result === "error") setError("That didn't save. Try again.");
    refresh();
  }

  async function acceptAll() {
    setBusy("all");
    setError(null);
    const queue = [...ready];
    let failed = 0;
    await Promise.all(
      Array.from({ length: Math.min(FILL_PARALLEL, queue.length) }, async () => {
        for (let x = queue.shift(); x; x = queue.shift()) if ((await fill(x.entryId, x.photoId!)) === "error") failed += 1;
      })
    );
    setBusy(null);
    if (failed) setError(`${failed} didn't save. Try those again.`);
    refresh();
  }

  async function unfill(entryId: string) {
    setBusy(entryId);
    setError(null);
    const { error } = await getBrowserSupabase()
      .from("occasion_entries")
      .update({ photo_source: null, gallery_photo_id: null })
      .eq("id", entryId)
      .eq("photo_source", "gallery");
    setBusy(null);
    if (error) setError("That didn't save. Try again.");
    refresh();
  }

  async function removePhoto(photo: GalleryPhoto) {
    setBusy(photo.id);
    setError(null);
    // The row first: its trigger hands any moment it filled back to song-only.
    const supabase = getBrowserSupabase();
    const { error } = await supabase.from("occasion_gallery_photos").delete().eq("id", photo.id);
    if (error) {
      setBusy(null);
      return setError("That didn't remove. Try again.");
    }
    const { error: fileError } = await supabase.storage
      .from(BUCKET)
      .remove([photo.path, photo.path.replace(/\.jpg$/, "_thumb.jpg")]);
    setBusy(null);
    if (fileError) {
      console.error("[gallery] photo removed but its files weren't:", fileError.message);
      setError("Removed from your gallery, but its file didn't delete. It's private, and goes if you delete the wedding.");
    }
    refresh();
  }

  const entryById = new Map([...songOnly, ...filled].map((e) => [e.id, e]));
  const pickerFor = (entryId: string, nearest: GalleryPhoto[]) => (
    <Picker photos={nearest} all={photos} inUse={inUse} label={photoTime} disabled={locked} onPick={(photo) => accept(entryId, photo.id)} />
  );

  return (
    <div className={gm.wrap}>
      <section className={h.panel} aria-labelledby="upload-title">
        <h2 id="upload-title" className={s.title}>
          {photos.length ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}` : "Add the gallery"}
        </h2>
        {photos.length ? (
          <p className={s.meta}>
            {timed === photos.length
              ? "Every one has the time it was taken."
              : `${timed} have the time they were taken; the rest can still be picked by hand.`}
          </p>
        ) : (
          <p className={s.body}>
            JPEGs straight from your photographer&rsquo;s gallery download work best: they keep the time each was taken.
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className={s.hidden}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void uploadFiles(files);
          }}
        />
        <button type="button" className={`${s.button} ${h.inline}`} onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? `Adding ${upload.done} of ${upload.total}…` : photos.length ? "Add more photos" : "Choose photos"}
        </button>
        {uploading ? <p className={s.meta}>Keep this page open until they&rsquo;re all added.</p> : null}
        {upload && !uploading ? (
          <p className={s.meta} aria-live="polite">
            Added {upload.total - upload.failed}.
            {upload.failed ? ` ${upload.failed} couldn't be read; try them as JPEGs.` : ""}
            {upload.noTime === 1 ? " 1 had no time in it, so it won't be suggested; you can still pick it by hand." : ""}
            {upload.noTime > 1
              ? ` ${upload.noTime} had no time in them, so they won't be suggested; you can still pick them by hand.`
              : ""}
          </p>
        ) : null}
        {unsigned ? <p className={s.meta}>Some previews didn&rsquo;t load. Refresh the page to see them.</p> : null}
      </section>

      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}

      {photos.length && nightEntries.length ? (
        <section className={h.section} aria-labelledby="suggest-title">
          <div className={h.sectionHead}>
            <h2 id="suggest-title" className={s.title}>
              Suggested photos
            </h2>
            {ready.length > 1 ? (
              <button type="button" className={s.quietButton} onClick={acceptAll} disabled={locked}>
                {busy === "all" ? "Saving…" : `Use all ${ready.length}`}
              </button>
            ) : null}
          </div>
          <label className={gm.clock}>
            <span className={s.meta}>Was the camera&rsquo;s clock off?</span>
            <select className={s.input} value={shift} onChange={(e) => setShift(Number(e.target.value))}>
              {CLOCK_SHIFTS.map((m) => (
                <option key={m} value={m}>
                  {m === 0
                    ? "No, it was right"
                    : `${m > 0 ? "Behind" : "Ahead"} by ${Math.abs(m) >= 60 ? `${Math.abs(m) / 60} hour${Math.abs(m) > 60 ? "s" : ""}` : `${Math.abs(m)} minutes`}`}
                </option>
              ))}
            </select>
          </label>
          {suggestions.length === 0 ? <p className={s.body}>That&rsquo;s every moment from the night.</p> : null}
          <ul className={gm.list}>
            {suggestions.map((x) => {
              const e = entryById.get(x.entryId)!;
              const p = x.photoId ? byId.get(x.photoId) : null;
              return (
                <li key={x.entryId} className={gm.row}>
                  <EntryLine entry={e} />
                  {p ? (
                    <div className={gm.match}>
                      <Thumb photo={p} large />
                      <p className={s.meta}>{apartLabel(x.minutesApart ?? 0)}</p>
                    </div>
                  ) : (
                    <p className={s.meta}>No photo was taken within 45 minutes. Pick one by hand, or leave it song-only.</p>
                  )}
                  <div className={h.actions}>
                    {p ? (
                      <button type="button" className={`${s.button} ${h.inline}`} onClick={() => accept(e.id, p.id)} disabled={locked}>
                        {busy === e.id ? "Saving…" : "Use this photo"}
                      </button>
                    ) : null}
                    <button type="button" className={s.quietButton} onClick={() => setPicking(picking === e.id ? null : e.id)}>
                      {picking === e.id ? "Close" : p ? "Another photo" : "Pick a photo"}
                    </button>
                    <button type="button" className={s.quietButton} onClick={() => setSkipped(new Set(skipped).add(e.id))}>
                      Leave it song-only
                    </button>
                  </div>
                  {picking === e.id
                    ? pickerFor(e.id, x.alternatives.map((id) => byId.get(id)).filter((p): p is GalleryPhoto => !!p))
                    : null}
                </li>
              );
            })}
          </ul>
          {skippedEntries.length ? (
            <div className={gm.skipped}>
              <p className={s.meta}>Left song-only: {skippedEntries.map((e) => e.title).join(", ")}.</p>
              <button type="button" className={s.quietButton} onClick={() => setSkipped(new Set())}>
                Undo
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {photos.length && laterEntries.length ? (
        <section className={h.section} aria-labelledby="later-title">
          <h2 id="later-title" className={s.title}>
            Added after the night
          </h2>
          <p className={s.meta}>These came in later, so their time says nothing about the photos. Pick one by hand if you like.</p>
          <ul className={gm.list}>
            {laterEntries.map((e) => (
              <li key={e.id} className={gm.row}>
                <EntryLine entry={e} />
                <div className={h.actions}>
                  <button type="button" className={s.quietButton} onClick={() => setPicking(picking === e.id ? null : e.id)}>
                    {picking === e.id ? "Close" : "Pick a photo"}
                  </button>
                </div>
                {picking === e.id ? pickerFor(e.id, photos) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filled.length ? (
        <section className={h.section} aria-labelledby="filled-title">
          <h2 id="filled-title" className={s.title}>
            Filled from your gallery
          </h2>
          <ul className={gm.list}>
            {filled.map((e) => {
              const p = e.galleryPhotoId ? byId.get(e.galleryPhotoId) : null;
              return (
                <li key={e.id} className={gm.rowCompact}>
                  {p ? <Thumb photo={p} /> : null}
                  {/* The photo stands in for the cover here. */}
                  <EntryLine entry={e} art={false} />
                  <button type="button" className={s.quietButton} onClick={() => unfill(e.id)} disabled={locked}>
                    {busy === e.id ? "…" : "Remove photo"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {photos.length ? (
        <section className={h.section} aria-labelledby="all-title">
          <h2 id="all-title" className={s.title}>
            Every photo
          </h2>
          <AllPhotos photos={photos} inUse={inUse} busy={busy} disabled={locked} label={photoTime} onRemove={removePhoto} />
        </section>
      ) : null}
    </div>
  );
}

function EntryLine({ entry, art = true }: { entry: GalleryEntry; art?: boolean }) {
  return (
    <div className={gm.entry}>
      {!art ? null : entry.artworkUrl ? <img className={gm.art} src={entry.artworkUrl} alt="" /> : <span className={gm.art} />}
      <p className={gm.entryText}>
        <span className={s.song}>{entry.title}</span> <span className={s.artist}>{entry.artist}</span>
        <span className={gm.by}>
          {entry.guestName} · {entry.when}
        </span>
      </p>
    </div>
  );
}

function Thumb({ photo, large = false }: { photo: GalleryPhoto; large?: boolean }) {
  return photo.thumbUrl ? (
    <img className={large ? gm.thumbLarge : gm.thumb} src={photo.thumbUrl} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className={large ? gm.thumbLarge : gm.thumb} />
  );
}

const PAGE = 48;

/** The nearest photos first, then the whole gallery a page at a time. Photos already used are marked. */
function Picker({
  photos,
  all,
  inUse,
  label,
  disabled,
  onPick,
}: {
  photos: GalleryPhoto[];
  all: GalleryPhoto[];
  inUse: Set<string>;
  label: (p: GalleryPhoto) => string;
  disabled: boolean;
  onPick: (p: GalleryPhoto) => void;
}) {
  const [showAll, setShowAll] = useState(photos === all);
  const [shown, setShown] = useState(PAGE);
  const list = showAll ? all.slice(0, shown) : photos;
  return (
    <div className={gm.picker}>
      <div className={gm.grid}>
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            className={gm.pick}
            onClick={() => onPick(p)}
            disabled={disabled}
            aria-label={`Use the photo taken ${label(p)}${inUse.has(p.id) ? " (already used for another moment)" : ""}`}
          >
            <Thumb photo={p} />
            {inUse.has(p.id) ? <span className={gm.used}>Used</span> : null}
          </button>
        ))}
      </div>
      {!showAll ? (
        <button type="button" className={s.quietButton} onClick={() => setShowAll(true)}>
          Show every photo
        </button>
      ) : shown < all.length ? (
        <button type="button" className={s.quietButton} onClick={() => setShown(shown + PAGE)}>
          Show more
        </button>
      ) : null}
    </div>
  );
}

function AllPhotos({
  photos,
  inUse,
  busy,
  disabled,
  label,
  onRemove,
}: {
  photos: GalleryPhoto[];
  inUse: Set<string>;
  busy: string | null;
  disabled: boolean;
  label: (p: GalleryPhoto) => string;
  onRemove: (p: GalleryPhoto) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <>
      <div className={gm.grid}>
        {photos.slice(0, shown).map((p) => (
          <figure key={p.id} className={gm.cell}>
            <Thumb photo={p} />
            {inUse.has(p.id) ? <span className={gm.used}>Used</span> : null}
            {confirming === p.id ? (
              <div className={gm.cellConfirm}>
                <button type="button" onClick={() => onRemove(p)} disabled={disabled}>
                  {busy === p.id ? "…" : inUse.has(p.id) ? "Remove (it's in use)" : "Remove"}
                </button>
                <button type="button" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={gm.cellRemove}
                onClick={() => setConfirming(p.id)}
                aria-label={`Remove the photo taken ${label(p)}`}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </figure>
        ))}
      </div>
      {shown < photos.length ? (
        <button type="button" className={s.quietButton} onClick={() => setShown(shown + PAGE)}>
          Show more ({photos.length - shown})
        </button>
      ) : null}
    </>
  );
}
