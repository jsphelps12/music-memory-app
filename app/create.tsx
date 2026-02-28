import { useState, useEffect, useMemo, useRef } from "react";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ActionSheetIOS,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { uploadMomentPhotoWithThumbnail } from "@/lib/storage";
import { getNowPlaying, onNowPlayingChange } from "@/lib/now-playing";
import { identifyAudio, stopShazamListening, type ShazamResult } from "@/modules/shazam-kit";
import { onSongSelected } from "@/lib/songEvents";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { CollectionPicker } from "@/components/CollectionPicker";
import { CreateCollectionModal } from "@/components/CreateCollectionModal";
import { fetchCollections, addMomentToCollection } from "@/lib/collections";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Song, Collection } from "@/types";
import { friendlyError } from "@/lib/errors";
import { checkAndNotifyMilestone } from "@/lib/notifications";
import { markTimelineStale } from "@/lib/timelineRefresh";

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late Night";
}

async function extractPhotoMetadata(assets: ImagePicker.ImagePickerAsset[]) {
  let earliestDate: Date | undefined;

  for (const asset of assets) {
    const exif = asset.exif as Record<string, any> | undefined;
    if (!exif) continue;
    const raw = exif.DateTimeOriginal ?? exif.DateTime;
    if (raw) {
      const normalized = (raw as string).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      const d = new Date(normalized);
      if (!isNaN(d.getTime()) && (!earliestDate || d < earliestDate)) {
        earliestDate = d;
      }
    }
  }

  let suggestedLocation: string | undefined;
  for (const asset of assets) {
    const exif = asset.exif as Record<string, any> | undefined;
    if (!exif?.GPSLatitude || !exif?.GPSLongitude) continue;
    const lat = exif.GPSLatitude * (exif.GPSLatitudeRef === "S" ? -1 : 1);
    const lon = exif.GPSLongitude * (exif.GPSLongitudeRef === "W" ? -1 : 1);
    try {
      const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (result) {
        suggestedLocation = [result.city, result.region].filter(Boolean).join(", ") || undefined;
      }
    } catch {
      // Geocoding failed — skip location suggestion
    }
    break; // Only geocode the first photo with GPS
  }

  return { date: earliestDate, location: suggestedLocation };
}

// ─── Minimal JPEG EXIF parser (no external deps) ────────────────────────────
// Reads only what we need: DateTimeOriginal and GPS coords.

function _u16(b: Uint8Array, o: number, le: boolean) {
  return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
}
function _u32(b: Uint8Array, o: number, le: boolean) {
  return le
    ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)
    : b[o] * 0x1000000 | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}
function _str(b: Uint8Array, o: number, len: number) {
  let s = "";
  for (let i = 0; i < len && b[o + i]; i++) s += String.fromCharCode(b[o + i]);
  return s;
}
function _rational(b: Uint8Array, o: number, le: boolean) {
  const n = _u32(b, o, le), d = _u32(b, o + 4, le);
  return d ? n / d : 0;
}

type _IFDEntry = { tag: number; count: number; valOff: number };
function _readIFD(b: Uint8Array, base: number, ifdStart: number, le: boolean): _IFDEntry[] {
  if (ifdStart + 2 > b.length) return [];
  const count = _u16(b, ifdStart, le);
  const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  const entries: _IFDEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = ifdStart + 2 + i * 12;
    if (e + 12 > b.length) break;
    const tag = _u16(b, e, le);
    const type = _u16(b, e + 2, le);
    const cnt = _u32(b, e + 4, le);
    const sz = (sizes[type] || 1) * cnt;
    // valOff is TIFF-relative; inline values live at e+8 in the buffer
    const valOff = sz <= 4 ? e + 8 - base : _u32(b, e + 8, le);
    entries.push({ tag, count: cnt, valOff });
  }
  return entries;
}

