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
import { Collection } from "@/types";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";

interface Props {
  visible: boolean;
  collections: Collection[];
  selectedId: string | null;
  onSelect: (collection: Collection | null) => void;
  onClose: () => void;
  onRequestCreate: () => void;
}

export function CollectionPicker({
  visible,
  collections,
  selectedId,
  onSelect,
  onClose,
  onRequestCreate,
}: Props) {
  const theme = useTheme();

  const translateY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) { runOnJS(onClose)(); }
      translateY.value = withTiming(0);
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const ownedPersonal = collections.filter((c) => c.role === "owner" && !c.isPublic);
  const ownedShared = collections.filter((c) => c.role === "owner" && c.isPublic);
  const shared = collections.filter((c) => c.role === "member");

  const handleSelect = (collection: Collection | null) => {
    onSelect(collection);
    onClose();
  };

  const renderRow = (item: Collection) => {
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
          name={item.role === "member" ? "people-outline" : "folder-outline"}
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
              {item.momentCount} {item.momentCount === 1 ? "moment" : "moments"}
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
        <Text style={[styles.sheetTitle, { color: theme.colors.textSecondary }]}>
          Collections
        </Text>

        {/* New Collection — pinned above the scroll list */}
        <TouchableOpacity
          style={[styles.newCollectionBtn, { borderBottomColor: theme.colors.border }]}
          onPress={onRequestCreate}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.textSecondary} style={styles.rowIcon} />
          <Text style={[styles.rowName, { color: theme.colors.text }]}>New Collection</Text>
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
                  MY COLLECTIONS
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
                  MY SHARED COLLECTIONS
                </Text>
              </View>
              {ownedShared.map((item) => {
                const sharedThumbUrl = item.coverPhotoUrl
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
                    {sharedThumbUrl ? (
                      <Image source={{ uri: sharedThumbUrl }} style={styles.rowThumb} contentFit="cover" />
                    ) : (
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={theme.colors.textSecondary}
                      style={styles.rowIcon}
                    />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.momentCount !== undefined ? (
                        <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
                          {item.momentCount} {item.momentCount === 1 ? "moment" : "moments"}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {selectedId === item.id ? (
                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                  ) : null}
                </TouchableOpacity>
              );
              })}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  sheetTitle: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  newCollectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flexGrow: 0,
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
  },
  rowName: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  rowSub: {
    fontSize: 12,
    marginTop: 1,
  },
});
