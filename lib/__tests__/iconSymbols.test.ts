/**
 * lib/iconSymbols.ts: every icon name the app uses must still exist in
 * Ionicons (Android, and the fallback), and its SF Symbol frame must stay in a
 * sane range. Symbol availability (iOS 15) is enforced by tsc via the type.
 */
import { describe, expect, it } from "vitest";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { ICON_SYMBOLS, symbolFor } from "@/lib/iconSymbols";

describe("ICON_SYMBOLS", () => {
  const entries = Object.entries(ICON_SYMBOLS);

  it("only names that Ionicons can draw", () => {
    const missing = entries.map(([name]) => name).filter((name) => !(name in glyphs));
    expect(missing).toEqual([]);
  });

  it("keeps each symbol's frame and nudge in range", () => {
    for (const [name, spec] of entries) {
      expect(spec.box, name).toBeGreaterThan(0.5);
      expect(spec.box, name).toBeLessThan(1.4);
      const nudge = spec as { x?: number; y?: number };
      expect(Math.abs(nudge.x ?? 0), name).toBeLessThan(0.1);
      expect(Math.abs(nudge.y ?? 0), name).toBeLessThan(0.1);
    }
  });

  it("returns undefined for unknown names, including prototype keys", () => {
    expect(symbolFor("not-an-icon")).toBeUndefined();
    expect(symbolFor("constructor")).toBeUndefined();
    expect(symbolFor("close")?.symbol).toBe("xmark");
  });
});
