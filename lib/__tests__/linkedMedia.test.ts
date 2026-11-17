import { describe, expect, it } from "vitest";
import { alignRefs, displaySources, linkedCloudIds, needsFullUpload, refsColumn } from "../linkedMedia";

const ref = (cloudId: string, full = false) => ({ cloudId, kind: "photo" as const, full });

describe("alignRefs", () => {
  it("lines up with the photos, nulls where none", () => {
    expect(alignRefs([ref("a"), null], 3)).toEqual([ref("a"), null, null]);
    expect(alignRefs([], 2)).toEqual([null, null]);
    expect(alignRefs(null, 1)).toEqual([null]);
  });

  it("drops malformed entries", () => {
    expect(alignRefs([{ cloudId: 5 }, { kind: "photo" }, { cloudId: "x", kind: "gif" }], 3)).toEqual([null, null, null]);
    expect(alignRefs([{ cloudId: "x", kind: "video", durationMs: 9000 }], 1)).toEqual([
      { cloudId: "x", kind: "video", durationMs: 9000, full: false },
    ]);
  });
});

describe("columns and uploads", () => {
  it("keeps plain moments plain", () => {
    expect(refsColumn([null, null])).toEqual([]);
    expect(refsColumn([null, ref("a")])).toEqual([null, ref("a")]);
  });

  it("lists what to resolve and what a share must upload", () => {
    const refs = [ref("a"), null, ref("b", true)];
    expect(linkedCloudIds(refs)).toEqual(["a", "b"]);
    expect(needsFullUpload(refs)).toEqual([0]);
    expect(needsFullUpload(undefined)).toEqual([]);
  });
});

describe("displaySources", () => {
  it("shows the original from Photos when it's on this device", () => {
    const sources = displaySources(
      ["https://x/thumb_1.jpg", "https://x/2.jpg", "https://x/thumb_3.jpg"],
      [ref("a"), null, ref("missing")],
      { a: "LOCAL-A/L0/001" }
    );
    expect(sources.map((s) => [s.uri, s.fromLibrary])).toEqual([
      ["ph://LOCAL-A/L0/001", true],
      ["https://x/2.jpg", false],
      ["https://x/thumb_3.jpg", false],
    ]);
  });
});
