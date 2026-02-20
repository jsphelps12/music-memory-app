import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl } from "@/lib/storage";
import { mapRowToMoment } from "@/lib/moments";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { friendlyError } from "@/lib/errors";
import { Moment, MoodOption } from "@/types";

export default function MomentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentSong, isPlaying, play, pause, stop } = usePlayer();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const fetchMoment = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      setError(friendlyError(fetchError));
      setLoading(false);
      return;
    }

    setMoment(mapRowToMoment(data));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchMoment();
      return () => {
        stop();
      };
    }, [fetchMoment, stop])
  );

  const photoUrls = useMemo(
    () => moment?.photoUrls.map(getPublicPhotoUrl) ?? [],
    [moment?.photoUrls]
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getMood = (value: MoodOption | null) =>
    value ? [...MOODS, ...(profile?.customMoods ?? [])].find((m) => m.value === value) : undefined;

  const openMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(true);
  };

  const handleEdit = () => {
    Haptics.selectionAsync();
    setMenuOpen(false);
    if (moment) router.push(`/moment/edit/${moment.id}`);
  };

  const handleDelete = () => {
    if (deleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    Alert.alert("Delete Moment", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          const { error: deleteError } = await supabase
            .from("moments")
            .delete()
            .eq("id", id);

          if (deleteError) {
            setDeleting(false);
            Alert.alert("Error", friendlyError(deleteError));
            return;
          }

          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <SkeletonMomentDetail />
      </View>
    );
  }

  if (error || !moment) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ErrorState
          message={error || "Moment not found"}
          onRetry={fetchMoment}
          onBack={() => router.back()}
        />
      </View>
    );
  }

  const mood = getMood(moment.mood);

  return (
    <View style={styles.container}>
      {moment?.songArtworkUrl ? (
        <>
          <Image
            source={{ uri: moment.songArtworkUrl }}
            style={StyleSheet.absoluteFill}
            blurRadius={50}
            contentFit="cover"
          />
          <View style={styles.backdrop} />
        </>
      ) : null}
      <View style={styles.headerRow}>
        {formatDate(moment.momentDate) ? (
          <Text style={styles.date}>{formatDate(moment.momentDate)}</Text>
        ) : (
          <Text style={[styles.date, styles.dateAbsent]}>No date</Text>
        )}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.moreButton} onPress={openMenu} activeOpacity={0.7}>
            <Text style={styles.moreButtonText}>{"\u22EF"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEdit} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Edit Moment</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete} activeOpacity={0.7}>
              <Text style={styles.menuItemTextDestructive}>Delete Moment</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Song row: artwork + title/artist + play */}
        <View style={styles.songRow}>
          {moment.songArtworkUrl ? (
            <Image
              source={{ uri: moment.songArtworkUrl }}
              style={styles.artwork}
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={2}>
              {moment.songTitle}
            </Text>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => router.push({ pathname: "/artist", params: { name: moment.songArtist } })}
            >
              <Text style={[styles.songArtist, styles.songArtistLink]} numberOfLines={1}>
                {moment.songArtist}
              </Text>
            </TouchableOpacity>
            {moment.songAlbumName ? (
              <Text style={styles.songAlbum} numberOfLines={1}>
                {moment.songAlbumName}
              </Text>
            ) : null}
          </View>
          {moment.songPreviewUrl ? (
            <TouchableOpacity
              style={styles.playButton}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const isCurrentSong =
                  isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId;
                if (isCurrentSong) {
                  pause();
                } else {
                  play(
                    {
                      id: moment.songAppleMusicId,
                      title: moment.songTitle,
                      artistName: moment.songArtist,
                      albumName: moment.songAlbumName,
                      artworkUrl: moment.songArtworkUrl,
                      appleMusicId: moment.songAppleMusicId,
                      durationMs: 0,
                    },
                    moment.songPreviewUrl!
                  );
                }
              }}
            >
              <Text style={styles.playButtonText}>
                {isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId
                  ? "Pause"
                  : "Play"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Reflection — the main content */}
        {moment.reflectionText ? (
          <Text style={styles.reflection}>{moment.reflectionText}</Text>
        ) : null}

        {/* Photos */}
        {photoUrls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoGallery}
            contentContainerStyle={styles.photoGalleryContent}
          >
            {photoUrls.map((url, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  setViewerIndex(index);
                  setViewerVisible(true);
                }}
                activeOpacity={0.9}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.photoImage}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Metadata */}
        {(mood || moment.people.length > 0) && (
          <View style={styles.metaRow}>
            {mood ? (
              <View style={styles.moodChip}>
                <Text style={styles.moodChipText}>
                  {mood.emoji} {mood.label}
                </Text>
              </View>
            ) : null}
            {moment.people.map((person) => (
              <View key={person} style={styles.personChip}>
                <Text style={styles.personChipText}>{person}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Location */}
        {moment.location ? (
          <Text style={styles.locationText}>{moment.location}</Text>
        ) : null}

      </ScrollView>

      <PhotoViewer
        photos={photoUrls}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.isDark ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.55)",
    },
    headerRow: {
      paddingTop: 60,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    date: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      flex: 1,
    },
    dateAbsent: {
      fontWeight: theme.fontWeight.normal,
      color: theme.colors.textTertiary,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    moreButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    moreButtonText: {
      fontSize: 18,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textSecondary,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
    },
    menuContainer: {
      position: "absolute",
      top: 60 + 12 + 32 + 8, // headerPaddingTop + approx paddingBottom + button height + gap
      right: theme.spacing.xl,
      backgroundColor: theme.colors.cardBg,
      borderRadius: 14,
      minWidth: 190,
      zIndex: 11,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
      overflow: "hidden",
    },
    menuItem: {
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
    },
    menuItemText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    menuItemTextDestructive: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.semibold,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 60,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardBg,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.xl,
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    songInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    songArtistLink: {
      textDecorationLine: "underline",
    },
    songAlbum: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    playButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.radii.lg,
      marginLeft: theme.spacing.sm,
    },
    playButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    reflection: {
      fontSize: 17,
      color: theme.colors.text,
      lineHeight: 26,
      marginBottom: theme.spacing.xl,
    },
    photoGallery: {
      marginBottom: theme.spacing.xl,
      marginHorizontal: -theme.spacing.xl,
    },
    photoGalleryContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoImage: {
      width: 200,
      height: 200,
      borderRadius: theme.radii.md,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing["3xl"],
    },
    moodChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      backgroundColor: theme.colors.chipBg,
    },
    moodChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    personChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      backgroundColor: theme.colors.accentBg,
    },
    personChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
    },
    locationText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["3xl"],
    },
  });
}
