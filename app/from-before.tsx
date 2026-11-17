import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";
import { Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { ErrorState } from "@/components/ErrorState";
import { PastPairingRow } from "@/components/PastPairingRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { currentWeek } from "@/lib/lastWeek";
import { captureParams, requestLastWeekAccess, songForCreate } from "@/lib/lastWeekData";
import { libraryAccessStatus } from "@/modules/now-playing";
import { useOnForeground } from "@/lib/appFocus";
import { photoWindow } from "@/lib/libraryMoments";
import { addedOnLabel, pairingReason } from "@/lib/pastPairings";
import {
  browseFromBefore,
  dismissPairing,
  fromBeforeYears,
  loadFromBefore,
  pairingFacts,
  type PastPairing,
  type PastPairings,
} from "@/lib/pastPairingsData";
import { prewarmQuestions, questionFor } from "@/lib/nudgeQuestionStore";

const PAGE = 6;
const STALE = 2 * 60 * 1000;

type Mode = "week" | "all" | number;

/**
 * From before on its own (1.4), from the long-press menu on +. "This week"
 * is the same weekly picks as the end of Rediscover; "All years" or a year
 * browses further, a page at a time. ✕ on a pick ("Not this one") means it
 * never comes back, here or in Rediscover.
 */
export default function FromBeforeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("week");
  const [limit, setLimit] = useState(PAGE);
  const weekKey = currentWeek(Date.now()).key;

  // From before needs both the Apple Music library and Photos. Without them
  // the list is empty for a different reason than a quiet week: say so, and
  // offer the ask (or iOS Settings once declined).
  const [access, setAccess] = useState<"ok" | "ask" | "denied" | null>(null);
  const checkAccess = useCallback(async () => {
    const library = libraryAccessStatus();
    let photos = "undetermined";
    try {
      photos = (await MediaLibrary.getPermissionsAsync()).status;
    } catch {}
    if (library === "authorized" && photos === "granted") setAccess("ok");
    else if (library === "notDetermined" || photos === "undetermined") setAccess("ask");
    else setAccess("denied");
  }, []);
  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);
  useOnForeground(() => void checkAccess());
  const askAccess = async () => {
    await requestLastWeekAccess();
    await checkAccess();
    void queryClient.invalidateQueries({ queryKey: ["fromBefore", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["fromBeforeBrowse", user?.id] });
  };

  const weekly = useQuery({
    queryKey: ["fromBefore", user?.id, weekKey],
    queryFn: () => loadFromBefore(user!.id),
    enabled: !!user,
    staleTime: STALE,
  });
  const years = useQuery({
    queryKey: ["fromBeforeYears", user?.id],
    queryFn: () => fromBeforeYears(),
    enabled: !!user,
    staleTime: STALE,
  });
  const browsing = mode !== "week";
  const browse = useQuery({
    queryKey: ["fromBeforeBrowse", user?.id, mode, limit],
    queryFn: () => browseFromBefore(user!.id, mode === "all" ? null : (mode as number), limit),
    enabled: !!user && browsing,
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });

  const current = browsing ? browse : weekly;
  const data: PastPairings | undefined = current.data;

  useEffect(() => {
    if (!data) return;
    void prewarmQuestions(data.pairings.map((p) => ({ key: `from_before:${p.song.key}`, facts: pairingFacts(p) })));
  }, [data]);

  const choose = (next: Mode) => {
    setMode(next);
    setLimit(PAGE);
    posthog?.capture("from_before_filter", { mode: typeof next === "number" ? "year" : next });
  };

  const open = useCallback(
    (p: PastPairing) => {
      if (!data) return;
      const song = songForCreate(p.song, data.catalog);
      const question = questionFor(`from_before:${p.song.key}`, pairingFacts(p));
      router.push({
        pathname: "/create",
        params: captureParams(song, p.song.at, p.song.day, "from_before", photoWindow(p.song.at), question),
      });
    },
    [data, router]
  );

  const dismiss = async (p: PastPairing) => {
    posthog?.capture("from_before_dismissed");
    await dismissPairing(p.song.key);
    void queryClient.invalidateQueries({ queryKey: ["fromBefore", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["fromBeforeBrowse", user?.id] });
  };

  let body: React.ReactNode;
  if (current.isLoading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  } else if (current.error) {
    body = <ErrorState message={friendlyError(current.error)} onRetry={() => void current.refetch()} />;
  } else if ((!data || data.pairings.length === 0) && (access === "ask" || access === "denied")) {
    body = (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>From before needs your library</Text>
        <Text style={styles.emptyText}>
          It pairs old songs from your Apple Music library with the photos you took the week you added them. Everything
          stays on this phone.
        </Text>
        <Button
          label={access === "ask" ? "Allow access" : "Open Settings"}
          onPress={access === "ask" ? () => void askAccess() : () => void Linking.openSettings()}
          fullWidth={false}
          align="center"
          style={styles.accessButton}
        />
      </View>
    );
  } else if (!data || data.pairings.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{browsing ? "Nothing stands out here" : "Nothing stands out this week"}</Text>
        <Text style={styles.emptyText}>
          From before picks old songs from weeks that stood out: far more photos than usual, time away from home, or
          photos you favorited.
        </Text>
      </View>
    );
  } else {
    const hasMore = browsing && data.pairings.length >= limit;
    body = (
      <ScrollView contentContainerStyle={styles.list}>
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
            onDismiss={() => void dismiss(p)}
          />
        ))}
        {hasMore ? (
          <View style={styles.more}>
            <Button
              label="Show more"
              variant="secondary"
              size="pill"
              loading={browse.isFetching}
              onPress={() => setLimit((n) => n + PAGE)}
            />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="From before" subtitle="From your library and photos. Not in your journal yet." />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="This week" selected={mode === "week"} onPress={() => choose("week")} />
          <Chip label="All years" selected={mode === "all"} onPress={() => choose("all")} />
          {(years.data ?? []).map((y) => (
            <Chip key={y} label={String(y)} selected={mode === y} onPress={() => choose(y)} />
          ))}
        </ScrollView>
      </View>
      {body}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    chips: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
    list: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing["4xl"] },
    more: { alignItems: "center", paddingTop: theme.spacing.lg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing["3xl"], gap: theme.spacing.sm },
    emptyTitle: { ...theme.typography.title, color: theme.colors.text, textAlign: "center" },
    emptyText: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
    accessButton: { marginTop: theme.spacing.md },
  });
}
