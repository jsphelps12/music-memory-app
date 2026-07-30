import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";
import { CustomMoodDefinition, CustomPromptCategory, FavoriteArtist, FavoriteSong, MusicProviderType, UserProfile } from "@/types";
import { getProvider } from "@/lib/providers";
import { prefetchTimeline, clearTimelineCache } from "@/lib/timelinePrefetch";
import { resetTimelineRefresh } from "@/lib/timelineRefresh";
import { clearLegacyAlbumCaches } from "@/lib/albums";
import { readProfileCache, writeProfileCache, clearProfileCache } from "@/lib/profileCache";
import { fetchBrowseMetadata, readBrowseCache, writeBrowseCache, clearBrowseCache } from "@/lib/browse";
import { fetchSharedScreenData, readSharedCache, writeSharedCache, clearSharedCache } from "@/lib/sharedScreen";

export interface OnboardingData {
  displayName: string;
  username?: string;
  birthYear?: number | null;
  country?: string | null;
  favoriteArtists: FavoriteArtist[];
  favoriteSongs: FavoriteSong[];
  genrePreferences: string[];
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileReady: boolean; // true once first profile fetch has completed
  profileError: boolean; // true when the last profile fetch failed (vs. genuinely having no profile)
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (updates: {
    displayName?: string;
    username?: string | null;
    avatarUrl?: string;
    birthYear?: number | null;
    country?: string | null;
    favoriteArtists?: FavoriteArtist[];
    favoriteSongs?: FavoriteSong[];
    genrePreferences?: string[];
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveOnboardingData: (data: { displayName: string; username?: string; birthYear?: number | null; country?: string | null }) => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  saveCustomMood: (mood: CustomMoodDefinition) => Promise<void>;
  deleteCustomMood: (value: string) => Promise<void>;
  saveCustomPromptCategory: (category: CustomPromptCategory) => Promise<void>;
  deleteCustomPromptCategory: (id: string) => Promise<void>;
  preferredProvider: MusicProviderType;
  setPreferredProvider: (type: MusicProviderType) => Promise<boolean>;
}

// Upper bound on how long the blocking overlay waits for a profile fetch before
// giving up and letting the app render. Every request also has its own abort
// timeout in lib/supabase.ts; this is the belt to that suspenders.
const PROFILE_TIMEOUT_MS = 8_000;

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const suppressAuth = useRef(false);
  const isMountedRef = useRef(true);
  const currentFetchUserIdRef = useRef<string | null>(null);
  // Guards against the duplicate concurrent hydration that getSession +
  // onAuthStateChange used to trigger on every cold start.
  const hydratingUserIdRef = useRef<string | null>(null);
  // Mirror of `session` readable from callbacks without stale closure capture.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // keepOnError: don't wipe cached profile on network failure (prevents bouncing user to onboarding)
  async function fetchProfile(userId: string, { keepOnError = false, email }: { keepOnError?: boolean; email?: string | null } = {}) {
    currentFetchUserIdRef.current = userId;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    // Discard result if user changed while fetch was in-flight
    if (currentFetchUserIdRef.current !== userId) return;

    if (error || !data) {
      // A failed fetch is NOT the same as "this user has no profile". Routing
      // on profile===null alone sends an existing user into onboarding, where
      // completing it overwrites their real profile data.
      //
      // PGRST116 is the exception: it means the row genuinely doesn't exist
      // (the handle_new_user trigger hasn't run or the row was removed), and
      // that user *should* go through onboarding. Treating it as an error would
      // strand them on an empty timeline with no profile instead.
      const isMissingRow = (error as { code?: string } | null)?.code === "PGRST116";
      setProfileError(!isMissingRow);
      if (!keepOnError) setProfile(null);
      setProfileReady(true);
      return;
    }
    setProfileError(false);

    const profile: UserProfile = {
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
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
      preferredMusicProvider: (data.preferred_music_provider as MusicProviderType) ?? 'apple_music',
      notifOnThisDay: data.notif_on_this_day ?? true,
      notifStreak: data.notif_streak ?? true,
      notifPrompts: data.notif_prompts ?? true,
      notifResurfacing: data.notif_resurfacing ?? true,
      notifMilestones: data.notif_milestones ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    setProfile(profile);
    setProfileReady(true);
    writeProfileCache(userId, profile);

    // Sentry user context — enables filtering errors by user in the Sentry dashboard
    Sentry.setUser({ id: userId, email: email ?? undefined });

    // PostHog identify with full properties for retention/cohort analysis
    posthog.identify(userId, {
      $set: {
        email: email ?? null,
        display_name: profile.displayName,
        username: profile.username,
        onboarding_completed: profile.onboardingCompleted,
        country: profile.country,
        birth_year: profile.birthYear,
      },
      $set_once: {
        signed_up_at: profile.createdAt,
      },
    });
  }

  useEffect(() => {
    // Warm the caches every tab reads on mount. Safe to call more than once:
    // each entry is idempotent and cheap when already warm.
    function startPrefetches(userId: string) {
      prefetchTimeline(userId);
      // No albums prefetch: its only purpose was writing a disk cache nothing
      // reads. The Albums tab fetches its own data under ["collectionsScreen"].
      readBrowseCache(userId).then((cached) => {
        if (cached) queryClient.setQueryData(["browseMeta", userId], cached);
        // staleTime 0: setQueryData above stamps dataUpdatedAt=now, so a non-zero
        // staleTime would make prefetchQuery a no-op and the disk cache would
        // never be refreshed again after the first ever launch.
        queryClient.prefetchQuery({
          queryKey: ["browseMeta", userId],
          queryFn: () =>
            fetchBrowseMetadata(userId).then((data) => {
              writeBrowseCache(userId, data).catch(() => {});
              return data;
            }),
          staleTime: 0,
        });
      });
      readSharedCache(userId).then((cached) => {
        if (cached) queryClient.setQueryData(["sharedScreen", userId], cached);
        queryClient.prefetchQuery({
          queryKey: ["sharedScreen", userId],
          queryFn: () =>
            fetchSharedScreenData(userId).then((data) => {
              writeSharedCache(userId, data).catch(() => {});
              return data;
            }),
          staleTime: 0,
        });
      });
    }

    /**
     * Resolve everything the app needs before it can route: the cached profile
     * (for an instant overlay lift) and then the fresh one.
     *
     * Guarantees, because the blocking overlay in app/_layout waits on these:
     * profileReady and loading are ALWAYS settled, on every path, including
     * timeout — an earlier version only rejected-and-caught on one of the two
     * entry paths, so a timeout on the other left the overlay up indefinitely.
     *
     * A timeout sets profileError so AuthGate does not mistake "we couldn't
     * load your profile" for "you haven't onboarded" and walk an existing user
     * into onboarding (which overwrites their real profile).
     */
    async function hydrateUser(userId: string, email?: string | null) {
      // Dedupe: getSession and onAuthStateChange both fire on a cold start
      // (SIGNED_IN and/or INITIAL_SESSION), and without this the same profile
      // was fetched up to three times concurrently on the one launch where
      // bandwidth is scarcest.
      if (hydratingUserIdRef.current === userId) return;
      hydratingUserIdRef.current = userId;

      startPrefetches(userId);

      try {
        const cached = await readProfileCache(userId);
        if (isMountedRef.current && cached) {
          setProfile(cached);
          setProfileReady(true);
          setLoading(false); // release the overlay immediately
        }

        let timedOut = false;
        await Promise.race([
          fetchProfile(userId, { keepOnError: cached !== null, email }),
          new Promise<void>((resolve) =>
            setTimeout(() => {
              timedOut = true;
              resolve();
            }, PROFILE_TIMEOUT_MS)
          ),
        ]);
        if (timedOut && isMountedRef.current) setProfileError(true);
      } finally {
        // Only settle if we're still the current hydration: a slower run for a
        // previous user must not mark the incoming user's profile as ready.
        if (isMountedRef.current && hydratingUserIdRef.current === userId) {
          setProfileReady(true);
          setLoading(false);
          hydratingUserIdRef.current = null;
        }
      }
    }

    // Supabase refreshes the JWT inside getSession() — on a flaky network this can hang
    // indefinitely and keep `loading = true` forever (blank screen after OTA reload).
    // If it times out we resolve with null session so the overlay lifts and shows sign-in;
    // onAuthStateChange will fire SIGNED_IN once the refresh eventually completes.
    const SESSION_TIMEOUT_MS = 10_000;
    const TIMED_OUT = Symbol("getSession timeout");
    Promise.race([
      supabase.auth.getSession(),
      new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), SESSION_TIMEOUT_MS)),
    ])
      .then((result) => {
        if (!isMountedRef.current) return;
        // A timeout is NOT the same as "signed out". Resolving it as a null
        // session used to overwrite a valid session the auth listener had
        // already set and bounce the user to the sign-in screen until the token
        // refresh finally landed. On timeout we do nothing and let the listener
        // deliver the session; the overlay's own escape hatch covers the rest.
        if (result === TIMED_OUT) return;
        const session = result.data.session;
        setSession(session);
        if (session?.user) {
          void hydrateUser(session.user.id, session.user.email);
        } else {
          setLoading(false);
        }
      })
      .catch(async () => {
        // Corrupted session in storage (e.g. HTML error page cached during outage)
        await supabase.auth.signOut({ scope: "local" });
        if (isMountedRef.current) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (suppressAuth.current) return;
      setSession(session);

      if (session?.user) {
        // Deliberately NOT awaited, and this callback is deliberately not async:
        // supabase-js awaits subscriber callbacks inside its auth lock for
        // SIGNED_IN / TOKEN_REFRESHED, so doing profile I/O here stalled session
        // recovery and the token-refresh tick behind our own network call.
        const { id, email } = session.user;
        setTimeout(() => void hydrateUser(id, email), 0);
      } else {
        posthog.reset();
        Sentry.setUser(null);
        setProfile(null);
        setProfileReady(false);
        setProfileError(false);
        hydratingUserIdRef.current = null;
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    suppressAuth.current = true;
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: "https://soundtracks.app/confirm" },
      });
      if (error) throw error;
      await supabase.auth.signOut();
    } finally {
      suppressAuth.current = false;
    }
  };

  const signInWithApple = async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });

    if (!credential.identityToken) {
      throw new Error("Apple Sign-In failed — no identity token received.");
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;

    // Apple only sends the full name on first authorization
    if (credential.fullName) {
      const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean);
      if (parts.length > 0) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user) {
          await supabase
            .from("profiles")
            .update({ display_name: parts.join(" ") })
            .eq("id", currentSession.user.id);
        }
      }
    }
  };

  const signOut = async () => {
    const userId = session?.user?.id;
    // Clear push token fire-and-forget — don't block sign-out on this network call
    if (userId) {
      supabase.from("profiles").update({ push_token: null }).eq("id", userId).then(null, () => {});
    }
    // Always clear locally even if the network call fails
    await supabase.auth.signOut().catch(() => supabase.auth.signOut({ scope: "local" }));
    if (userId) {
      clearTimelineCache(userId);
      clearProfileCache(userId);
      clearLegacyAlbumCaches(userId);
      clearBrowseCache(userId);
      clearSharedCache(userId);
    }
    // Drop in-memory query state and the one-shot cross-screen stores too.
    // Query keys are user-scoped so the next user can't *see* this data, but
    // consumeTimelineStale carries a pending Moment with no user scoping — it
    // could prepend the previous user's moment to the next user's timeline.
    queryClient.clear();
    resetTimelineRefresh();
    posthog.reset();
    Sentry.setUser(null);
  };

  const deleteAccount = async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) throw new Error("Not authenticated");

    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      let message = "Delete failed";
      try {
        const body = await res.json();
        message = body.error ?? message;
      } catch {}
      throw new Error(message);
    }

    // Sign out locally only — the auth user no longer exists server-side
    await supabase.auth.signOut({ scope: "local" });
  };

  const updateProfile = async (updates: {
    displayName?: string;
    username?: string | null;
    avatarUrl?: string;
    birthYear?: number | null;
    country?: string | null;
    favoriteArtists?: FavoriteArtist[];
    favoriteSongs?: FavoriteSong[];
    genrePreferences?: string[];
  }) => {
    if (!session?.user) throw new Error("Not authenticated");

    const dbUpdates: Record<string, any> = {};
    if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
    if (updates.username !== undefined) {
      dbUpdates.username = updates.username ? updates.username.toLowerCase().trim() : null;
      if (updates.username) dbUpdates.username_customized = true;
    }
    if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;
    if (updates.birthYear !== undefined) dbUpdates.birth_year = updates.birthYear;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.favoriteArtists !== undefined) dbUpdates.favorite_artists = updates.favoriteArtists;
    if (updates.favoriteSongs !== undefined) dbUpdates.favorite_songs = updates.favoriteSongs;
    if (updates.genrePreferences !== undefined) dbUpdates.genre_preferences = updates.genrePreferences;

    const { data: rows, error } = await supabase
      .from("profiles")
      .update(dbUpdates)
      .eq("id", session.user.id)
      .select("id");

    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Profile update blocked — check RLS policies.");

    await fetchProfile(session.user.id);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  const saveOnboardingData = async (data: { displayName: string; username?: string; birthYear?: number | null; country?: string | null }) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updates: Record<string, any> = {
      display_name: data.displayName,
    };
    if (data.birthYear !== undefined) updates.birth_year = data.birthYear;
    if (data.country !== undefined) updates.country = data.country;
    if (data.username) updates.username = data.username.toLowerCase().trim();
    const { data: rows, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id)
      .select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Profile update blocked — check RLS policies.");
    await fetchProfile(session.user.id);
  };

  const completeOnboarding = async (data: OnboardingData) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updates: Record<string, any> = {
      birth_year: data.birthYear,
      country: data.country,
      favorite_artists: data.favoriteArtists,
      favorite_songs: data.favoriteSongs,
      genre_preferences: data.genrePreferences,
      onboarding_completed: true,
    };
    // Only set display_name if non-empty — never overwrite with blank
    if (data.displayName.trim()) updates.display_name = data.displayName.trim();
    if (data.username) updates.username = data.username.toLowerCase().trim();
    const { data: rows, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id)
      .select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Profile update blocked — check RLS policies.");
    await fetchProfile(session.user.id);
  };

  const saveCustomMood = async (mood: CustomMoodDefinition) => {
    if (!session?.user) throw new Error("Not authenticated");
    const current = profile?.customMoods ?? [];
    const updated = [...current.filter((m) => m.value !== mood.value), mood];
    const { error } = await supabase
      .from("profiles")
      .update({ custom_moods: updated })
      .eq("id", session.user.id);
    if (error) throw error;
    await fetchProfile(session.user.id);
  };

  const deleteCustomMood = async (value: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updated = (profile?.customMoods ?? []).filter((m) => m.value !== value);
    const { error } = await supabase
      .from("profiles")
      .update({ custom_moods: updated })
      .eq("id", session.user.id);
    if (error) throw error;
    await fetchProfile(session.user.id);
  };

  const saveCustomPromptCategory = async (category: CustomPromptCategory) => {
    if (!session?.user) throw new Error("Not authenticated");
    const current = profile?.customPromptCategories ?? [];
    const updated = [...current.filter((c) => c.id !== category.id), category];
    const { error } = await supabase
      .from("profiles")
      .update({ custom_prompt_categories: updated })
      .eq("id", session.user.id);
    if (error) throw error;
    await fetchProfile(session.user.id);
  };

  const deleteCustomPromptCategory = async (id: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updated = (profile?.customPromptCategories ?? []).filter((c) => c.id !== id);
    const { error } = await supabase
      .from("profiles")
      .update({ custom_prompt_categories: updated })
      .eq("id", session.user.id);
    if (error) throw error;
    await fetchProfile(session.user.id);
  };

  const setPreferredProvider = async (type: MusicProviderType): Promise<boolean> => {
    if (!session?.user) return false;
    // Authorize the provider before persisting — revert if the user cancels
    const authorized = await getProvider(type).authorize();
    if (!authorized) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ preferred_music_provider: type })
      .eq("id", session.user.id);
    if (error) return false;
    await fetchProfile(session.user.id);
    return true;
  };

  const contextValue = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profileReady,
    profileError,
    signIn,
    signUp,
    signInWithApple,
    signOut,
    deleteAccount,
    updateProfile,
    refreshProfile,
    saveOnboardingData,
    completeOnboarding,
    saveCustomMood,
    deleteCustomMood,
    saveCustomPromptCategory,
    deleteCustomPromptCategory,
    preferredProvider: (profile?.preferredMusicProvider ?? 'apple_music') as MusicProviderType,
    setPreferredProvider,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [session, profile, loading, profileReady, profileError]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
