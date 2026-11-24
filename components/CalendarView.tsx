import { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { Theme, overImage } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { MomentCardData } from "@/types";
import { pad } from "@/lib/dateUtils";
import { artworkUrlAtSize } from "@/lib/itunes";
import { buildCalendarMonths, type CalendarMonth } from "@/lib/monthGroups";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
// Warm ink over artwork (DESIGN.md allows it over imagery) so the day number
// holds contrast; paper for the number itself.
const INK_VEIL = overImage.veil;
const INK_GLASS = overImage.glass;
const INK_SHADOW = overImage.textShadow;
const PAPER_ON_ART = overImage.text;
const { width: SW } = Dimensions.get("window");
const H_PAD = 16;
const CELL = Math.floor((SW - H_PAD * 2) / 7);
// What the cells draw, at 3x. The stored URL is the 600px detail image, and a
// year of days asked for that many full-size images.
const CELL_ARTWORK_PX = Math.min(600, Math.ceil(CELL * 3));
// 40pt undated rows, at 3x.
const ROW_ARTWORK_PX = 120;

/** All the calendar draws: the Journal fetches just these columns for it. */
export type CalendarMoment = Pick<
  MomentCardData,
  "id" | "momentDate" | "songArtworkUrl" | "songTitle" | "songArtist"
>;

interface Props {
  moments: CalendarMoment[];
  onDayPress: (momentId: string) => void;
  theme: Theme;
  loading?: boolean;
}

type Styles = ReturnType<typeof createStyles>;

// One list of months, then the undated moments as rows of their own, so both
// are windowed: only what's near the screen is mounted.
type Item =
  | { kind: "month"; key: string; month: CalendarMonth<CalendarMoment> }
  | { kind: "undatedHeader"; key: string }
  | { kind: "undated"; key: string; moment: CalendarMoment };

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function CalendarViewComponent({ moments, onDayPress, theme, loading }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  const items = useMemo<Item[]>(() => {
    const { months, undated } = buildCalendarMonths(moments);
    const list: Item[] = months.map((month) => ({ kind: "month", key: month.key, month }));
    if (undated.length > 0) {
      list.push({ kind: "undatedHeader", key: "undated" });
      for (const m of undated) list.push({ kind: "undated", key: `u-${m.id}`, moment: m });
    }
    return list;
  }, [moments]);

  const todayStr = todayString();

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.kind === "month") {
        return <MonthGrid month={item.month} todayStr={todayStr} onDayPress={onDayPress} styles={styles} />;
      }
      if (item.kind === "undatedHeader") {
        return <Text style={[styles.monthLabel, styles.undatedLabel]}>No date</Text>;
      }
      return <UndatedRow moment={item.moment} onDayPress={onDayPress} styles={styles} />;
    },
    [todayStr, onDayPress, styles]
  );

  // The spinner only before there's anything to show: a refresh of a calendar
  // already on screen keeps it (and its scroll position) in place.
  if (loading && moments.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.textSecondary} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      // A month is most of a screen tall, so a few at a time is plenty.
      initialNumToRender={3}
      maxToRenderPerBatch={2}
      windowSize={5}
      removeClippedSubviews
    />
  );
}

function keyOf(item: Item): string {
  return item.key;
}