function _parseJpegExif(bytes: Uint8Array): { date?: Date; lat?: number; lon?: number } {
  let p = 2; // skip SOI FF D8
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xFF) break;
    const marker = bytes[p + 1];
    const segLen = (bytes[p + 2] << 8) | bytes[p + 3];
    if (marker === 0xDA) break; // start of scan — no more metadata
    if (marker === 0xE1 && segLen > 6 && _str(bytes, p + 4, 4) === "Exif") {
      const base = p + 10; // skip FF E1, length(2), "Exif\0\0"(6)
      const le = bytes[base] === 0x49;
      if (_u16(bytes, base + 2, le) !== 0x002A) break;
      const ifd0 = _readIFD(bytes, base, base + _u32(bytes, base + 4, le), le);

      let dateStr: string | undefined;
      let exifOff: number | undefined;
      let gpsOff: number | undefined;
      for (const e of ifd0) {
        if (e.tag === 0x0132) dateStr = _str(bytes, base + e.valOff, e.count);
        // Sub-IFD pointers are 4-byte LONG values — read the value, not store the location
        if (e.tag === 0x8769) exifOff = _u32(bytes, base + e.valOff, le);
        if (e.tag === 0x8825) gpsOff = _u32(bytes, base + e.valOff, le);
      }

      // DateTimeOriginal overrides DateTime
      if (exifOff != null) {
        for (const e of _readIFD(bytes, base, base + exifOff, le)) {
          if (e.tag === 0x9003) dateStr = _str(bytes, base + e.valOff, e.count);
        }
      }

      let date: Date | undefined;
      if (dateStr) {
        const d = new Date(dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
        if (!isNaN(d.getTime())) date = d;
      }

      let lat: number | undefined, lon: number | undefined;
      if (gpsOff != null) {
        let latRef = "N", lonRef = "E", latRaw: number | undefined, lonRaw: number | undefined;
        for (const e of _readIFD(bytes, base, base + gpsOff, le)) {
          if (e.tag === 0x0001) latRef = _str(bytes, base + e.valOff, 1);
          if (e.tag === 0x0003) lonRef = _str(bytes, base + e.valOff, 1);
          if (e.tag === 0x0002 && e.count === 3) {
            const d = _rational(bytes, base + e.valOff, le);
            const m = _rational(bytes, base + e.valOff + 8, le);
            const s = _rational(bytes, base + e.valOff + 16, le);
            latRaw = d + m / 60 + s / 3600;
          }
          if (e.tag === 0x0004 && e.count === 3) {
            const d = _rational(bytes, base + e.valOff, le);
            const m = _rational(bytes, base + e.valOff + 8, le);
            const s = _rational(bytes, base + e.valOff + 16, le);
            lonRaw = d + m / 60 + s / 3600;
          }
        }
        if (latRaw != null) lat = latRaw * (latRef === "S" ? -1 : 1);
        if (lonRaw != null) lon = lonRaw * (lonRef === "W" ? -1 : 1);
      }

      return { date, lat, lon };
    }
    p += 2 + segLen;
  }
  return {};
}
// ─────────────────────────────────────────────────────────────────────────────

