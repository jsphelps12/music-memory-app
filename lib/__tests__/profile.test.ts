/**
 * The user's own profile: the read (RPC first, direct read only while the RPC
 * isn't deployed), the row mapping, the patch→column mapping, and the Edit
 * Profile diff that keeps one field's save from wiping the others.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserProfile } from "@/types";

// Hoisted with the vi.mock below, which runs before plain top-level consts.
const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));

import {
  fetchOwnProfileRow,
  isMissingFunctionError,
  mapProfileRow,
  normalizeRpcRow,
  profileEditChanges,
  sameProfile,
  toProfileDbFields,
  OWN_PROFILE_COLUMNS,
} from "../profile";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    display_name: "Josh",
    avatar_url: "u1/avatar.jpg",
    username: "josh",
    username_customized: true,
    friend_invite_token: "tok",
    custom_moods: [{ value: "x", label: "X", emoji: "x" }],
    custom_prompt_categories: [],
    birth_year: 1990,
    country: "Canada",
    favorite_artists: [{ id: "1", name: "A", artworkUrl: null }],
    favorite_songs: [],
    onboarding_completed: true,
    genre_preferences: ["Rock"],
    preferred_music_provider: "apple_music",
    notif_on_this_day: false,
    notif_streak: true,
    notif_prompts: true,
    notif_resurfacing: true,
    notif_milestones: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => sb.reset());

describe("fetchOwnProfileRow", () => {
  it("reads through get_my_profile and never queries the table when it exists", async () => {
    sb.queueData(row());
    const result = await fetchOwnProfileRow("u1");
    expect(result.row?.id).toBe("u1");
    expect(result.error).toBeNull();
    expect(sb.client.rpc).toHaveBeenCalledWith("get_my_profile");
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__"]);
  });

  it("accepts a one-row array from a set-returning RPC", async () => {
    sb.queueData([row()]);
    expect((await fetchOwnProfileRow("u1")).row?.id).toBe("u1");
  });

  it("reports an empty RPC result as a missing row, not an error", async () => {
    sb.queueData(null);
    expect(await fetchOwnProfileRow("u1")).toEqual({ row: null, error: null });
  });

  it("marks a row for a different user as stale", async () => {
    sb.queueData(row({ id: "someone-else" }));
    const result = await fetchOwnProfileRow("u1");
    expect(result.stale).toBe(true);
    expect(result.row).toBeNull();
  });

  it("falls back to an explicit-column read of the caller's own row when the RPC isn't deployed", async () => {
    sb.queueError({ message: "Could not find the function", code: "PGRST202" });
    sb.queueData(row());
    const result = await fetchOwnProfileRow("u1");
    expect(result.row?.id).toBe("u1");
    const fallback = sb.queries[1];
    expect(fallback.table).toBe("profiles");
    expect(fallback.chain).toEqual([
      { method: "select", args: [OWN_PROFILE_COLUMNS] },
      { method: "eq", args: ["id", "u1"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(OWN_PROFILE_COLUMNS).not.toContain("*");
  });

  it("does not fall back on other RPC errors", async () => {
    sb.queueError({ message: "Network request failed" });
    const result = await fetchOwnProfileRow("u1");
    expect(result.error?.message).toBe("Network request failed");
    expect(sb.queries).toHaveLength(1);
  });
});

describe("isMissingFunctionError / normalizeRpcRow", () => {
  it("recognises PostgREST and Postgres missing-function codes only", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "42501" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });

  it("treats an all-null composite as no row", () => {
    expect(normalizeRpcRow({ id: null, display_name: null })).toBeNull();
    expect(normalizeRpcRow([])).toBeNull();
    expect(normalizeRpcRow(undefined)).toBeNull();
  });
});

describe("mapProfileRow", () => {
  it("maps columns and fills defaults for missing ones", () => {
    const p = mapProfileRow({ id: "u1", created_at: "c", updated_at: "u" });
    expect(p).toMatchObject({
      id: "u1",
      displayName: null,
      username: null,
      usernameCustomized: false,
      friendInviteToken: "",
      customMoods: [],
      preferredMusicProvider: "apple_music",
      notifOnThisDay: true,
      notifMilestones: true,
    });
    expect(mapProfileRow(row()).notifOnThisDay).toBe(false);
  });
});

describe("sameProfile", () => {
  it("is true for equal data in different objects, false after any change", () => {
    expect(sameProfile(mapProfileRow(row()), mapProfileRow(row()))).toBe(true);
    expect(sameProfile(mapProfileRow(row()), mapProfileRow(row({ updated_at: "later" })))).toBe(false);
    expect(sameProfile(null, mapProfileRow(row()))).toBe(false);
    expect(sameProfile(null, null)).toBe(true);
  });
});

describe("toProfileDbFields", () => {
  it("writes only the keys present and maps them to columns", () => {
    const { db, local } = toProfileDbFields({ notifStreak: false, country: null, displayName: undefined });
    expect(db).toEqual({ notif_streak: false, country: null });
    expect(local).toEqual({ notifStreak: false, country: null });
  });

  it("normalizes the username and stores blank as null", () => {
    expect(toProfileDbFields({ username: "  Josh_1 " }).db).toEqual({ username: "josh_1" });
    expect(toProfileDbFields({ username: "   " }).db).toEqual({ username: null });
  });

  it("returns nothing for an empty patch", () => {
    expect(toProfileDbFields({}).db).toEqual({});
  });
});

describe("profileEditChanges", () => {
  const profile: UserProfile = mapProfileRow(row());
  const unchangedForm = {
    displayName: "Josh",
    username: "josh",
    birthYear: 1990,
    country: "Canada",
    favoriteArtists: profile.favoriteArtists,
    favoriteSongs: profile.favoriteSongs,
    genrePreferences: profile.genrePreferences,
  };

  it("sends nothing when nothing changed", () => {
    expect(profileEditChanges(profile, unchangedForm)).toEqual({});
  });

  it("sends only the changed field", () => {
    expect(profileEditChanges(profile, { ...unchangedForm, displayName: "Joshua " })).toEqual({
      displayName: "Joshua",
    });
  });

  it("never blanks the display name", () => {
    expect(profileEditChanges(profile, { ...unchangedForm, displayName: "  " })).toEqual({});
  });

  it("marks a new username as customized and allows clearing it", () => {
    expect(profileEditChanges(profile, { ...unchangedForm, username: "jp" })).toEqual({
      username: "jp",
      usernameCustomized: true,
    });
    expect(profileEditChanges(profile, { ...unchangedForm, username: "" })).toEqual({ username: null });
  });

  it("detects list and nullable-field changes", () => {
    const changes = profileEditChanges(profile, {
      ...unchangedForm,
      country: "",
      birthYear: null,
      genrePreferences: ["Rock", "Jazz"],
    });
    expect(changes).toEqual({ country: null, birthYear: null, genrePreferences: ["Rock", "Jazz"] });
  });
});
