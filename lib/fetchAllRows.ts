// Read every row of a query, a page at a time.
//
// PostgREST caps one response at max_rows (1000, the Supabase default), and
// does it silently: a query without a range just stops at row 1000. Lists that
// need the whole set (the calendar, browse, the map, Year in review) page
// through it with this instead.

/** Matches PostgREST's default max_rows, so a full page means "maybe more". */
export const ROWS_PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Calls `page(from, to)` (inclusive bounds, as `.range()` takes them) until a
 * page comes back short, and returns the rows in order. The query must have a
 * stable order ending in a unique column (`id`), or pages can overlap or skip
 * rows. Throws the first error.
 *
 * A short page ends it, so the usual case (under 1000 rows) is one request.
 * That relies on `pageSize` not being above the server's max_rows.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = ROWS_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) rows.push(row);
    if (batch.length < pageSize) return rows;
    from += batch.length;
  }
}