// Extracts EXIF date + GPS from a bare file path (e.g. shared via share extension).
// Reads only the first 64 KB — EXIF is always in the opening segments of a JPEG.
async function extractExifFromPath(uri: string): Promise<{ date?: Date; location?: string }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as any,
      position: 0,
      length: 65536,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { date, lat, lon } = _parseJpegExif(bytes);
    console.log("[EXIF] parsed:", { date, lat, lon });

    let location: string | undefined;
    if (lat != null && lon != null) {
      try {
        const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (result) location = [result.city, result.region].filter(Boolean).join(", ") || undefined;
      } catch {
        // Geocoding failed — skip location
      }
    }

    return { date, location };
  } catch (e) {
    console.log("[EXIF] extractExifFromPath error:", e);
    return {};
  }
}

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollViewRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songAppleMusicId?: string;
    songDurationMs?: string;
    photos?: string;
    shareCandidates?: string;
    shareFailedUrl?: string;
    sharedPhotoPath?: string;
  }>();

  const [song, setSong] = useState<Song | null>(null);
  const [nowPlayingSong, setNowPlayingSong] = useState<Song | null>(null);
  const [shazamResult, setShazamResult] = useState<ShazamResult | null>(null);
  const [isShazaming, setIsShazaming] = useState(false);
  const [shazamError, setShazamError] = useState("");
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Sync song from search params when returning from song-search modal or share intent
  useEffect(() => {
    if (params.songTitle) {
      setSong({
        id: params.songId ?? "",
        title: params.songTitle,
        artistName: params.songArtist ?? "",
        albumName: params.songAlbum ?? "",
        artworkUrl: params.songArtwork ?? "",
        appleMusicId: params.songAppleMusicId ?? "",
        durationMs: Number(params.songDurationMs) || 0,
      });
    }
  }, [params.songId]);

  // Listen for song selected in song-search
  useEffect(() => onSongSelected((s) => setSong(s)), []);

  // Handle Spotify cross-search candidates from share intent
  useEffect(() => {
    if (params.shareCandidates) {
      try {
        const parsed = JSON.parse(params.shareCandidates) as Song[];
        if (parsed.length > 1) {
          setCandidates(parsed);
          setShowCandidateModal(true);
        }
      } catch {}
    }
  }, [params.shareCandidates]);

  // If share intent lookup failed, open song search
  useEffect(() => {
    if (params.shareFailedUrl) {
      router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } });
    }
  }, [params.shareFailedUrl, photos, router]);

  // Restore photos from params after song-search navigation
  useEffect(() => {
    if (params.photos) {
      try {
        const restored = JSON.parse(params.photos) as string[];
        if (restored.length > 0) setPhotos(restored);
      } catch {}
    }
  }, [params.photos]);

  // Shared photo from share extension — pre-fill photos, open details, and extract EXIF
  useEffect(() => {
    console.log("[SharedPhoto] sharedPhotoPath param:", params.sharedPhotoPath);
    if (!params.sharedPhotoPath) return;
    setPhotos([params.sharedPhotoPath]);
    setShowDetails(true);
    extractExifFromPath(params.sharedPhotoPath).then((meta) => {
      console.log("[SharedPhoto] extractExifFromPath result:", meta);
      if (meta.date || meta.location) {
        setMetaSuggestion(meta);
        setDismissedMetaSuggestion(false);
      }
    });
  }, [params.sharedPhotoPath]);

  // Now Playing detection — check on mount and listen for song changes
  useEffect(() => {
    if (song) return;

    let cancelled = false;
    getNowPlaying().then((nowPlaying) => {
      if (!cancelled && nowPlaying) {
        setNowPlayingSong(nowPlaying);
      }
    });

    const subscription = onNowPlayingChange((nowPlaying) => {
      if (!cancelled) {
        setNowPlayingSong(nowPlaying);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [song]);

  // Auto-detect current location for suggestion banner
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [result] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (!cancelled && result) {
          const suggestion = [result.city, result.region].filter(Boolean).join(", ");
          if (suggestion) setLocationSuggestion(suggestion);
        }
      } catch {
        // Location unavailable — skip suggestion
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasSong = !!song;

  const [reflection, setReflection] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [location, setLocation] = useState("");
  const [metaSuggestion, setMetaSuggestion] = useState<{ date?: Date; location?: string } | null>(null);
  const [dismissedMetaSuggestion, setDismissedMetaSuggestion] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [locationSuggestion, setLocationSuggestion] = useState("");
  const [dismissedLocationSuggestion, setDismissedLocationSuggestion] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [createCollectionVisible, setCreateCollectionVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");

  useEffect(() => {
    if (showDetails && user && collections.length === 0) {
      fetchCollections(user.id).then(setCollections).catch(() => {});
    }
  }, [showDetails, user]);

  const handleUseNowPlaying = () => {
    if (nowPlayingSong) {
      Haptics.selectionAsync();
      setSong(nowPlayingSong);
      setNowPlayingSong(null);
    }
  };

  const handleDismissNowPlaying = () => {
    setNowPlayingSong(null);
  };

  const handleIdentify = async () => {
    if (isShazaming) {
      stopShazamListening().catch(() => {});
      setIsShazaming(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsShazaming(true);
    setShazamError("");
    setShazamResult(null);
    try {
      const result = await identifyAudio();
      setShazamResult(result);
    } catch (e: any) {
      const code = e?.code ?? "";
      if (code !== "CANCELLED") {
        setShazamError(code === "TIMEOUT" ? "Couldn't identify the song. Try again." : "Microphone error. Check permissions.");
      }
    } finally {
      setIsShazaming(false);
    }
  };

  const handleUseShazamResult = () => {
    if (!shazamResult) return;
    Haptics.selectionAsync();
    setSong({
      id: shazamResult.appleMusicId,
      title: shazamResult.title,
      artistName: shazamResult.artist,
      albumName: "",
      artworkUrl: shazamResult.artworkUrl,
      appleMusicId: shazamResult.appleMusicId,
      durationMs: 0,
    });
    setShazamResult(null);
    setShazamError("");
  };

  const handleDismissShazam = () => {
    setShazamResult(null);
    setShazamError("");
  };

  const handleSelectCandidate = (selected: Song) => {
    Haptics.selectionAsync();
    setSong(selected);
    setCandidates([]);
    setShowCandidateModal(false);
  };

  const handleAddPhotos = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Library"],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;

        if (buttonIndex === 1) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            setError("Camera permission is required to take photos.");
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            exif: true,
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            quality: 0.8,
            exif: true,
          });
        }

        if (result && !result.canceled) {
          const uris = result.assets.map((a) => a.uri);
          setPhotos((prev) => [...prev, ...uris]);
          const meta = await extractPhotoMetadata(result.assets);
          if (meta.date || meta.location) {
            setMetaSuggestion(meta);
            setDismissedMetaSuggestion(false);
          }
        }
      }
    );
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setMomentDate(date);
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasSong) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please select a song.");
      return;
    }

    setError("");
    setLoading(true);
    if (!user) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      const { previewUrl, albumName: fetchedAlbumName } = await fetchPreviewUrl(song!.appleMusicId);

      const results = await Promise.all(
        photos.map((uri) => uploadMomentPhotoWithThumbnail(user.id, uri))
      );
      const photoPaths = results.map((r) => r.fullPath);
      const thumbnailPaths = results.map((r) => r.thumbnailPath);

      const { data: inserted, error: insertError } = await supabase
        .from("moments")
        .insert({
          user_id: user.id,
          song_title: song!.title,
          song_artist: song!.artistName,
          song_album_name: song!.albumName || fetchedAlbumName || null,
          song_artwork_url: song!.artworkUrl || null,
          song_apple_music_id: song!.appleMusicId,
          song_preview_url: previewUrl,
          reflection_text: reflection.trim(),
          mood: selectedMood,
          people,
          photo_urls: photoPaths,
          photo_thumbnails: thumbnailPaths,
          location: location.trim() || null,
          moment_date: momentDate
            ? `${momentDate.getFullYear()}-${String(momentDate.getMonth() + 1).padStart(2, "0")}-${String(momentDate.getDate()).padStart(2, "0")}`
            : null,
          time_of_day: getTimeOfDay(),
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (selectedCollection && inserted?.id) {
        await addMomentToCollection(selectedCollection.id, inserted.id, user.id).catch(() => {});
      }

      checkAndNotifyMilestone(user.id).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSong(null);
      setReflection("");
      setSelectedMood(null);
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setLocation("");
      setSelectedCollection(null);
      setMetaSuggestion(null);
      setDismissedMetaSuggestion(false);
      setShowDetails(false);
      setDismissedLocationSuggestion(false);
      setShazamResult(null);
      setShazamError("");
      setError("");

      markTimelineStale();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Capture a Moment</Text>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={8}>
            <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Now Playing suggestion banner */}
        {!hasSong && nowPlayingSong && (
          <View style={styles.nowPlayingBanner}>
            <View style={styles.nowPlayingContent}>
              {nowPlayingSong.artworkUrl ? (
                <Image
                  source={{ uri: nowPlayingSong.artworkUrl }}
                  style={styles.nowPlayingArtwork}
                />
              ) : (
                <View style={[styles.nowPlayingArtwork, styles.artworkPlaceholder]} />
              )}
              <View style={styles.nowPlayingInfo}>
                <Text style={styles.nowPlayingLabel}>Now Playing</Text>
                <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                  {nowPlayingSong.title}
                </Text>
                <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                  {nowPlayingSong.artistName}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.nowPlayingDismiss}
                onPress={handleDismissNowPlaying}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.nowPlayingDismissText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.nowPlayingUseButton}
              activeOpacity={0.7}
              onPress={handleUseNowPlaying}
            >
              <Text style={styles.nowPlayingUseText}>Use this song</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Song card */}
        {hasSong ? (
          <TouchableOpacity
            style={styles.songCard}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } })}
          >
            {song!.artworkUrl ? (
              <Image
                source={{ uri: song!.artworkUrl }}
                style={styles.artwork}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {song!.title}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {song!.artistName}
              </Text>
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.selectSongButton}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } })}
            >
              <Text style={styles.selectSongButtonText}>Select Song</Text>
            </TouchableOpacity>

            {/* Identify button */}
            <TouchableOpacity
              style={[styles.identifyButton, isShazaming && { borderColor: theme.colors.accent }]}
              activeOpacity={0.7}
              onPress={handleIdentify}
            >
              {isShazaming ? (
                <View style={styles.identifyRow}>
                  <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginRight: 8 }} />
                  <Text style={[styles.identifyButtonText, { color: theme.colors.accent }]}>Listening… Tap to cancel</Text>
                </View>
              ) : (
                <Text style={styles.identifyButtonText}>Identify Song</Text>
              )}
            </TouchableOpacity>

            {/* Shazam result banner */}
            {shazamResult && (
              <View style={styles.shazamBanner}>
                <View style={styles.nowPlayingContent}>
                  {shazamResult.artworkUrl ? (
                    <Image source={{ uri: shazamResult.artworkUrl }} style={styles.nowPlayingArtwork} />
                  ) : (
                    <View style={[styles.nowPlayingArtwork, styles.artworkPlaceholder]} />
                  )}
                  <View style={styles.nowPlayingInfo}>
                    <Text style={styles.shazamLabel}>Found</Text>
                    <Text style={styles.nowPlayingTitle} numberOfLines={1}>{shazamResult.title}</Text>
                    <Text style={styles.nowPlayingArtist} numberOfLines={1}>{shazamResult.artist}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.nowPlayingDismiss}
                    onPress={handleDismissShazam}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.nowPlayingDismissText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.nowPlayingUseButton}
                  activeOpacity={0.7}
                  onPress={handleUseShazamResult}
                >
                  <Text style={styles.nowPlayingUseText}>Use this song</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Shazam error */}
            {shazamError ? (
              <Text style={styles.shazamError}>{shazamError}</Text>
            ) : null}
          </>
        )}

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={[styles.reflectionInput, focusedField === "reflection" && { borderColor: theme.colors.accent }]}
          placeholder="What does this song remind you of? (optional)"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          multiline
          textAlignVertical="top"
          value={reflection}
          onChangeText={setReflection}
          onFocus={() => setFocusedField("reflection")}
          onBlur={() => setFocusedField("")}
        />

        {/* Details toggle */}
        <TouchableOpacity
          style={styles.detailsToggle}
          activeOpacity={0.7}
          onPress={() => {
            setShowDetails((v) => !v);
            Haptics.selectionAsync();
          }}
        >
          <Text style={styles.detailsToggleText}>
            {showDetails ? "Hide details ▲" : "Add details ▼"}
          </Text>
        </TouchableOpacity>

        {showDetails && (
          <>
            {/* Mood selector */}
            <Text style={styles.sectionLabel}>Mood</Text>
            <MoodSelector
              selectedMood={selectedMood}
              onSelectMood={setSelectedMood}
              customMoods={profile?.customMoods ?? []}
              saveCustomMood={saveCustomMood}
              deleteCustomMood={deleteCustomMood}
            />

            {/* People */}
            <Text style={styles.sectionLabel}>People</Text>
            <PeopleInput people={people} onChange={setPeople} />

            {/* Collection */}
            <Text style={styles.sectionLabel}>Collection</Text>
            {selectedCollection ? (
              <View style={styles.collectionChipRow}>
                <TouchableOpacity
                  style={styles.collectionChip}
                  onPress={() => setCollectionPickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="folder-outline" size={14} color={theme.colors.accentText} />
                  <Text style={styles.collectionChipText}>{selectedCollection.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedCollection(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.collectionEmpty}
                onPress={() => setCollectionPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-outline" size={16} color={theme.colors.placeholder} />
                <Text style={styles.collectionEmptyText}>Add to collection</Text>
              </TouchableOpacity>
            )}

            {/* Photos */}
            <Text style={styles.sectionLabel}>Photos</Text>
            <TouchableOpacity style={styles.addPhotosButton} activeOpacity={0.7} onPress={handleAddPhotos}>
              <Text style={styles.addPhotosButtonText}>Add Photos</Text>
            </TouchableOpacity>
            {photos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoScroll}
                contentContainerStyle={styles.photoScrollContent}
              >
                {photos.map((uri) => (
                  <View key={uri} style={styles.photoThumbContainer}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                    <TouchableOpacity
                      style={styles.photoRemove}
                      onPress={() => handleRemovePhoto(uri)}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Photo metadata suggestion banner */}
            {metaSuggestion && !dismissedMetaSuggestion && (
              <View style={styles.metaBanner}>
                <View style={styles.metaBannerRow}>
                  <Text style={styles.metaBannerLabel}>From Photo</Text>
                  <TouchableOpacity onPress={() => setDismissedMetaSuggestion(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.metaBannerDismissText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.metaBannerBody}>
                  {[
                    metaSuggestion.date && `Taken ${metaSuggestion.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
                    metaSuggestion.location && `in ${metaSuggestion.location}`,
                  ].filter(Boolean).join(" ")}
                </Text>
                <TouchableOpacity
                  style={styles.metaBannerUseButton}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (metaSuggestion.date) setMomentDate(metaSuggestion.date);
                    if (metaSuggestion.location) setLocation(metaSuggestion.location);
                    setDismissedMetaSuggestion(true);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={styles.metaBannerUseText}>Use</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Date picker */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>Date</Text>
              {momentDate ? (
                <TouchableOpacity onPress={() => setMomentDate(null)} hitSlop={8}>
                  <Text style={styles.dateClearText}>Clear</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setMomentDate(new Date())} hitSlop={8}>
                  <Text style={styles.dateSetText}>Set date</Text>
                </TouchableOpacity>
              )}
            </View>
            {momentDate ? (
              <DateTimePicker
                value={momentDate}
                mode="date"
                display="compact"
                maximumDate={new Date()}
                onChange={handleDateChange}
                themeVariant={theme.isDark ? "dark" : "light"}
                accentColor={theme.colors.accent}
                style={styles.datePicker}
              />
            ) : (
              <Text style={styles.noDateText}>No specific date</Text>
            )}

            {/* Location suggestion banner */}
            {locationSuggestion && !dismissedLocationSuggestion && !location && (
              <View style={styles.locationBanner}>
                <View style={styles.locationBannerRow}>
                  <Text style={styles.locationBannerLabel}>Currently in {locationSuggestion}</Text>
                  <TouchableOpacity onPress={() => setDismissedLocationSuggestion(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.locationBannerDismissText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.locationBannerUseButton}
                  activeOpacity={0.7}
                  onPress={() => {
                    setLocation(locationSuggestion);
                    setDismissedLocationSuggestion(true);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={styles.locationBannerUseText}>Use as location</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Location */}
            <Text style={styles.sectionLabel}>Location</Text>
            <TextInput
              style={[styles.input, focusedField === "location" && { borderColor: theme.colors.accent }]}
              placeholder="Where were you?"
              placeholderTextColor={theme.colors.placeholder}
              cursorColor={theme.colors.accent}
              value={location}
              onChangeText={setLocation}
              onFocus={() => setFocusedField("location")}
              onBlur={() => setFocusedField("")}
              returnKeyType="done"
            />
          </>
        )}

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>Save Moment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CollectionPicker
        visible={collectionPickerVisible}
        collections={collections}
        selectedId={selectedCollection?.id ?? null}
        onSelect={(c) => setSelectedCollection(c)}
        onClose={() => setCollectionPickerVisible(false)}
        onRequestCreate={() => {
          setCollectionPickerVisible(false);
          setCreateCollectionVisible(true);
        }}
      />

      {user ? (
        <CreateCollectionModal
          visible={createCollectionVisible}
          userId={user.id}
          onCreated={(collection) => {
            setCollections((prev) => [...prev, collection]);
            setSelectedCollection(collection);
            setCreateCollectionVisible(false);
          }}
          onClose={() => setCreateCollectionVisible(false)}
        />
      ) : null}

      {/* Spotify candidate selection modal */}
      <Modal
        visible={showCandidateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCandidateModal(false)}
      >
        <View style={styles.candidateModal}>
          <View style={styles.candidateHeader}>
            <Text style={styles.candidateTitle}>Select the right match</Text>
            <TouchableOpacity onPress={() => setShowCandidateModal(false)}>
              <Text style={styles.candidateClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.candidateSubtitle}>
            We found several Apple Music matches for this Spotify song.
          </Text>
          <FlatList
            data={candidates}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.candidateList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.candidateRow}
                activeOpacity={0.7}
                onPress={() => handleSelectCandidate(item)}
              >
                {item.artworkUrl ? (
                  <Image
                    source={{ uri: item.artworkUrl }}
                    style={styles.candidateArtwork}
                  />
                ) : (
                  <View style={[styles.candidateArtwork, styles.artworkPlaceholder]} />
                )}
                <View style={styles.candidateInfo}>
                  <Text style={styles.candidateSongTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.candidateArtist} numberOfLines={1}>
                    {item.artistName}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing.xl,
      paddingTop: 80,
      paddingBottom: theme.spacing["4xl"],
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing["2xl"],
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    // Now Playing banner
    nowPlayingBanner: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    nowPlayingContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    nowPlayingArtwork: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.sm,
    },
    nowPlayingInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    nowPlayingLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    nowPlayingTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginTop: 1,
    },
    nowPlayingArtist: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    nowPlayingDismiss: {
      padding: theme.spacing.xs,
    },
    nowPlayingDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    nowPlayingUseButton: {
      marginTop: theme.spacing.sm,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    nowPlayingUseText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
    },
    // Location suggestion banner
    locationBanner: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    locationBannerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.sm,
    },
    locationBannerLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      fontWeight: theme.fontWeight.medium,
      flex: 1,
    },
    locationBannerDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    locationBannerUseButton: {
      backgroundColor: theme.colors.buttonBg,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    locationBannerUseText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.buttonText,
    },
    // Details toggle
    detailsToggle: {
      marginTop: theme.spacing.xl,
      alignSelf: "center",
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
    },
    detailsToggleText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    // Photo metadata suggestion banner
    metaBanner: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    metaBannerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.xs,
    },
    metaBannerLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    metaBannerDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    metaBannerBody: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    metaBannerUseButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    metaBannerUseText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
    },
    // Song card
    songCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundSecondary,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
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
      marginTop: 2,
    },
    changeText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginLeft: theme.spacing.sm,
    },
    selectSongButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: theme.spacing.lg,
      borderRadius: theme.radii.md,
      alignItems: "center",
    },
    selectSongButtonText: {
      color: theme.colors.buttonText,
      fontSize: 17,
      fontWeight: theme.fontWeight.semibold,
    },
    sectionLabel: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    dateClearText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
    },
    dateSetText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
    noDateText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.placeholder,
      paddingVertical: theme.spacing.sm,
    },
    reflectionInput: {
      height: 120,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    addPhotosButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: "dashed",
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    addPhotosButtonText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.medium,
    },
    photoScroll: {
      marginTop: 10,
      marginHorizontal: -theme.spacing.xl,
    },
    photoScrollContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoThumbContainer: {
      position: "relative",
    },
    photoThumb: {
      width: 80,
      height: 80,
      borderRadius: theme.radii.sm,
    },
    photoRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    photoRemoveText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: theme.fontWeight.semibold,
    },
    datePicker: {
      alignSelf: "center",
    },
    error: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.lg,
    },
    saveButton: {
      height: 48,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing["2xl"],
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    // Collection picker UI
    collectionChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    collectionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.accentBg,
    },
    collectionChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
      fontWeight: theme.fontWeight.medium,
    },
    collectionEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 8,
      marginBottom: theme.spacing.md,
    },
    collectionEmptyText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.placeholder,
    },
    // Candidate selection modal
    candidateModal: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: theme.spacing["2xl"],
    },
    candidateHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    candidateTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    candidateClose: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
    },
    candidateSubtitle: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
    },
    candidateList: {
      paddingHorizontal: theme.spacing.xl,
    },
    candidateRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    candidateArtwork: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    candidateInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    candidateSongTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    candidateArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    // Identify / ShazamKit
    identifyButton: {
      marginTop: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    identifyRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    identifyButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textSecondary,
    },
    shazamBanner: {
      marginTop: theme.spacing.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    shazamLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    shazamError: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
    },
  });
}
