import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { Image as RNImage } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
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
    staleTime: 5 * 60 * 1000,
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

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Load failure: not the same as having no located moments */}
      {isError && mapMoments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Couldn&apos;t load your map</Text>
            <Text style={styles.emptySubtitle}>{friendlyError(error)}</Text>
            <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7} accessibilityRole="button">
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Empty state, only once the query has actually answered */}
      {isSuccess && mapMoments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Ionicons name="map-outline" size={28} color="rgba(0,0,0,0.3)" />
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
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    backButton: {
      position: "absolute",
      left: 16,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    markerContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
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
    markerDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "#E8825C",
    },
    previewCard: {
      position: "absolute",
      left: 16,
      right: 16,
      backgroundColor: theme.colors.cardBg,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    previewArtwork: {
      width: 52,
      height: 52,
      borderRadius: 8,
    },
    previewInfo: {
      flex: 1,
      gap: 2,
    },
    previewTitle: {
      fontSize: 15,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.text,
    },
    previewArtist: {
      fontSize: 13,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
    },
    previewDate: {
      fontSize: 12,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    emptyCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      gap: 8,
      maxWidth: 280,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.text,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    retryText: {
      marginTop: theme.spacing.xs,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
  });
}
