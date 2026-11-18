import { beforeEach, describe, expect, it, vi } from "vitest";

const linking = vi.hoisted(() => ({ canOpenURL: vi.fn(), openURL: vi.fn() }));
vi.mock("react-native", () => ({ Linking: linking }));

import { mailtoUrl, openMail } from "../mail";

describe("mailtoUrl", () => {
  it("is the bare address with no fields", () => {
    expect(mailtoUrl("a@b.co")).toBe("mailto:a@b.co");
  });

  it("encodes the subject and body", () => {
    expect(mailtoUrl("a@b.co", { subject: "Report: Song & more", body: "Line 1\nID: x" })).toBe(
      "mailto:a@b.co?subject=Report%3A%20Song%20%26%20more&body=Line%201%0AID%3A%20x"
    );
  });

  it("leaves out empty fields", () => {
    expect(mailtoUrl("a@b.co", { subject: "Soundtracks Feedback", body: "" })).toBe(
      "mailto:a@b.co?subject=Soundtracks%20Feedback"
    );
  });
});

describe("openMail", () => {
  beforeEach(() => {
    linking.canOpenURL.mockReset();
    linking.openURL.mockReset();
  });

  it("opens Mail when it can", async () => {
    linking.canOpenURL.mockResolvedValue(true);
    linking.openURL.mockResolvedValue(undefined);
    await expect(openMail("mailto:a@b.co")).resolves.toBe(true);
    expect(linking.openURL).toHaveBeenCalledWith("mailto:a@b.co");
  });

  it("answers false without trying when there's no mail app", async () => {
    linking.canOpenURL.mockResolvedValue(false);
    await expect(openMail("mailto:a@b.co")).resolves.toBe(false);
    expect(linking.openURL).not.toHaveBeenCalled();
  });

  it("answers false when opening fails", async () => {
    linking.canOpenURL.mockResolvedValue(true);
    linking.openURL.mockRejectedValue(new Error("no handler"));
    await expect(openMail("mailto:a@b.co")).resolves.toBe(false);
  });

  it("answers false when the check itself fails", async () => {
    linking.canOpenURL.mockRejectedValue(new Error("boom"));
    await expect(openMail("mailto:a@b.co")).resolves.toBe(false);
  });
});
