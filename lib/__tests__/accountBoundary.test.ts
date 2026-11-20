import { describe, expect, it } from "vitest";
import { isAccountBoundary, mayClearOnLeave } from "@/lib/accountBoundary";

describe("isAccountBoundary", () => {
  it("is a boundary when the owner signs out", () => {
    expect(isAccountBoundary("a", null)).toBe(true);
  });

  it("is a boundary when a different account signs in", () => {
    expect(isAccountBoundary("a", "b")).toBe(true);
  });

  it("is not a boundary on a token refresh for the same user", () => {
    expect(isAccountBoundary("a", "a")).toBe(false);
  });

  it("is not a boundary when nobody owned the cache (first sign-in, cold start)", () => {
    expect(isAccountBoundary(null, "a")).toBe(false);
    expect(isAccountBoundary(null, null)).toBe(false);
  });
});

describe("mayClearOnLeave", () => {
  it("clears when nobody owns the cache any more", () => {
    expect(mayClearOnLeave(null, "a")).toBe(true);
    expect(mayClearOnLeave(null, undefined)).toBe(true);
  });

  it("clears when the leaving user still owns it (listener suppressed)", () => {
    expect(mayClearOnLeave("a", "a")).toBe(true);
  });

  it("never clears once the next account owns it", () => {
    expect(mayClearOnLeave("b", "a")).toBe(false);
    expect(mayClearOnLeave("b", undefined)).toBe(false);
  });
});
