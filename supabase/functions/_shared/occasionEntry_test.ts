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
  newEditToken,
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

Deno.test("edit tokens are random and hash to 64 hex", async () => {
  const a = newEditToken();
  const b = newEditToken();
  assert(a !== b);
  assert(/^[A-Za-z0-9_-]{43}$/.test(a));
  const h = await sha256Hex(a);
  assertEquals(h.length, 64);
  assert(sameHex(h, await sha256Hex(a)));
  assert(!sameHex(h, await sha256Hex(b)));
});

Deno.test("clientIp takes the first forwarded address", () => {
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
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
  assertEquals(rateLimitError({ device: 0, ip: 0, total: 0 }), null);
  assert(rateLimitError({ device: LIMITS.perDevicePerHour, ip: 0, total: 0 })?.includes("few minutes"));
  assert(rateLimitError({ device: 0, ip: LIMITS.perIpPerHour, total: 0 })?.includes("few minutes"));
  assertEquals(rateLimitError({ device: 0, ip: 0, total: LIMITS.perOccasionTotal }), "This guest book is full.");
});
