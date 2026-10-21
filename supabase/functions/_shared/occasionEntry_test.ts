import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanAppleMusicId,
  cleanDeviceId,
  cleanEmail,
  cleanName,
  cleanSlug,
  cleanWords,
  clientIp,
  LIMITS,
  isEditToken,
  rateLimitError,
  sameHex,
  sha256Hex,
  sniffImage,
  songFromLookup,
} from "./occasionEntry.ts";

Deno.test("cleanName collapses whitespace and requires something", () => {
  assertEquals(cleanName("  Aunt   Linda "), { ok: true, value: "Aunt Linda" });
  assertEquals(cleanName("   ").ok, false);
  assertEquals(cleanName(undefined).ok, false);
  assertEquals(cleanName("x".repeat(LIMITS.nameMax + 1)).ok, false);
});

Deno.test("cleanWords keeps line breaks, empties to null, caps length", () => {
  assertEquals(cleanWords("  one\r\ntwo  \n"), { ok: true, value: "one\ntwo" });
  assertEquals(cleanWords(""), { ok: true, value: null });
  assertEquals(cleanWords(null), { ok: true, value: null });
  assertEquals(cleanWords("x".repeat(LIMITS.wordsMax + 1)).ok, false);
});

Deno.test("cleanEmail is optional and lowercased", () => {
  assertEquals(cleanEmail(" Mara@Example.com "), { ok: true, value: "mara@example.com" });
  assertEquals(cleanEmail(""), { ok: true, value: null });
  assertEquals(cleanEmail("not-an-email").ok, false);
});

Deno.test("ids and slugs reject junk", () => {
  assertEquals(cleanDeviceId("abc_DEF-1234"), "abc_DEF-1234");
  assertEquals(cleanDeviceId("<script>"), null);
  assertEquals(cleanAppleMusicId(1440833098), "1440833098");
  assertEquals(cleanAppleMusicId("12a"), null);
  assertEquals(cleanSlug("Sam-and-Priya"), "sam-and-priya");
  assertEquals(cleanSlug("sam--priya"), null);
  assertEquals(cleanSlug("../etc"), null);
});

Deno.test("sniffImage trusts bytes, not claims", () => {
  assertEquals(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assertEquals(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext, "png");
  assertEquals(
    sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.ext,
    "webp"
  );
  assertEquals(sniffImage(new TextEncoder().encode("<html>")), null);
});

Deno.test("edit tokens: 43 base64url chars, hashed to 64 hex", async () => {
  const token = "Qx0_".padEnd(43, "a");
  assert(isEditToken(token));
  assert(!isEditToken(token + "a"));
  assert(!isEditToken("short"));
  assert(!isEditToken("x".repeat(42) + "/"));
  const h = await sha256Hex(token);
  assertEquals(h.length, 64);
  assert(sameHex(h, await sha256Hex(token)));
  assert(!sameHex(h, await sha256Hex(token.replace("Q", "R"))));
});

Deno.test("clientIp prefers the edge's header and never the client's claim", () => {
  assertEquals(
    clientIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 203.0.113.7" })),
    "203.0.113.7"
  );
  // A spoofed leftmost entry is ignored; the rightmost was added by a proxy.
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" })), "198.51.100.9");
  assertEquals(clientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assertEquals(clientIp(new Headers()), null);
});

Deno.test("songFromLookup keeps only Apple's fields for the right track", () => {
  const json = {
    results: [
      { wrapperType: "collection", collectionName: "September (single)" },
      {
        kind: "song",
        trackId: 4433,
        trackName: "September",
        artistName: "Earth, Wind & Fire",
        collectionName: "The Best of Earth, Wind & Fire, Vol. 1",
        artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
        previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
      },
    ],
  };
  const song = songFromLookup(json, "4433");
  assertEquals(song?.title, "September");
  assertEquals(song?.artworkUrl, "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg");
  assertEquals(songFromLookup(json, "9999"), null);
  assertEquals(songFromLookup({ results: [{ kind: "song", trackId: 1, trackName: "x", artistName: "y", previewUrl: "http://insecure" }] }, "1")?.previewUrl, null);
  assertEquals(songFromLookup(null, "1"), null);
});

Deno.test("rateLimitError picks the right limit", () => {
  const zero = { device: 0, ip: 0, hour: 0, total: 0, allTotal: 0 };
  assertEquals(rateLimitError(zero), null);
  assert(rateLimitError({ ...zero, device: LIMITS.perDevicePerHour })?.includes("few minutes"));
  assert(rateLimitError({ ...zero, ip: LIMITS.perIpPerHour })?.includes("few minutes"));
  assert(rateLimitError({ ...zero, hour: LIMITS.perOccasionPerHour })?.includes("few minutes"));
  assertEquals(rateLimitError({ ...zero, total: LIMITS.perOccasionTotal }), "This guest book is full.");
  assertEquals(rateLimitError({ ...zero, allTotal: LIMITS.perOccasionHardTotal }), "This guest book is full.");
});