const MonthGrid = memo(function MonthGrid({
  month,
  todayStr,
  onDayPress,
  styles,
}: {
  month: CalendarMonth<CalendarMoment>;
  todayStr: string;
  onDayPress: (momentId: string) => void;
  styles: Styles;
}) {
  const { year: y, month: mo, days } = month;
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const firstDow = new Date(y, mo, 1).getDay();

  return (
    <View style={styles.monthBlock}>
      <Text style={styles.monthLabel}>{month.label}</Text>
      <View style={styles.dowRow}>
        {DAYS.map((d, i) => (
          <View key={i} style={styles.dowCell}>
            <Text style={styles.dowText}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: firstDow }, (_, i) => (
          <View key={`b${i}`} style={styles.blankCell} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${y}-${pad(mo + 1)}-${pad(day)}`;
          const dayMoments = days.get(day);
          const hasMoment = !!dayMoments?.length;
          const first = dayMoments?.[0];
          const count = dayMoments?.length ?? 0;
          const isToday = dateStr === todayStr;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.cell, isToday && styles.cellToday]}
              onPress={() => first && onDayPress(first.id)}
              disabled={!hasMoment}
              activeOpacity={0.75}
            >
              {hasMoment && first?.songArtworkUrl ? (
                <>
                  <AppImage
                    source={{ uri: artworkUrlAtSize(first.songArtworkUrl, CELL_ARTWORK_PX) }}
                    style={[StyleSheet.absoluteFill, styles.cellArtwork]}
                    contentFit="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, styles.cellScrim]} />
                  <Text style={[styles.dayNum, styles.dayNumOnArt]}>{day}</Text>
                  {count > 1 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count}</Text>
                    </View>
                  )}
                </>
              ) : hasMoment ? (
                <>
                  {/* No artwork: an ink tile, not a terracotta one. */}
                  <View style={[StyleSheet.absoluteFill, styles.cellInk]} />
                  <Text style={[styles.dayNum, styles.dayNumOnInk]}>{day}</Text>
                  {count > 1 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{day}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const UndatedRow = memo(function UndatedRow({
  moment: m,
  onDayPress,
  styles,
}: {
  moment: CalendarMoment;
  onDayPress: (momentId: string) => void;
  styles: Styles;
}) {
  return (
    <TouchableOpacity style={styles.undatedRow} activeOpacity={0.7} onPress={() => onDayPress(m.id)}>
      {m.songArtworkUrl ? (
        <AppImage source={{ uri: artworkUrlAtSize(m.songArtworkUrl, ROW_ARTWORK_PX) }} style={styles.undatedArt} />
      ) : (
        <ArtworkPlaceholder style={styles.undatedArt} />
      )}
      <View style={styles.undatedInfo}>
        <Text style={styles.undatedTitle} numberOfLines={1}>{m.songTitle}</Text>
        <Text style={styles.undatedArtist} numberOfLines={1}>{m.songArtist}</Text>
      </View>
    </TouchableOpacity>
  );
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: H_PAD,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing["4xl"],
    },
    monthBlock: {
      marginBottom: theme.spacing["3xl"],
    },
    monthLabel: {
      ...theme.typography.label,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    dowRow: {
      flexDirection: "row",
      marginBottom: 4,
    },
    dowCell: {
      width: CELL,
      alignItems: "center",
      paddingVertical: 4,
    },
    dowText: {
      fontFamily: theme.fonts.bodyMedium,
      fontSize: 11,
      color: theme.colors.textTertiary,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    blankCell: {
      width: CELL,
      height: CELL,
    },
    cell: {
      width: CELL,
      height: CELL,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // Today is the view's one terracotta signal: a ring, never a fill.
    cellToday: {
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
    },
    cellArtwork: {},
    cellScrim: {
      backgroundColor: INK_VEIL,
    },
    cellInk: {
      backgroundColor: theme.colors.buttonBg,
    },
    dayNum: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textTertiary,
    },
    dayNumOnArt: {
      color: PAPER_ON_ART,
      fontFamily: theme.fonts.bodySemibold,
      textShadowColor: INK_SHADOW,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    dayNumOnInk: {
      color: theme.colors.buttonText,
      fontFamily: theme.fonts.bodySemibold,
    },
    dayNumToday: {
      color: theme.colors.text,
      fontFamily: theme.fonts.bodyBold,
    },
    badge: {
      position: "absolute",
      bottom: 2,
      right: 2,
      backgroundColor: INK_GLASS,
      borderRadius: 6,
      minWidth: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: {
      fontFamily: theme.fonts.bodyBold,
      fontSize: 9,
      color: PAPER_ON_ART,
    },
    undatedLabel: {
      marginTop: theme.spacing.sm,
    },
    undatedRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    undatedArt: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.sm,
    },
    undatedInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    undatedTitle: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
    },
    undatedArtist: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}

export const CalendarView = memo(CalendarViewComponent);
