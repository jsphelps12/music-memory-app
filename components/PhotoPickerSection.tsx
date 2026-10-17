import { Ref, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActionSheetIOS,
  StyleSheet,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { extractPhotoMetadata } from "@/lib/photoMetadata";
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
  onChange: (photos: string[]) => void;
  /** Called when EXIF data provides a date/location to auto-fill */
  onApplyMeta?: (date: Date | undefined, location: { name: string; lat: number | null; lng: number | null } | undefined) => void;
  /** Horizontal padding of the parent scroll view, used to extend the photo strip edge-to-edge */
  horizontalPadding?: number;
  /**
   * Capture screen (Phase 1): no big "Add Photos" button. The screen's Photo
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

  const [metaSuggestion, setMetaSuggestion] = useState<PhotoMetaSuggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);

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

  return (
    <>
      {!compact && (
        <TouchableOpacity style={styles.addButton} activeOpacity={0.7} onPress={handleAddPhotos}>
          <Text style={styles.addButtonText}>Add Photos</Text>
        </TouchableOpacity>
      )}

      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoScroll}
          contentContainerStyle={styles.photoScrollContent}
        >
          {photos.map((uri) => (
            <View key={uri} style={styles.thumbContainer}>
              <AppImage source={{ uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.removeButton} onPress={() => handleRemovePhoto(uri)}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {compact && (
            <TouchableOpacity
              style={[styles.thumb, styles.addTile]}
              activeOpacity={0.7}
              onPress={handleAddPhotos}
              accessibilityLabel="Add more photos"
            >
              <Ionicons name="add" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {metaSuggestion && !dismissed && onApplyMeta && (
        <View style={styles.metaBanner}>
          <View style={styles.metaBannerRow}>
            <Text style={styles.metaBannerLabel}>From Photo</Text>
            <TouchableOpacity
              onPress={() => setDismissed(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.metaDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.metaBannerBody}>
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
          <TouchableOpacity style={styles.metaUseButton} activeOpacity={0.7} onPress={handleApplyMeta}>
            <Text style={styles.metaUseText}>Use</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

function createStyles(theme: Theme, horizontalPadding: number, compact: boolean) {
  return StyleSheet.create({
    addButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: "dashed",
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    addButtonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    photoScroll: {
      marginTop: compact ? 0 : 10,
      marginHorizontal: -horizontalPadding,
    },
    photoScrollContent: {
      paddingHorizontal: horizontalPadding,
      gap: 10,
    },
    addTile: {
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbContainer: {
      position: "relative",
    },
    thumb: {
      width: 80,
      height: 80,
      borderRadius: theme.radii.sm,
    },
    removeButton: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.7)",
      alignItems: "center",
      justifyContent: "center",
    },
    removeText: {
      color: "#fff",
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
    },
    metaBanner: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    metaBannerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.xs,
    },
    metaBannerLabel: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    metaDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    metaBannerBody: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    metaUseButton: {
      backgroundColor: theme.colors.buttonBg,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    metaUseText: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.buttonText,
    },
  });
}
