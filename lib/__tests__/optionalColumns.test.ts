/**
 * The app can run before the song metadata migration is applied. A write
 * naming a missing column is retried once without the optional columns, and
 * nothing else is retried.
 */
import { describe, it, expect, vi } from "vitest";
import {
  MOMENT_OPTIONAL_COLUMNS,
  SONG_METADATA_OPTIONAL_COLUMNS,
  isCaptureSourceCheckError,
  isMissingColumnError,
  withoutColumns,
  writeWithOptionalColumns,
} from "../optionalColumns";

const PG_MISSING = { code: "42703", message: 'column "song_genre" of relation "moments" does not exist' };
const PGRST_MISSING = {
  code: "PGRST204",
  message: "Could not find the 'capture_source' column of 'moments' in the schema cache",
};

describe("isMissingColumnError", () => {
  it("recognises Postgres and PostgREST missing-column errors", () => {
    expect(isMissingColumnError(PG_MISSING)).toBe(true);
    expect(isMissingColumnError(PGRST_MISSING)).toBe(true);
    // By message alone, when a code didn't come through.
    expect(isMissingColumnError({ message: PG_MISSING.message })).toBe(true);
    expect(isMissingColumnError({ message: PGRST_MISSING.message })).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError("network")).toBe(false);
    expect(isMissingColumnError({ message: "network request failed" })).toBe(false);
    expect(isMissingColumnError({ code: "23514", message: "violates check constraint" })).toBe(false);
    expect(isMissingColumnError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

const SOURCE_CHECK = {
  code: "23514",
  message: 'new row for relation "moments" violates check constraint "moments_capture_source_check"',
};

describe("isCaptureSourceCheckError", () => {
  it("recognises only the capture_source CHECK", () => {
    expect(isCaptureSourceCheckError(SOURCE_CHECK)).toBe(true);
    expect(isCaptureSourceCheckError({ code: "23514", message: 'violates check constraint "moments_song_part_ms_check"' })).toBe(false);
    expect(isCaptureSourceCheckError({ message: SOURCE_CHECK.message })).toBe(false);
    expect(isCaptureSourceCheckError(PG_MISSING)).toBe(false);
    expect(isCaptureSourceCheckError(null)).toBe(false);
  });
});

describe("withoutColumns", () => {
  it("drops only the named columns", () => {
    expect(withoutColumns({ a: 1, song_genre: "Rock", capture_source: null }, SONG_METADATA_OPTIONAL_COLUMNS)).toEqual({
      a: 1,
    });
  });
});

describe("writeWithOptionalColumns", () => {
  const row = { id: "m1", song_title: "T", song_genre: "Rock", capture_source: "search" };

  it("writes once when it works", async () => {
    const write = vi.fn(async () => ({ data: { id: "m1" }, error: null }));
    const got = await writeWithOptionalColumns(row, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(row);
    expect(got).toEqual({ data: { id: "m1" }, error: null, droppedOptional: false });
  });

  it.each([
    ["Postgres", PG_MISSING],
    ["PostgREST", PGRST_MISSING],
  ])("retries once without the optional columns on a %s missing-column error", async (_n, error) => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error })
      .mockResolvedValueOnce({ data: { id: "m1" }, error: null });
    const got = await writeWithOptionalColumns(row, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: "m1", song_title: "T" });
    expect(got).toEqual({ data: { id: "m1" }, error: null, droppedOptional: true });
  });

  it("returns the retry's error when that fails too, without a third try", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: PG_MISSING })
      .mockResolvedValueOnce({ data: null, error: { message: "network" } });
    const got = await writeWithOptionalColumns(row, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(2);
    expect(got.error).toEqual({ message: "network" });
  });

  it("doesn't retry other errors", async () => {
    const write = vi.fn(async () => ({ data: null, error: { message: "network" } }));
    const got = await writeWithOptionalColumns(row, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(got.droppedOptional).toBe(false);
  });

  it("saves without capture_source when the database doesn't allow its value yet (a new way in, migration pending)", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: SOURCE_CHECK })
      .mockResolvedValueOnce({ data: { id: "m1" }, error: null });
    const got = await writeWithOptionalColumns({ ...row, capture_source: "your_day" }, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: "m1", song_title: "T", song_genre: "Rock" });
    expect(got).toEqual({ data: { id: "m1" }, error: null, droppedOptional: true });
  });

  it("after dropping capture_source, still drops missing columns, and never loops", async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: SOURCE_CHECK })
      .mockResolvedValueOnce({ data: null, error: PG_MISSING })
      .mockResolvedValueOnce({ data: null, error: SOURCE_CHECK });
    const got = await writeWithOptionalColumns({ ...row, capture_source: "your_day" }, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenLastCalledWith({ id: "m1", song_title: "T" });
    expect(got.error).toBe(SOURCE_CHECK);
  });

  it("doesn't retry when there is no optional column to drop", async () => {
    const write = vi.fn(async () => ({ data: null, error: PG_MISSING }));
    const got = await writeWithOptionalColumns({ id: "m1" }, SONG_METADATA_OPTIONAL_COLUMNS, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(got.error).toBe(PG_MISSING);
  });
});

describe("MOMENT_OPTIONAL_COLUMNS", () => {
  it("lets a save drop the voice columns on a database without them", () => {
    expect(MOMENT_OPTIONAL_COLUMNS).toEqual(expect.arrayContaining(["voice_path", "voice_duration_ms", "song_part_ms"]));
    for (const col of SONG_METADATA_OPTIONAL_COLUMNS) expect(MOMENT_OPTIONAL_COLUMNS).toContain(col);
  });
});
