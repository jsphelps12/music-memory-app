#!/usr/bin/env node
/**
 * Backfill song details (genre, release date, artist/album ids, length) for
 * moments saved before capture kept them (20261120120000_song_metadata.sql).
 *
 * Writes SQL for review; it never connects to Supabase and needs no key.
 *
 * 1. In the Supabase SQL editor (after the migration is applied), export:
 *      select id, song_apple_music_id
 *        from public.moments
 *       where song_apple_music_id is not null and song_genre is null;
 *    and save the rows as a JSON array: [{"id": "…", "song_apple_music_id": "…"}, …]
 * 2. node --no-warnings scripts/backfill-song-metadata.mjs rows.json backfill.sql
 *    (without the second argument the SQL goes to stdout; progress to stderr)
 * 3. Read backfill.sql, then run it in the SQL editor. Each statement only
 *    touches a row whose song_genre is still null, so a re-run is harmless.
 *
 * Looks ids up on the iTunes lookup API (/lookup?id=1,2,3), up to 150 per
 * request, with a pause between requests (the API allows roughly 20 a
 * minute). Songs the US store doesn't know come back empty and are skipped.
 * The field mapping is lib/songMetadata.ts, imported directly (Node 22.18+
 * strips its types).
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseItunesLookupResult } from "../lib/songMetadata.ts";

const BATCH_SIZE = 150;
const DELAY_MS = 3500;
const RETRY_DELAY_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPLE_ID = /^\d{1,20}$/;

const log = (...args) => console.error(...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A SQL string literal (standard_conforming_strings is on in Postgres). */
export function sqlString(value) {
  return `'${String(value).replaceAll(String.fromCharCode(0), "").replace(/'/g, "''")}'`;
}

/** The update for one moment, or null when the lookup gave nothing to set. */
export function updateStatement(momentId, lookup) {
  const sets = [];
  if (lookup.genre) sets.push(`song_genre = ${sqlString(lookup.genre)}`);
  if (lookup.releaseDate) sets.push(`song_release_date = ${sqlString(lookup.releaseDate)}::date`);
  if (lookup.artistId) sets.push(`song_artist_id = ${sqlString(lookup.artistId)}`);
  if (lookup.albumId) sets.push(`song_album_id = ${sqlString(lookup.albumId)}`);
  if (lookup.durationMs != null) sets.push(`song_duration_ms = ${Number(lookup.durationMs)}`);
  if (sets.length === 0) return null;
  return `update public.moments set ${sets.join(", ")} where id = ${sqlString(momentId)} and song_genre is null;`;
}

async function lookupBatch(ids) {
  const url = `https://itunes.apple.com/lookup?id=${ids.join(",")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const byId = new Map();
      for (const result of json.results ?? []) {
        if (result?.trackId) byId.set(String(result.trackId), parseItunesLookupResult(result));
      }
      return byId;
    }
    if ((res.status === 403 || res.status === 429) && attempt === 0) {
      log(`  rate limited (${res.status}); waiting ${RETRY_DELAY_MS / 1000}s`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    throw new Error(`lookup failed: HTTP ${res.status}`);
  }
  return new Map();
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    log("usage: node scripts/backfill-song-metadata.mjs <rows.json> [out.sql]");
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(rows)) throw new Error("input must be a JSON array of {id, song_apple_music_id}");

  // Apple id → moment ids (one song can sit under several moments).
  const momentsBySong = new Map();
  let skipped = 0;
  for (const row of rows) {
    const id = String(row?.id ?? "");
    const appleId = String(row?.song_apple_music_id ?? "").trim();
    if (!UUID.test(id) || !APPLE_ID.test(appleId)) {
      skipped++;
      continue;
    }
    if (!momentsBySong.has(appleId)) momentsBySong.set(appleId, []);
    momentsBySong.get(appleId).push(id);
  }
  if (skipped) log(`skipped ${skipped} row(s) without a valid id or Apple Music id`);

  const songIds = [...momentsBySong.keys()];
  const statements = [];
  let found = 0;
  for (let i = 0; i < songIds.length; i += BATCH_SIZE) {
    const batch = songIds.slice(i, i + BATCH_SIZE);
    log(`looking up ${i + 1}–${i + batch.length} of ${songIds.length}`);
    const results = await lookupBatch(batch);
    for (const appleId of batch) {
      const lookup = results.get(appleId);
      if (!lookup) continue;
      found++;
      for (const momentId of momentsBySong.get(appleId)) {
        const statement = updateStatement(momentId, lookup);
        if (statement) statements.push(statement);
      }
    }
    if (i + BATCH_SIZE < songIds.length) await sleep(DELAY_MS);
  }

  const sql = [
    `-- Song metadata backfill, generated ${new Date().toISOString()} by scripts/backfill-song-metadata.mjs`,
    `-- ${found} of ${songIds.length} songs found; ${statements.length} moment update(s). Review before running.`,
    "begin;",
    ...statements,
    "commit;",
    "",
  ].join("\n");

  if (outputPath) {
    fs.writeFileSync(outputPath, sql);
    log(`wrote ${statements.length} update(s) to ${outputPath}`);
  } else {
    process.stdout.write(sql);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    log(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
