import { Linking } from "react-native";

/** Where feedback and reports go. */
export const FEEDBACK_EMAIL = "founder@soundtracks.app";

/** The line above the address when Mail can't open (Settings' feedback, a report). */
export const MAIL_UNAVAILABLE_TEXT = "Mail isn't set up on this phone. Send a note from any email app to:";

/** A mailto: URL with an encoded subject and body. */
export function mailtoUrl(to: string, fields: { subject?: string; body?: string } = {}): string {
  const query = (["subject", "body"] as const)
    .filter((key) => fields[key])
    .map((key) => `${key}=${encodeURIComponent(fields[key] ?? "")}`)
    .join("&");
  return query ? `mailto:${to}?${query}` : `mailto:${to}`;
}

/**
 * Opens a mailto: URL in Mail. Resolves false when there's no mail app (the
 * simulator, or a phone that deleted Mail) or opening fails, so the caller
 * can show the address to copy instead; a bare openURL used to reject
 * silently and the row did nothing. canOpenURL can answer for mailto because
 * it's declared in LSApplicationQueriesSchemes (1.4).
 */
export async function openMail(url: string): Promise<boolean> {
  try {
    if (!(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
