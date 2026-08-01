#!/usr/bin/env node
/**
 * Applies pending repo migrations (supabase/migrations/*.sql) to both Supabase
 * projects via the Management API, recording each in
 * supabase_migrations.schema_migrations with the version FROM THE FILENAME —
 * the invariant that keeps remote history identical to the repo (see
 * docs/DEPLOY.md "Running migrations").
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/db-migrate.mjs          # apply
 *   SUPABASE_ACCESS_TOKEN=... node scripts/db-migrate.mjs --check  # drift check only
 *
 * --check exits 1 if either project's history diverges from the repo
 * (a remote version missing from the repo, or vice versa), applying nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECTS = [
  { name: "production", ref: "izfhbtipzuvinyacttin" },
  { name: "staging", ref: "bqyrpahvdukllasafdpv" },
];

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}
const CHECK_ONLY = process.argv.includes("--check");

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();
const repo = files.map((f) => ({
  version: f.slice(0, 14),
  name: f.slice(15).replace(/\.sql$/, ""),
  file: f,
}));

async function runSql(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

let failed = false;

for (const project of PROJECTS) {
  console.log(`\n── ${project.name} (${project.ref}) ──`);
  const rows = await runSql(
    project.ref,
    "select version, name from supabase_migrations.schema_migrations order by version"
  );
  const remote = new Map(rows.map((r) => [r.version, r.name]));

  // Drift: remote versions the repo doesn't have.
  const unknown = [...remote.keys()].filter((v) => !repo.some((m) => m.version === v));
  if (unknown.length > 0) {
    console.error(`✗ remote history has versions missing from the repo: ${unknown.join(", ")}`);
    failed = true;
    continue;
  }

  const pending = repo.filter((m) => !remote.has(m.version));
  if (pending.length === 0) {
    console.log("✓ in sync, nothing to apply");
    continue;
  }

  if (CHECK_ONLY) {
    console.error(`✗ ${pending.length} unapplied migration(s): ${pending.map((m) => m.file).join(", ")}`);
    failed = true;
    continue;
  }

  for (const m of pending) {
    const sql = readFileSync(join(migrationsDir, m.file), "utf8");
    console.log(`→ applying ${m.file}`);
    await runSql(project.ref, sql);
    await runSql(
      project.ref,
      `insert into supabase_migrations.schema_migrations (version, name) values ('${m.version}', '${m.name.replace(/'/g, "''")}')`
    );
    console.log(`✓ applied + recorded ${m.version}`);
  }
}

process.exit(failed ? 1 : 0);
