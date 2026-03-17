import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";
import { CustomMoodDefinition, CustomPromptCategory, FavoriteArtist, FavoriteSong, UserProfile } from "@/types";
import { prefetchTimeline, clearTimelineCache } from "@/lib/timelinePrefetch";

export interface OnboardingData {
  displayName: string;
  username?: string;
  birthYear: number | null;
  country: string | null;
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
  saveOnboardingData: (data: Pick<OnboardingData, "displayName" | "username" | "birthYear" | "country">) => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  saveCustomMood: (mood: CustomMoodDefinition) => Promise<void>;
  deleteCustomMood: (value: string) => Promise<void>;
  saveCustomPromptCategory: (category: CustomPromptCategory) => Promise<void>;
  deleteCustomPromptCategory: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const suppressAuth = useRef(false);
  const isMountedRef = useRef(true);
  const currentFetchUserIdRef = useRef<string | null>(null);

  async function fetchProfile(userId: string) {
    currentFetchUserIdRef.current = userId;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    // Discard result if user changed while fetch was in-flight
    if (currentFetchUserIdRef.current !== userId) return;

    if (error || !data) {
      setProfile(null);
      setProfileReady(true);
      return;
    }

    setProfile({
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      username: data.username ?? null,
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
    });
    setProfileReady(true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMountedRef.current) return;
      try {
        setSession(session);
        if (session?.user) {
          posthog.identify(session.user.id, { $set: { email: session.user.email } });
          await fetchProfile(session.user.id);
          prefetchTimeline(session.user.id);
        }
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!suppressAuth.current) {
        setSession(session);
        if (session?.user) {
          posthog.identify(session.user.id, { $set: { email: session.user.email } });
          await fetchProfile(session.user.id);
        } else {
          posthog.reset();
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (userId) clearTimelineCache(userId);
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
    if (updates.username !== undefined) dbUpdates.username = updates.username ? updates.username.toLowerCase().trim() : null;
    if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;
    if (updates.birthYear !== undefined) dbUpdates.birth_year = updates.birthYear;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.favoriteArtists !== undefined) dbUpdates.favorite_artists = updates.favoriteArtists;
    if (updates.favoriteSongs !== undefined) dbUpdates.favorite_songs = updates.favoriteSongs;
    if (updates.genrePreferences !== undefined) dbUpdates.genre_preferences = updates.genrePreferences;

    const { error } = await supabase
      .from("profiles")
      .update(dbUpdates)
      .eq("id", session.user.id);

    if (error) throw error;

    await fetchProfile(session.user.id);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  const saveOnboardingData = async (data: Pick<OnboardingData, "displayName" | "username" | "birthYear" | "country">) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updates: Record<string, any> = {
      display_name: data.displayName,
      birth_year: data.birthYear,
      country: data.country,
    };
    if (data.username) updates.username = data.username.toLowerCase().trim();
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id);
    if (error) throw error;
    await fetchProfile(session.user.id);
  };

  const completeOnboarding = async (data: OnboardingData) => {
    if (!session?.user) throw new Error("Not authenticated");
    const updates: Record<string, any> = {
      display_name: data.displayName,
      birth_year: data.birthYear,
      country: data.country,
      favorite_artists: data.favoriteArtists,
      favorite_songs: data.favoriteSongs,
      genre_preferences: data.genrePreferences,
      onboarding_completed: true,
    };
    if (data.username) updates.username = data.username.toLowerCase().trim();
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id);
    if (error) throw error;
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

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
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
