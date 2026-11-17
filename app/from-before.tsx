import { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import { PastPairingRow } from "@/components/PastPairingRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { currentWeek } from "@/lib/lastWeek";
import { captureParams, songForCreate } from "@/lib/lastWeekData";
import { photoWindow } from "@/lib/libraryMoments";
import { addedOnLabel, pairingReason } from "@/lib/pastPairings";
import { loadFromBefore, type PastPairing } from "@/lib/pastPairingsData";

/**
 * From before on its own (1.4), reached from the long-press menu on +. The
 * same weekly picks as the end of Rediscover (same query), so a pick made
 * here is the one shown there.
 */
export default function FromBeforeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { user } = useAuth();
  const weekKey = currentWeek(Date.now()).key;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fromBefore", user?.id, weekKey],
    queryFn: () => loadFromBefore(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const open = useCallback(
    (p: PastPairing) => {
      if (!data) return;
      const song = songForCreate(p.song, data.catalog);
      router.push({
        pathname: "/create",
        params: captureParams(song, p.song.at, p.song.day, "from_before", photoWindow(p.song.at)),
      });
    },
    [data, router]
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  } else if (error) {
    body = <ErrorState message={friendlyError(error)} onRetry={() => void refetch()} />;
  } else if (!data || data.pairings.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing stands out this week</Text>
        <Text style={styles.emptyText}>
          From before picks old songs from weeks when you took far more photos than usual. A new set comes each week.
        </Text>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.note}>From your library and photos. Not in your journal yet. A new set comes each week.</Text>
        {data.pairings.map((p, i) => (
          <PastPairingRow
            key={p.song.key}
            song={p.song}
            when={addedOnLabel(p.song.at)}
            line={pairingReason(p)}
            artworkUrl={songForCreate(p.song, data.catalog).artworkUrl}
            photoUris={p.photoUris}
            saved={!!data.saved[p.song.key]}
            first={i === 0}
            onPress={() => open(p)}
            onOpenSaved={() => router.push(`/moment/${data.saved[p.song.key]}`)}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="From before" />
      {body}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing["4xl"] },
    note: { ...theme.typography.meta, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing["3xl"], gap: theme.spacing.sm },
    emptyTitle: { ...theme.typography.title, color: theme.colors.text, textAlign: "center" },
    emptyText: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
  });
}
