import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared by the link-preview images (opengraph-image.tsx files). Satori, which
// draws them, needs TTF/OTF/WOFF rather than the site's WOFF2, so the
// faces are kept here as WOFF (Google Fonts, OFL).

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  paper: "#FBF7F2",
  ink: "#23222B",
  graphite: "#5E5C66",
  umber: "#736A63",
  terracotta: "#D9693F",
  night: "#0E0B0A",
  nightText: "#F5F0EB",
  nightSoft: "#C9C0B9",
};

export async function ogFonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [serif, sans, sansMedium, reading] = await Promise.all([
    readFile(join(dir, "DMSerifDisplay-Regular.woff")),
    readFile(join(dir, "DMSans-Regular.woff")),
    readFile(join(dir, "DMSans-Medium.woff")),
    readFile(join(dir, "Newsreader-Regular.woff")),
  ]);
  return [
    { name: "Serif", data: serif, weight: 400 as const, style: "normal" as const },
    { name: "Sans", data: sans, weight: 400 as const, style: "normal" as const },
    { name: "Sans", data: sansMedium, weight: 500 as const, style: "normal" as const },
    // What a guest wrote is always in Newsreader (DESIGN.md).
    { name: "Reading", data: reading, weight: 400 as const, style: "normal" as const },
  ];
}

/** The record from the app icon: ink disc, terracotta label, the serif S. */
export function RecordMark({ size = 96, disc = OG.ink, letter = OG.paper }: { size?: number; disc?: string; letter?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: disc, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size,
          background: OG.terracotta,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: letter,
          fontFamily: "Serif",
          fontSize: size * 0.26,
          lineHeight: 1,
          paddingTop: size * 0.02,
        }}
      >
        S
      </div>
    </div>
  );
}

/** Long names step down so they stay on two lines. */
export function namesSize(names: string): number {
  return names.length > 34 ? 72 : names.length > 22 ? 88 : 104;
}
