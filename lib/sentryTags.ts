/**
 * Sentry tags naming the JS bundle that is actually running, so an error can be
 * pinned to one OTA ("did the 3pm update cause this?") instead of to the binary.
 *
 * Pure: takes the subset of `expo-updates` it reads, so tests need no native
 * module. The Sentry SDK's ExpoContext integration also adds
 * `expo.updates.*` tags, but only when it can read the module and never with an
 * "embedded" marker; these short names are the ones to search and alert on.
 */
export type UpdatesInfo = {
  isEnabled?: boolean | null;
  isEmbeddedLaunch?: boolean | null;
  updateId?: string | null;
  channel?: string | null;
  runtimeVersion?: string | null;
  createdAt?: Date | null;
};

export type UpdateTags = {
  update_id: string;
  update_channel: string;
  runtime_version: string;
  update_created_at?: string;
};

export function updateTags(info: UpdatesInfo | null | undefined): UpdateTags {
  if (!info || !info.isEnabled) {
    // Dev builds, simulator builds without updates, or no native module.
    return { update_id: "disabled", update_channel: "none", runtime_version: "none" };
  }
  const tags: UpdateTags = {
    // The embedded bundle has an id too, but "embedded" reads at a glance as
    // "no OTA applied", which is the question being asked.
    update_id: info.isEmbeddedLaunch || !info.updateId ? "embedded" : info.updateId,
    update_channel: info.channel || "none",
    runtime_version: info.runtimeVersion || "none",
  };
  if (info.createdAt instanceof Date && !Number.isNaN(info.createdAt.getTime())) {
    tags.update_created_at = info.createdAt.toISOString();
  }
  return tags;
}

/**
 * True when the app bundle lives in a Simulator container
 * (`…/CoreSimulator/Devices/…`). Release builds run in the Simulator (Mac
 * preview builds, E2E runs) would otherwise report Mac sleep/wake hangs and
 * simulator-only stalls as if they were real devices. Unknown → false, so a
 * real device keeps reporting.
 */
export function isSimulatorBundle(bundleUri: string | null | undefined): boolean {
  return typeof bundleUri === "string" && bundleUri.includes("/CoreSimulator/Devices/");
}
