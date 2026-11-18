import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, ROWS_PAGE_SIZE } from "../fetchAllRows";

const rows = (start: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: start + i }));

describe("fetchAllRows", () => {
  it("is one request when the first page is short", async () => {
    const page = vi.fn(async () => ({ data: rows(0, 3), error: null }));
    expect(await fetchAllRows(page)).toEqual(rows(0, 3));
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, ROWS_PAGE_SIZE - 1);
  });

  it("keeps paging past the 1000-row cap until a short page", async () => {
    const pages = [rows(0, 1000), rows(1000, 1000), rows(2000, 7)];
    const page = vi.fn(async () => ({ data: pages.shift()!, error: null }));
    const all = await fetchAllRows(page);
    expect(all).toHaveLength(2007);
    expect(all[2006]).toEqual({ id: 2006 });
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more after an exactly full page, and stops on the empty one", async () => {
    const pages = [rows(0, 2), []];
    const page = vi.fn(async () => ({ data: pages.shift()!, error: null }));
    expect(await fetchAllRows(page, 2)).toEqual(rows(0, 2));
    expect(page.mock.calls).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("treats null data as an empty page", async () => {
    expect(await fetchAllRows(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it("throws the error from any page", async () => {
    const err = { message: "boom" };
    const pages = [{ data: rows(0, 2), error: null }, { data: null, error: err }];
    await expect(fetchAllRows(async () => pages.shift()!, 2)).rejects.toBe(err);
  });
});
