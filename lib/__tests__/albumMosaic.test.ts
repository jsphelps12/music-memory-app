import { describe, expect, it } from "vitest";
import { mosaicFace } from "../albumMosaic";

describe("mosaicFace", () => {
  it("is empty with no artwork", () => {
    expect(mosaicFace([])).toEqual({ kind: "empty" });
    expect(mosaicFace([null, "", undefined])).toEqual({ kind: "empty" });
  });
  it("shows one artwork full bleed", () => {
    expect(mosaicFace(["a"])).toEqual({ kind: "single", uri: "a" });
  });
  it("puts two on the diagonal", () => {
    expect(mosaicFace(["a", "b"])).toEqual({ kind: "grid", cells: ["a", "b", "b", "a"] });
  });
  it("fills three with the newest again", () => {
    expect(mosaicFace(["a", "b", "c"])).toEqual({ kind: "grid", cells: ["a", "b", "c", "a"] });
  });
  it("takes the first four", () => {
    expect(mosaicFace(["a", "b", "c", "d", "e"])).toEqual({ kind: "grid", cells: ["a", "b", "c", "d"] });
  });
  it("counts the same artwork once", () => {
    expect(mosaicFace(["a", "a", "b", "a"])).toEqual({ kind: "grid", cells: ["a", "b", "b", "a"] });
    expect(mosaicFace(["a", "a"])).toEqual({ kind: "single", uri: "a" });
  });
});
