/**
 * Covers the pure URL-construction half of lib/storage.ts. The upload paths are
 * out of scope here — they're expo-file-system / expo-image-manipulator glue —
 * but URL construction is where the production bug actually lived: cards asked
 * storage for a `/render/image/` transform URL, which is a paid feature this
 * project doesn't have, so every request 403'd and every photo strip rendered
 * blank. Nothing about that needed a renderer to catch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// `../storage` is imported statically below, so its `@/lib/supabase` mock
// factory runs during hoisted import evaluation — before a plain
// `const sb = createSupabaseMock()` would have been initialised. vi.hoisted is
// the supported escape hatch: it is lifted above the imports along with the
// vi.mock calls that depend on it.
const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});

// `@/lib/supabase` and the expo-* native modules all fail to parse under
// vitest. Only the storage half of the client matters for these tests.
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

import {
  momentCardImageUrls,
  getPublicPhotoUrl,
  getPublicPhotoThumbnailUrl,
} from "../storage";

beforeEach(() => {
  sb.reset();
});

/** Minimum shape momentCardImageUrls needs off a Moment. */
function moment(photoUrls: string[], photoThumbnails: string[]) {
  return { photoUrls, photoThumbnails };
}

describe("momentCardImageUrls", () => {
  it("prefers thumbnails when the moment has them", () => {
    const urls = momentCardImageUrls(
      moment(["u1/a.jpg", "u1/b.jpg"], ["u1/thumb_a.jpg", "u1/thumb_b.jpg"])
    );

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("u1/thumb_a.jpg");
    expect(urls[1]).toContain("u1/thumb_b.jpg");
    expect(urls.join(" ")).not.toContain("u1/a.jpg");
  });

  it("falls back to full-size photos when the thumbnails array is empty", () => {
    // Moments created before thumbnails shipped have photo_thumbnails = []. If
    // this mapped over the empty array instead, their photo strips would render
    // nothing — a silent regression on the oldest, most-valued moments.
    const urls = momentCardImageUrls(moment(["u1/a.jpg", "u1/b.jpg"], []));

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("u1/a.jpg");
    expect(urls[1]).toContain("u1/b.jpg");
  });

  it("returns [] for a moment with no photos at all", () => {
    expect(momentCardImageUrls(moment([], []))).toEqual([]);
  });

  it("preserves photo order", () => {
    const urls = momentCardImageUrls(moment([], ["u1/t1.jpg", "u1/t2.jpg", "u1/t3.jpg"]));
    expect(urls.map((u) => u.split("/").pop())).toEqual(["t1.jpg", "t2.jpg", "t3.jpg"]);
  });

  it("never asks for a /render/image/ transform URL", () => {
    // THE BUG. `getPublicUrl(path, { transform })` returns a /render/image/ URL;
    // Supabase image transformation is not enabled on this project, so it 403s
    // — blank thumbnails in production for every user. The guard is twofold:
    // no transform argument is ever passed, and no returned URL is a transform
    // URL.
    const urls = [
      ...momentCardImageUrls(moment(["u1/a.jpg"], ["u1/thumb_a.jpg"])),
      ...momentCardImageUrls(moment(["u1/b.jpg"], [])),
    ];

    for (const url of urls) {
      expect(url).not.toContain("/render/image/");
      expect(url).toContain("/object/public/");
    }

    expect(sb.storage.getPublicUrl).toHaveBeenCalled();
    for (const call of sb.storage.getPublicUrl.mock.calls) {
      expect(call, `getPublicUrl called with a transform argument: ${JSON.stringify(call)}`)
        .toHaveLength(1);
    }
  });

  it("reads from the moment-photos bucket", () => {
    momentCardImageUrls(moment([], ["u1/thumb_a.jpg"]));
    expect(sb.storage.buckets).toContain("moment-photos");
  });
});

describe("getPublicPhotoUrl / getPublicPhotoThumbnailUrl", () => {
  it("builds a plain public object URL", () => {
    expect(getPublicPhotoUrl("u1/a.jpg")).toBe(
      `${sb.publicUrlBase}/moment-photos/u1/a.jpg`
    );
  });

  it("treats thumbnails as plain public objects — they are pre-resized at upload", () => {
    // Deliberately identical to getPublicPhotoUrl. The two functions exist to
    // name the intent at the call site, not because the URLs differ; if this
    // ever starts differing, it means someone reintroduced the transform.
    expect(getPublicPhotoThumbnailUrl("u1/thumb_a.jpg")).toBe(
      `${sb.publicUrlBase}/moment-photos/u1/thumb_a.jpg`
    );
    expect(sb.storage.getPublicUrl.mock.calls.every((c) => c.length === 1)).toBe(true);
  });
});
