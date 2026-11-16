import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("@tanstack/react-query", () => ({ focusManager: { setEventListener: vi.fn() } }));

import { shouldRefreshOnResume } from "../appFocus";

const COOLDOWN = 30_000;

describe("shouldRefreshOnResume", () => {
  it("never refetches before the first load has happened", () => {
    expect(shouldRefreshOnResume(0, 1_000_000, COOLDOWN)).toBe(false);
    expect(shouldRefreshOnResume(0, 1_000_000, COOLDOWN, true)).toBe(false);
  });

  it("refetches after a long absence (the missing-moment bug)", () => {
    const lastFetch = 1_000_000;
    expect(shouldRefreshOnResume(lastFetch, lastFetch + 3 * 60 * 60 * 1000, COOLDOWN)).toBe(true);
  });

  it("skips a quick round trip inside the cooldown", () => {
    const lastFetch = 1_000_000;
    expect(shouldRefreshOnResume(lastFetch, lastFetch + 5_000, COOLDOWN)).toBe(false);
  });

  it("always refetches when something was marked stale", () => {
    const lastFetch = 1_000_000;
    expect(shouldRefreshOnResume(lastFetch, lastFetch + 5_000, COOLDOWN, true)).toBe(true);
  });

  it("refetches exactly at the cooldown boundary", () => {
    expect(shouldRefreshOnResume(1_000, 1_000 + COOLDOWN, COOLDOWN)).toBe(true);
  });
});
