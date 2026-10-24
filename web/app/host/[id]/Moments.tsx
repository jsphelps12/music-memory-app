"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "@/components/share.module.css";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import h from "../host.module.css";

export type Moment = {
  id: string;
  guestName: string;
  words: string | null;
  title: string;
  artist: string;
  artworkUrl: string | null;
  photoUrl: string | null;
  hidden: boolean;
  time: string;
};

/**
 * The couple's view of every moment. Hiding is instant on screen and saved
 * in the background; if the save fails the moment flips back and says so.
 */
export function Moments({ moments }: { moments: Moment[] }) {
  const router = useRouter();
  // Local overrides on top of the server's list, keyed by id, so a refresh
  // from the server (new moments arriving) doesn't lose a pending toggle.
  const [hiddenOverride, setHiddenOverride] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHidden = (m: Moment) => hiddenOverride[m.id] ?? m.hidden;
  const hiddenCount = moments.filter(isHidden).length;
  const list = showHidden ? moments : moments.filter((m) => !isHidden(m));

  async function toggle(m: Moment) {
    const next = !isHidden(m);
    setHiddenOverride((o) => ({ ...o, [m.id]: next }));
    setError(null);
    const { data, error } = await getBrowserSupabase()
      .from("occasion_entries")
      .update({ hidden: next })
      .eq("id", m.id)
      .select("id");
    if (error || !data?.length) {
      setHiddenOverride((o) => ({ ...o, [m.id]: !next }));
      setError("That didn't save. Try again.");
      return;
    }
    // The count at the top comes from the server.
    router.refresh();
  }

  if (moments.length === 0) {
    return <p className={s.body}>Nothing yet. Share your link and the first songs will show up here.</p>;
  }

  return (
    <>
      {hiddenCount > 0 ? (
        <button type="button" className={s.quietButton} onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden}>
          {showHidden ? `Leave out hidden (${hiddenCount})` : `Show hidden (${hiddenCount})`}
        </button>
      ) : null}
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
      <ul className={h.moments}>
        {list.map((m) => (
          <li key={m.id} className={`${h.moment} ${isHidden(m) ? h.momentHidden : ""}`}>
            {m.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={h.momentPhoto} src={m.photoUrl} alt="" loading="lazy" />
            ) : null}
            <div className={h.momentSong}>
              {m.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.artworkUrl} alt="" width={44} height={44} loading="lazy" />
              ) : (
                <span className={h.artBlank} />
              )}
              <p className={`${s.resultText} ${s.oneLine}`}>
                <span className={s.song}>{m.title}</span> <span className={s.artist}>{m.artist}</span>
              </p>
            </div>
            {m.words ? <p className={h.momentWords}>{m.words}</p> : null}
            <div className={h.momentFoot}>
              <p className={s.meta}>
                {m.guestName} · {m.time}
                {isHidden(m) ? " · Hidden" : ""}
              </p>
              <button type="button" className={s.quietButton} onClick={() => toggle(m)}>
                {isHidden(m) ? "Show" : "Hide"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
