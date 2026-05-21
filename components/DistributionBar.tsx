import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { Moment } from "@/types";

export function DistributionBar({ moments, color }: { moments: Moment[]; color: string }) {
  const theme = useTheme();

  const counts = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const m of moments) {
      if (!m.momentDate) continue;
      const key = m.momentDate.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length === 0) return [];
    const max = Math.max(...sorted.map(([, c]) => c));
    return sorted.map(([, c]) => c / max);
  }, [moments]);

  const dateRange = useMemo(() => {
    const dates = moments.map((m) => m.momentDate).filter(Boolean) as string[];
    if (dates.length === 0) return "";
    const sorted = [...dates].sort();
    const from = new Date(sorted[0] + "T00:00:00").getFullYear();
    const to = new Date(sorted[sorted.length - 1] + "T00:00:00").getFullYear();
    return from === to ? `${from}` : `${from} → today`;
  }, [moments]);

  if (counts.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
      <View style={[styles.card, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.label, { color: theme.colors.textTertiary }]}>WHEN</Text>
          <Text style={[styles.range, { color: theme.colors.textTertiary }]}>{dateRange}</Text>
        </View>
        <View style={styles.bars}>
          {counts.map((ratio, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: Math.max(3, ratio * 28),
                  backgroundColor: ratio > 0 ? color : theme.colors.border,
                  opacity: ratio > 0 ? 0.85 : 1,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: { fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 },
  range: { fontSize: 11 },
  bars: { flexDirection: "row", gap: 3, alignItems: "flex-end", height: 28 },
  bar: { flex: 1, borderRadius: 2 },
});
