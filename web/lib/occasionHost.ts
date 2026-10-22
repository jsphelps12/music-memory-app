// Couple setup for occasions (docs/OCCASIONS.md, flow 1): the pure parts,
// tested in web/lib/__tests__/occasionHost.test.ts.

/** "Sam & Priya" → "sam-and-priya". The database has the final say (taken, reserved). */
export function slugify(names: string): string {
  return names
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export function isSlugShape(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Where to go after signing in. Only our own /host pages: a `next` from the
 * URL is attacker-controlled, and an open redirect on a sign-in page is a
 * phishing tool.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/host") || next.startsWith("//") || next.includes("\\")) return "/host";
  try {
    const url = new URL(next, "https://soundtracks.app");
    return url.origin === "https://soundtracks.app" && url.pathname.startsWith("/host")
      ? url.pathname + url.search
      : "/host";
  } catch {
    return "/host";
  }
}

const US_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

/** US zones first (most weddings), then every other zone the browser knows. */
export function timeZoneOptions(all: string[] = supportedZones()): string[] {
  const rest = all.filter((z) => !US_ZONES.includes(z)).sort();
  return [...US_ZONES, ...rest];
}

function supportedZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? [];
}

export type SetupInput = {
  names: string;
  eventDate: string;
  city: string;
  timeZone: string;
  guestEstimate: string;
  slug: string;
};

/** The first problem with the setup form, in words for the couple, or null. */
export function setupProblem(input: SetupInput, today: string): string | null {
  const names = input.names.trim();
  if (!names) return "Add your names, the way you want them on the guest book.";
  if (names.length > 120) return "Keep your names to 120 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) return "Add your wedding date.";
  if (input.eventDate < today) return "That date has already passed.";
  if (!input.timeZone) return "Pick the time zone of the wedding.";
  if (input.guestEstimate.trim()) {
    const n = Number(input.guestEstimate);
    if (!Number.isInteger(n) || n < 1 || n > 2000) return "Guests should be a number between 1 and 2,000.";
  }
  if (!isSlugShape(input.slug)) return "Your link can use lowercase letters, numbers and dashes.";
  return null;
}

/** The guest link as couples will share it. */
export function guestLink(slug: string, origin = "https://soundtracks.app"): string {
  return `${origin}/for/${slug}`;
}
