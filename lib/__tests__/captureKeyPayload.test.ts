/**
 * The capture key item the app writes and the App Intent reads. The Swift
 * side repeats the keychain names, so this also checks they match.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  captureKeyRevokeBody,
  CAPTURE_KEY_ITEM,
  CAPTURE_KEYCHAIN_SERVICE,
  encodeStoredCaptureKey,
  KEY_ROTATE_AFTER_MS,
  parseStoredCaptureKey,
  QUICK_CAPTURE_BODY_FIELDS,
  storedKeyDueForRotation,
  storedKeyServes,
} from "../captureKeyPayload";
import { LIMITS as SERVER_LIMITS } from "../../supabase/functions/_shared/quickCapture";

const KEY = `stc_${"a".repeat(43)}`;
const ISSUED = Date.parse("2026-11-25T12:00:00Z");
const base = { key: KEY, userId: "user-1", url: "https://abc.supabase.co/", anonKey: "anon", issuedAt: ISSUED };

describe("stored capture key", () => {
  it("round-trips, without the URL's trailing slash", () => {
    const parsed = parseStoredCaptureKey(encodeStoredCaptureKey(base));
    expect(parsed).toEqual({
      v: 1,
      key: KEY,
      userId: "user-1",
      url: "https://abc.supabase.co",
      anonKey: "anon",
      issuedAt: ISSUED,
    });
  });

  it("refuses anything malformed", () => {
    expect(parseStoredCaptureKey(null)).toBeNull();
    expect(parseStoredCaptureKey("not json")).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ ...base, v: 2 }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, key: "stc_short" }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, userId: "" }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, url: "ftp://x" }))).toBeNull();
    expect(parseStoredCaptureKey(JSON.stringify({ v: 1, ...base, issuedAt: "yesterday" }))).toBeNull();
  });

  it("serves only the same user on the same project", () => {
    const stored = parseStoredCaptureKey(encodeStoredCaptureKey(base));
    expect(storedKeyServes(stored, "user-1", "https://abc.supabase.co")).toBe(true);
    expect(storedKeyServes(stored, "user-1", "https://abc.supabase.co/")).toBe(true);
    expect(storedKeyServes(stored, "user-2", "https://abc.supabase.co")).toBe(false);
    expect(storedKeyServes(stored, "user-1", "https://other.supabase.co")).toBe(false);
    expect(storedKeyServes(null, "user-1", "https://abc.supabase.co")).toBe(false);
  });

  it("is replaced after 30 days, well inside the server's 90-day limit", () => {
    const stored = parseStoredCaptureKey(encodeStoredCaptureKey(base))!;
    expect(storedKeyDueForRotation(stored, ISSUED + 1000)).toBe(false);
    expect(storedKeyDueForRotation(stored, ISSUED + KEY_ROTATE_AFTER_MS - 1)).toBe(false);
    expect(storedKeyDueForRotation(stored, ISSUED + KEY_ROTATE_AFTER_MS)).toBe(true);
    // Issued "in the future": the clock moved; replace it rather than trust it.
    expect(storedKeyDueForRotation(stored, ISSUED - 2 * 24 * 60 * 60 * 1000)).toBe(true);
    // A phone opened at least every two months never holds a refused key.
    expect(SERVER_LIMITS.keyMaxAgeMs - KEY_ROTATE_AFTER_MS).toBeGreaterThanOrEqual(60 * 24 * 60 * 60 * 1000);
  });

  it("revokes every device's key on a global sign-out, or only this install's", () => {
    // No deviceId: capture-key revokes all of the caller's keys.
    expect(captureKeyRevokeBody("all", "install-1")).toEqual({});
    expect(captureKeyRevokeBody("all", null)).toEqual({});
    expect(captureKeyRevokeBody("device", "install-1")).toEqual({ deviceId: "install-1" });
    // Never asked for a key here: nothing to revoke by device.
    expect(captureKeyRevokeBody("device", null)).toBeNull();
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

  it("sends the quick-capture body fields listed here, and no others", () => {
    const swift = readFileSync(
      path.resolve(__dirname, "../../plugins/remember-this-song/RememberThisSong.swift"),
      "utf8"
    );
    const save = swift.slice(swift.indexOf("static func save("), swift.indexOf("var request = URLRequest"));
    const sent = new Set(Array.from(save.matchAll(/^\s*"(\w+)":/gm), (m) => m[1]));
    for (const m of save.matchAll(/body\["(\w+)"\]/g)) sent.add(m[1]);
    expect([...sent].sort()).toEqual([...QUICK_CAPTURE_BODY_FIELDS].sort());
  });
});
