import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useAuth } from "@/contexts/AuthContext";
import { useLastWeek } from "@/hooks/useLastWeek";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { artworkUrlAtSize } from "@/lib/itunes";
import { lastWeekRowState, weekLabel } from "@/lib/lastWeek";
import { dismissAccessAsk, dismissWeek, requestLastWeekAccess, songForCreate } from "@/lib/lastWeekData";

const STACK = 3;
const THUMB = 40;

/**
 * "Last week" at the top of the Journal (1.4): a ruled row, not a banner.
 * It appears from Sunday evening for the week that's ending and stays all
 * week; using it doesn't clear it, only the next week or its ✕ does. Before
 * access is granted it asks once, and never again after a no or a ✕.
 */
export function LastWeekRow() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data } = useLastWeek({ observe: true });
  const [asking, setAsking] = useState(false);

  if (!data) return null;
  const state = lastWeekRowState({
    week: data.week,
    access: data.access,
    askDismissed: data.askDismissed,
    dismissedWeek: data.dismissedWeek,
    hasContent: data.hasContent,
  });
  if (state === "hidden") return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lastWeek", user?.id] });

  if (state === "ask") {
    return (
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>Last week</Text>
          <Text style={styles.body}>
            Each week, see the songs you added and played and the photos you took, to start moments from. It all
            stays on this phone.
          </Text>
          <View style={styles.askActions}>
            <Button
              label="Turn on"
              size="pill"
              loading={asking}
              onPress={async () => {
                setAsking(true);
                const access = await requestLastWeekAccess();
                posthog?.capture("last_week_access", { access });
                if (access !== "granted") await dismissAccessAsk();
                setAsking(false);
                void refresh();
              }}
            />
          </View>
        </View>
        <IconButton
          name="close"
          size={18}
          color={theme.colors.textSecondary}
          accessibilityLabel="Not now"
          onPress={async () => {
            await dismissAccessAsk();
            void refresh();
          }}
        />
      </View>
    );
  }

  const songCount = data.songs.length;
  const counts = [
    songCount ? `${songCount} ${songCount === 1 ? "song" : "songs"}` : null,
    data.photoCount ? `${data.photoCount} ${data.photoCount === 1 ? "photo" : "photos"}` : null,
  ].filter(Boolean);
  const meta = [weekLabel(data.week), ...counts].join(" · ");

  // Artwork carries the color; a week with no songs shows its photos instead.
  const thumbs: string[] = data.songs
    .map((s) => songForCreate(s, data.catalog).artworkUrl)
    .filter(Boolean)
    .slice(0, STACK)
    .map((u) => artworkUrlAtSize(u, THUMB * 3));
  if (thumbs.length === 0) {
    for (const d of data.days) for (const p of d.photos) if (thumbs.length < STACK) thumbs.push(p.uri);
  }
  const unseen = data.seenWeek !== data.week.key;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Last week, ${meta}${unseen ? ", new" : ""}`}
      onPress={() => {
        posthog?.capture("last_week_opened", { from: "journal_row", songs: songCount, photos: data.photoCount });
        router.push("/last-week");
      }}
    >
      <View style={[styles.stack, { width: THUMB + (Math.max(thumbs.length, 1) - 1) * (THUMB * 0.45) }]}>
        {thumbs.map((uri, i) => (
          <AppImage
            key={`${uri}-${i}`}
            source={{ uri }}
            style={[styles.thumb, { left: i * THUMB * 0.45, zIndex: STACK - i }]}
            contentFit="cover"
          />
        ))}
      </View>
      <View style={styles.textCol}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>Last week</Text>
          {unseen ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <IconButton
        name="close"
        size={18}
        color={theme.colors.textTertiary}
        accessibilityLabel="Hide last week"
        onPress={async () => {
          posthog?.capture("last_week_dismissed", { songs: songCount, photos: data.photoCount });
          await dismissWeek(data.week);
          void refresh();
        }}
      />
      <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      marginBottom: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    stack: {
      height: THUMB,
    },
    thumb: {
      position: "absolute",
      top: 0,
      width: THUMB,
      height: THUMB,
      borderRadius: theme.radii.sm,
      borderWidth: 1.5,
      borderColor: theme.colors.background,
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    textCol: {
      flex: 1,
      gap: 2,
    },
    titleLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    body: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
    askActions: {
      flexDirection: "row",
      marginTop: theme.spacing.md,
    },
  });
}
