import { createHmac } from "node:crypto";

/**
 * A moment's share signature, the same as occasion-book's momentSig:
 * HMAC-SHA256 of the moment id keyed by the book token, first 128 bits as
 * hex. Server-only (the couple's preview); guests get theirs from the
 * function.
 */
export function momentSig(bookToken: string, entryId: string): string {
  return createHmac("sha256", bookToken).update(entryId).digest("hex").slice(0, 32);
}
