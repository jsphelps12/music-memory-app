/**
 * What an album's face shows when it has no cover photo
 * (components/AlbumMosaic.tsx), from its songs' artworks, newest first:
 * - none: an empty tile;
 * - one: that artwork, full bleed;
 * - two: a 2×2 grid with the pair on the diagonal (A B / B A);
 * - three: A B / C A;
 * - four or more: the first four.
 * The same artwork twice (a song in two moments) counts once.
 */
export type MosaicFace = { kind: "empty" } | { kind: "single"; uri: string } | { kind: "grid"; cells: [string, string, string, string] };

export function mosaicFace(artworks: readonly (string | null | undefined)[]): MosaicFace {
  const unique = [...new Set(artworks.filter((a): a is string => !!a))];
  const [a, b, c, d] = unique;
  if (!a) return { kind: "empty" };
  if (!b) return { kind: "single", uri: a };
  if (!c) return { kind: "grid", cells: [a, b, b, a] };
  if (!d) return { kind: "grid", cells: [a, b, c, a] };
  return { kind: "grid", cells: [a, b, c, d] };
}
