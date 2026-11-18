import { describe, it, expect } from "vitest";
import { withLoadedPhotos } from "../capturePhotos";

describe("withLoadedPhotos", () => {
  it("adds photos that finished loading after Save was tapped, with their library ids", () => {
    const result = withLoadedPhotos(["file:///a.jpg"], { "file:///a.jpg": "A" }, [
      { uri: "file:///b.jpg", assetId: "B" },
    ]);
    expect(result.photos).toEqual(["file:///a.jpg", "file:///b.jpg"]);
    expect(result.assets).toEqual({ "file:///a.jpg": "A", "file:///b.jpg": "B" });
  });

  it("skips ones that couldn't load and doesn't add one twice", () => {
    const result = withLoadedPhotos(["file:///a.jpg"], {}, [null, { uri: "file:///a.jpg", assetId: "A" }]);
    expect(result.photos).toEqual(["file:///a.jpg"]);
  });

  it("leaves the form state alone", () => {
    const photos = ["file:///a.jpg"];
    const assets = {};
    withLoadedPhotos(photos, assets, [{ uri: "file:///b.jpg", assetId: "B" }]);
    expect(photos).toEqual(["file:///a.jpg"]);
    expect(assets).toEqual({});
  });
});
