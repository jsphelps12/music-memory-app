import { describe, expect, it } from "vitest";
import { isQuietHour, localHour, socialDelivery } from "./socialPush";

describe("socialPush", () => {
  it("reads the hour in the recipient's own timezone", () => {
    const at = new Date("2026-07-15T03:00:00Z");
    expect(localHour(at, "UTC")).toBe(3);
    expect(localHour(at, "America/New_York")).toBe(23);
    expect(localHour(at, "Not/AZone")).toBe(3);
    expect(localHour(new Date("2026-07-15T00:30:00Z"), "UTC")).toBe(0);
  });

  it("is quiet from 10pm to before 8am", () => {
    expect([21, 22, 23, 0, 7, 8].map(isQuietHour)).toEqual([false, true, true, true, true, false]);
  });

  it("sends with sound by day, silently at night, and not at all when switched off", () => {
    const day = new Date("2026-07-15T15:00:00Z");
    const night = new Date("2026-07-15T23:30:00Z");
    const r = { push_token: "tok", timezone: "UTC" };
    expect(socialDelivery(r, day)).toEqual({ to: "tok", sound: "default" });
    expect(socialDelivery(r, night)).toEqual({ to: "tok", interruptionLevel: "passive" });
    expect(socialDelivery({ ...r, notif_quiet_hours: false }, night)).toEqual({ to: "tok", sound: "default" });
    expect(socialDelivery({ ...r, notif_social: false }, day)).toBeNull();
    expect(socialDelivery({ timezone: "UTC" }, day)).toBeNull();
  });
});
