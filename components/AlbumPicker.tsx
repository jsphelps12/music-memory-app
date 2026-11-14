import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { SectionLabel } from "@/components/SectionLabel";
import { Album } from "@/types";
import { getPublicPhotoUrl } from "@/lib/storage";
import { pluralMoments } from "@/lib/utils";

interface Props {
  visible: boolean;
  collections: Album[];
  selectedId: string | null;
  onSelect: (album: Album | null) => void;
  onClose: () => void;
  onRequestCreate: () => void;
}

export function AlbumPicker({
  visible,
  collections,
  selectedId,
  onSelect,
  onClose,
  onRequestCreate,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ownedPersonal = collections.filter((c) => c.role === "owner" && !c.isPublic);
  const ownedShared = collections.filter((c) => c.role === "owner" && c.isPublic);
  const shared = collections.filter((c) => c.role === "member");

  const handleSelect = (album: Album | null) => {
    onSelect(album);
    onClose();
  };

  const renderRow = (item: Album) => {
    const thumbUrl = item.coverPhotoUrl ? getPublicPhotoUrl(item.coverPhotoUrl) : null;
    const sub =
      item.role === "member" && item.ownerName
        ? `by ${item.ownerName}`
        : item.momentCount !== undefined
          ? pluralMoments(item.momentCount)
          : null;
    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => handleSelect(item)}
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId === item.id }}
      >
        {thumbUrl ? (
          <AppImage source={{ uri: thumbUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumb}>
            <Ionicons
              name={item.isPublic ? "people-outline" : "albums-outline"}
              size={18}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        {selectedId === item.id ? (
          <Ionicons name="checkmark" size={20} color={theme.colors.text} />
        ) : null}
      </Pressable>
    );
  };

  const section = (label: string, items: Album[]) =>
    items.length > 0 ? (
      <>
        <SectionLabel style={styles.sectionLabel}>{label}</SectionLabel>
        {items.map(renderRow)}
      </>
    ) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Albums" maxHeight="70%">
      {/* New album, pinned above the scroll list */}
      <Pressable
        style={({ pressed }) => [styles.row, styles.newRow, pressed && styles.pressed]}
        onPress={onRequestCreate}
        accessibilityRole="button"
      >
        <View style={styles.thumb}>
          <Ionicons name="add" size={20} color={theme.colors.text} />
        </View>
        <Text style={[styles.rowName, styles.rowText]}>New album</Text>
      </Pressable>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => handleSelect(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === null }}
        >
          <View style={styles.thumb}>
            <Ionicons name="musical-notes-outline" size={18} color={theme.colors.textSecondary} />
          </View>
          <Text style={[styles.rowName, styles.rowText]}>No album</Text>
          {selectedId === null ? (
            <Ionicons name="checkmark" size={20} color={theme.colors.text} />
          ) : null}
        </Pressable>

        {section("My albums", ownedPersonal)}
        {section("My shared albums", ownedShared)}
        {section("Shared with me", shared)}
      </ScrollView>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
    },
    sectionLabel: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xs,
    },
    // Rows on the page, ruled by hairlines in the divider token.
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 60,
      paddingVertical: theme.spacing.md,
      marginHorizontal: theme.spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    newRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    thumb: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.artworkPlaceholder,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: {
      flex: 1,
    },
    rowName: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    rowSub: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
  });
}
