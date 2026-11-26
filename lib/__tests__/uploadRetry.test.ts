import { describe, it, expect, vi } from "vitest";
import { isTransientUploadError, isAlreadyExistsError, withUploadRetry } from "../uploadRetry";

const noSleep = async () => {};

describe("isTransientUploadError", () => {
  it("retries a lost connection and storage's own timeout (the Sentry cases)", () => {
    expect(isTransientUploadError({ name: "StorageUnknownError", message: "fetch failed: The network connection was lost." })).toBe(true);
    expect(isTransientUploadError({ name: "StorageApiError", message: "request timed out", status: 408 })).toBe(true);
  });

  it("retries rate limits and server errors", () => {
    expect(isTransientUploadError({ status: 429 })).toBe(true);
    expect(isTransientUploadError({ status: 503 })).toBe(true);
  });

  it("doesn't retry errors that will fail the same way again", () => {
    expect(isTransientUploadError({ message: "new row violates row-level security policy", status: 403 })).toBe(false);
    expect(isTransientUploadError({ message: "Duplicate", status: 400, statusCode: "409" })).toBe(false);
    expect(isTransientUploadError(null)).toBe(false);
  });

  it("doesn't retry our own two-minute abort", () => {
    expect(isTransientUploadError({ name: "AbortError", message: "Aborted" })).toBe(false);
  });
});

describe("isAlreadyExistsError", () => {
  it("recognises storage's duplicate answer", () => {
    expect(isAlreadyExistsError({ message: "The resource already exists", status: 400, statusCode: "409" })).toBe(true);
    expect(isAlreadyExistsError({ message: "Duplicate", status: 409 })).toBe(true);
    expect(isAlreadyExistsError({ message: "request timed out", status: 408 })).toBe(false);
  });
});

describe("withUploadRetry", () => {
  it("succeeds on a later attempt after transient failures", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ status: 408, message: "request timed out" })
      .mockResolvedValueOnce({ name: "StorageUnknownError", message: "fetch failed" })
      .mockResolvedValueOnce(null);
    await expect(withUploadRetry(attempt, [1, 1], noSleep)).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last retry with the last error", async () => {
    const attempt = vi.fn().mockResolvedValue({ status: 503, message: "unavailable" });
    await expect(withUploadRetry(attempt, [1, 1], noSleep)).rejects.toMatchObject({ status: 503 });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("fails at once on a permanent error", async () => {
    const attempt = vi.fn().mockResolvedValue({ status: 403, message: "forbidden" });
    await expect(withUploadRetry(attempt, [1, 1], noSleep)).rejects.toMatchObject({ status: 403 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("counts 'already exists' on a retry as done: the first attempt landed", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ name: "StorageUnknownError", message: "The network connection was lost." })
      .mockResolvedValueOnce({ message: "The resource already exists", status: 400, statusCode: "409" });
    await expect(withUploadRetry(attempt, [1, 1], noSleep)).resolves.toBeUndefined();
  });

  it("treats 'already exists' on the first attempt as a real error", async () => {
    const attempt = vi.fn().mockResolvedValue({ message: "The resource already exists", status: 400, statusCode: "409" });
    await expect(withUploadRetry(attempt, [1, 1], noSleep)).rejects.toMatchObject({ statusCode: "409" });
  });

  it("waits the given delays between attempts", async () => {
    const waits: number[] = [];
    const attempt = vi.fn().mockResolvedValue({ status: 500 });
    await expect(withUploadRetry(attempt, [10, 20], async (ms) => void waits.push(ms))).rejects.toBeTruthy();
    expect(waits).toEqual([10, 20]);
  });
});
