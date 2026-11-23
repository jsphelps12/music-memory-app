/**
 * Writes that include columns a database might not have yet. The app can
 * reach users (over the air) before a migration is applied in production, so
 * a write naming a new column must not fail the save: when the database says
 * the column doesn't exist, it is retried once without the optional columns.
 * Pure: the write itself is passed in. Importable from vitest.
 */

/** Columns added by 20261120120000_song_metadata.sql. Every write may drop them. */
export const SONG_METADATA_OPTIONAL_COLUMNS = [
  "song_genre",
  "song_release_date",
  "song_artist_id",
  "song_album_id",
  "song_duration_ms",
  "capture_source",
] as const;

/**
 * Every column a moment write may drop on a database that doesn't have it
 * yet: the song metadata above, and the part of the song
 * (20261123120000_song_part.sql).
 */
export const MOMENT_OPTIONAL_COLUMNS = [...SONG_METADATA_OPTIONAL_COLUMNS, "song_part_ms"] as const;

/**
 * Whether an error says a column doesn't exist: Postgres `42703`
 * (undefined_column) or PostgREST `PGRST204` ("Could not find the 'x' column
 * of 'moments' in the schema cache"). Either way nothing was written.
 */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42703" || code === "PGRST204") return true;
  if (typeof message !== "string") return false;
  return /column .* does not exist/i.test(message) || /could not find the .* column/i.test(message);
}

/** The row without the named columns. */
export function withoutColumns<T extends Record<string, unknown>>(row: T, columns: readonly string[]): Partial<T> {
  const drop = new Set(columns);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !drop.has(key))) as Partial<T>;
}

type WriteResult<D> = { data: D | null; error: unknown };

/**
 * Runs `write(row)`. If it fails because a column is missing and the row has
 * any of the `optional` columns, runs it once more without them. Returns the
 * last result, and whether the optional columns were dropped.
 */
export async function writeWithOptionalColumns<D>(
  row: Record<string, unknown>,
  optional: readonly string[],
  write: (row: Record<string, unknown>) => PromiseLike<WriteResult<D>>
): Promise<WriteResult<D> & { droppedOptional: boolean }> {
  const first = await write(row);
  if (!first.error || !isMissingColumnError(first.error)) return { ...first, droppedOptional: false };
  const fallback = withoutColumns(row, optional);
  if (Object.keys(fallback).length === Object.keys(row).length) return { ...first, droppedOptional: false };
  const second = await write(fallback);
  return { ...second, droppedOptional: true };
}
