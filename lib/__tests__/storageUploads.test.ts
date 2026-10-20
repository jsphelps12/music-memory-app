/**
 * The upload half of lib/storage.ts: sizing, all-or-nothing photo uploads,
 * and versioned avatars. The native image and file modules are stubbed; what
 * is under test is which objects end up in (and get removed from) the bucket.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});

let uuidCounter = 0;
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(public uri: string) {}
    async arrayBuffer() {
      return new ArrayBuffer(1);
    }
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++uuidCounter}` }));

// One fake decode per manipulate() call, recorded so tests can count them.
const manipulated: string[] = [];
const resizes: unknown[] = [];
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: (uri: string) => {
      manipulated.push(uri);
      let size = { width: 4000, height: 3000 };
      let saves = 0;
      const ref = () => ({
        width: size.width,
        height: size.height,
        saveAsync: async () => ({ uri: `${uri}#${size.width}x${size.height}#${saves++}` }),
        release: () => {},
      });
      const context = {
        resize: (r: { width?: number; height?: number }) => {
          resizes.push(r);
          const scale = r.width ? r.width / size.width : r.height! / size.height;
          size = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
          return context;
        },
        renderAsync: async () => ref(),
        release: () => {},
      };
      return context;
    },
  },
}));

import {
  resizeToFit,
  mapSettledWithLimit,
  uploadMomentPhotos,
  uploadAvatar,
  avatarFullPathFor,
  avatarFullPath,
  isAvatarObjectName,
} from "../storage";

beforeEach(() => {
  sb.reset();
  manipulated.length = 0;
  resizes.length = 0;
  uuidCounter = 0;
  sb.storage.upload.mockImplementation(async () => ({ data: { path: "uploaded" }, error: null }));
});

describe("resizeToFit", () => {
  it("leaves an image that already fits alone", () => {
    expect(resizeToFit(1200, 800, 1920)).toBeNull();
    expect(resizeToFit(1920, 1920, 1920)).toBeNull();
  });

  it("scales by the long edge", () => {
    expect(resizeToFit(4000, 3000, 1920)).toEqual({ width: 1920 });
    expect(resizeToFit(3000, 4000, 1920)).toEqual({ height: 1920 });
  });
});

describe("mapSettledWithLimit", () => {
  it("never runs more than the limit at once and keeps order", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapSettledWithLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (n === 3) throw new Error("three");
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, "x", 40, 50]);
  });
});

describe("uploadMomentPhotos", () => {
  it("decodes each photo once and derives the thumbnail from the resized image", async () => {
    const out = await uploadMomentPhotos("u1", ["file:///a.jpg"]);

    expect(manipulated).toEqual(["file:///a.jpg"]);
    expect(resizes).toEqual([{ width: 1920 }, { width: 400 }]);
    expect(out.photoPaths).toEqual(["u1/uuid-1.jpg"]);
    expect(out.thumbnailPaths).toEqual(["u1/thumb_uuid-1.jpg"]);
  });

  it("removes every uploaded object when one photo fails, then rethrows", async () => {
    sb.storage.upload.mockImplementation(async (path: string) =>
      path.includes("uuid-2") && !path.includes("thumb_")
        ? { data: null, error: { message: "network" } }
        : { data: { path }, error: null }
    );

    await expect(uploadMomentPhotos("u1", ["a", "b", "c"])).rejects.toMatchObject({ message: "network" });
    // Let the fire-and-forget deletes run.
    await new Promise((r) => setTimeout(r, 0));

    const removed = sb.storage.remove.mock.calls.flatMap((c) => c[0] as string[]);
    const uploaded = sb.storage.upload.mock.calls
      .map((c) => c[0] as string)
      .filter((p) => p !== "u1/uuid-2.jpg");
    expect(new Set(removed)).toEqual(new Set(uploaded));
  });
});

describe("avatar paths", () => {
  it("pairs each avatar with its full-size companion", () => {
    expect(avatarFullPathFor("u1/avatar-123.jpg")).toBe("u1/avatar-123_full.jpg");
    expect(avatarFullPathFor("u1/avatar.jpg")).toBe("u1/avatar_full.jpg");
    expect(avatarFullPath("u1")).toBe("u1/avatar_full.jpg");
  });

  it("recognises only avatar objects", () => {
    for (const name of ["avatar.jpg", "avatar_full.jpg", "avatar-1.jpg", "avatar-1_full.jpg"]) {
      expect(isAvatarObjectName(name)).toBe(true);
    }
    for (const name of ["uuid.jpg", "thumb_avatar.jpg", "avatar-x.jpg", "collection_covers"]) {
      expect(isAvatarObjectName(name)).toBe(false);
    }
  });
});

describe("uploadAvatar", () => {
  it("writes a new path each time, so the URL changes", async () => {
    sb.queueData({ avatar_url: null });
    const first = await uploadAvatar("u1", "file:///a.jpg");
    await new Promise((r) => setTimeout(r, 2));
    sb.queueData({ avatar_url: first });
    const second = await uploadAvatar("u1", "file:///b.jpg");

    expect(first).toMatch(/^u1\/avatar-\d+\.jpg$/);
    expect(second).not.toBe(first);
    const paths = sb.storage.upload.mock.calls.map((c) => c[0]);
    expect(paths).toContain(avatarFullPathFor(second));
    for (const call of sb.storage.upload.mock.calls) {
      expect((call[2] as { upsert: boolean }).upsert).toBe(false);
    }
  });

  it("deletes old avatars but keeps the one the profile still points at", async () => {
    sb.queueData({ avatar_url: "u1/avatar-100.jpg" });
    sb.storage.list.mockResolvedValueOnce({
      data: [
        { name: "avatar.jpg" },
        { name: "avatar_full.jpg" },
        { name: "avatar-50.jpg" },
        { name: "avatar-50_full.jpg" },
        { name: "avatar-100.jpg" },
        { name: "avatar-100_full.jpg" },
        { name: "photo.jpg" },
      ],
      error: null,
    });

    const path = await uploadAvatar("u1", "file:///a.jpg");
    await new Promise((r) => setTimeout(r, 0));

    expect(sb.storage.remove).toHaveBeenCalledTimes(1);
    const removed = sb.storage.remove.mock.calls[0][0] as string[];
    expect(removed.sort()).toEqual(
      ["u1/avatar.jpg", "u1/avatar_full.jpg", "u1/avatar-50.jpg", "u1/avatar-50_full.jpg"].sort()
    );
    expect(removed).not.toContain(path);
  });

  it("deletes nothing when it can't tell which avatar is in use", async () => {
    sb.queueError("network");
    await uploadAvatar("u1", "file:///a.jpg");
    await new Promise((r) => setTimeout(r, 0));

    expect(sb.storage.list).not.toHaveBeenCalled();
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });
});
