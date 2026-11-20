import { describe, expect, it } from "vitest";
import { gateDecision } from "../fingerprint.mjs";

const build = (buildNumber, runtimeVersion) => ({ buildNumber, appVersion: "1.4.0", runtimeVersion });

describe("gateDecision", () => {
  it("publishes when any build serves the runtime version, not just the newest", () => {
    const builds = [build("12", "bbb"), build("11", "aaa")];
    const d = gateDecision({ runtimeVersion: "aaa", builds });
    expect(d).toMatchObject({ action: "publish", reason: "match" });
    expect(d.match.buildNumber).toBe("11");
  });

  it("publishes on a match whether or not skipping is allowed", () => {
    const d = gateDecision({ runtimeVersion: "aaa", builds: [build("11", "aaa")], skipIfUnserved: true });
    expect(d.action).toBe("publish");
  });

  it("fails with no matching build by default (production)", () => {
    expect(gateDecision({ runtimeVersion: "ccc", builds: [build("12", "bbb")] })).toMatchObject({
      action: "fail",
      reason: "no-match",
    });
    expect(gateDecision({ runtimeVersion: "ccc", builds: [] })).toMatchObject({
      action: "fail",
      reason: "no-builds",
    });
  });

  it("skips with no matching build when the caller opts in (preview)", () => {
    expect(
      gateDecision({ runtimeVersion: "ccc", builds: [build("12", "bbb")], skipIfUnserved: true })
    ).toMatchObject({ action: "skip", reason: "no-match", match: null });
    expect(gateDecision({ runtimeVersion: "ccc", builds: [], skipIfUnserved: true })).toMatchObject({
      action: "skip",
      reason: "no-builds",
    });
  });

  it("fails on a missing runtime version even when skipping is allowed", () => {
    for (const runtimeVersion of [undefined, null, ""]) {
      expect(
        gateDecision({ runtimeVersion, builds: [build("12", undefined)], skipIfUnserved: true })
      ).toMatchObject({ action: "fail", reason: "no-runtime" });
    }
  });
});
