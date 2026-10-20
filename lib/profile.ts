import { supabase } from "@/lib/supabase";
import type { MusicProviderType, UserProfile } from "@/types";

/**
 * The signed-in user's own profile: reading it, mapping it, and turning a
 * camelCase patch into the columns to write. AuthContext is the only caller;
 * everything here except fetchOwnProfileRow is pure so it can be tested.
 */

/**
 * Columns the app reads for its own profile when get_my_profile() isn't
 * deployed yet. Explicit rather than `*` so the read never depends on what
 * else the table holds.
 */
export const OWN_PROFILE_COLUMNS = [
  "id",
  "display_name",
  "avatar_url",
  "username",
  "username_customized",
  "friend_invite_token",
  "custom_moods",
  "custom_prompt_categories",
  "birth_year",
  "country",
  "favorite_artists",
  "favorite_songs",
  "onboarding_completed",
  "genre_preferences",
  "preferred_music_provider",
  "notif_on_this_day",
  "notif_streak",
  "notif_prompts",
  "notif_resurfacing",
  "notif_milestones",
  "created_at",
  "updated_at",
].join(", ");

type ProfileRow = Record<string, any>;

export interface OwnProfileResult {
  row: ProfileRow | null;
  /** Set when the read failed. A missing row is `row: null, error: null`. */
  error: { message: string; code?: string } | null;
  /** The session belongs to someone else now; drop the result. */
  stale?: boolean;
}

/** PostgREST / Postgres codes for "this function isn't deployed". */
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883";
}

/**
 * An RPC can come back as an object (RETURNS profiles), a one-row array
 * (RETURNS SETOF / TABLE) or null. A composite return with no row can also
 * come back as an object of nulls. Normalize all of them to row-or-null.
 */
export function normalizeRpcRow(data: unknown): ProfileRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return (row as ProfileRow).id ? (row as ProfileRow) : null;
}

/**
 * Read the caller's own profile through get_my_profile(). Until that RPC is
 * deployed, fall back to a direct read of the caller's own row.
 */
export async function fetchOwnProfileRow(userId: string): Promise<OwnProfileResult> {
  const rpc = await supabase.rpc("get_my_profile");
  if (!rpc.error) {
    const row = normalizeRpcRow(rpc.data);
    // The RPC answers for whoever holds the session. If that is not the user
    // we were asked about, the session changed under us.
    if (row && row.id !== userId) return { row: null, error: null, stale: true };
    return { row, error: null };
  }
  if (!isMissingFunctionError(rpc.error)) return { row: null, error: rpc.error };

  const { data, error } = await supabase
    .from("profiles")
    .select(OWN_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) return { row: null, error };
  return { row: (data as ProfileRow | null) ?? null, error: null };
}

