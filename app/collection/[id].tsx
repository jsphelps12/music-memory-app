import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { CollectionShareSheet } from "@/components/CollectionShareSheet";
import { ErrorState } from "@/components/ErrorState";
import { MOODS } from "@/constants/Moods";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { fetchSharedCollectionMoments, markCollectionViewed } from "@/lib/collections";
import { friendlyError } from "@/lib/errors";
import { Collection, Moment } from "@/types";

function groupByMonth(moments: Moment[]): { title: string; data: Moment[] }[] {
  const grouped: Record<string, Moment[]> = {};
  for (const m of moments) {
    const key = m.momentDate
      ? new Date(m.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "No Date";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  return Object.entries(grouped).map(([title, data]) => ({ title, data }));
}

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const fetchCollection = useCallback(async () => {
    if (!user || !id) return;
    setError("");

    try {
      // Try owned first
      const { data: owned } = await supabase
        .from("collections")
        .select("id, user_id, name, created_at, is_public, invite_code, collection_moments(moment_id)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (owned) {
        const col: Collection = {
          id: owned.id,
          userId: owned.user_id,
          name: owned.name,
          createdAt: owned.created_at,
          momentCount: (owned.collection_moments ?? []).length,
          isPublic: owned.is_public ?? false,
          inviteCode: owned.invite_code ?? undefined,
          role: "owner",
        };
        setCollection(col);
        await loadMoments(col);
        markCollectionViewed(id, user.id, "owner").catch(() => {});
        return;
      }

      // Try member
      const { data: membership } = await supabase
        .from("collection_members")
        .select("collection_id")
        .eq("collection_id", id)
        .eq("user_id", user.id)
        .single();

      if (membership) {
        const { data: joined } = await supabase
          .from("collections")
          .select("id, user_id, name, created_at, is_public, invite_code, collection_moments(moment_id)")
          .eq("id", id)
          .single();

        if (joined) {
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", joined.user_id)
            .single();

          const col: Collection = {
            id: joined.id,
            userId: joined.user_id,
            name: joined.name,
            createdAt: joined.created_at,
            momentCount: (joined.collection_moments ?? []).length,
            isPublic: joined.is_public ?? false,
            inviteCode: joined.invite_code ?? undefined,
            role: "member",
            ownerName: ownerProfile?.display_name ?? undefined,
          };
          setCollection(col);
          await loadMoments(col);
          markCollectionViewed(id, user.id, "member").catch(() => {});
          return;
        }
      }

      setError("Collection not found.");
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, user]);

  const loadMoments = async (col: Collection) => {
    if (col.isPublic) {
      const shared = await fetchSharedCollectionMoments(col.id);
      setMoments(shared);
    } else {
      // Personal owned collection
      const { data: cm } = await supabase
        .from("collection_moments")
        .select("moment_id")
        .eq("collection_id", col.id);
      const ids = (cm ?? []).map((r: any) => r.moment_id);
      if (ids.length === 0) { setMoments([]); return; }
      const { data } = await supabase
        .from("moments")
        .select("*")
        .in("id", ids)
        .order("moment_date", { ascending: false });
      setMoments((data ?? []).map(mapRowToMoment));
    }
  };

  useEffect(() => { fetchCollection(); }, [fetchCollection]);

  useFocusEffect(useCallback(() => { fetchCollection(); }, [fetchCollection]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCollection();
  }, [fetchCollection]);

  const sections = useMemo(() => groupByMonth(moments), [moments]);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      collectionId={collection?.id}
      collectionRole={collection?.role}
    />
  ), [allMoods, collection]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <ErrorState message={error} onRetry={fetchCollection} onBack={() => router.back()} />
    );
  }

  const isShared = collection?.isPublic;
  const isOwner = collection?.role === "owner";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {isShared && (
            <Ionicons
              name="people-outline"
              size={13}
              color={theme.colors.accentSecondary}
              style={{ marginBottom: 2 }}
            />
          )}
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {collection?.name ?? "Collection"}
          </Text>
          {collection?.ownerName && (
            <Text style={[styles.headerSub, { color: theme.colors.textSecondary }]}>
              by {collection.ownerName}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShareSheetVisible(true)}
          hitSlop={8}
          style={styles.shareBtn}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isOwner ? "settings-outline" : "ellipsis-horizontal"}
            size={22}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Moments */}
      {moments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="musical-notes-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No moments yet</Text>
          <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
            {isShared ? "Members can add moments to this collection." : "Add moments to this collection from the timeline."}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderMoment}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { color: theme.colors.textSecondary, backgroundColor: theme.colors.background }]}>
              {title}
            </Text>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent} />
          }
        />
      )}

      {/* Share sheet */}
      {collection && shareSheetVisible && (
        <CollectionShareSheet
          visible={shareSheetVisible}
          collection={collection}
          onClose={() => setShareSheetVisible(false)}
          onUpdated={(updated) => setCollection(updated)}
          onLeft={() => router.back()}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 56,
      paddingBottom: 12,
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { padding: 6, marginRight: 4 },
    headerCenter: {
      flex: 1,
      alignItems: "center",
    },
    headerTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    headerSub: {
      fontSize: theme.fontSize.xs,
      marginTop: 1,
    },
    shareBtn: { padding: 6, marginLeft: 4 },
    sectionHeader: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    listContent: {
      paddingBottom: 40,
    },
    emptyTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
      textAlign: "center",
    },
    emptySub: {
      fontSize: theme.fontSize.base,
      textAlign: "center",
      lineHeight: 22,
    },
  });
}
