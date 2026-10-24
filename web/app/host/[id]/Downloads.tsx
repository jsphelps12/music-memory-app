"use client";

import { Zip, ZipPassThrough } from "fflate";
import { useEffect, useRef, useState } from "react";
import s from "@/components/share.module.css";
import h from "../host.module.css";
import { photosForZip } from "./downloadActions";

export type ZipPhoto = { url: string; name: string };

type State =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "done"; failed: number }
  | { kind: "error" };

// Photos fetched at once; enough to keep the connection busy, few enough
// that a phone isn't holding dozens in memory before they're zipped.
const AHEAD = 4;
// A photo that hasn't arrived by now counts as failed rather than stalling the zip.
const PHOTO_TIMEOUT_MS = 60_000;

/**
 * Every photo in one zip, made here in the browser from freshly signed URLs
 * (asked for on the tap), so no server holds the whole wedding in memory. JPEGs don't shrink,
 * so the zip stores them as they are. A photo that won't download is
 * skipped and counted, not silently lost.
 */
export function PhotoZip({ occasionId, slug, count }: { occasionId: string; slug: string; count: number }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Leaving the page mid-zip stops it, rather than dropping a file on whatever page comes next.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function download() {
    setState({ kind: "working", done: 0, total: count });
    try {
      const { photos, missing } = await photosForZip(occasionId);
      if (!photos.length) throw new Error("no photos to zip");
      // Pass-through entries zip synchronously: each push writes its chunks
      // straight into parts, and end() writes the directory.
      const parts: Uint8Array[] = [];
      let zipError: unknown = null;
      let ended = false;
      const zip = new Zip((err, chunk, final) => {
        if (err) zipError = err;
        else {
          parts.push(chunk);
          if (final) ended = true;
        }
      });
      const fetchOne = (p: ZipPhoto) =>
        fetch(p.url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) })
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => new Uint8Array(b))
          .catch(() => null);
      const queue = photos.slice(0, AHEAD).map(fetchOne);
      let failed = missing;
      for (let i = 0; i < photos.length; i++) {
        const bytes = await queue[i];
        if (!alive.current) return;
        if (i + AHEAD < photos.length) queue.push(fetchOne(photos[i + AHEAD]));
        if (bytes) {
          const file = new ZipPassThrough(photos[i].name);
          zip.add(file);
          file.push(bytes, true);
        } else failed += 1;
        setState({ kind: "working", done: i + 1, total: photos.length });
      }
      zip.end();
      if (zipError || !ended) throw zipError ?? new Error("zip did not finish");
      if (failed >= photos.length + missing) throw new Error("no photos downloaded");
      if (!alive.current) return;

      const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-photos.zip`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState({ kind: "done", failed });
    } catch {
      if (alive.current) setState({ kind: "error" });
    }
  }

  const busy = state.kind === "working";
  return (
    <div className={h.download}>
      <button type="button" className={`${s.button} ${h.inline}`} onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? (state.done ? `Zipping ${state.done} of ${state.total}…` : "Getting your photos…") : "Download every photo"}
      </button>
      <p className={s.meta} aria-live="polite">
        {state.kind === "done" && state.failed
          ? `${state.failed} ${state.failed === 1 ? "photo" : "photos"} didn't download. Try again to get them.`
          : state.kind === "error"
            ? "The zip didn't finish. Try again."
            : `${count} ${count === 1 ? "photo" : "photos"}, as a .zip, named by guest and song.`}
      </p>
    </div>
  );
}
