/**
 * Every Spotify failure must end in a sentence the user can act on, except a
 * deliberate cancel, which must end in silence. These pin both halves.
 */
import { describe, it, expect, vi } from "vitest";
import {
  SpotifyError,
  spotifyFailureOf,
  spotifyFailureFromStatus,
  spotifyFailureMessage,
  spotifySearchFallbackNotice,
  withTimeout,
  type SpotifyFailure,
} from "../providers/spotifyErrors";

const ALL: SpotifyFailure[] = ["cancelled", "unavailable", "not_registered", "signed_out", "network", "failed"];

describe("spotifyFailureFromStatus", () => {
  it("maps Web API statuses to failures", () => {
    expect(spotifyFailureFromStatus(401)).toBe("signed_out");
    expect(spotifyFailureFromStatus(403)).toBe("not_registered");
    expect(spotifyFailureFromStatus(429)).toBe("network");
    expect(spotifyFailureFromStatus(503)).toBe("network");
    expect(spotifyFailureFromStatus(400)).toBe("failed");
  });
});

describe("spotifyFailureOf", () => {
  it("reads the reason off a SpotifyError and treats anything else as failed", () => {
    expect(spotifyFailureOf(new SpotifyError("network"))).toBe("network");
    expect(spotifyFailureOf(new Error("boom"))).toBe("failed");
    expect(spotifyFailureOf(undefined)).toBe("failed");
  });
});

describe("spotifyFailureMessage", () => {
  it("stays silent on a deliberate cancel", () => {
    expect(spotifyFailureMessage("cancelled")).toBeNull();
  });

  it("has a message for every other failure", () => {
    for (const reason of ALL.filter((r) => r !== "cancelled")) {
      expect(spotifyFailureMessage(reason)).toBeTruthy();
    }
  });
});

describe("spotifySearchFallbackNotice", () => {
  it("always says the results are from Apple Music, and stays banner-sized", () => {
    for (const reason of ALL) {
      const notice = spotifySearchFallbackNotice(reason);
      expect(notice).toMatch(/Apple Music results/);
      expect(notice.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("withTimeout", () => {
  it("passes through a value that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("rejects with a network failure when the promise hangs", async () => {
    vi.useFakeTimers();
    const hung = withTimeout(new Promise(() => {}), 15_000);
    vi.advanceTimersByTime(15_000);
    await expect(hung).rejects.toMatchObject({ reason: "network" });
    vi.useRealTimers();
  });

  it("passes through the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new SpotifyError("failed")), 1000)).rejects.toMatchObject({
      reason: "failed",
    });
  });
});
