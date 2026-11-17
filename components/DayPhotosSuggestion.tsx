import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { SectionLabel } from "@/components/SectionLabel";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { weekdayName, type WeekPhoto } from "@/lib/lastWeek";
import { cameraPhotosChecked, photoFileUri, suggestDayPhotos } from "@/lib/lastWeekData";
import { warmAnalyses } from "@/lib/photoAnalysisStore";

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
  range,
  photos,
  onChange,
  onAssetIds,
}: {
  /** Day key, "2026-11-15". */
  day: string;
  /** The span to offer instead of the day (From before offers its week). */
  range?: { from: number; to: number };
  /** The moment's attached photos. */
  photos: string[];
  /** Capture's setter: functional updates, so photos loading at once don't drop each other. */
  onChange: Dispatch<SetStateAction<string[]>>;
  /** Which attached file is which library photo, so it links instead of uploading. */
  onAssetIds?: (map: Record<string, string>) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<WeekPhoto[] | null>(null);
  // Library id → the file URI it was attached as, to take it off again.
  const [attached, setAttached] = useState<Record<string, string>>({});
  // Tapped, original still loading: shown as picked straight away.
  const [pending, setPending] = useState<Record<string, true>>({});
  // File URIs for photos already on the phone, looked up ahead of a tap
  // (never downloads; iCloud-only originals load when picked).
  const localUris = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await suggestDayPhotos())) return;
      const [y, m, d] = day.split("-").map(Number);
      const span = range ?? { from: new Date(y, m - 1, d).getTime(), to: new Date(y, m - 1, d + 1).getTime() };
      const first = await cameraPhotosChecked(span.from, span.to);
      if (cancelled) return;
      setItems(first.photos);
      // Look at the rest in the background, then drop any that turn out boring.
      if (first.unanalyzed.length && (await warmAnalyses(first.unanalyzed)) && !cancelled) {
        const again = await cameraPhotosChecked(span.from, span.to);
        if (!cancelled) setItems(again.photos);
      }
      const found = first.photos;
      for (const photo of found.slice(0, 12)) {
        if (cancelled) return;
        const uri = await photoFileUri(photo, true);
        if (uri) localUris.current.set(photo.id, uri);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The range arrives as two numbers from route params; key on them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, range?.from, range?.to]);

  if (!items || items.length === 0) return null;

  const attach = (photo: WeekPhoto, fileUri: string) => {
    onAssetIds?.({ [fileUri]: photo.id });
    setAttached((a) => ({ ...a, [photo.id]: fileUri }));
    onChange((current) => (current.includes(fileUri) ? current : [...current, fileUri]));
  };

  const toggle = async (photo: WeekPhoto) => {
    if (pending[photo.id]) return;
    Haptics.selectionAsync();
    const uri = attached[photo.id];
    if (uri && photos.includes(uri)) {
      onChange((current) => current.filter((p) => p !== uri));
      setAttached(({ [photo.id]: _gone, ...rest }) => rest);
      return;
    }
    const local = localUris.current.get(photo.id);
    if (local) {
      attach(photo, local);
      return;
    }
    setPending((p) => ({ ...p, [photo.id]: true }));
    const fileUri = await photoFileUri(photo);
    setPending(({ [photo.id]: _done, ...rest }) => rest);
    if (fileUri) attach(photo, fileUri);
  };

  return (
    <View style={styles.wrap}>
      <SectionLabel meta={String(items.length)}>{range ? "Photos from that week" : `Photos from ${weekdayName(day)}`}</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.scroll}>
        {items.map((photo) => {
          const loading = !!pending[photo.id];
          const on = loading || (!!attached[photo.id] && photos.includes(attached[photo.id]));
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
              {on ? (
                <View style={styles.check}>
                  {loading ? (
                    <ActivityIndicator size="small" color={theme.colors.buttonText} />
                  ) : (
                    <Icon name="checkmark" size={14} color={theme.colors.buttonText} />
                  )}
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
