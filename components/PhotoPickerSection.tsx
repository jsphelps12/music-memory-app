import { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { View, Text, Pressable, ActionSheetIOS, StyleSheet } from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { PhotoViewer } from "@/components/PhotoViewer";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import * as ImagePicker from "expo-image-picker";
import { extractPhotoMetadata } from "@/lib/photoMetadata";
import { moveItem, slotForDrag } from "@/lib/reorder";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export interface PhotoMetaSuggestion {
  date?: Date;
  location?: string;
  lat?: number;
  lng?: number;
}

interface PhotoPickerSectionProps {
  photos: string[];
  /** Also called with the new order after a drag-to-reorder. */
  onChange: (photos: string[]) => void;
  /** Called when EXIF data provides a date/location to auto-fill */
  onApplyMeta?: (date: Date | undefined, location: { name: string; lat: number | null; lng: number | null } | undefined) => void;
  /** Horizontal padding of the parent scroll view, used to extend the photo strip edge-to-edge */
  horizontalPadding?: number;
  /**
   * Capture screen (Phase 1): no big "Add photos" button. The screen's Photo
   * chip opens the picker through `ref`, and once there are photos the strip
   * ends in a small add tile.
   */
  compact?: boolean;
  /** A date/place found elsewhere (photos shared in from another app). */
  suggestion?: PhotoMetaSuggestion | null;
  ref?: Ref<PhotoPickerHandle>;
}

export interface PhotoPickerHandle {
  openPicker: () => void;
}

// Fixed tile width keeps the reorder slot math to one division.
const TILE = 80;
const GAP = 10;
const PITCH = TILE + GAP;
// Home Screen style: hold, then drag. A quicker swipe scrolls the strip.
const LONG_PRESS_MS = 350;
const LIFT_SCALE = 1.05;
const SPRING = { damping: 20, stiffness: 260, mass: 0.8 };

export function PhotoPickerSection({
  photos,
  onChange,
  onApplyMeta,
  horizontalPadding = 20,
  compact = false,
  suggestion,
  ref,
}: PhotoPickerSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme, horizontalPadding, compact), [theme, horizontalPadding, compact]);
  const reduceMotion = useReducedMotion();

  const [metaSuggestion, setMetaSuggestion] = useState<PhotoMetaSuggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // The drag reorders this on the UI thread; React only hears the result on
  // release, through onChange.
  const order = useSharedValue<string[]>(photos);
  const activeUri = useSharedValue<string | null>(null);
  const startSlot = useSharedValue(0);
  const targetSlot = useSharedValue(0);

  useEffect(() => {
    order.value = photos;
  }, [photos, order]);

  useEffect(() => {
    if (suggestion) {
      setMetaSuggestion(suggestion);
      setDismissed(false);
    }
  }, [suggestion]);

  const handleAddPhotos = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Library"],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;

        if (buttonIndex === 1) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") return;
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            exif: true,
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            quality: 0.8,
            exif: true,
          });
        }

        if (result && !result.canceled) {
          const uris = result.assets.map((a) => a.uri);
          onChange([...photos, ...uris]);
          const meta = await extractPhotoMetadata(result.assets);
          if (meta.date || meta.location) {
            setMetaSuggestion(meta);
            setDismissed(false);
          }
        }
      }
    );
  };

  useImperativeHandle(ref, () => ({ openPicker: handleAddPhotos }));

  const handleRemovePhoto = (uri: string) => {
    Haptics.selectionAsync();
    onChange(photos.filter((p) => p !== uri));
  };

  const handleApplyMeta = () => {
    if (!metaSuggestion || !onApplyMeta) return;
    const loc = metaSuggestion.location
      ? { name: metaSuggestion.location, lat: metaSuggestion.lat ?? null, lng: metaSuggestion.lng ?? null }
      : undefined;
    onApplyMeta(metaSuggestion.date, loc);
    setDismissed(true);
    Haptics.selectionAsync();
  };

  const handlePickUp = useCallback(() => {
    setDragging(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleSlotChange = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const handleDrop = useCallback(
    (next: string[] | null) => {
      setDragging(false);
      if (next) onChange(next);
    },
    [onChange]
  );

  const handleOpen = useCallback(
    (uri: string) => {
      const index = photos.indexOf(uri);
      if (index >= 0) setViewerIndex(index);
    },
    [photos]
  );

  // VoiceOver can't hold and drag; it gets "Move earlier / later" actions.
  const handleMoveBy = useCallback(
    (uri: string, delta: number) => {
      const from = photos.indexOf(uri);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= photos.length) return;
      onChange(moveItem(photos, from, to));
    },
    [photos, onChange]
  );

  const showCover = photos.length > 1;

  return (
    <>
      {!compact && (
        <Button
          label="Add photos"
          icon="image-outline"
          variant="secondary"
          onPress={handleAddPhotos}
        />
      )}

      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!dragging}
          style={styles.photoScroll}
          contentContainerStyle={styles.photoScrollContent}
        >
          <View style={[styles.tiles, { width: photos.length * PITCH - GAP }, showCover && styles.tilesWithCover]}>
            {photos.map((uri, index) => (
              <PhotoTile
                key={uri}
                uri={uri}
                index={index}
                count={photos.length}
                order={order}
                activeUri={activeUri}
                startSlot={startSlot}
                targetSlot={targetSlot}
                reduceMotion={reduceMotion}
                onPickUp={handlePickUp}
                onSlotChange={handleSlotChange}
                onDrop={handleDrop}
                onOpen={handleOpen}
                onRemove={handleRemovePhoto}
                onMoveBy={handleMoveBy}
                styles={styles}
                theme={theme}
              />
            ))}
            {/* The first photo is the entry's cover; the label stays with the
                slot, so dragging a photo here makes it the cover. */}
            {showCover ? (
              <Text style={styles.coverLabel} numberOfLines={1}>
                Cover
              </Text>
            ) : null}
          </View>
          {compact && (
            <Pressable
              style={({ pressed }) => [styles.thumb, styles.addTile, pressed && styles.pressed]}
              onPress={handleAddPhotos}
              accessibilityRole="button"
              accessibilityLabel="Add more photos"
            >
              <Icon name="add" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </ScrollView>
      )}

      {metaSuggestion && !dismissed && onApplyMeta && (
        <View style={styles.metaRow}>
          <Icon name="image-outline" size={18} color={theme.colors.textSecondary} />
          <View style={styles.metaText}>
            <Text style={styles.metaLabel}>From the photo</Text>
            <Text style={styles.metaBody} numberOfLines={2}>
              {[
                metaSuggestion.date &&
                  `Taken ${metaSuggestion.date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}`,
                metaSuggestion.location && `in ${metaSuggestion.location}`,
              ]
                .filter(Boolean)
                .join(" ")}
            </Text>
          </View>
          <Button label="Use" size="pill" variant="secondary" onPress={handleApplyMeta} align="center" />
          <IconButton
            name="close"
            size={18}
            color={theme.colors.textSecondary}
            onPress={() => setDismissed(true)}
            accessibilityLabel="Dismiss"
            style={styles.metaDismiss}
          />
        </View>
      )}

      {photos.length > 0 ? (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex ?? 0}
          visible={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

interface TileProps {
  uri: string;
  index: number;
  count: number;
  order: SharedValue<string[]>;
  activeUri: SharedValue<string | null>;
  startSlot: SharedValue<number>;
  targetSlot: SharedValue<number>;
  reduceMotion: boolean;
  onPickUp: () => void;
  onSlotChange: () => void;
  onDrop: (next: string[] | null) => void;
  onOpen: (uri: string) => void;
  onRemove: (uri: string) => void;
  onMoveBy: (uri: string, delta: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}

function PhotoTile({
  uri,
  index,
  count,
  order,
  activeUri,
  startSlot,
  targetSlot,
  reduceMotion,
  onPickUp,
  onSlotChange,
  onDrop,
  onOpen,
  onRemove,
  onMoveBy,
  styles,
  theme,
}: TileProps) {
  // Each tile is absolutely placed by translateX, so its slot comes from the
  // shared order, not from where React happens to render it.
  const x = useSharedValue(index * PITCH);
  const lift = useSharedValue(0);
  // Where React renders it, for the moment before the shared order hears
  // about a newly added photo. A shared value, not a reaction dependency: a
  // re-created reaction would snap the tile instead of letting it settle.
  const renderedIndex = useSharedValue(index);
  useEffect(() => {
    renderedIndex.value = index;
  }, [index, renderedIndex]);

  // Others slide aside as the held tile crosses them (and close up after a
  // removal). The held tile follows the finger instead.
  useAnimatedReaction(
    () => {
      const i = order.value.indexOf(uri);
      return i >= 0 ? i : renderedIndex.value;
    },
    (slot, prev) => {
      if (activeUri.value === uri) return;
      const to = slot * PITCH;
      if (prev === null || reduceMotion) x.value = to;
      else if (slot !== prev) x.value = withSpring(to, SPRING);
    },
    [reduceMotion]
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart(() => {
        const from = order.value.indexOf(uri);
        startSlot.value = from;
        targetSlot.value = from;
        activeUri.value = uri;
        lift.value = reduceMotion ? 1 : withSpring(1, SPRING);
        runOnJS(onPickUp)();
      })
      .onUpdate((e) => {
        if (activeUri.value !== uri) return;
        x.value = startSlot.value * PITCH + e.translationX;
        const next = slotForDrag(startSlot.value, e.translationX, PITCH, order.value.length);
        if (next !== targetSlot.value) {
          order.value = moveItem(order.value, targetSlot.value, next);
          targetSlot.value = next;
          runOnJS(onSlotChange)();
        }
      })
      .onFinalize(() => {
        if (activeUri.value !== uri) return;
        activeUri.value = null;
        const to = targetSlot.value * PITCH;
        x.value = reduceMotion ? to : withSpring(to, SPRING);
        lift.value = reduceMotion ? 0 : withSpring(0, SPRING);
        runOnJS(onDrop)(targetSlot.value !== startSlot.value ? order.value.slice() : null);
      });
    const tap = Gesture.Tap().onEnd((_e, success) => {
      if (success) runOnJS(onOpen)(uri);
    });
    // The tap only wins when the hold never turned into a drag.
    return Gesture.Exclusive(pan, tap);
  }, [uri, order, activeUri, startSlot, targetSlot, x, lift, reduceMotion, onPickUp, onSlotChange, onDrop, onOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { scale: reduceMotion ? 1 : 1 + (LIFT_SCALE - 1) * lift.value },
    ],
    shadowOpacity: 0.22 * lift.value,
    zIndex: lift.value > 0 ? 10 : 0,
  }));

  const isCover = index === 0 && count > 1;

  return (
    <Animated.View style={[styles.tile, animatedStyle]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={styles.thumbWrap}
          accessible
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${index + 1} of ${count}${isCover ? ", cover" : ""}`}
          accessibilityHint="Opens the photo. Hold and drag to reorder."
          accessibilityActions={[
            { name: "activate" },
            ...(index > 0 ? [{ name: "moveEarlier", label: "Move earlier" }] : []),
            ...(index < count - 1 ? [{ name: "moveLater", label: "Move later" }] : []),
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "activate") onOpen(uri);
            else if (e.nativeEvent.actionName === "moveEarlier") onMoveBy(uri, -1);
            else if (e.nativeEvent.actionName === "moveLater") onMoveBy(uri, 1);
          }}
        >
          <AppImage source={{ uri }} style={styles.thumb} />
        </Animated.View>
      </GestureDetector>
      <Pressable
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
        onPress={() => onRemove(uri)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove photo ${index + 1}`}
      >
        <Icon name="close" size={14} color={overPhotoInk(theme)} />
      </Pressable>
    </Animated.View>
  );
}

/** Paper on the warm-ink disc, in either theme. */
function overPhotoInk(theme: Theme) {
  return theme.isDark ? theme.colors.text : theme.colors.background;
}

function createStyles(theme: Theme, horizontalPadding: number, compact: boolean) {
  return StyleSheet.create({
    photoScroll: {
      marginTop: compact ? 0 : theme.spacing.md,
      marginHorizontal: -horizontalPadding,
      flexGrow: 0,
    },
    photoScrollContent: {
      paddingHorizontal: horizontalPadding,
      // Room for the lifted tile's scale and shadow, which the scroll view
      // would otherwise clip.
      paddingVertical: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    tiles: {
      height: TILE,
    },
    tilesWithCover: {
      height: TILE + theme.spacing.xs + theme.typography.meta.lineHeight,
    },
    tile: {
      position: "absolute",
      left: 0,
      top: 0,
      width: TILE,
      height: TILE,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.chipBg,
      shadowColor: theme.isDark ? theme.colors.background : theme.colors.text,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 12,
      shadowOpacity: 0,
    },
    thumbWrap: {
      width: TILE,
      height: TILE,
    },
    thumb: {
      width: TILE,
      height: TILE,
      borderRadius: theme.radii.sm,
    },
    addTile: {
      marginLeft: GAP,
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    coverLabel: {
      ...theme.typography.meta,
      position: "absolute",
      left: 0,
      top: TILE + theme.spacing.xs,
      width: TILE,
      color: theme.colors.textSecondary,
    },
    // Over the photo, so warm ink rather than a theme surface.
    removeButton: {
      position: "absolute",
      top: theme.spacing.xs,
      right: theme.spacing.xs,
      width: 22,
      height: 22,
      borderRadius: theme.radii.full,
      backgroundColor: "rgba(35,34,43,0.72)",
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: { opacity: 0.7 },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    metaText: {
      flex: 1,
    },
    metaLabel: {
      ...theme.typography.label,
      color: theme.colors.textSecondary,
    },
    metaBody: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginTop: 2,
    },
    metaDismiss: {
      marginLeft: -theme.spacing.sm,
      marginRight: -theme.spacing.md,
    },
  });
}
