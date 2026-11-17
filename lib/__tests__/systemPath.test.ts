import { describe, expect, it } from "vitest";
import { isShareIntentPath, routeForSystemPath } from "../systemPath";

describe("routeForSystemPath", () => {
  const share = "soundtracks-beta://dataUrl=soundtracks-betaShareKey?nonce=6F1C#weburl";

  it("recognizes the share extension's hand-off link", () => {
    expect(isShareIntentPath(share)).toBe(true);
    expect(isShareIntentPath("soundtracks://dataUrl=soundtracksShareKey#media")).toBe(true);
    expect(isShareIntentPath("/create?source=widget")).toBe(false);
  });

  it("starts on the Journal when a share launches the app", () => {
    expect(routeForSystemPath(share, true)).toBe("/");
  });

  it("stays put when a share arrives while the app is open", () => {
    expect(routeForSystemPath(share, false)).toBeNull();
  });

  it("passes every other link through", () => {
    expect(routeForSystemPath("soundtracks:///create?source=widget", true)).toBe(
      "soundtracks:///create?source=widget"
    );
    expect(routeForSystemPath("soundtracks://confirm?code=abc", false)).toBe("soundtracks://confirm?code=abc");
  });
});
