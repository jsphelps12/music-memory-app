import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("@/modules/now-playing", () => ({ getLibrarySongs: vi.fn(), libraryAccessStatus: vi.fn() }));

import { createSharedLoader, dropOnResume, LIBRARY_RESUME_GAP_MS } from "../libraryCache";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(ttlMs = 1000, keep?: (v: string) => boolean) {
  let t = 0;
  const pending: ReturnType<typeof deferred<string>>[] = [];
  const load = vi.fn(() => {
    const d = deferred<string>();
    pending.push(d);
    return d.promise;
  });
  const loader = createSharedLoader(load, { ttlMs, now: () => t, keep });
  return { loader, load, pending, setTime: (v: number) => (t = v) };
}

describe("createSharedLoader", () => {
  it("shares one read between callers asking at the same time", async () => {
    const { loader, load, pending } = setup();
    const a = loader.get();
    const b = loader.get();
    expect(load).toHaveBeenCalledTimes(1);
    pending[0].resolve("lib");
    expect(await a).toBe("lib");
    expect(await b).toBe("lib");
  });

  it("serves the copy until the TTL, then reads again", async () => {
    const { loader, load, pending, setTime } = setup(1000);
    const first = loader.get();
    pending[0].resolve("v1");
    await first;
    setTime(999);
    expect(await loader.get()).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
    setTime(1000);
    const again = loader.get();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve("v2");
    expect(await again).toBe("v2");
  });

  it("dates a read from when it started", async () => {
    const { loader, load, pending, setTime } = setup(1000);
    const first = loader.get();
    setTime(500); // the read took a while
    pending[0].resolve("v1");
    await first;
    setTime(1000);
    void loader.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reads again for a caller that needs a newer copy (freshSince)", async () => {
    const { loader, load, pending, setTime } = setup(60_000);
    const first = loader.get();
    pending[0].resolve("sunday");
    await first;
    setTime(100);
    expect(await loader.get({ freshSince: 0 })).toBe("sunday");
    const monday = loader.get({ freshSince: 50 });
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve("monday");
    expect(await monday).toBe("monday");
    expect(await loader.get()).toBe("monday");
  });

  it("doesn't share a read that started before freshSince", async () => {
    const { loader, load, pending, setTime } = setup(60_000);
    void loader.get();
    setTime(100);
    void loader.get({ freshSince: 50 });
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve("new");
    pending[0].resolve("old"); // the older read finishing last doesn't win
    await Promise.resolve();
    await Promise.resolve();
    expect(await loader.get()).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep a failed read", async () => {
    const { loader, load, pending } = setup();
    const a = loader.get();
    pending[0].reject(new Error("native"));
    await expect(a).rejects.toThrow("native");
    const b = loader.get();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve("ok");
    expect(await b).toBe("ok");
  });

  it("doesn't keep a value `keep` rejects (an empty library)", async () => {
    const { loader, load, pending } = setup(1000, (v) => v.length > 0);
    const a = loader.get();
    pending[0].resolve("");
    expect(await a).toBe("");
    void loader.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets the copy and a read in progress on invalidate", async () => {
    const { loader, load, pending } = setup();
    const a = loader.get();
    loader.invalidate();
    pending[0].resolve("stale");
    expect(await a).toBe("stale"); // its caller still gets an answer
    const b = loader.get();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve("fresh");
    expect(await b).toBe("fresh");
  });
});

describe("dropOnResume", () => {
  it("drops after a long time in the background", () => {
    expect(dropOnResume(1_000, 1_000 + LIBRARY_RESUME_GAP_MS)).toBe(true);
  });
  it("keeps it for a quick trip away", () => {
    expect(dropOnResume(1_000, 1_000 + 60_000)).toBe(false);
  });
  it("keeps it when the app never went to the background (Control Center, Face ID)", () => {
    expect(dropOnResume(null, 10 * LIBRARY_RESUME_GAP_MS)).toBe(false);
  });
});
