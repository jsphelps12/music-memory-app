import { describe, it, expect } from "vitest";
import { isSimulatorBundle, updateTags } from "../sentryTags";

describe("updateTags", () => {
  it("marks dev / disabled builds instead of throwing", () => {
    expect(updateTags(null)).toEqual({ update_id: "disabled", update_channel: "none", runtime_version: "none" });
    expect(updateTags({ isEnabled: false, updateId: "abc" }).update_id).toBe("disabled");
  });

  it("names the embedded bundle 'embedded'", () => {
    const tags = updateTags({
      isEnabled: true,
      isEmbeddedLaunch: true,
      updateId: "embedded-manifest-id",
      channel: "production",
      runtimeVersion: "fp123",
    });
    expect(tags.update_id).toBe("embedded");
    expect(tags.update_channel).toBe("production");
    expect(tags.runtime_version).toBe("fp123");
  });

  it("carries the OTA id and its publish time", () => {
    const tags = updateTags({
      isEnabled: true,
      isEmbeddedLaunch: false,
      updateId: "0193-ota",
      channel: "preview",
      runtimeVersion: "fp456",
      createdAt: new Date("2026-11-20T15:00:00Z"),
    });
    expect(tags).toEqual({
      update_id: "0193-ota",
      update_channel: "preview",
      runtime_version: "fp456",
      update_created_at: "2026-11-20T15:00:00.000Z",
    });
  });

  it("falls back when fields are missing", () => {
    const tags = updateTags({ isEnabled: true, createdAt: new Date("nope") });
    expect(tags).toEqual({ update_id: "embedded", update_channel: "none", runtime_version: "none" });
  });
});

describe("isSimulatorBundle", () => {
  it("spots a Simulator container", () => {
    expect(
      isSimulatorBundle(
        "file:///Users/me/Library/Developer/CoreSimulator/Devices/F60A67B0/data/Containers/Bundle/Application/D454ED9F/Soundtracksb.app/"
      )
    ).toBe(true);
  });

  it("treats a device bundle or an unknown path as a real device", () => {
    expect(isSimulatorBundle("file:///private/var/containers/Bundle/Application/ABC/Soundtracks.app/")).toBe(false);
    expect(isSimulatorBundle(null)).toBe(false);
    expect(isSimulatorBundle(undefined)).toBe(false);
  });
});
