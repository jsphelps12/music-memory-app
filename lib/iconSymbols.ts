// Type-only: sf-symbols-typescript ships with expo-symbols and lists every
// symbol by the SF Symbols release that added it.
import type { SFSymbols3_0 } from "sf-symbols-typescript";

/**
 * How an Ionicons-style icon name is drawn as an SF Symbol on iOS
 * (components/Icon). Call sites keep the Ionicons names they always used;
 * Android still draws the Ionicons glyph.
 *
 * - `symbol`: outline Ionicons map to the plain symbol, filled ones to
 *   `.fill`. Typed as SF Symbols 3.0, so every name exists on iOS 15, at or
 *   below the app's deployment target (15.1); tsc rejects anything newer.
 * - `box`: the symbol's frame as a share of the icon's size. SymbolView
 *   stretches the symbol to fill its frame, so without this a plus or an
 *   xmark would draw much bigger than the Ionicons glyph it replaces. The
 *   numbers are measured (the Ionicons glyph's ink against the symbol's ink
 *   inside its image) so each symbol covers the same area as the old glyph.
 * - `x`, `y`: a nudge, as a share of size, where the symbol's ink sits off
 *   centre in its image (chevrons, play, share), so it centres in its box
 *   the way the Ionicons glyph did.
 */
type SymbolSpec = { symbol: SFSymbols3_0; box: number; x?: number; y?: number };

export const ICON_SYMBOLS = {
  add: { symbol: "plus", box: 0.81 },
  "albums-outline": { symbol: "rectangle.stack", box: 1.01, y: 0.03 },
  "alert-circle-outline": { symbol: "exclamationmark.circle", box: 0.96 },
  "apps-outline": { symbol: "square.grid.2x2", box: 1.03 },
  at: { symbol: "at", box: 0.88 },
  book: { symbol: "book.fill", box: 1.13, y: -0.02 },
  "book-outline": { symbol: "book", box: 1.14 },
  "calendar-outline": { symbol: "calendar", box: 1.09 },
  checkmark: { symbol: "checkmark", box: 0.89 },
  "checkmark-circle": { symbol: "checkmark.circle.fill", box: 0.96 },
  "chevron-back": { symbol: "chevron.left", box: 0.8, x: 0.05 },
  "chevron-down": { symbol: "chevron.down", box: 0.84 },
  "chevron-forward": { symbol: "chevron.right", box: 0.8, x: -0.05 },
  "chevron-up": { symbol: "chevron.up", box: 0.84 },
  close: { symbol: "xmark", box: 0.7 },
  "close-circle": { symbol: "xmark.circle.fill", box: 0.96 },
  "cloud-offline-outline": { symbol: "icloud.slash", box: 1.15, y: 0.02 },
  "copy-outline": { symbol: "doc.on.doc", box: 1.0 },
  "ear-outline": { symbol: "ear", box: 1.11, x: -0.01 },
  "ellipsis-horizontal": { symbol: "ellipsis", box: 0.99 },
  "expand-outline": { symbol: "arrow.up.left.and.arrow.down.right", box: 0.94 },
  "eye-outline": { symbol: "eye", box: 1.07 },
  "eye-off-outline": { symbol: "eye.slash", box: 1.07 },
  "flag-outline": { symbol: "flag", box: 1.04, x: -0.02 },
  "happy-outline": { symbol: "face.smiling", box: 1.03 },
  "image-outline": { symbol: "photo", box: 1.06 },
  "journal-outline": { symbol: "book.closed", box: 1.02 },
  "link-outline": { symbol: "link", box: 1.08 },
  "list-outline": { symbol: "list.bullet", box: 1.01 },
  "location-outline": { symbol: "mappin.and.ellipse", box: 1.05 },
  "lock-closed-outline": { symbol: "lock", box: 1.11 },
  "mail-outline": { symbol: "envelope", box: 1.05 },
  "map-outline": { symbol: "map", box: 1.08 },
  "musical-note": { symbol: "music.note", box: 1.04 },
  "musical-note-outline": { symbol: "music.note", box: 1.04 },
  "musical-notes": { symbol: "music.note", box: 1.04 },
  "musical-notes-outline": { symbol: "music.note", box: 1.04 },
  "navigate-outline": { symbol: "location", box: 1.01, x: 0.03 },
  "notifications-off-outline": { symbol: "bell.slash", box: 1.09, x: -0.01 },
  "notifications-outline": { symbol: "bell", box: 1.03 },
  "paper-plane-outline": { symbol: "paperplane", box: 1.03, x: 0.02 },
  pause: { symbol: "pause.fill", box: 0.84 },
  "pencil-outline": { symbol: "pencil", box: 1.04 },
  "people-outline": { symbol: "person.2", box: 1.11, y: 0.02 },
  person: { symbol: "person.fill", box: 1.08 },
  "person-outline": { symbol: "person", box: 1.08 },
  "person-add-outline": { symbol: "person.badge.plus", box: 1.12, x: -0.02, y: 0.02 },
  "person-remove-outline": { symbol: "person.badge.minus", box: 1.11, x: -0.02, y: 0.02 },
  play: { symbol: "play.fill", box: 0.88, x: -0.04 },
  "play-circle": { symbol: "play.circle.fill", box: 0.96 },
  pulse: { symbol: "waveform", box: 1.04 },
  "remove-circle-outline": { symbol: "minus.circle", box: 0.96 },
  search: { symbol: "magnifyingglass", box: 1.0 },
  "search-outline": { symbol: "magnifyingglass", box: 1.0 },
  "settings-outline": { symbol: "gearshape", box: 1.05 },
  "share-outline": { symbol: "square.and.arrow.up", box: 1.08, y: -0.03 },
  shuffle: { symbol: "shuffle", box: 0.99 },
  // Rediscover: resurfacing, not a clock face. No .fill exists, so the tab
  // bar's active and inactive states draw the same symbol.
  time: { symbol: "clock.arrow.circlepath", box: 0.89, x: 0.03 },
  "time-outline": { symbol: "clock.arrow.circlepath", box: 0.89, x: 0.03 },
  "toggle-outline": { symbol: "switch.2", box: 1.27 },
  "trash-outline": { symbol: "trash", box: 1.02 },
  "volume-high-outline": { symbol: "speaker.wave.3", box: 1.08 },
} as const satisfies Record<string, SymbolSpec>;

export type IconName = keyof typeof ICON_SYMBOLS;

/** The spec for a name, or undefined for a name outside the table. */
export function symbolFor(name: string): SymbolSpec | undefined {
  return Object.prototype.hasOwnProperty.call(ICON_SYMBOLS, name)
    ? (ICON_SYMBOLS as Record<string, SymbolSpec>)[name]
    : undefined;
}
