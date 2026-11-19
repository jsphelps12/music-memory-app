import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { SectionLabel } from "@/components/SectionLabel";
import { ListRow } from "@/components/ListRow";
import { Album } from "@/types";
import { getPublicPhotoUrl } from "@/lib/storage";
import { pluralMoments } from "@/lib/utils";

interface CommonProps {
  visible: boolean;
  collections: Album[];
  onClose: () => void;
  /** After the sheet has fully closed: open the next sheet from here. */
  onClosed?: () => void;
  onRequestCreate: () => void;
  /** Sheet title. Default "Albums". */
  title?: string;
  /** A failed add or remove, shown at the top of the sheet. */
  error?: string;
  /** The albums are loading: a spinner in place of the list. */
  loading?: boolean;
  /** The albums couldn't load: the message and Try again in place of the list. */
  loadError?: string;
  onRetry?: () => void;
}

/**
 * single (capture): pick one album or "No album"; a pick closes the sheet.
 * multi (a saved moment): tick any number; each tap applies at once through
 * onToggle and the sheet stays open, so Done only closes.
 */
type Props = CommonProps &
  (
    | { mode?: "single"; selectedId: string | null; onSelect: (album: Album | null) => void }
    | { mode: "multi"; selectedIds: readonly string[]; onToggle: (album: Album) => void }
  );

export function AlbumPicker(props: Props) {
  const { visible, collections, onClose, onClosed, onRequestCreate, title = "Albums", error, loading, loadError, onRetry } =
    props;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ownedPersonal = collections.filter((c) => c.role === "owner" && !c.isPublic);
  const ownedShared = collections.filter((c) => c.role === "owner" && c.isPublic);
  const shared = collections.filter((c) => c.role === "member");

  const isSelected = (id: string) =>
    props.mode === "multi" ? props.selectedIds.includes(id) : props.selectedId === id;

  const handleSelect = (album: Album | null) => {
    if (props.mode === "multi") {
      if (album) props.onToggle(album);
      return;
    }
    props.onSelect(album);
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
        selected={isSelected(item.id)}
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
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} title={title} maxHeight="70%">
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
        testID="album-picker-new"
      />

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : loadError ? (
        <View style={styles.status}>
          <Text style={styles.statusText}>{loadError}</Text>
          {onRetry ? <Button label="Try again" variant="text" onPress={onRetry} /> : null}
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {props.mode === "multi" ? null : (
            <ListRow
              label="No album"
              leading={
                <View style={styles.thumb}>
                  <Icon name="musical-notes-outline" size={18} color={theme.colors.textSecondary} />
                </View>
              }
              accessory="check"
              selected={props.selectedId === null}
              onPress={() => handleSelect(null)}
              style={styles.row}
            />
          )}

          {section("My albums", ownedPersonal)}
          {section("My shared albums", ownedShared)}
          {section("Shared with you", shared)}
        </ScrollView>
      )}
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
    // Like AlbumShareSheet's inline error: Meta in the destructive color.
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    status: {
      paddingVertical: theme.spacing["2xl"],
      paddingHorizontal: theme.spacing.xl,
      alignItems: "center",
    },
    statusText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
  });
}
