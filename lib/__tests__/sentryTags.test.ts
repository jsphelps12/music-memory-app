import { describe, it, expect } from "vitest";
import { updateTags } from "../sentryTags";

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
