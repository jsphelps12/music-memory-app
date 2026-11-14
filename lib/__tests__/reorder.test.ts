import { describe, expect, it } from "vitest";
import { moveItem, slotForDrag } from "@/lib/reorder";

describe("moveItem", () => {
  const items = ["a", "b", "c", "d"];

  it("moves an item later", () => {
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier", () => {
    expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns an equal copy for a no-op move", () => {
    const out = moveItem(items, 1, 1);
    expect(out).toEqual(items);
    expect(out).not.toBe(items);
  });

  it("clamps a target past either end", () => {
    expect(moveItem(items, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveItem(items, 2, -5)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores an out-of-range source", () => {
    expect(moveItem(items, 7, 0)).toEqual(items);
    expect(moveItem(items, -1, 0)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    moveItem(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("slotForDrag", () => {
  const pitch = 90;

  it("stays put until the tile is halfway into its neighbour", () => {
    expect(slotForDrag(1, 44, pitch, 4)).toBe(1);
    expect(slotForDrag(1, -44, pitch, 4)).toBe(1);
  });

  it("changes slot once past halfway", () => {
    expect(slotForDrag(1, 46, pitch, 4)).toBe(2);
    expect(slotForDrag(1, -46, pitch, 4)).toBe(0);
  });

  it("crosses several slots in one drag", () => {
    expect(slotForDrag(0, 3 * pitch, pitch, 5)).toBe(3);
  });

  it("never leaves the strip", () => {
    expect(slotForDrag(0, -500, pitch, 4)).toBe(0);
    expect(slotForDrag(3, 500, pitch, 4)).toBe(3);
  });

  it("handles degenerate input", () => {
    expect(slotForDrag(0, 10, pitch, 0)).toBe(0);
    expect(slotForDrag(2, 10, 0, 4)).toBe(0);
  });
});
