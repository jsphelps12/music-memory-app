import { describe, expect, it, vi } from "vitest";
import { EMPTY_SONG_LOOKUP, LIMITS, parseQuickCaptureBody, type SongLookup } from "../_shared/quickCapture";
import { type CaptureStore, saveBackgroundMoment } from "./save";

const NOW = Date.parse("2026-11-25T18:30:00Z");
const USER = "user-1";
const body = {
  appleMusicId: "1440831203",
  title: "Holocene",
  artist: "Bon Iver",
  capturedAt: "2026-11-25T18:29:58Z",
  utcOffsetMinutes: -420,
};
const FOUND: SongLookup = {
  ...EMPTY_SONG_LOOKUP,
  previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a",
  albumName: "Bon Iver, Bon Iver",
  artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg",
};

function input(patch: Record<string, unknown> = {}) {
  const r = parseQuickCaptureBody({ ...body, ...patch }, NOW);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

type Row = Record<string, unknown> & { id: string; created_at: string };

/** An in-memory moments table. `gate` lets a test pause a call to interleave two saves. */
function fakeStore(opts: { lookup?: SongLookup; gate?: Partial<Record<keyof CaptureStore, () => Promise<void>>> } = {}) {
  const rows: Row[] = [];
  let clock = NOW;
  let seq = 0;
  const pass = async (name: keyof CaptureStore) => opts.gate?.[name]?.();
  const lookupSong = vi.fn(async (_id: string, _country: string | null) => {
    await pass("lookupSong");
    return opts.lookup ?? FOUND;
  });
  const store: CaptureStore = {
    async countBackgroundSaves(userId, sinceIso) {
      await pass("countBackgroundSaves");
      return rows.filter((r) => r.user_id === userId && r.capture_source === "background" && r.created_at >= sinceIso).length;
    },
    async recentCaptures(userId, title, artist, sinceIso) {
      await pass("recentCaptures");
      return rows
        .filter(
          (r) =>
            r.user_id === userId &&
            r.capture_source === "background" &&
            r.song_title === title &&
            r.song_artist === artist &&
            r.created_at >= sinceIso
        )
        .map((r) => ({ id: r.id, song_title: String(r.song_title), song_artist: String(r.song_artist), created_at: r.created_at }));
    },
    async insertMoment(row) {
      await pass("insertMoment");
      clock += 5;
      const saved: Row = { ...row, id: `m${++seq}`, created_at: new Date(clock).toISOString() };
      rows.push(saved);
      return { id: saved.id, song_title: row.song_title, song_artist: row.song_artist, created_at: saved.created_at };
    },
    async updateLookup(momentId, userId, appleMusicId, columns) {
      await pass("updateLookup");
      const r = rows.find((x) => x.id === momentId && x.user_id === userId && x.song_apple_music_id === appleMusicId);
      if (r) Object.assign(r, columns);
    },
    async deleteMoment(momentId, userId) {
      await pass("deleteMoment");
      const i = rows.findIndex((x) => x.id === momentId && x.user_id === userId);
      if (i >= 0) rows.splice(i, 1);
    },
    lookupSong,
  };
  return { store, rows, lookupSong };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("saveBackgroundMoment", () => {
  it("inserts first, then fills in the lookup's details in the storefront sent", async () => {
    const { store, rows, lookupSong } = fakeStore();
    const out = await saveBackgroundMoment(store, USER, input({ country: "GB" }), NOW);
    expect(out).toEqual({ status: 200, body: { momentId: "m1", title: "Holocene", artist: "Bon Iver", duplicate: false } });
    expect(lookupSong).toHaveBeenCalledWith("1440831203", "gb");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: USER,
      song_artwork_url: FOUND.artworkUrl,
      song_preview_url: FOUND.previewUrl,
      song_album_name: "Bon Iver, Bon Iver",
      capture_source: "background",
    });
  });

  it("looks up without a country for build 20, which sends none", async () => {
    const { store, lookupSong } = fakeStore();
    await saveBackgroundMoment(store, USER, input(), NOW);
    expect(lookupSong).toHaveBeenCalledWith("1440831203", null);
  });

  it("a second fire during the first one's lookup gets the first moment back", async () => {
    const lookupStarted = deferred();
    const finishLookup = deferred();
    let first = true;
    const { store, rows } = fakeStore({
      gate: {
        lookupSong: async () => {
          if (!first) return;
          first = false;
          lookupStarted.resolve();
          await finishLookup.promise;
        },
      },
    });
    const a = saveBackgroundMoment(store, USER, input(), NOW);
    await lookupStarted.promise;
    const b = await saveBackgroundMoment(store, USER, input(), NOW + 300);
    finishLookup.resolve();
    expect(b.body).toEqual({ momentId: "m1", title: "Holocene", artist: "Bon Iver", duplicate: true });
    expect((await a).body).toMatchObject({ momentId: "m1", duplicate: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].song_artwork_url).toBe(FOUND.artworkUrl);
  });

  it("two saves that both pass the check before either inserts still leave one moment", async () => {
    // Both duplicate checks run before either insert.
    let checks = 0;
    const bothChecked = deferred();
    const { store, rows } = fakeStore({
      gate: {
        recentCaptures: async () => {
          if (++checks === 2) bothChecked.resolve();
        },
        insertMoment: () => bothChecked.promise,
      },
    });
    const [a, b] = await Promise.all([
      saveBackgroundMoment(store, USER, input(), NOW),
      saveBackgroundMoment(store, USER, input(), NOW),
    ]);
    expect(rows).toHaveLength(1);
    const outs = [a.body, b.body] as { momentId: string; duplicate: boolean }[];
    expect(outs.map((o) => o.duplicate).sort()).toEqual([false, true]);
    expect(outs[0].momentId).toBe(rows[0].id);
    expect(outs[1].momentId).toBe(rows[0].id);
  });

  it("the later copy removes itself even when the earlier save's re-check missed it", async () => {
    // A inserts and re-checks before B inserts; B's check ran before A's insert.
    const bChecked = deferred();
    const aDone = deferred();
    let calls = 0;
    const { store, rows } = fakeStore({
      gate: {
        recentCaptures: async () => {
          calls++;
          // 1: A's check, 2: B's check, 3: A's re-check, 4: B's re-check.
          if (calls === 2) bChecked.resolve();
        },
      },
    });
    const a = (async () => {
      const r = await saveBackgroundMoment(
        {
          ...store,
          insertMoment: async (row) => {
            await bChecked.promise;
            return store.insertMoment(row);
          },
        },
        USER,
        input(),
        NOW
      );
      aDone.resolve();
      return r;
    })();
    const b = saveBackgroundMoment(
      {
        ...store,
        insertMoment: async (row) => {
          await aDone.promise;
          return store.insertMoment(row);
        },
      },
      USER,
      input(),
      NOW
    );
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.body).toMatchObject({ momentId: "m1", duplicate: false });
    expect(rb.body).toMatchObject({ momentId: "m1", duplicate: true });
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("a different song, or the same one after the window, is a new moment", async () => {
    const { store, rows } = fakeStore();
    await saveBackgroundMoment(store, USER, input(), NOW);
    expect((await saveBackgroundMoment(store, USER, input({ title: "Perth" }), NOW)).body).toMatchObject({ duplicate: false });
    const later = NOW + LIMITS.duplicateWindowMs + 60_000;
    expect((await saveBackgroundMoment(store, USER, input(), later)).body).toMatchObject({ duplicate: false });
    expect(rows).toHaveLength(3);
  });

  it("refuses past the hourly limit before saving anything", async () => {
    const { store, rows } = fakeStore();
    for (let i = 0; i < LIMITS.savesPerHour; i++) await saveBackgroundMoment(store, USER, input({ title: `Song ${i}` }), NOW);
    const out = await saveBackgroundMoment(store, USER, input({ title: "One more" }), NOW);
    expect(out).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(rows).toHaveLength(LIMITS.savesPerHour);
  });

  it("keeps the moment when the lookup finds nothing or the update fails", async () => {
    const empty = fakeStore({ lookup: EMPTY_SONG_LOOKUP });
    const updateSpy = vi.spyOn(empty.store, "updateLookup");
    expect((await saveBackgroundMoment(empty.store, USER, input(), NOW)).status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(empty.rows[0].song_artwork_url).toBeNull();

    const failing = fakeStore();
    failing.store.updateLookup = async () => {
      throw new Error("network");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await saveBackgroundMoment(failing.store, USER, input(), NOW)).body).toMatchObject({ duplicate: false });
    expect(failing.rows).toHaveLength(1);
    err.mockRestore();
  });

  it("keeps the moment when the re-check fails", async () => {
    let calls = 0;
    const { store, rows } = fakeStore({
      gate: {
        recentCaptures: async () => {
          if (++calls === 2) throw new Error("timeout");
        },
      },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await saveBackgroundMoment(store, USER, input(), NOW)).body).toMatchObject({ momentId: "m1", duplicate: false });
    expect(rows).toHaveLength(1);
    err.mockRestore();
  });

  it("skips the lookup for a song outside the catalog", async () => {
    const { store, lookupSong } = fakeStore();
    await saveBackgroundMoment(store, USER, input({ appleMusicId: "0" }), NOW);
    expect(lookupSong).not.toHaveBeenCalled();
  });
});
