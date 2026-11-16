import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { Image as RNImage } from "react-native";
import { Icon } from "@/components/Icon";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { DEFAULT_SCREEN_STALE } from "@/lib/queryConfig";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/Button";
import { friendlyError } from "@/lib/errors";
import { artworkUrlAtSize } from "@/lib/itunes";

// Where the map opens before the moments arrive and frame it.
const DEFAULT_REGION = {
  latitude: 37.0902,
  longitude: -95.7129,
  latitudeDelta: 50,
  longitudeDelta: 50,
};
// 40pt markers and 52pt preview artwork, at 3x.
const MARKER_ARTWORK_PX = 120;
const PREVIEW_ARTWORK_PX = 156;
// Night, not pure black, for the shadows of things floating over the map.
const SHADOW_INK = "#0E0B0A";

interface MapMoment {
  id: string;
  song_title: string;
  song_artist: string;
  song_artwork_url: string | null;
  moment_date: string | null;
  location_lat: number;
  location_lng: number;
  location: string | null;
}

export default function MomentsMapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [selectedMoment, setSelectedMoment] = useState<MapMoment | null>(null);

  const { data: mapMoments = [], isSuccess, isError, error, refetch } = useQuery<MapMoment[]>({
    queryKey: ["momentsMap", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moments")
        .select("id, song_title, song_artist, song_artwork_url, moment_date, location_lat, location_lng, location")
        .eq("user_id", user!.id)
        .not("location_lat", "is", null)
        .not("location_lng", "is", null);
      if (error) throw error;
      return (data ?? []) as MapMoment[];
    },
    enabled: !!user,
    staleTime: DEFAULT_SCREEN_STALE,
  });

  // initialRegion is only read at mount, and with a cold cache the data
  // arrives after that. So the map frames the moments itself once both the
  // map and the data are ready (and again if the set of moments changes).
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const framedForRef = useRef<MapMoment[] | null>(null);
  useEffect(() => {
    if (!mapReady || mapMoments.length === 0 || framedForRef.current === mapMoments) return;
    framedForRef.current = mapMoments;
    const coords = mapMoments.map((m) => ({ latitude: m.location_lat, longitude: m.location_lng }));
    if (coords.length === 1) {
      mapRef.current?.animateToRegion({ ...coords[0], latitudeDelta: 0.5, longitudeDelta: 0.5 }, 300);
    } else {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, bottom: 160, left: 60 },
        animated: true,
      });
    }
  }, [mapReady, mapMoments]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
        onMapReady={() => setMapReady(true)}
      >
        {mapMoments.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.location_lat, longitude: m.location_lng }}
            onPress={() => setSelectedMoment(m)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.markerContainer} pointerEvents="none">
              {m.song_artwork_url ? (
                <RNImage source={{ uri: artworkUrlAtSize(m.song_artwork_url, MARKER_ARTWORK_PX) }} style={styles.markerArtwork} />
              ) : (
                <View style={styles.markerDot} />
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Back: a glass disc over the map (IconButton "filled"), the same
          one the entry screen floats over artwork. */}
      <View style={[styles.backWrap, { top: insets.top + 6 }]}>
        <IconButton
          variant="glass"
          name="chevron-back"
          size={20}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        />
      </View>

      {/* Load failure: not the same as having no located moments */}
      {isError && mapMoments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Couldn&apos;t load your map</Text>
            <Text style={styles.emptySubtitle}>{friendlyError(error)}</Text>
            <Button label="Try again" variant="text" fullWidth={false} onPress={() => refetch()} />
          </View>
        </View>
      ) : null}

      {/* Empty state, only once the query has actually answered */}
      {isSuccess && mapMoments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Icon name="map-outline" size={28} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>No located moments yet</Text>
            <Text style={styles.emptySubtitle}>
              Add a location when creating a moment and it'll appear here.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Preview card */}
      {selectedMoment ? (
        <TouchableOpacity
          style={[styles.previewCard, { bottom: insets.bottom + 32 }]}
          activeOpacity={0.9}
          onPress={() => {
            router.push(`/moment/${selectedMoment.id}` as any);
            setSelectedMoment(null);
          }}
        >
          {selectedMoment.song_artwork_url ? (
            <AppImage
              source={{ uri: artworkUrlAtSize(selectedMoment.song_artwork_url, PREVIEW_ARTWORK_PX) }}
              style={styles.previewArtwork}
              contentFit="cover"
            />
          ) : (
            <ArtworkPlaceholder style={styles.previewArtwork} />
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {selectedMoment.song_title}
            </Text>
            <Text style={styles.previewArtist} numberOfLines={1}>
              {selectedMoment.song_artist}
            </Text>
            {selectedMoment.moment_date ? (
              <Text style={styles.previewDate}>
                {new Date(selectedMoment.moment_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backWrap: {
      position: "absolute",
      left: 12,
    },
    // Frosted paper on light, night glass on dark: the map is imagery.
    markerContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.elevated,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: SHADOW_INK,
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      overflow: "hidden",
    },
    markerArtwork: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    // No artwork: an ink dot. Terracotta is one signal per view, and a map
    // can hold dozens of these.
    markerDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.colors.buttonBg,
    },
    // Floats over the map, so it's a raised surface with a soft shadow.
    previewCard: {
      position: "absolute",
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radii.button,
      flexDirection: "row",
      alignItems: "center",
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      shadowColor: SHADOW_INK,
      shadowOpacity: theme.isDark ? 0.45 : 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    previewArtwork: {
      width: 52,
      height: 52,
      borderRadius: theme.radii.sm,
    },
    previewInfo: {
      flex: 1,
      gap: 2,
    },
    previewTitle: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    previewArtist: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    previewDate: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing["3xl"],
    },
    emptyCard: {
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radii.button,
      padding: theme.spacing["2xl"],
      alignItems: "center",
      gap: theme.spacing.sm,
      maxWidth: 280,
    },
    emptyTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      textAlign: "center",
    },
    emptySubtitle: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
  });
}
