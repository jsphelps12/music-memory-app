#!/usr/bin/env node
/**
 * Design lint: fails when app code reaches past the design system
 * (DESIGN.md, "Components") back to the old one. Run in CI as
 * `node scripts/design-lint.mjs`; deliberately not an npm script, because
 * package.json's scripts block feeds the native fingerprint.
 *
 * Escape hatches, each needing a reason in the comment:
 *   a line containing `design-lint-ignore: <reason>` (or the line above it)
 *   a file containing `design-lint-file-ignore: <reason>`
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components"];
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const RULES = [
  {
    id: "uppercase-label",
    why: "Labels are set in their own case (SectionLabel), never upper-cased.",
    re: /textTransform:\s*["']uppercase["']/,
  },
  {
    id: "pure-color",
    why: "No pure white/black: use theme tokens (paper, ink, night) or warm rgba over imagery.",
    re: /["'](#fff|#FFF|#ffffff|#FFFFFF|#000|#000000|white|black)["']/,
  },
  {
    id: "neutral-rgba",
    why: "Scrims and overlays are warm: theme.colors.scrim, or rgba(35,34,43,x) / rgba(14,11,10,x) over imagery.",
    re: /rgba\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*,/,
  },
  {
    id: "literal-font",
    why: "Fonts come from theme.fonts or theme.typography, not literal family strings.",
    re: /["'](DMSans_|DMSerifDisplay_|Newsreader_)\w*["']/,
  },
  {
    id: "system-font-weight",
    why: "fontWeight renders the system font; pick a DM Sans family (bodyMedium/bodySemibold/bodyBold).",
    re: /fontWeight:\s*(["']\d00["']|["']bold["']|theme\.fontWeight)/,
  },
  {
    id: "terracotta-fill",
    why: "Terracotta is a signal, not a fill. Buttons and chips are ink (Button, Chip).",
    re: /backgroundColor:\s*theme\.colors\.accent\b/,
  },
  {
    id: "glyph-icon",
    why: "Icons are the Icon component (SF Symbols), not text glyphs or emoji.",
    re: /(["'>]\s*[✕✓✔✖×]\s*["'<])|["']🎵["']/,
  },
  {
    id: "direct-icon-font",
    why: "Draw icons with components/Icon (SF Symbols on iOS); add new names to lib/iconSymbols.ts.",
    re: /from\s+["']@expo\/vector-icons/,
  },
  {
    id: "page-sheet",
    why: 'No presentation: "modal" page sheets (CLAUDE.md): a screen or a compact BottomSheet.',
    re: /presentation:\s*["']modal["']/,
  },
  {
    id: "replace-to-tabs",
    why: 'Use goHome(router) (lib/goHome.ts): replace("/(tabs)") over the tabs stacks a second tab navigator (blank Journal).',
    re: /\.replace\(\s*["'`]\/\(tabs\)/,
  },
  {
    id: "retired-accent",
    why: "#E8825C and #2C2C3A are the pre-2026-10 accent and ink.",
    re: /#E8825C|#2C2C3A/i,
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("design-lint-file-ignore:")) continue;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("design-lint-ignore:") || (lines[i - 1] ?? "").includes("design-lint-ignore:")) return;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        problems.push({ file: path.relative(ROOT, file), line: i + 1, rule, src: trimmed });
      }
    }
  });
}

// Tab screens share one header. A tab that restyles its ScreenHeader is how
// Journal and Albums drifted apart by 16pt (2026-11-20): the spacing lives in
// ScreenHeader and PaneSwitcher, not in each tab.
const TAB_HEADER_RULE = {
  id: "tab-header-style",
  why: "Tab screens use ScreenHeader as is: no style prop (spacing lives in ScreenHeader and PaneSwitcher).",
};
for (const file of files) {
  if (!file.includes(`${path.sep}(tabs)${path.sep}`)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("design-lint-file-ignore:")) continue;
  const re = /<ScreenHeader\b[\s\S]*?\/>/g;
  let m;
  while ((m = re.exec(text))) {
    // Only the header's own props: drop nested JSX (e.g. the right={...} slot).
    const own = m[0].replace(/\{[\s\S]*\}/g, "{}");
    if (/\sstyle=/.test(own)) {
      const line = text.slice(0, m.index).split("\n").length;
      problems.push({ file: path.relative(ROOT, file), line, rule: TAB_HEADER_RULE, src: "<ScreenHeader … style=…>" });
    }
  }
}

if (problems.length === 0) {
  console.log(`design-lint: ${files.length} files clean.`);
  process.exit(0);
}

const byRule = new Map();
for (const p of problems) byRule.set(p.rule.id, [...(byRule.get(p.rule.id) ?? []), p]);
for (const [id, list] of byRule) {
  console.log(`\n${id} (${list.length}): ${list[0].rule.why}`);
  for (const p of list) console.log(`  ${p.file}:${p.line}  ${p.src.slice(0, 110)}`);
}
console.log(`\ndesign-lint: ${problems.length} problem(s) in ${new Set(problems.map((p) => p.file)).size} file(s).`);
process.exit(1);
