import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCollectionByInviteCode, joinCollection } from "@/lib/collections";
import { setPendingCollectionId } from "@/lib/pendingCollection";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { friendlyError } from "@/lib/errors";
import { CollectionPreview } from "@/types";

type ScreenState = "loading" | "not_found" | "already_owner" | "already_member" | "ready" | "joining";

export default function JoinScreen() {
  const { inviteCode } = useLocalSearchParams<{ inviteCode: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const [state, setState] = useState<ScreenState>("loading");
  const [collection, setCollection] = useState<CollectionPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inviteCode || !user) return;
    loadPreview();
  }, [inviteCode, user]);

  async function loadPreview() {
    setState("loading");
    setError("");
    try {
      const data = await fetchCollectionByInviteCode(inviteCode);
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
      const { data: membership } = await supabase
        .from("collection_members")
        .select("collection_id")
        .eq("collection_id", data.id)
        .eq("user_id", user!.id)
        .single();

      setState(membership ? "already_member" : "ready");
    } catch {
      setState("not_found");
    }
  }

  async function handleJoin() {
    if (!inviteCode || !user) return;
    setState("joining");
    setError("");
    try {
      const joined = await joinCollection(inviteCode, user.id);
      setPendingCollectionId(joined.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      setError(friendlyError(e));
      setState("ready");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Handle + close */}
      <View style={[styles.handle, { backgroundColor: theme.colors.textTertiary }]} />
      <TouchableOpacity style={styles.closeButton} onPress={() => router.replace("/(tabs)")} hitSlop={8}>
        <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
      </TouchableOpacity>

      {state === "loading" && (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
        </View>
      )}

      {state === "not_found" && (
        <View style={styles.centered}>
          <Ionicons name="link-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            Link not found
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            This invite link may have expired or the collection was made private.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "already_owner" && collection && (
        <View style={styles.centered}>
          <Ionicons name="star" size={48} color={theme.colors.accent} />
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            This is your collection
          </Text>
          <Text style={[styles.collectionName, { color: theme.colors.text }]}>
            {collection.name}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Share the invite link with friends so they can join.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "already_member" && collection && (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={48} color={theme.colors.accent} />
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            You're already in this collection
          </Text>
          <Text style={[styles.collectionName, { color: theme.colors.text }]}>
            {collection.name}
          </Text>
          {collection.ownerName ? (
            <Text style={[styles.ownerName, { color: theme.colors.textSecondary }]}>
              by {collection.ownerName}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      {(state === "ready" || state === "joining") && collection && (
        <View style={styles.content}>
          <View style={styles.collectionIcon}>
            <Ionicons name="people" size={36} color={theme.colors.accent} />
          </View>

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            You've been invited to
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {collection.name}
          </Text>
          {collection.ownerName ? (
            <Text style={[styles.ownerName, { color: theme.colors.textSecondary }]}>
              by {collection.ownerName}
            </Text>
          ) : null}

          <View style={[styles.statsRow, { borderColor: theme.colors.border }]}>
            <Ionicons name="musical-notes-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.statsText, { color: theme.colors.textSecondary }]}>
              {collection.momentCount} {collection.momentCount === 1 ? "moment" : "moments"}
            </Text>
          </View>

          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.accent },
              state === "joining" && styles.buttonDisabled,
            ]}
            onPress={handleJoin}
            disabled={state === "joining"}
            activeOpacity={0.8}
          >
            {state === "joining" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Join Collection</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(tabs)")} activeOpacity={0.7} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
              Not now
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    opacity: 0.3,
  },
  closeButton: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  collectionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232, 130, 92, 0.12)",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  collectionName: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  ownerName: {
    fontSize: 15,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 32,
  },
  statsText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginVertical: 12,
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    fontSize: 15,
  },
});
