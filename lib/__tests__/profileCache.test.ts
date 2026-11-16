/**
 * The profile disk cache outlives app updates and was read with a bare
 * `JSON.parse(raw) as UserProfile`. A profile written by an older bundle (or a
 * truncated write) without `customMoods` crashed the first custom-mood edit,
 * and one without `onboardingCompleted` read as "not onboarded", which routes
 * an existing user into onboarding. parseCachedProfile treats both as a miss.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
  ...storage,
}));

// Imported after the mock is set up (a static import would evaluate the mock
// factory before `storage` exists).
const { parseCachedProfile, readProfileCache } = await import("../profileCache");

const USER = "user-aaa";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: USER,
    displayName: "Josh",
    avatarUrl: null,
    username: "josh",
    usernameCustomized: false,
    friendInviteToken: "tok",
    customMoods: [],
    customPromptCategories: [],
    birthYear: null,
    country: null,
    favoriteArtists: [],
    favoriteSongs: [],
    onboardingCompleted: true,
    genrePreferences: [],
    preferredMusicProvider: "apple_music",
    notifOnThisDay: true,
    notifStreak: true,
    notifPrompts: true,
    notifResurfacing: true,
    notifMilestones: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => storage.reset());

describe("parseCachedProfile", () => {
  it("accepts a well-formed profile", () => {
    const p = profile();
    expect(parseCachedProfile(JSON.stringify(p), USER)).toEqual(p);
  });

  it("treats empty, invalid JSON and non-objects as a miss", () => {
    expect(parseCachedProfile(null)).toBeNull();
    expect(parseCachedProfile("")).toBeNull();
    expect(parseCachedProfile("{not json")).toBeNull();
    expect(parseCachedProfile("null")).toBeNull();
    expect(parseCachedProfile("[]")).toBeNull();
    expect(parseCachedProfile('"profile"')).toBeNull();
  });

  it("rejects a profile without customMoods as an array", () => {
    expect(parseCachedProfile(JSON.stringify(profile({ customMoods: undefined })))).toBeNull();
    expect(parseCachedProfile(JSON.stringify(profile({ customMoods: null })))).toBeNull();
    expect(parseCachedProfile(JSON.stringify(profile({ customMoods: {} })))).toBeNull();
  });

  it("rejects a profile missing any other array the app reads unguarded", () => {
    for (const field of ["customPromptCategories", "favoriteArtists", "favoriteSongs", "genrePreferences"]) {
      expect(parseCachedProfile(JSON.stringify(profile({ [field]: undefined })))).toBeNull();
    }
  });

  it("rejects a profile without onboardingCompleted (it would route to onboarding)", () => {
    expect(parseCachedProfile(JSON.stringify(profile({ onboardingCompleted: undefined })))).toBeNull();
    expect(parseCachedProfile(JSON.stringify(profile({ onboardingCompleted: "true" })))).toBeNull();
  });

  it("rejects a profile without an id, or one for another user", () => {
    expect(parseCachedProfile(JSON.stringify(profile({ id: undefined })))).toBeNull();
    expect(parseCachedProfile(JSON.stringify(profile({ id: "someone-else" })), USER)).toBeNull();
  });
});

describe("readProfileCache", () => {
  it("returns a valid cached profile", async () => {
    storage.seed(`profile_cache_v1_${USER}`, JSON.stringify(profile()));
    expect((await readProfileCache(USER))?.id).toBe(USER);
  });

  it("returns null for a malformed cached profile instead of handing it to the app", async () => {
    storage.seed(`profile_cache_v1_${USER}`, JSON.stringify({ id: USER, displayName: "Old" }));
    expect(await readProfileCache(USER)).toBeNull();
  });

  it("returns null when there is nothing cached", async () => {
    expect(await readProfileCache(USER)).toBeNull();
  });
});
