import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";
import { CustomMoodDefinition, CustomPromptCategory, FavoriteArtist, FavoriteSong, UserProfile } from "@/types";
import { prefetchTimeline, clearTimelineCache } from "@/lib/timelinePrefetch";
import { fetchCollections, writeCollectionsCache, clearCollectionsCache, clearAllCollectionMomentsCache } from "@/lib/collections";
import { readProfileCache, writeProfileCache, clearProfileCache } from "@/lib/profileCache";
import { fetchBrowseMetadata } from "@/lib/browse";
import { fetchSharedScreenData } from "@/lib/sharedScreen";

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
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const suppressAuth = useRef(false);
  const isMountedRef = useRef(true);
  const currentFetchUserIdRef = useRef<string | null>(null);

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
      if (!keepOnError) setProfile(null);
      setProfileReady(true);
      return;
    }

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
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!isMountedRef.current) return;
        setSession(session);
        if (session?.user) {
          // ── Tab prefetches — add new tab-level queries here ──────────────────
          // Fire before any awaits so data is warm before tabs mount.
          prefetchTimeline(session.user.id);
          fetchCollections(session.user.id)
            .then((data) => writeCollectionsCache(session.user.id, data))
            .catch(() => {});
          queryClient.prefetchQuery({
            queryKey: ["browseMeta", session.user.id],
            queryFn: () => fetchBrowseMetadata(session.user.id),
            staleTime: 60_000,
          });
          queryClient.prefetchQuery({
            queryKey: ["sharedScreen", session.user.id],
            queryFn: () => fetchSharedScreenData(session.user.id),
            staleTime: 2 * 60 * 1000,
          });

          // Stale-while-revalidate: lift AuthGate overlay immediately from cache, then refresh
          const cached = await readProfileCache(session.user.id);
          if (isMountedRef.current && cached) {
            setProfile(cached);
            setProfileReady(true);
            setLoading(false); // release overlay immediately
          }

          try {
            await fetchProfile(session.user.id, { keepOnError: cached !== null, email: session.user.email });
          } finally {
            if (isMountedRef.current) setLoading(false);
          }
        } else {
          if (isMountedRef.current) setLoading(false);
        }
      })
      .catch(async () => {
        // Corrupted session in storage (e.g. HTML error page cached during outage)
        await supabase.auth.signOut({ scope: "local" });
        if (isMountedRef.current) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!suppressAuth.current) {
        setSession(session);
        if (session?.user) {
          try {
            await fetchProfile(session.user.id, { email: session.user.email });
          } catch {
            if (isMountedRef.current) setProfileReady(true);
          }
        } else {
          posthog.reset();
          Sentry.setUser(null);
          setProfile(null);
          setProfileReady(false);
        }
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
      clearCollectionsCache(userId);
      clearAllCollectionMomentsCache(userId);
    }
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

  const contextValue = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profileReady,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [session, profile, loading, profileReady]);

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
