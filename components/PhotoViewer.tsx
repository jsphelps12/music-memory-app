import { useRef, useState, useMemo } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { AppImage } from "@/components/AppImage";
import { useTheme } from "@/hooks/useTheme";
import { Theme, overImage } from "@/constants/theme";

interface Props {
  photos: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

// The close floats over the photo, so it's a warm-ink glass disc with a paper
// glyph (DESIGN.md allows warm ink over imagery), the same in both themes.
const INK_GLASS = overImage.glass;
const PAPER_ON_GLASS = overImage.text;

export function PhotoViewer({ photos, initialIndex, visible, onClose }: Props) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const handleOpen = () => {
    setCurrentIndex(initialIndex);
    // Scroll to the correct initial position after modal mounts
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    }, 50);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          removeClippedSubviews
          windowSize={3}
          maxToRenderPerBatch={1}
          initialNumToRender={1}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
              contentContainerStyle={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: "center", justifyContent: "center" }}
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <AppImage
                source={{ uri: item }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                contentFit="contain"
              />
            </ScrollView>
          )}
        />

        <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close photos"
          >
            <Icon name="close" size={20} color={PAPER_ON_GLASS} />
          </TouchableOpacity>
        </View>

        {photos.length > 1 && (
          <View style={[styles.dotsContainer, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            {photos.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    overlay: {
      position: "absolute",
      top: 0,
      right: 0,
      left: 0,
    },
    closeButton: {
      alignSelf: "flex-end",
      margin: theme.spacing.lg,
      width: 36,
      height: 36,
      borderRadius: theme.radii.full,
      backgroundColor: INK_GLASS,
      alignItems: "center",
      justifyContent: "center",
    },
    dotsContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.textTertiary,
    },
    dotActive: {
      backgroundColor: theme.colors.text,
    },
  });
}
