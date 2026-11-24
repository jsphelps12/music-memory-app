/**
 * The capture key item the app writes and the App Intent reads. The Swift
 * side repeats the keychain names, so this also checks they match.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  CAPTURE_KEY_ITEM,
  CAPTURE_KEYCHAIN_SERVICE,
  encodeStoredCaptureKey,
  parseStoredCaptureKey,
  storedKeyServes,
} from "../captureKeyPayload";

const KEY = `stc_${"a".repeat(43)}`;
const base = { key: KEY, userId: "user-1", url: "https://abc.supabase.co/", anonKey: "anon" };

describe("stored capture key", () => {
  it("round-trips, without the URL's trailing slash", () => {
    const parsed = parseStoredCaptureKey(encodeStoredCaptureKey(base));
    expect(parsed).toEqual({ v: 1, key: KEY, userId: "user-1", url: "https://abc.supabase.co", anonKey: "anon" });
  });

  it("refuses anything malformed", () => {
    expect(parseStoredCaptureKey(null)).toBeNull();
    expect(parseStoredCaptureKey("not json")).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ ...base, v: 2 }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, key: "stc_short" }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, userId: "" }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, url: "ftp://x" }))).toBeNull();
  });

  it("serves only the same user on the same project", () => {
    const stored = parseStoredCaptureKey(encodeStoredCaptureKey(base));
    expect(storedKeyServes(stored, "user-1", "https://abc.supabase.co")).toBe(true);
    expect(storedKeyServes(stored, "user-1", "https://abc.supabase.co/")).toBe(true);
    expect(storedKeyServes(stored, "user-2", "https://abc.supabase.co")).toBe(false);
    expect(storedKeyServes(stored, "user-1", "https://other.supabase.co")).toBe(false);
    expect(storedKeyServes(null, "user-1", "https://abc.supabase.co")).toBe(false);
  });

  it("uses the keychain names the App Intent reads", () => {
    const swift = readFileSync(
      path.resolve(__dirname, "../../plugins/remember-this-song/RememberThisSong.swift"),
      "utf8"
    );
    // expo-secure-store appends ":no-auth" for items without Face ID.
    expect(swift).toContain(`"${CAPTURE_KEYCHAIN_SERVICE}:no-auth"`);
    expect(swift).toContain(`"${CAPTURE_KEY_ITEM}"`);
    // The JSON fields the intent decodes.
    for (const field of ["key", "url", "anonKey"]) expect(swift).toMatch(new RegExp(`let ${field}: String`));
  });
});
