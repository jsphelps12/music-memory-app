import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bookMoment,
  canOpenBook,
  canShareMoments,
  chunks,
  isBookToken,
  isMomentSig,
  momentSig,
  photoPathFor,
  type BookEntryRow,
  type BookOccasion,
} from "./occasionBook.ts";

const TOKEN = "0123456789abcdef0123456789abcdef";

const occasion: BookOccasion = {
  id: "o1",
  names: "Sam & Priya",
  event_date: "2027-06-14",
  city: null,
  time_zone: "America/New_York",
  status: "revealed",
  share_book_with_guests: true,
  book_token: TOKEN,
};

const row: BookEntryRow = {
  id: "e1",
  guest_name: "Mara",
  words: null,
  song_apple_id: "1",
  song_title: "September",
  song_artist: "Earth, Wind & Fire",
  song_album: null,
  song_artwork_url: null,
  song_preview_url: null,
  photo_source: null,
  photo_path: null,
  gallery_photo_id: null,
  created_at: "2027-06-15T02:00:00Z",
};

Deno.test("book tokens are 32 lowercase hex", () => {
  assert(isBookToken(TOKEN));
  assert(!isBookToken(TOKEN.toUpperCase()));
  assert(!isBookToken(TOKEN.slice(1)));
  assert(!isBookToken(null));
});

Deno.test("a book opens only revealed, shared, with the right token", () => {
  assert(canOpenBook(occasion, TOKEN));
  assert(!canOpenBook(occasion, "f".repeat(32)));
  assert(!canOpenBook({ ...occasion, status: "curating" }, TOKEN));
  assert(!canOpenBook({ ...occasion, share_book_with_guests: false }, TOKEN));
});

Deno.test("photo paths come from the guest or the gallery", () => {
  const gallery = new Map([["g1", "o1/gallery/g1.jpg"]]);
  assertEquals(photoPathFor(row, gallery), null);
  assertEquals(photoPathFor({ ...row, photo_source: "guest", photo_path: "o1/entries/e1.jpg" }, gallery), "o1/entries/e1.jpg");
  assertEquals(photoPathFor({ ...row, photo_source: "gallery", gallery_photo_id: "g1" }, gallery), "o1/gallery/g1.jpg");
  assertEquals(photoPathFor({ ...row, photo_source: "gallery", gallery_photo_id: "missing" }, gallery), null);
});

Deno.test("a moment carries no storage paths", () => {
  const m = bookMoment({ ...row, photo_source: "guest", photo_path: "o1/entries/e1.jpg" }, "https://signed");
  assertEquals(m.photoUrl, "https://signed");
  assert(!JSON.stringify(m).includes("entries/e1.jpg"));
});

Deno.test("chunks", () => {
  assertEquals(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunks([], 3), []);
});

Deno.test("moment signatures match the web's (HMAC-SHA256, first 128 bits)", async () => {
  // Same vector as web/lib/__tests__/occasionBook.test.ts.
  assertEquals(await momentSig(TOKEN, "5a757ee6-203b-4d58-9dbd-44bdc33108ef"), "3caac8aa49ba8fed9347bb56c71eca01");
  assert(isMomentSig("3caac8aa49ba8fed9347bb56c71eca01"));
  assert(!isMomentSig(TOKEN + "0"));
  assert((await momentSig(TOKEN, "a")) !== (await momentSig(TOKEN, "b")));
});

Deno.test("moments are shareable only from a revealed, shared book", () => {
  assert(canShareMoments(occasion));
  assert(!canShareMoments({ ...occasion, share_book_with_guests: false }));
  assert(!canShareMoments({ ...occasion, status: "curating" }));
});
