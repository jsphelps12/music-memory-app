import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { weekdayName, type WeekPhoto } from "@/lib/lastWeek";
import { photoFileUri, photosForDay, suggestDayPhotos } from "@/lib/lastWeekData";

const TILE = 64;

/**
 * "Photos from Saturday" in capture, when it was opened from Last week
 * (1.4). An offer, not a default: nothing is attached until tapped, a second
 * tap takes it off again, and the Photo chip works as always. Behind a
 * switch (Settings → long-press the version → Photos and music) while Josh
 * decides whether it stays.
 */
export function DayPhotosSuggestion({
  day,
  photos,
  onChange,
}: {
  /** Day key, "2026-11-15". */
  day: string;
  /** The moment's attached photos. */
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<WeekPhoto[] | null>(null);
  // Library id → the file URI it was attached as, to take it off again.
  const [attached, setAttached] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await suggestDayPhotos())) return;
      const found = await photosForDay(day);
      if (!cancelled) setItems(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [day]);

  if (!items || items.length === 0) return null;

  const toggle = async (photo: WeekPhoto) => {
    if (busy) return;
    Haptics.selectionAsync();
    const uri = attached[photo.id];
    if (uri && photos.includes(uri)) {
      onChange(photos.filter((p) => p !== uri));
      setAttached(({ [photo.id]: _gone, ...rest }) => rest);
      return;
    }
    setBusy(photo.id);
    const fileUri = await photoFileUri(photo);
    setBusy(null);
    if (!fileUri) return;
    setAttached((a) => ({ ...a, [photo.id]: fileUri }));
    onChange([...photos, fileUri]);
  };

  return (
    <View style={styles.wrap}>
      <SectionLabel meta={String(items.length)}>{`Photos from ${weekdayName(day)}`}</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.scroll}>
        {items.map((photo) => {
          const on = !!attached[photo.id] && photos.includes(attached[photo.id]);
          return (
            <TouchableOpacity
              key={photo.id}
              activeOpacity={0.8}
              onPress={() => toggle(photo)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={on ? "Remove this photo" : "Add this photo"}
            >
              <AppImage source={{ uri: photo.uri }} style={[styles.tile, on && styles.tileOn]} contentFit="cover" />
              {busy === photo.id ? (
                <View style={styles.overlay}>
                  <ActivityIndicator color={theme.colors.textSecondary} />
                </View>
              ) : on ? (
                <View style={styles.check}>
                  <Icon name="checkmark" size={14} color={theme.colors.buttonText} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { marginTop: theme.spacing.lg },
    scroll: { marginHorizontal: -theme.spacing.xl, marginTop: theme.spacing.xs },
    strip: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xs },
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.artworkPlaceholder,
      opacity: 0.85,
    },
    tileOn: { opacity: 1, borderWidth: 2, borderColor: theme.colors.text },
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.scrim,
    },
    check: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.buttonBg,
    },
  });
}
