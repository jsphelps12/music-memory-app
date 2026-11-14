/**
 * Slot math for drag-to-reorder in a strip of fixed-width tiles (the capture
 * screen's photo strip). Pure and worklet-safe: the drag runs these on the UI
 * thread, and the tests run them in node.
 */

/** A copy of `items` with the element at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  "worklet";
  const next = items.slice();
  if (from < 0 || from >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  const target = Math.max(0, Math.min(to, next.length));
  next.splice(target, 0, item);
  return next;
}

/**
 * The slot a tile picked up at `fromSlot` sits over after moving
 * `translationX` points, for tiles spaced `pitch` apart (tile width + gap).
 * It changes slot once its center crosses halfway into the neighbour, and
 * never leaves the strip.
 */
export function slotForDrag(
  fromSlot: number,
  translationX: number,
  pitch: number,
  count: number
): number {
  "worklet";
  if (count <= 0 || pitch <= 0) return 0;
  const raw = Math.round(fromSlot + translationX / pitch);
  return Math.max(0, Math.min(count - 1, raw));
}
