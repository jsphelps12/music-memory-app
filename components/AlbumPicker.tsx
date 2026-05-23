import { useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
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

  const translateY = useSharedValue(0);
  const panGesture = useMemo(() => Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) { runOnJS(onClose)(); }
      translateY.value = withTiming(0);
    }),
  [onClose, translateY]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const ownedPersonal = collections.filter((c) => c.role === "owner" && !c.isPublic);
  const ownedShared = collections.filter((c) => c.role === "owner" && c.isPublic);
  const shared = collections.filter((c) => c.role === "member");

  const handleSelect = (album: Album | null) => {
    onSelect(album);
    onClose();
  };

  const renderRow = (item: Album) => {
    const thumbUrl = item.coverPhotoUrl
      ? getPublicPhotoThumbnailUrl(item.coverPhotoUrl, 72, true)
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
          <Image source={{ uri: thumbUrl }} style={styles.rowThumb} contentFit="cover" />
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: theme.isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" },
        ]}
        onPress={onClose}
      />
      <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.cardBg }, animatedStyle]}>
        <GestureDetector gesture={panGesture}>
          <View
            style={[styles.handle, { backgroundColor: theme.colors.border }]}
            hitSlop={{ top: 12, bottom: 16, left: 120, right: 120 }}
          />
        </GestureDetector>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.colors.textSecondary }]}>
            Albums
          </Text>
          <CloseButton onPress={onClose} />
        </View>

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
      </Animated.View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
    },
    sheet: {
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      paddingBottom: Platform.OS === "ios" ? 36 : 20,
      maxHeight: "70%",
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 4,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: 10,
    },
    sheetTitle: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
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
