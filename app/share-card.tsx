import type { ComponentRef } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { ErrorState } from "@/components/ErrorState";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import {
  ShareCard,
  ShareCardVariant,
  CARD_WIDTH,
  CARD_HEIGHT_POST,
  CARD_HEIGHT_STORY,
} from "@/components/ShareCard";
import { consumeShareCardData, ShareCardData } from "@/lib/shareCardStore";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// The share card, as its own screen (design sweep, 2026-11). It used to be a
// second view inside ShareMomentSheet at 92% height, a page-sheet look the
// screen-vs-quick-pick rule bans; the preview (up to 9:16) needs the room.
// ShareMomentSheet hands the moment over through lib/shareCardStore.
export default function ShareCardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<ComponentRef<typeof ViewShot>>(null);

  // Read once on mount. A cold deep link (or a swallowed hand-off) has none.
  const [data] = useState<ShareCardData | null>(() => consumeShareCardData());
  const [variant, setVariant] = useState<ShareCardVariant>("post");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const handleShare = async () => {
    if (sharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      const uri = await (viewShotRef.current as any).capture({
        format: "png",
        quality: 1.0,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Moment",
        UTI: "public.png",
      });
    } catch {
      // User cancelled or capture failed — silent
    } finally {
      setSharing(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Share card" leading="close" onLeadingPress={close} />
        <ErrorState
          message="This card isn't available. Open the moment and share it from there."
          onBack={close}
        />
      </View>
    );
  }

  const { moment, photoUrls } = data;
  const cardHeight = variant === "story" ? CARD_HEIGHT_STORY : CARD_HEIGHT_POST;
  const songSubtitle = [moment.songTitle, moment.songArtist].filter(Boolean).join(" · ");

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Share card"
        subtitle={songSubtitle || undefined}
        leading="close"
        onLeadingPress={close}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Post / Story format: same card, two prints */}
        <View style={styles.variantChips}>
          {(["post", "story"] as const).map((v) => (
            <Chip
              key={v}
              label={v === "post" ? "Post" : "Story"}
              selected={variant === v}
              onPress={() => {
                Haptics.selectionAsync();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setVariant(v);
              }}
            />
          ))}
        </View>

        {/* Card preview */}
        <View style={styles.cardWrapper}>
          <ViewShot
            ref={viewShotRef}
            options={{ format: "png", quality: 1.0 }}
            style={{ width: CARD_WIDTH, height: cardHeight }}
          >
            <ShareCard
              moment={moment}
              photoUrl={photoUrls.length > 0 ? photoUrls[selectedIndex] : null}
              variant={variant}
            />
          </ViewShot>
        </View>

        {/* Photo picker */}
        {photoUrls.length > 1 && (
          <View style={styles.pickerSection}>
            <SectionLabel style={styles.pickerLabel}>Choose photo</SectionLabel>
            <FlatList
              data={photoUrls}
              horizontal
              keyExtractor={(_, i) => String(i)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerContent}
              renderItem={({ item, index }) => {
                const selected = index === selectedIndex;
                return (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedIndex(index);
                    }}
                    style={[styles.thumb, selected && styles.thumbSelected]}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${index + 1}`}
                    accessibilityState={{ selected }}
                  >
                    <AppImage source={{ uri: item }} style={styles.thumbImage} contentFit="cover" />
                  </Pressable>
                );
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* The one action, pinned so a tall Story preview never hides it. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
        <Button label="Share image" icon="share-outline" onPress={handleShare} loading={sharing} />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: theme.spacing.lg,
    },
    variantChips: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
    },
    // Lifted artwork (DESIGN.md "Artwork lift"): the card sits above the page.
    cardWrapper: {
      alignSelf: "center",
      marginVertical: theme.spacing.lg,
      borderRadius: theme.radii.lg,
      overflow: "hidden",
      shadowColor: theme.shadows.card.shadowColor,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 8,
    },
    pickerSection: {
      marginBottom: theme.spacing.sm,
    },
    pickerLabel: {
      paddingHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.xs,
    },
    pickerContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "transparent",
    },
    thumbSelected: {
      borderColor: theme.colors.text,
    },
    thumbImage: {
      width: "100%",
      height: "100%",
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
    },
  });
}
