import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { AlbumUnavailableError, fetchAlbumByInviteCode, joinAlbum } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";
import { AlbumPreview } from "@/types";

type ScreenState = "loading" | "not_found" | "error" | "already_owner" | "already_member" | "ready" | "joining";

export default function JoinScreen() {
  const { inviteCode } = useLocalSearchParams<{ inviteCode: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  const [state, setState] = useState<ScreenState>("loading");
  const [collection, setCollection] = useState<AlbumPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inviteCode || !user) return;
    loadPreview();
  }, [inviteCode, user]);

  async function loadPreview() {
    setState("loading");
    setError("");
    try {
      const data = await fetchAlbumByInviteCode(inviteCode);
      if (!data) {
        setState("not_found");
        return;
      }
      setCollection(data);

      // Owner can't join their own collection
      if (data.ownerId === user!.id) {
        setState("already_owner");
        return;
      }

      // Check if already a member
      const { data: membership, error: membershipError } = await supabase
        .from("collection_members")
        .select("collection_id")
        .eq("collection_id", data.id)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (membershipError) throw membershipError;
      setState(membership ? "already_member" : "ready");
    } catch (e) {
      // A missing album returns null above; reaching here means the lookup
      // itself failed (offline, a timeout), so offer a retry rather than
      // calling a working link dead.
      setError(friendlyError(e));
      setState("error");
    }
  }

  function openAlbum(albumId: string) {
    router.replace({ pathname: "/album/[id]", params: { id: albumId } });
  }

  function leave() {
    router.replace("/(tabs)");
  }

  async function handleJoin() {
    if (!inviteCode || !user) return;
    setState("joining");
    setError("");
    try {
      const joined = await joinAlbum(inviteCode, user.id);
      posthog.capture("collection_joined", { collection_name: collection?.name ?? null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The Albums screen, You's album row and badge caches still predate
      // this membership; without this the album is missing from them.
      invalidateAlbumCaches(queryClient, user.id, joined.id);
      // Land in the album just joined: albums aren't a tab any more, so the
      // Journal would leave no trace of it.
      openAlbum(joined.id);
    } catch (e) {
      if (e instanceof AlbumUnavailableError) {
        setState("not_found");
        return;
      }
      setError(friendlyError(e));
      setState("ready");
    }
  }

  const byLine = (c: AlbumPreview) =>
    [c.ownerName ? `by ${c.ownerName}` : null, pluralMoments(c.momentCount)].filter(Boolean).join(" · ");

  return (
    <View style={styles.container}>
      {/* A presented task (joining from a link), so it closes with an ✕. */}
      <ScreenHeader leading="close" onLeadingPress={leave} />

      {state === "loading" && (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.textSecondary} size="large" />
        </View>
      )}

      {state === "not_found" && (
        <View style={styles.centered}>
          <Ionicons name="link-outline" size={44} color={theme.colors.textSecondary} />
          <Text style={styles.stateTitle}>Link not found</Text>
          <Text style={styles.body}>
            This invite link may have expired or the album was made private.
          </Text>
          <Button label="Go back" onPress={leave} style={styles.primary} />
        </View>
      )}

      {state === "error" && (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={theme.colors.textSecondary} />
          <Text style={styles.stateTitle}>Couldn't open this invite</Text>
          <Text style={styles.body}>{error}</Text>
          <Button label="Try again" onPress={loadPreview} style={styles.primary} />
          <Button label="Not now" variant="text" tone="secondary" fullWidth onPress={leave} />
        </View>
      )}

      {state === "already_owner" && collection && (
        <View style={styles.centered}>
          <Text style={styles.albumName}>{collection.name}</Text>
          <Text style={styles.meta}>{pluralMoments(collection.momentCount)}</Text>
          <Text style={styles.body}>
            This is your album. Share the invite link with friends so they can join.
          </Text>
          <Button label="Open album" onPress={() => openAlbum(collection.id)} style={styles.primary} />
        </View>
      )}

      {state === "already_member" && collection && (
        <View style={styles.centered}>
          <Text style={styles.albumName}>{collection.name}</Text>
          <Text style={styles.meta}>{byLine(collection)}</Text>
          <Text style={styles.body}>You're already in this album.</Text>
          <Button label="Open album" onPress={() => openAlbum(collection.id)} style={styles.primary} />
        </View>
      )}

      {(state === "ready" || state === "joining") && collection && (
        <View style={styles.centered}>
          <Text style={styles.lead}>You've been invited to</Text>
          <Text style={styles.albumName}>{collection.name}</Text>
          <Text style={styles.meta}>{byLine(collection)}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Join album"
            onPress={handleJoin}
            loading={state === "joining"}
            style={styles.primary}
          />
          <Button label="Not now" variant="text" tone="secondary" fullWidth onPress={leave} />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["3xl"],
      // Optically centre against the header above.
      paddingBottom: theme.spacing["4xl"] * 2,
    },
    stateTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
      textAlign: "center",
      marginTop: theme.spacing.xl,
    },
    lead: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
    albumName: {
      ...theme.typography.headline,
      color: theme.colors.text,
      textAlign: "center",
    },
    meta: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.sm,
    },
    body: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.md,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
      textAlign: "center",
      marginTop: theme.spacing.lg,
    },
    primary: {
      marginTop: theme.spacing["3xl"],
      marginBottom: theme.spacing.xs,
    },
  });
}
