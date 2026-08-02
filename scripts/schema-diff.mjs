/**
 * Prod-vs-staging schema diff (ops hardening): the db-migrate workflow keeps
 * migration HISTORY identical, but history parity says nothing about shape —
 * staging once silently missed three schema changes with an empty history.
 * This compares the actual public-schema shape of both projects and fails on
 * any difference.
 *
 * Compared: tables + columns (type, nullability, default), RLS policies
 * (name, command, roles, permissiveness), and function signatures. Values and
 * data are never read.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/schema-diff.mjs
 */

const PROD = { name: "production", ref: "izfhbtipzuvinyacttin" };
const STAGING = { name: "staging", ref: "bqyrpahvdukllasafdpv" };

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}

// One row per object, keyed deterministically, so the comparison is a
// dictionary diff instead of a text diff.
const INTROSPECTION_SQL = `
select 'column' as kind,
       table_name || '.' || column_name as key,
       data_type || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '-') as shape
from information_schema.columns
where table_schema = 'public'
union all
select 'policy' as kind,
       tablename || '.' || policyname as key,
       cmd || ' roles=' || array_to_string(roles, ',') || ' permissive=' || permissive as shape
from pg_policies
where schemaname = 'public'
union all
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as key,
       pg_get_function_result(p.oid) as shape
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by kind, key
`;

async function fetchShape(ref) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: INTROSPECTION_SQL }),
  });
  if (!res.ok) {
    throw new Error(`introspection for ${ref}: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return new Map(rows.map((r) => [`${r.kind} ${r.key}`, r.shape]));
}

const [prodShape, stagingShape] = await Promise.all([fetchShape(PROD.ref), fetchShape(STAGING.ref)]);

let failed = false;

for (const [key, shape] of prodShape) {
  if (!stagingShape.has(key)) {
    failed = true;
    console.error(`✗ missing in staging: ${key}`);
  } else if (stagingShape.get(key) !== shape) {
    failed = true;
    console.error(`✗ differs: ${key}\n    production: ${shape}\n    staging:    ${stagingShape.get(key)}`);
  }
}
for (const key of stagingShape.keys()) {
  if (!prodShape.has(key)) {
    failed = true;
    console.error(`✗ only in staging: ${key}`);
  }
}

if (!failed) {
  console.log(`✓ schemas match (${prodShape.size} objects compared)`);
}
process.exit(failed ? 1 : 0);
