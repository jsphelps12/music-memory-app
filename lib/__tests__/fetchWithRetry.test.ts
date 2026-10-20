import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  requestTimeoutMs,
  shouldRetry520,
  AUTH_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from "../fetchWithRetry";

const BASE = "https://example.supabase.co";

describe("requestTimeoutMs", () => {
  it("bounds auth calls tightest", () => {
    expect(requestTimeoutMs(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST" })).toBe(
      AUTH_TIMEOUT_MS
    );
  });

  it("keeps the REST bound for reads and writes", () => {
    expect(requestTimeoutMs(`${BASE}/rest/v1/moments?select=*`)).toBe(REQUEST_TIMEOUT_MS);
    expect(requestTimeoutMs(`${BASE}/rest/v1/moments`, { method: "POST" })).toBe(REQUEST_TIMEOUT_MS);
  });

  it("gives storage uploads a longer bound, since the timer covers sending the body", () => {
    const url = `${BASE}/storage/v1/object/moment-photos/u1/a.jpg`;
    expect(requestTimeoutMs(url, { method: "POST" })).toBe(UPLOAD_TIMEOUT_MS);
    expect(requestTimeoutMs(url, { method: "put" })).toBe(UPLOAD_TIMEOUT_MS);
  });

  it("keeps the REST bound for storage deletes", () => {
    expect(requestTimeoutMs(`${BASE}/storage/v1/object/moment-photos`, { method: "DELETE" })).toBe(
      REQUEST_TIMEOUT_MS
    );
  });
});

describe("shouldRetry520", () => {
  it("retries reads", () => {
    expect(shouldRetry520()).toBe(true);
    expect(shouldRetry520({ method: "GET" })).toBe(true);
    expect(shouldRetry520({ method: "head" })).toBe(true);
  });

  it("never retries writes", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(shouldRetry520({ method })).toBe(false);
    }
  });
});

describe("fetchWithRetry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a GET that hits a 520, then returns the success", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 520 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const pending = fetchWithRetry(`${BASE}/rest/v1/moments`);
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a POST's 520 without resending it", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 520 }));

    const res = await fetchWithRetry(`${BASE}/rest/v1/moments`, { method: "POST", body: "{}" });

    expect(res.status).toBe(520);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after three attempts", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 520 }));

    const pending = fetchWithRetry(`${BASE}/rest/v1/moments`);
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.status).toBe(520);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not abort an upload at the REST bound", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise((resolve) => {
          signal = init?.signal ?? undefined;
          setTimeout(() => resolve(new Response("ok", { status: 200 })), REQUEST_TIMEOUT_MS + 5_000);
        })
    );

    const pending = fetchWithRetry(`${BASE}/storage/v1/object/moment-photos/u1/a.jpg`, {
      method: "POST",
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000);
    expect(signal?.aborted).toBe(false);
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
  });

  it("leaves a caller-supplied signal alone", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const controller = new AbortController();

    await fetchWithRetry(`${BASE}/rest/v1/moments`, { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