/** The single DB→TypeScript mapping for the user's own profile row. */
export function mapProfileRow(data: ProfileRow): UserProfile {
  return {
    id: data.id,
    displayName: data.display_name ?? null,
    avatarUrl: data.avatar_url ?? null,
    username: data.username ?? null,
    usernameCustomized: data.username_customized ?? false,
    friendInviteToken: data.friend_invite_token ?? "",
    customMoods: data.custom_moods ?? [],
    customPromptCategories: data.custom_prompt_categories ?? [],
    birthYear: data.birth_year ?? null,
    country: data.country ?? null,
    favoriteArtists: data.favorite_artists ?? [],
    favoriteSongs: data.favorite_songs ?? [],
    onboardingCompleted: data.onboarding_completed ?? false,
    genrePreferences: data.genre_preferences ?? [],
    preferredMusicProvider: (data.preferred_music_provider as MusicProviderType) ?? "apple_music",
    notifOnThisDay: data.notif_on_this_day ?? true,
    notifStreak: data.notif_streak ?? true,
    notifPrompts: data.notif_prompts ?? true,
    notifResurfacing: data.notif_resurfacing ?? true,
    notifMilestones: data.notif_milestones ?? true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * True when two profiles hold the same data. Used to keep the existing object
 * (and its arrays' identity) when a refetch returns nothing new, so consumers
 * memoized on profile fields don't re-render.
 */
export function sameProfile(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The profile fields a client may write, in camelCase. */
export type ProfilePatch = Partial<
  Pick<
    UserProfile,
    | "displayName"
    | "username"
    | "usernameCustomized"
    | "avatarUrl"
    | "birthYear"
    | "country"
    | "favoriteArtists"
    | "favoriteSongs"
    | "genrePreferences"
    | "customMoods"
    | "customPromptCategories"
    | "onboardingCompleted"
    | "preferredMusicProvider"
    | "notifOnThisDay"
    | "notifStreak"
    | "notifPrompts"
    | "notifResurfacing"
    | "notifMilestones"
  >
>;

const PATCH_COLUMNS: Record<keyof ProfilePatch, string> = {
  displayName: "display_name",
  username: "username",
  usernameCustomized: "username_customized",
  avatarUrl: "avatar_url",
  birthYear: "birth_year",
  country: "country",
  favoriteArtists: "favorite_artists",
  favoriteSongs: "favorite_songs",
  genrePreferences: "genre_preferences",
  customMoods: "custom_moods",
  customPromptCategories: "custom_prompt_categories",
  onboardingCompleted: "onboarding_completed",
  preferredMusicProvider: "preferred_music_provider",
  notifOnThisDay: "notif_on_this_day",
  notifStreak: "notif_streak",
  notifPrompts: "notif_prompts",
  notifResurfacing: "notif_resurfacing",
  notifMilestones: "notif_milestones",
};

/** Usernames are stored lowercase and trimmed; empty means none. */
export function normalizeUsername(username: string | null): string | null {
  const cleaned = username?.toLowerCase().trim();
  return cleaned ? cleaned : null;
}

/**
 * Map a camelCase patch to DB columns. Keys that are `undefined` are left
 * out, so a patch only ever writes the fields it names. Returns the
 * normalized patch too, for applying to local state.
 */
export function toProfileDbFields(patch: ProfilePatch): { db: Record<string, unknown>; local: ProfilePatch } {
  const db: Record<string, unknown> = {};
  const local: ProfilePatch = {};
  for (const key of Object.keys(PATCH_COLUMNS) as (keyof ProfilePatch)[]) {
    let value = patch[key];
    if (value === undefined) continue;
    if (key === "username") value = normalizeUsername(value as string | null);
    db[PATCH_COLUMNS[key]] = value;
    (local as Record<string, unknown>)[key] = value;
  }
  return { db, local };
}

/** The Edit Profile form's values. */
export interface ProfileEditForm {
  displayName: string;
  username: string;
  birthYear: number | null;
  country: string;
  favoriteArtists: UserProfile["favoriteArtists"];
  favoriteSongs: UserProfile["favoriteSongs"];
  genrePreferences: string[];
}

/**
 * Only the fields the user actually changed, so saving one field can never
 * overwrite another with the form's empty default. A blank display name is
 * never written (the form treats it as "leave it").
 */
export function profileEditChanges(profile: UserProfile, form: ProfileEditForm): ProfilePatch {
  const changes: ProfilePatch = {};
  const name = form.displayName.trim();
  if (name && name !== (profile.displayName ?? "")) changes.displayName = name;

  const username = normalizeUsername(form.username);
  if (username !== (profile.username ?? null)) {
    changes.username = username;
    if (username) changes.usernameCustomized = true;
  }

  if (form.birthYear !== profile.birthYear) changes.birthYear = form.birthYear;

  const country = form.country.trim() || null;
  if (country !== (profile.country ?? null)) changes.country = country;

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(form.favoriteArtists, profile.favoriteArtists)) changes.favoriteArtists = form.favoriteArtists;
  if (!same(form.favoriteSongs, profile.favoriteSongs)) changes.favoriteSongs = form.favoriteSongs;
  if (!same(form.genrePreferences, profile.genrePreferences)) changes.genrePreferences = form.genrePreferences;
  return changes;
}
