import { describe, expect, it } from "vitest";
import { albumInviteCode, isShareIntentPath, parkedLinkAction, routeForSystemPath } from "../systemPath";

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

  it("sends album invite links to the join screen", () => {
    expect(routeForSystemPath("/c/AbC123", false)).toBe("/join?inviteCode=AbC123");
    expect(routeForSystemPath("https://soundtracks.app/c/AbC123", true)).toBe("/join?inviteCode=AbC123");
    expect(routeForSystemPath("https://www.soundtracks.app/c/AbC123/", true)).toBe("/join?inviteCode=AbC123");
    expect(albumInviteCode("/c/AbC123?utm=x")).toBe("AbC123");
    expect(albumInviteCode("/create")).toBeNull();
    expect(albumInviteCode("/m/abc")).toBeNull();
  });
});

describe("parkedLinkAction", () => {
  it("parks a friend or album link only when nobody is signed in", () => {
    expect(parkedLinkAction(false, false)).toBe("park");
    expect(parkedLinkAction(false, true)).toBe("skip");
  });

  it("waits for auth on a cold start instead of parking for a signed-in user", () => {
    expect(parkedLinkAction(true, false)).toBe("wait");
    // The session restored before the profile: already known to be signed in.
    expect(parkedLinkAction(true, true)).toBe("skip");
  });
});
