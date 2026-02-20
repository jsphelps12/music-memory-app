import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Theme } from "@/constants/theme";
import { Moment } from "@/types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const { width: SW } = Dimensions.get("window");
const H_PAD = 16;
const CELL = Math.floor((SW - H_PAD * 2) / 7);

const pad = (n: number) => String(n).padStart(2, "0");

interface Props {
  moments: Moment[];
  onDayPress: (momentId: string) => void;
  theme: Theme;
}

export function CalendarView({ moments, onDayPress, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  const byDate = useMemo(() => {
    const map = new Map<string, Moment[]>();
    for (const m of moments) {
      if (!m.momentDate) continue;
      const arr = map.get(m.momentDate) ?? [];
      arr.push(m);
      map.set(m.momentDate, arr);
    }
    return map;
  }, [moments]);

  const undated = useMemo(() => moments.filter((m) => !m.momentDate), [moments]);

  const months = useMemo(() => {
    const dated = moments.filter((m) => m.momentDate);
    if (!dated.length) return [];
    const min = new Date(
      Math.min(...dated.map((m) => new Date(m.momentDate! + "T00:00:00").getTime()))
    );
    const result: Date[] = [];
    const cur = new Date();
    cur.setDate(1);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cur >= end) {
      result.push(new Date(cur));
      cur.setMonth(cur.getMonth() - 1);
    }
    return result;
  }, [moments]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {months.map((month) => {
        const y = month.getFullYear();
        const mo = month.getMonth();
        const daysInMonth = new Date(y, mo + 1, 0).getDate();
        const firstDow = new Date(y, mo, 1).getDay();

        // Skip months with no moments
        let hasAny = false;
        for (let d = 1; d <= daysInMonth; d++) {
          if (byDate.has(`${y}-${pad(mo + 1)}-${pad(d)}`)) { hasAny = true; break; }
        }
        if (!hasAny) return null;

        const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        return (
          <View key={`${y}-${mo}`} style={styles.monthBlock}>
            <Text style={styles.monthLabel}>{label}</Text>
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
                const dayMoments = byDate.get(dateStr);
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
                        <Image
                          source={{ uri: first.songArtworkUrl }}
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
                        <View style={[StyleSheet.absoluteFill, styles.cellAccent]} />
                        <Text style={[styles.dayNum, styles.dayNumOnArt]}>{day}</Text>
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
      })}

      {undated.length > 0 && (
        <View style={styles.undatedBlock}>
          <Text style={styles.monthLabel}>No Date</Text>
          {undated.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.undatedRow}
              activeOpacity={0.7}
              onPress={() => onDayPress(m.id)}
            >
              {m.songArtworkUrl ? (
                <Image source={{ uri: m.songArtworkUrl }} style={styles.undatedArt} />
              ) : (
                <View style={[styles.undatedArt, styles.artworkPlaceholder]} />
              )}
              <View style={styles.undatedInfo}>
                <Text style={styles.undatedTitle} numberOfLines={1}>{m.songTitle}</Text>
                <Text style={styles.undatedArtist} numberOfLines={1}>{m.songArtist}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
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
      fontSize: 11,
      color: theme.colors.textTertiary,
      fontWeight: theme.fontWeight.medium,
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
    cellToday: {
      borderWidth: 1.5,
      borderColor: theme.colors.accent,
    },
    cellArtwork: {},
    cellScrim: {
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    cellAccent: {
      backgroundColor: theme.colors.accent,
    },
    dayNum: {
      fontSize: 12,
      color: theme.colors.textTertiary,
      fontWeight: theme.fontWeight.medium,
    },
    dayNumOnArt: {
      color: "#fff",
      fontWeight: theme.fontWeight.semibold,
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    dayNumToday: {
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.bold,
    },
    badge: {
      position: "absolute",
      bottom: 2,
      right: 2,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 6,
      minWidth: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: {
      fontSize: 9,
      color: "#fff",
      fontWeight: theme.fontWeight.bold,
    },
    undatedBlock: {
      marginTop: theme.spacing.sm,
    },
    undatedRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    undatedArt: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.sm,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    undatedInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    undatedTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    undatedArtist: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}
