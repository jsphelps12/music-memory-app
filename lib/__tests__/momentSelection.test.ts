/**
 * Select mode (Journal): the selection set, the bulk-run summary, and the
 * words it shows. The bulk delete keeps failures selected and reports how
 * many, so the summary is what decides what the person sees next.
 */
import { describe, it, expect } from "vitest";
import {
  albumAddNotice,
  bulkDeleteFailedTitle,
  planAlbumAdd,
  pruneSelection,
  runEach,
  selectionTitle,
  toggleSelected,
} from "../momentSelection";
import { DELETE_MOMENT_CONFIRM, DELETE_MOMENT_FAILED, deleteMomentsConfirm } from "../momentActions";

describe("toggleSelected", () => {
  it("adds and removes, never mutating the input", () => {
    const start = new Set(["a"]);
    const added = toggleSelected(start, "b");
    expect([...added]).toEqual(["a", "b"]);
    expect([...toggleSelected(added, "a")]).toEqual(["b"]);
    expect([...start]).toEqual(["a"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids no longer listed", () => {
    expect([...pruneSelection(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
  });

  it("returns the same set when nothing changed", () => {
    const s = new Set(["a"]);
    expect(pruneSelection(s, ["a", "b"])).toBe(s);
    const empty = new Set<string>();
    expect(pruneSelection(empty, [])).toBe(empty);
  });
});

describe("selectionTitle", () => {
  it("reads as a count once something is picked", () => {
    expect(selectionTitle(0)).toBe("Select moments");
    expect(selectionTitle(1)).toBe("1 selected");
    expect(selectionTitle(12)).toBe("12 selected");
  });
});

describe("runEach", () => {
  it("sorts ids by outcome in the order given, whether failure is returned or thrown", async () => {
    const res = await runEach(["a", "b", "c", "d"], async (id) => {
      if (id === "b") return { error: new Error("nope") };
      if (id === "d") throw new Error("boom");
      return { error: null };
    });
    expect(res.succeeded).toEqual(["a", "c"]);
    expect(res.failed).toEqual(["b", "d"]);
    expect((res.firstError as Error).message).toBe("nope");
  });

  it("runs every id, at most `concurrency` at once", async () => {
    let running = 0;
    let peak = 0;
    const ids = ["1", "2", "3", "4", "5", "6", "7"];
    const res = await runEach(
      ids,
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 1));
        running--;
      },
      3
    );
    expect(res.succeeded).toEqual(ids);
    expect(res.failed).toEqual([]);
    expect(res.firstError).toBeNull();
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles nothing to do", async () => {
    expect(await runEach([], async () => {})).toEqual({ succeeded: [], failed: [], firstError: null });
  });
});

describe("planAlbumAdd", () => {
  it("skips moments already in the album and duplicates", () => {
    expect(planAlbumAdd(["a", "b", "a", "c"], ["b"])).toEqual({ toAdd: ["a", "c"], skipped: ["b"] });
  });
});

describe("albumAddNotice", () => {
  it("says how many were added", () => {
    expect(albumAddNotice("Summer", 1, 0)).toBe("Added 1 moment to “Summer”");
    expect(albumAddNotice("Summer", 3, 2)).toBe("Added 3 moments to “Summer”");
  });

  it("says when there was nothing to add", () => {
    expect(albumAddNotice("Summer", 0, 1)).toBe("Already in “Summer”");
    expect(albumAddNotice("Summer", 0, 4)).toBe("All already in “Summer”");
  });
});

describe("bulk delete copy", () => {
  it("one moment uses the single delete's words", () => {
    expect(deleteMomentsConfirm(1)).toBe(DELETE_MOMENT_CONFIRM);
    expect(bulkDeleteFailedTitle(1, 1)).toBe(DELETE_MOMENT_FAILED);
  });

  it("several say how many", () => {
    expect(deleteMomentsConfirm(3)).toEqual({
      title: "Delete 3 moments?",
      message: "Their photos are deleted too. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    expect(bulkDeleteFailedTitle(2, 5)).toBe("Couldn't delete 2 of 5 moments");
    expect(bulkDeleteFailedTitle(3, 3)).toBe("Couldn't delete 3 moments");
  });
});
