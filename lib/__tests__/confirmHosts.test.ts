import { describe, expect, it, vi } from "vitest";
import { createConfirmHost, pickHost } from "../confirmHosts";

const h = (name: string, root: boolean, focused: boolean) => ({ name, root, focused });

describe("pickHost", () => {
  it("is undefined with no hosts", () => {
    expect(pickHost([])).toBeUndefined();
  });

  it("uses the root host when no screen has its own", () => {
    expect(pickHost([h("root", true, true)])?.name).toBe("root");
  });

  it("prefers a focused screen's host over the root, whatever the mount order", () => {
    // Cold start into a modal screen: its host mounts before the root's.
    expect(pickHost([h("detail", false, true), h("root", true, true)])?.name).toBe("detail");
    expect(pickHost([h("root", true, true), h("detail", false, true)])?.name).toBe("detail");
  });

  it("skips hosts on screens that aren't focused", () => {
    // Moment detail closed back to the tabs: an album screen's host further
    // down the stack must not answer.
    expect(pickHost([h("root", true, true), h("album", false, false)])?.name).toBe("root");
    // A screen pushed over the album, without a host of its own.
    expect(pickHost([h("root", true, true), h("album", false, false), h("detail", false, false)])?.name).toBe("root");
  });

  it("lets a sheet's host (mounted when the sheet opens) win over its screen's", () => {
    expect(pickHost([h("root", true, true), h("detail", false, true), h("share sheet", false, true)])?.name).toBe(
      "share sheet"
    );
  });

  it("falls back to the newest host if there's no root", () => {
    expect(pickHost([h("a", false, false), h("b", false, false)])?.name).toBe("b");
  });
});

describe("createConfirmHost", () => {
  it("shows the question and resolves with the answer", async () => {
    const show = vi.fn();
    const host = createConfirmHost<string>(show);
    const answer = host.present("Delete?");
    expect(show).toHaveBeenCalledWith("Delete?");
    expect(host.answer(true)).toBe(true);
    await expect(answer).resolves.toBe(true);
  });

  it("answers each question once", async () => {
    const host = createConfirmHost<string>(() => {});
    const answer = host.present("Q");
    host.answer(false);
    expect(host.answer(true)).toBe(false);
    await expect(answer).resolves.toBe(false);
  });

  it("answers an open question no when a new one replaces it", async () => {
    const host = createConfirmHost<string>(() => {});
    const first = host.present("first");
    const second = host.present("second");
    await expect(first).resolves.toBe(false);
    host.answer(true);
    await expect(second).resolves.toBe(true);
  });
});
