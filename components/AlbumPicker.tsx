import { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { Album } from "@/types";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";
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
    const thumbUrl = item.coverPhotoUrl
      ? getPublicPhotoThumbnailUrl(item.coverPhotoUrl)
      : null;
    return (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        {thumbUrl ? (
          <AppImage source={{ uri: thumbUrl }} style={styles.rowThumb} contentFit="cover" />
        ) : (
        <Ionicons
          name={item.isPublic ? "people-outline" : "folder-outline"}
          size={20}
          color={theme.colors.textSecondary}
          style={styles.rowIcon}
        />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.role === "member" && item.ownerName ? (
            <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
              by {item.ownerName}
            </Text>
          ) : item.momentCount !== undefined ? (
            <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
              {pluralMoments(item.momentCount)}
            </Text>
          ) : null}
        </View>
      </View>
      {selectedId === item.id ? (
        <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
      ) : null}
    </TouchableOpacity>
  );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Albums" maxHeight="70%">
      {/* New Album — pinned above the scroll list */}
      <TouchableOpacity
        style={[styles.newAlbumBtn, { borderBottomColor: theme.colors.border }]}
        onPress={onRequestCreate}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle-outline" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
        <Text style={[styles.rowName, { color: theme.colors.text }]}>New Album</Text>
      </TouchableOpacity>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* All Moments */}
        <TouchableOpacity style={styles.row} onPress={() => handleSelect(null)} activeOpacity={0.7}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="albums-outline"
              size={20}
              color={theme.colors.textSecondary}
              style={styles.rowIcon}
            />
            <Text style={[styles.rowName, { color: theme.colors.text }]}>All Moments</Text>
          </View>
          {selectedId === null ? (
            <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
          ) : null}
        </TouchableOpacity>

        {/* My Collections (personal/private) */}
        {ownedPersonal.length > 0 ? (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                MY ALBUMS
              </Text>
            </View>
            {ownedPersonal.map(renderRow)}
          </>
        ) : null}

        {/* My Shared Collections */}
        {ownedShared.length > 0 ? (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                MY SHARED ALBUMS
              </Text>
            </View>
            {ownedShared.map(renderRow)}
          </>
        ) : null}

        {/* Shared With Me */}
        {shared.length > 0 ? (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                SHARED WITH ME
              </Text>
            </View>
            {shared.map(renderRow)}
          </>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    newAlbumBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    scroll: {
      flexGrow: 0,
    },
    sectionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 14,
      paddingBottom: theme.spacing.xs,
    },
    sectionLabel: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 0.6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: 14,
    },
    rowLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    rowIcon: {
      marginRight: theme.spacing.md,
    },
    rowThumb: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      marginRight: theme.spacing.md,
    },
    rowName: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
    },
    rowSub: {
      fontSize: theme.fontSize.xs,
      marginTop: 1,
    },
  });
}
