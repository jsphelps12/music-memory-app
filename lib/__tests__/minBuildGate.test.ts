/**
 * The min-build gate's one invariant is FAIL-OPEN: it may only block when it
 * has positive knowledge the build is below the floor. These tests pin the
 * pure comparison — every unparseable/missing input must mean "not below",
 * because a gate that bricks the app on a bad config value or a weird build
 * string is worse than no gate.
 */
import { describe, it, expect, vi } from "vitest";

// minBuildGate imports the supabase client and expo-application (both
// transitively react-native); the pure comparison touches neither.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("expo-application", () => ({ nativeBuildVersion: "23" }));

import { isBuildBelowMinimum } from "../minBuildGate";

describe("isBuildBelowMinimum", () => {
  it("blocks only when current < min", () => {
    expect(isBuildBelowMinimum("22", 23)).toBe(true);
    expect(isBuildBelowMinimum("23", 23)).toBe(false);
    expect(isBuildBelowMinimum("24", 23)).toBe(false);
  });

  it("accepts the jsonb value as number or numeric string", () => {
    expect(isBuildBelowMinimum("7", "8")).toBe(true);
    expect(isBuildBelowMinimum("8", "8")).toBe(false);
  });

  it("fails open on unparseable or missing inputs", () => {
    expect(isBuildBelowMinimum(null, 23)).toBe(false);
    expect(isBuildBelowMinimum(undefined, 23)).toBe(false);
    expect(isBuildBelowMinimum("", 23)).toBe(false);
    expect(isBuildBelowMinimum("abc", 23)).toBe(false);
    expect(isBuildBelowMinimum("22", null)).toBe(false);
    expect(isBuildBelowMinimum("22", "not-a-number")).toBe(false);
    expect(isBuildBelowMinimum("22", {})).toBe(false);
  });

  it("parses build strings with numeric prefixes the way iOS reports them", () => {
    // CFBundleVersion is a plain integer under EAS remote versioning, but a
    // "23.0"-style value must still compare sanely.
    expect(isBuildBelowMinimum("23.0", 24)).toBe(true);
    expect(isBuildBelowMinimum("23.0", 23)).toBe(false);
  });
});
