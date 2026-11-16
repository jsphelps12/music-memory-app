import { useMemo } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { SectionLabel } from "@/components/SectionLabel";
import { ListRow } from "@/components/ListRow";
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
      <ListRow
        key={item.id}
        label={item.name}
        subtitle={sub ?? undefined}
        leading={
          thumbUrl ? (
            <AppImage source={{ uri: thumbUrl }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumb}>
              <Icon
                name={item.isPublic ? "people-outline" : "albums-outline"}
                size={18}
                color={theme.colors.textSecondary}
              />
            </View>
          )
        }
        accessory="check"
        selected={selectedId === item.id}
        onPress={() => handleSelect(item)}
        style={styles.row}
      />
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
      <ListRow
        label="New album"
        leading={
          <View style={styles.thumb}>
            <Icon name="add" size={20} color={theme.colors.text} />
          </View>
        }
        accessory="none"
        onPress={onRequestCreate}
        style={[styles.row, styles.newRow]}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <ListRow
          label="No album"
          leading={
            <View style={styles.thumb}>
              <Icon name="musical-notes-outline" size={18} color={theme.colors.textSecondary} />
            </View>
          }
          accessory="check"
          selected={selectedId === null}
          onPress={() => handleSelect(null)}
          style={styles.row}
        />

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
    // ListRow inside the sheet's gutters; a touch taller for the thumbnails.
    row: {
      minHeight: 60,
      marginHorizontal: theme.spacing.xl,
    },
    newRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    thumb: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.artworkPlaceholder,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
