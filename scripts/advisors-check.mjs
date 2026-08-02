/**
 * Weekly advisors sweep (ops hardening): pull Supabase's security and
 * performance advisors for BOTH projects and fail the run when NEW security
 * findings appear — a red Monday run instead of findings quietly ageing in a
 * dashboard nobody opens.
 *
 * "New" means: a security lint at ERROR or WARN whose cache_key is not in
 * scripts/advisors-baseline.json — the accepted-risk register (deliberately
 * exposed SECURITY DEFINER RPCs and similar known decisions live there, so
 * the sweep gates on regressions, not on standing accepted state). Stale
 * baseline entries that no longer fire are reported as cleanup hints.
 * INFO-level security lints and all performance lints are printed but never
 * fail — performance advice is workload-dependent and belongs in a human's
 * judgement, not a gate.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/advisors-check.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECTS = [
  { name: "production", ref: "izfhbtipzuvinyacttin" },
  { name: "staging", ref: "bqyrpahvdukllasafdpv" },
];

const baselinePath = join(dirname(fileURLToPath(import.meta.url)), "advisors-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(1);
}

async function fetchAdvisors(ref, type) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`advisors/${type} for ${ref}: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.lints ?? [];
}

function describe(lint) {
  const detail = (lint.detail ?? "").replace(/\s+/g, " ").slice(0, 160);
  return `  [${lint.level}] ${lint.name ?? lint.title}: ${detail}`;
}

let failed = false;

for (const project of PROJECTS) {
  console.log(`\n── ${project.name} (${project.ref}) ──`);
  const accepted = new Set(baseline[project.name] ?? []);

  const security = await fetchAdvisors(project.ref, "security");
  const severe = security.filter((l) => l.level === "ERROR" || l.level === "WARN");
  const fresh = severe.filter((l) => !accepted.has(l.cache_key));
  const baselined = severe.filter((l) => accepted.has(l.cache_key));
  const info = security.filter((l) => l.level === "INFO");

  if (fresh.length > 0) {
    failed = true;
    console.error(`✗ ${fresh.length} NEW security finding(s) (not in advisors-baseline.json):`);
    for (const lint of fresh) {
      console.error(describe(lint));
      console.error(`      cache_key: ${lint.cache_key}`);
    }
  } else {
    console.log(`✓ no new security findings (${baselined.length} baselined accepted)`);
  }

  // A baseline entry that no longer fires is a fixed finding — prune it so
  // the fix can never regress silently.
  const firing = new Set(severe.map((l) => l.cache_key));
  const stale = [...accepted].filter((key) => !firing.has(key));
  if (stale.length > 0) {
    console.log(`ℹ ${stale.length} baseline entr(y/ies) no longer firing — prune from advisors-baseline.json:`);
    for (const key of stale) console.log(`    ${key}`);
  }
  if (info.length > 0) {
    console.log(`ℹ ${info.length} INFO-level security note(s):`);
    for (const lint of info) console.log(describe(lint));
  }

  const performance = await fetchAdvisors(project.ref, "performance");
  if (performance.length > 0) {
    console.log(`ℹ ${performance.length} performance note(s) (non-gating):`);
    for (const lint of performance.slice(0, 10)) console.log(describe(lint));
    if (performance.length > 10) console.log(`  … and ${performance.length - 10} more`);
  } else {
    console.log("✓ no performance notes");
  }
}

process.exit(failed ? 1 : 0);
