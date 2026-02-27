import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";
import { CustomMoodDefinition, UserProfile } from "@/types";
import { prefetchTimeline } from "@/lib/timelinePrefetch";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (updates: { displayName?: string; avatarUrl?: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveCustomMood: (mood: CustomMoodDefinition) => Promise<void>;
  deleteCustomMood: (value: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const suppressAuth = useRef(false);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      setProfile(null);
      return;
    }

    setProfile({
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      customMoods: data.custom_moods ?? [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
          prefetchTimeline(session.user.id);
        }
      } finally {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!suppressAuth.current) {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    });

    return () => subscription.unsubscribe();
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
        options: { emailRedirectTo: "tracks://" },
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const deleteAccount = async () => {
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) throw error;
    // Sign out locally — the auth state change will redirect to sign-in
    await supabase.auth.signOut();
  };

  const updateProfile = async (updates: { displayName?: string; avatarUrl?: string }) => {
    if (!session?.user) throw new Error("Not authenticated");

    const dbUpdates: Record<string, string> = {};
    if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
    if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;

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

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signIn,
        signUp,
        signInWithApple,
        signOut,
        deleteAccount,
        updateProfile,
        refreshProfile,
        saveCustomMood,
        deleteCustomMood,
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
