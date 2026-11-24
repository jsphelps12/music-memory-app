import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as Sentry from "@sentry/react-native";
import { usePostHog } from "posthog-react-native";
import {
  Alert,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  Keyboard,
  StyleSheet,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { Chip } from "@/components/Chip";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import type { IconName } from "@/components/Icon";
import { useRouter, useLocalSearchParams, useNavigation, usePreventRemove } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { extractExifFromPath } from "@/lib/photoMetadata";
import { saveMoment, lookupPreview, type SaveMomentInput, type SaveMomentResult } from "@/lib/saveMoment";
import { enqueueOutbox } from "@/lib/outbox";
import { queueFailedSave } from "@/lib/outboxFlush";
import { momentCreatedProperties, momentQueuedProperties, QUEUED_NOTICE, type QueuedReason } from "@/lib/outboxUi";
import { isDeviceOnline } from "@/lib/appFocus";
import type { SongLookup } from "@/lib/songMetadata";
import { captureSourceFor, type SongPick } from "@/lib/captureSource";
import { maybeRequestReview } from "@/lib/reviewPrompt";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import { SongPickerSection } from "@/components/SongPickerSection";
import { PhotoPickerSection, type PhotoPickerHandle } from "@/components/PhotoPickerSection";
import { DayPhotosSuggestion } from "@/components/DayPhotosSuggestion";
import { LocationField } from "@/components/LocationField";
import { fetchAlbums } from "@/lib/albums";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song, Album, type PersonLink } from "@/types";
import { GeoResult } from "@/lib/geocoding";
import { friendlyError } from "@/lib/errors";
import { checkAndNotifyMilestone } from "@/lib/notifications";
import { cancelTodaysCheckIn } from "@/lib/dailyCheckIn";
import { markTimelineStale, setListNotice } from "@/lib/timelineRefresh";
import { invalidateMomentCaches, invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import type { MusicProviderType } from "@/types";
import { PromptPickerModal } from "@/components/PromptPickerModal";
import { BottomSheet } from "@/components/BottomSheet";
import { fetchWeather, WeatherResult } from "@/lib/weather";
import { dateToStr } from "@/lib/dateUtils";
import { MOODS } from "@/constants/Moods";
import { startTimer } from "@/lib/perf";
import { setWritingSession } from "@/lib/writingSession";
import {
  loadDraftToPickUp,
  saveCaptureDraft,
  discardCaptureDraft,
  releaseDraft,
  startDraftSession,
  afterDraftLoad,
  afterMomentSaved,
  afterDraftDiscarded,
  canWriteDraft,
  isWorthKeeping,
  draftWhenLabel,
  newDraftId,
  type CaptureDraft,
  type DraftAlbum,
  type DraftContent,
  type DraftGiven,
  type DraftSession,
} from "@/lib/captureDraft";
import { restoreDraftPhotos } from "@/lib/captureDraftFiles";
import type { DraftPhoto } from "@/lib/draftPhotos";
import { withLoadedPhotos, type LoadedPhoto } from "@/lib/capturePhotos";

import { goHome } from "@/lib/goHome";
import { formatSongTime } from "@/lib/songPart";
import { SongPartSheet } from "@/components/SongPartSheet";
// Starters, not prompts: they open a sentence for the three ways people use
// the journal (a memory, a discovery, a day) and get out of the way.
// The left-edge strip that asks before leaving: about as wide as iOS's own
// back-swipe zone, a swipe of this far to the right, and not a scroll.
const EDGE_SWIPE_WIDTH = 20;
const EDGE_SWIPE_DISTANCE = 24;
const EDGE_SWIPE_SLOP = 20;

const STARTERS = [
  { label: "It takes me back to…", text: "It takes me back to " },
  { label: "Just found this…", text: "Just found this " },
  { label: "Today I…", text: "Today I " },
] as const;

type DetailSheet = "mood" | "people" | "place" | "date" | "part" | null;

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatDateChip(date: Date | null) {
  if (!date) return "No date";
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function withMore(first: string, count: number) {
  return count > 1 ? `${first} +${count - 1}` : first;
}

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  // Open → saved, the number that says whether capture is quick.
  const [sinceOpen] = useState(() => startTimer());
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const createAlbumAfterPicker = useRef(false);
  const photoPickerRef = useRef<PhotoPickerHandle>(null);
  const params = useLocalSearchParams<{
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songProvider?: string;
    songAppleMusicId?: string;
    songSpotifyId?: string;
    songDurationMs?: string;
    photos?: string;
    shareCandidates?: string;
    shareFailedUrl?: string;
    sharedPhotoPaths?: string;
    /** Library ids for sharedPhotoPaths, same order (Last week): those photos link (1.4). */
    sharedAssetIds?: string;
    promptQuestion?: string;
    promptStarter?: string;
    collectionId?: string;
    /** "1" from the widget's Identify tile and control: start listening. */
    identify?: string;
    /** Where capture was opened from ("widget"), for analytics. */
    source?: string;
    /** From Last week: offer that day's photos ("2026-11-15"). */
    photosDay?: string;
    /** From Last week: when the song or photo happened (epoch ms), the moment's date. */
    momentAt?: string;
    /** "1" from the long-press menu's Search: open song search straight away. */
    search?: string;
    /** From before: offer the week's photos (epoch ms bounds) rather than the day's. */
    photosFrom?: string;
    photosTo?: string;
    /** From "Continue a draft" (components/CaptureMenu): pick up exactly this draft. */
    draftId?: string;
  }>();

  // Opened from a widget or control: worth knowing whether capture-from-
  // anywhere gets used at all.
  useEffect(() => {
    if (params.source) posthog.capture("capture_opened", { source: params.source, identify: params.identify === "1" });
    // Once per screen open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [song, setSong] = useState<Song | null>(null);
  const previewFetchRef = useRef<Promise<SongLookup> | null>(null);
  // How the current song was chosen in the picker; null when it came in with
  // the route (a share, Last week, a draft). Feeds capture_source.
  const songPickRef = useRef<SongPick | null>(null);
  // The id this capture's moment saves under, picked on the first Save and
  // kept across retries, so a save that landed but lost its response can't
  // become a second moment (saveMoment reads it back; the outbox reuses it).
  // A new form (after a save, Start fresh, a share arriving) gets a new one.
  const momentIdRef = useRef<string | null>(null);

  const handleSongChange = useCallback((s: Song | null, pick?: SongPick) => {
    setSong(s);
    songPickRef.current = s ? pick ?? null : null;
    // Never rejects: a lookup for a song that gets swapped out (or a capture
    // that's cancelled) has no one awaiting it.
    previewFetchRef.current = s ? lookupPreview(s) : null;
  }, []);
  // The part of the song (lib/songPart.ts) and the song's length for its
  // scrubber. A different song starts with no part; partSongKey says which
  // song the part belongs to, so a continued draft can bring its own back.
  const [songPartMs, setSongPartMs] = useState<number | null>(null);
  const [songDurationMs, setSongDurationMs] = useState<number | null>(null);
  const songKey = song ? `${song.provider}:${song.appleMusicId ?? song.spotifyId ?? song.id}:${song.title}` : "";
  const partSongKey = useRef(songKey);
  useEffect(() => {
    if (partSongKey.current === songKey) return;
    partSongKey.current = songKey;
    setSongPartMs(null);
  }, [songKey]);
  useEffect(() => {
    if (!song) {
      setSongDurationMs(null);
      return;
    }
    // The picker's length until the catalog lookup (always ms) says.
    let cancelled = false;
    setSongDurationMs(song.durationMs > 0 ? song.durationMs : null);
    previewFetchRef.current?.then((lookup) => {
      if (!cancelled && lookup?.durationMs) setSongDurationMs(lookup.durationMs);
    });
    return () => {
      cancelled = true;
    };
    // The lookup starts with the song, in handleSongChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songKey]);
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Sync song from params when returning from song-search with a share intent song
  useEffect(() => {
    if (params.songTitle) {
      const provider = (params.songProvider as MusicProviderType | undefined) ?? 'apple_music';
      handleSongChange({
        id: params.songId ?? "",
        title: params.songTitle,
        artistName: params.songArtist ?? "",
        albumName: params.songAlbum ?? "",
        artworkUrl: params.songArtwork ?? "",
        provider,
        appleMusicId: params.songAppleMusicId || null,
        spotifyId: params.songSpotifyId || null,
        durationMs: Number(params.songDurationMs) || 0,
      });
    }
    // Depend on every field read above, not just songId: share-intent songs
    // often arrive without an id, so consecutive selections would collide on
    // "" and the second one would be silently dropped — saving the wrong song.
  }, [
    params.songId,
    params.songTitle,
    params.songArtist,
    params.songAlbum,
    params.songArtwork,
    params.songProvider,
    params.songAppleMusicId,
    params.songSpotifyId,
    params.songDurationMs,
    handleSongChange,
  ]);

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

  const [photos, setPhotos] = useState<string[]>([]);
  // Photo URI → its Photos library id, for photos that came from the library
  // (picker, suggestion strip, Last week). Those link instead of uploading.
  const [photoAssets, setPhotoAssets] = useState<Record<string, string>>({});
  const rememberAssets = useCallback((map: Record<string, string>) => {
    setPhotoAssets((current) => ({ ...current, ...map }));
  }, []);
  // Poster URI → length (ms) for videos in the strip (1.4): linked, never uploaded.
  const [photoVideos, setPhotoVideos] = useState<Record<string, number>>({});
  const rememberVideos = useCallback((map: Record<string, number>) => {
    setPhotoVideos((current) => ({ ...current, ...map }));
  }, []);
  // Day photos tapped while their original is still coming from iCloud: Save
  // waits for these, so a photo shown as picked is never left out.
  const photoLoads = useRef(new Set<Promise<LoadedPhoto>>());
  const trackPhotoLoad = useCallback((load: Promise<LoadedPhoto>) => {
    photoLoads.current.add(load);
    void load.finally(() => photoLoads.current.delete(load));
  }, []);

  // If share intent lookup failed, open song search, once. The param stays
  // set for the screen's lifetime, so without the guard any later photo
  // change would open song search again.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const openedSearchFor = useRef<string | null>(null);
  useEffect(() => {
    if (!params.shareFailedUrl || openedSearchFor.current === params.shareFailedUrl) return;
    openedSearchFor.current = params.shareFailedUrl;
    router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photosRef.current) } });
  }, [params.shareFailedUrl, router]);

  // The long-press menu's Search: straight to song search, once.
  const openedSearch = useRef(false);
  useEffect(() => {
    if (params.search !== "1" || openedSearch.current) return;
    openedSearch.current = true;
    router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photosRef.current) } });
  }, [params.search, router]);

  // Restore photos from params after song-search navigation
  useEffect(() => {
    if (params.photos) {
      try {
        const restored = JSON.parse(params.photos) as string[];
        if (restored.length > 0) setPhotos(restored);
      } catch {}
    }
  }, [params.photos]);

  // Shared photos from share extension — pre-fill photos, open details, extract EXIF from first
  useEffect(() => {
    if (!params.sharedPhotoPaths) return;
    try {
      const paths = JSON.parse(params.sharedPhotoPaths) as string[];
      if (paths.length === 0) return;
      setPhotos(paths);
      const ids = params.sharedAssetIds ? (JSON.parse(params.sharedAssetIds) as (string | null)[]) : [];
      const map: Record<string, string> = {};
      paths.forEach((p, i) => {
        if (ids[i]) map[p] = ids[i]!;
      });
      rememberAssets(map);
      extractExifFromPath(paths[0]).then((meta) => {
        if (meta.date || meta.location) setMetaSuggestion(meta);
      });
    } catch {}
  }, [params.sharedPhotoPaths, params.sharedAssetIds, rememberAssets]);

  const hasSong = !!song;

  // The writing area is uncontrolled. `reflection` mirrors what's typed; text
  // set from code (starters, prompts) remounts the input with it as the
  // default instead of pushing it through `value`. A controlled value plus
  // focus() in one tick dispatches two native commands, and RN 0.81 crashed
  // (SIGSEGV in Scheduler::uiManagerDidDispatchCommand) on exactly that.
  const [reflection, setReflection] = useState("");
  const [reflectionSeed, setReflectionSeed] = useState({ key: 0, text: "", focus: false });
  const replaceReflection = useCallback((text: string, focus: boolean) => {
    setReflection(text);
    setReflectionSeed((seed) => ({ key: seed.key + 1, text, focus }));
  }, []);

  // Pre-fill reflection from a journal prompt
  useEffect(() => {
    if (params.promptStarter) replaceReflection(params.promptStarter, false);
  }, [params.promptStarter, replaceReflection]);

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  // Names linked to friends (private to the owner; components/PeopleInput.tsx).
  const [peopleLinks, setPeopleLinks] = useState<PersonLink[]>([]);
  // Dated when it happened when it came from Last week, else now.
  const [momentDate, setMomentDate] = useState<Date | null>(() => {
    const at = Number(params.momentAt);
    return Number.isFinite(at) && at > 0 ? new Date(at) : new Date();
  });
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [weatherResult, setWeatherResult] = useState<WeatherResult | null>(null);
  const [metaSuggestion, setMetaSuggestion] = useState<{ date?: Date; location?: string; lat?: number; lng?: number } | null>(null);
  const [detailSheet, setDetailSheet] = useState<DetailSheet>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  // A continued draft's album, until the albums have loaded to pick it from.
  const [draftAlbum, setDraftAlbum] = useState<DraftAlbum | null>(null);
  const [albumPickerVisible, setAlbumPickerVisible] = useState(false);
  const [createAlbumVisible, setCreateAlbumVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promptPickerVisible, setPromptPickerVisible] = useState(false);

  const loadAlbums = useCallback(() => {
    if (user && albums.length === 0) fetchAlbums(user.id).then(setAlbums).catch(() => {});
  }, [user, albums.length]);

  // Drafts: what the person added survives a crash or iOS killing the app,
  // silently, and closing capture asks whether to keep it (below, by
  // close()). A draft keeps the writing, song, photos and videos, moods,
  // people, date, place and album (lib/captureDraft.ts). This capture writes
  // only its own draft, so a pre-filled one (a share, Last week, From before,
  // a prompt, Identify) leaves an earlier draft alone. A blank capture opens
  // blank; from "Continue a draft" it picks up exactly that draft (draftId),
  // and writes wait until that read is done. After the save, or Discard,
  // nothing is written again.
  // When the picked-up draft was last written (for "Draft from Tuesday"), or
  // null when this capture didn't pick one up.
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(null);
  const draftSession = useRef<DraftSession | null>(null);
  const latestDraft = useRef<DraftContent>({ reflection: "", song: null });
  // Text the app put in (starters, prompts): not the user's writing on its own.
  // State for the close prompt's check in render; the ref for effects.
  const [templates, setTemplates] = useState<string[]>(() => [
    ...STARTERS.map((s) => s.text),
    ...(params.promptStarter ? [params.promptStarter] : []),
  ]);
  // Photos that came with the capture (Last week, shared in): not, on their
  // own, something the person added.
  const givenPhotos = useMemo(() => {
    try {
      return params.sharedPhotoPaths ? (JSON.parse(params.sharedPhotoPaths) as string[]) : [];
    } catch {
      return [];
    }
  }, [params.sharedPhotoPaths]);
  const draftGiven = useRef<DraftGiven>({ templates, photos: givenPhotos });
  useEffect(() => {
    draftGiven.current = { templates, photos: givenPhotos };
  }, [templates, givenPhotos]);

  // Everything a draft keeps, as it is now.
  const draftContent = useMemo<DraftContent>(
    () => ({
      reflection,
      song,
      photos: photos.map(
        (uri): DraftPhoto => ({ uri, assetId: photoAssets[uri] ?? null, videoMs: photoVideos[uri] ?? null })
      ),
      moods: selectedMoods,
      people,
      peopleLinks,
      date: momentDate ? momentDate.getTime() : null,
      place: locationResult,
      album: selectedAlbum ? { id: selectedAlbum.id, name: selectedAlbum.name } : draftAlbum,
      partMs: songPartMs,
    }),
    [reflection, song, photos, photoAssets, photoVideos, selectedMoods, people, peopleLinks, momentDate, locationResult, selectedAlbum, draftAlbum, songPartMs]
  );

  // A continued draft back into the form; `restored` is its photos as files
  // on this phone now (lib/captureDraftFiles.ts).
  const applyDraft = (draft: CaptureDraft, restored: DraftPhoto[]) => {
    replaceReflection(draft.reflection, false);
    if (draft.song) {
      handleSongChange(draft.song);
      // The draft's part belongs to its song: keep the song-change reset
      // from clearing it.
      partSongKey.current = `${draft.song.provider}:${draft.song.appleMusicId ?? draft.song.spotifyId ?? draft.song.id}:${draft.song.title}`;
      if (draft.partMs != null) setSongPartMs(draft.partMs);
    }
    if (restored.length) {
      const uris = restored.map((p) => p.uri);
      setPhotos((current) => [...uris, ...current.filter((uri) => !uris.includes(uri))]);
      const assets: Record<string, string> = {};
      const videos: Record<string, number> = {};
      for (const p of restored) {
        if (p.assetId) assets[p.uri] = p.assetId;
        if (p.videoMs != null) videos[p.uri] = p.videoMs;
      }
      rememberAssets(assets);
      rememberVideos(videos);
    }
    if (draft.moods?.length) setSelectedMoods(draft.moods);
    if (draft.people?.length) setPeople(draft.people);
    if (draft.peopleLinks?.length) setPeopleLinks(draft.peopleLinks);
    if (draft.date !== undefined) setMomentDate(draft.date === null ? null : new Date(draft.date));
    if (draft.place) setLocationResult(draft.place);
    if (draft.album) setDraftAlbum(draft.album);
    setRestoredDraftAt(draft.savedAt);
  };

  useEffect(() => {
    if (!user) return;
    const prefilled =
      !!params.songTitle || !!params.promptStarter || !!params.shareCandidates ||
      !!params.shareFailedUrl || !!params.sharedPhotoPaths || params.identify === "1" ||
      !!params.photosDay;
    const session = startDraftSession(newDraftId(), prefilled);
    draftSession.current = session;
    if (session.phase === "open") return;
    loadDraftToPickUp(user.id, {
      prefilled,
      typed: () => latestDraft.current.reflection,
      draftId: params.draftId,
    }).then(async (picked) => {
      let draft = picked;
      const restored = draft?.photos?.length ? await restoreDraftPhotos(draft.photos) : [];
      // Writing typed while its photos were being found: that stays, and the
      // draft waits for another capture.
      if (draft && latestDraft.current.reflection.trim()) {
        releaseDraft(draft.id);
        draft = null;
      }
      if (draft) applyDraft(draft, restored);
      draftSession.current = afterDraftLoad(draftSession.current ?? session, draft);
      // Anything typed while the read was in flight: keep it now rather
      // than at the next keystroke.
      const current = draftSession.current;
      if (!draft && canWriteDraft(current)) {
        void saveCaptureDraft(user.id, current.id, latestDraft.current, draftGiven.current);
      }
    });
    // Once per screen open, for the signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    latestDraft.current = draftContent;
    if (!user || !canWriteDraft(draftSession.current)) return;
    const t = setTimeout(() => {
      // Checked again when it fires: the moment may have been saved since.
      const current = draftSession.current;
      if (canWriteDraft(current)) void saveCaptureDraft(user.id, current.id, draftContent, draftGiven.current);
    }, 600);
    return () => clearTimeout(t);
  }, [draftContent, user]);

  // A continued draft's album, once the albums are here. Left off if it's
  // gone (deleted, or left), and never over one picked meanwhile.
  useEffect(() => {
    if (draftAlbum) loadAlbums();
  }, [draftAlbum, loadAlbums]);
  useEffect(() => {
    if (!draftAlbum || albums.length === 0) return;
    const match = albums.find((a) => a.id === draftAlbum.id);
    if (match) setSelectedAlbum((current) => current ?? match);
    setDraftAlbum(null);
  }, [draftAlbum, albums]);

  // A share that arrives while this capture is open (the share handler
  // replaces the route, and the screen is reused with the new params) is a
  // new capture: what's there so far stays as its own draft for later
  // instead of riding along into the shared song's moment.
  const shareKey = [
    params.songId, params.songTitle, params.songArtist, params.shareCandidates,
    params.sharedPhotoPaths, params.shareFailedUrl,
  ].join("|");
  const openedWithShareKey = useRef(shareKey);
  useEffect(() => {
    if (shareKey === openedWithShareKey.current) return;
    openedWithShareKey.current = shareKey;
    const current = draftSession.current;
    if (user && canWriteDraft(current)) {
      void saveCaptureDraft(user.id, current.id, latestDraft.current, draftGiven.current);
    }
    if (current) releaseDraft(current.id);
    draftSession.current = startDraftSession(newDraftId(), true);
    momentIdRef.current = null;
    replaceReflection("", false);
    if (!params.sharedPhotoPaths) setPhotos([]);
    setSelectedMoods([]);
    setPeople([]);
    setPeopleLinks([]);
    setLocationResult(null);
    setSelectedAlbum(null);
    setDraftAlbum(null);
    setRestoredDraftAt(null);
    // Only a new share starts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareKey]);

  // Leaving (Cancel, swipe) flushes the last changes the debounce hasn't
  // written yet. Not after a save: the draft is gone for good then.
  useEffect(
    () => () => {
      const current = draftSession.current;
      if (user && canWriteDraft(current)) {
        void saveCaptureDraft(user.id, current.id, latestDraft.current, draftGiven.current);
      }
      if (current) releaseDraft(current.id);
    },
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Back to a blank capture: after a save, and on "Start fresh".
  const clearForm = () => {
    momentIdRef.current = null;
    setRestoredDraftAt(null);
    handleSongChange(null);
    replaceReflection("", false);
    setSelectedMoods([]);
    setPeople([]);
    setPeopleLinks([]);
    setPhotos([]);
    setMomentDate(new Date());
    setLocationResult(null);
    setSelectedAlbum(null);
    setDraftAlbum(null);
    setWeatherResult(null);
    setMetaSuggestion(null);
    setError("");
  };

  // The draft's photos, moods and the rest go too: its kept photo copies are
  // deleted with it.
  const startFresh = () => {
    Haptics.selectionAsync();
    const current = draftSession.current;
    if (user && canWriteDraft(current)) void discardCaptureDraft(user.id, current.id);
    clearForm();
  };

  const openFullPage = () => {
    Keyboard.dismiss();
    setWritingSession({
      text: latestDraft.current.reflection,
      songTitle: song?.title,
      songArtist: song?.artistName,
      songArtworkUrl: song?.artworkUrl || undefined,
      placeholder: params.promptQuestion || "What's this song doing for you?",
      // Mirrored as it's typed so the draft keeps full-page writing too.
      onChange: setReflection,
      onDone: (text) => replaceReflection(text, false),
    });
    router.push("/write");
  };

  // Opened from an album view: pre-select that album.
  useEffect(() => {
    if (params.collectionId) loadAlbums();
  }, [params.collectionId, loadAlbums]);

  // The detail bar rides the keyboard; it only needs the home-indicator
  // inset when the keyboard is down.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!params.collectionId || albums.length === 0) return;
    const match = albums.find((c) => c.id === params.collectionId);
    if (match) setSelectedAlbum(match);
  }, [params.collectionId, albums]);

  // Auto-fetch weather when location + date are both set
  useEffect(() => {
    if (!locationResult?.lat || !locationResult?.lng || !momentDate) {
      setWeatherResult(null);
      return;
    }
    let cancelled = false;
    const d = momentDate;
    const dateStr = dateToStr(d);
    const hour = new Date().getHours();
    const tod =
      hour >= 5 && hour < 12 ? "Morning" :
      hour >= 12 && hour < 17 ? "Afternoon" :
      hour >= 17 && hour < 21 ? "Evening" : "Late Night";
    fetchWeather(locationResult.lat, locationResult.lng, dateStr, tod).then((result) => {
      if (!cancelled) setWeatherResult(result);
    });
    return () => { cancelled = true; };
  }, [locationResult?.lat, locationResult?.lng, momentDate?.toDateString()]);

  const handleApplyMeta = (
    date: Date | undefined,
    location: { name: string; lat: number | null; lng: number | null } | undefined
  ) => {
    if (date) setMomentDate(date);
    if (location) setLocationResult(location);
    Haptics.selectionAsync();
  };

  const handleSelectCandidate = (selected: Song) => {
    Haptics.selectionAsync();
    handleSongChange(selected);
    setCandidates([]);
    setShowCandidateModal(false);
  };

  function close() {
    if (router.canGoBack()) router.back();
    else goHome(router);
  }

  // Closing with writing worth keeping asks (✕, swipe back, a replace): keep
  // it as a draft, or discard it. Dismissing the question stays in capture.
  // A crash or iOS killing the app still keeps the draft silently (above).
  const [keepAsk, setKeepAsk] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const keepChoice = useRef<"keep" | "discard" | null>(null);
  const continueLeave = useRef<(() => void) | null>(null);
  const worthKeeping = isWorthKeeping(draftContent, { templates, photos: givenPhotos });
  const guarding = worthKeeping && !leaving;
  const allowLeave = usePreventRemove(guarding, ({ repeat }) => {
    Keyboard.dismiss();
    keepChoice.current = null;
    continueLeave.current = repeat;
    setKeepAsk(true);
  });

  // Swiping back asks first (owner, 2026-11-23). iOS's own back swipe can't
  // be held mid-way: with the guard on it finished, showed the Journal, then
  // jumped back to capture to ask. So while there's something to keep the
  // native swipe is off and an edge swipe of our own (below) asks in place;
  // leaving after the answer lifts the guard first.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !guarding });
  }, [navigation, guarding]);
  const askBeforeLeaving = () => {
    Keyboard.dismiss();
    keepChoice.current = null;
    continueLeave.current = () => {
      allowLeave();
      close();
    };
    setKeepAsk(true);
  };
  const edgeSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX(EDGE_SWIPE_DISTANCE)
    .failOffsetY([-EDGE_SWIPE_SLOP, EDGE_SWIPE_SLOP])
    .onStart(askBeforeLeaving);

  const chooseKeep = (choice: "keep" | "discard") => {
    Haptics.selectionAsync();
    keepChoice.current = choice;
    if (choice === "discard") {
      const current = draftSession.current;
      if (current) {
        // Before anything else can write it back: the flush on leaving
        // checks the session.
        draftSession.current = afterDraftDiscarded(current);
        if (user) void discardCaptureDraft(user.id, current.id);
      }
    }
    setKeepAsk(false);
  };

  // Leave once the question's sheet is gone (DESIGN.md: hand off on onClosed).
  const onKeepAskClosed = () => {
    const choice = keepChoice.current;
    const leave = continueLeave.current;
    keepChoice.current = null;
    continueLeave.current = null;
    if (!choice || !leave) return;
    setLeaving(true);
    leave();
  };

  // The moment went to the outbox instead of saving (no connection, or a
  // save that failed for a reason a retry fixes). For the person it's saved:
  // the draft goes (the outbox keeps its own copies of the photos), capture
  // closes as after a save, and the Journal (or album) says where it is.
  // moment_created fires when the outbox actually saves it (lib/outboxSaved.ts).
  const finishQueued = (input: SaveMomentInput, reason: QueuedReason) => {
    const session = draftSession.current;
    if (user && session) {
      draftSession.current = afterMomentSaved(session);
      void discardCaptureDraft(user.id, session.id);
    }
    posthog.capture("moment_queued_offline", momentQueuedProperties(input, reason));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setListNotice(QUEUED_NOTICE);
    // Today is logged, even if it hasn't gone up yet.
    void cancelTodaysCheckIn();
    clearForm();
    allowLeave();
    close();
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
      const sinceSave = startTimer();
      // Photos still loading were shown as picked: wait for them.
      const loaded = await Promise.all([...photoLoads.current]);
      const toSave = withLoadedPhotos(photos, photoAssets, loaded);
      const captureSource = captureSourceFor(
        {
          source: params.source,
          shared: !!(params.songTitle || params.shareCandidates || params.shareFailedUrl || params.sharedPhotoPaths),
          draft: restoredDraftAt != null,
          identify: params.identify === "1",
          search: params.search === "1",
        },
        songPickRef.current
      );
      if (!momentIdRef.current) momentIdRef.current = Crypto.randomUUID();
      const input: SaveMomentInput = {
        momentId: momentIdRef.current,
        userId: user.id,
        song: song!,
        reflection,
        photos: toSave.photos,
        photoAssetIds: toSave.photos.map((uri) => toSave.assets[uri] ?? null),
        photoVideoDurations: toSave.photos.map((uri) => photoVideos[uri] ?? null),
        people,
        peopleLinks,
        moods: selectedMoods,
        locationResult,
        momentDate,
        selectedAlbum,
        // The pending lookup itself, so photo uploads start alongside it.
        prefetchedPreview: previewFetchRef.current,
        weatherResult,
        captureSource,
        songPartMs,
      };

      // No connection: straight to the outbox, saved when it's back
      // (docs/PLAN-1.5.md, "5. Offline saves").
      if (!(await isDeviceOnline())) {
        await enqueueOutbox(user.id, input, { failure: { kind: "offline" } });
        finishQueued(input, "offline");
        return;
      }
      let saved: SaveMomentResult;
      try {
        saved = await saveMoment(input);
      } catch (e) {
        // A failure retrying can fix (the connection, the server) goes to the
        // outbox under the same id; anything else is shown as before. An
        // outbox that can't be written shows the save's error, draft kept.
        const queued = await queueFailedSave(user.id, input, e).catch(() => null);
        if (!queued) throw e;
        finishQueued(input, "save_failed");
        return;
      }
      const { moment: savedMoment, secondaryFailures } = saved;

      // Saved: this capture's draft goes, and nothing writes it again (a
      // late debounce or the flush on leaving would bring it back).
      const session = draftSession.current;
      if (session) {
        draftSession.current = afterMomentSaved(session);
        void discardCaptureDraft(user.id, session.id);
      }

      // Captured before the form reset below clears selectedAlbum.
      const savedToAlbumId = selectedAlbum?.id;

      posthog.capture("moment_created", {
        ...momentCreatedProperties(input),
        capture_ms: sinceOpen(),
        save_ms: sinceSave(),
        source: params.source ?? null,
      });

      checkAndNotifyMilestone(user.id).catch(() => {});
      maybeRequestReview().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (secondaryFailures.length > 0) {
        Alert.alert(
          "Moment saved",
          `Your moment was saved, but ${secondaryFailures.join(" and ")}. You can retry from the moment detail.`
        );
      }

      clearForm();

      markTimelineStale(savedMoment);
      // Today is logged: its check-in reminder has nothing left to ask.
      void cancelTodaysCheckIn();
      invalidateMomentCaches(queryClient, user.id);
      // saveMoment adds the moment to the album for us, so the album caches are
      // stale too — invalidate here rather than widening saveMoment's signature.
      if (savedToAlbumId) invalidateAlbumCaches(queryClient, user.id, savedToAlbumId);

      // Saved: nothing left to ask about. Lift the close guard now; the
      // reset above only lands on the next render.
      allowLeave();
      close();
    } catch (e: any) {
      Sentry.captureException(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (sheet: Exclude<DetailSheet, null>) => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setDetailSheet(sheet);
  };

  const applyStarter = (text: string) => {
    Haptics.selectionAsync();
    replaceReflection(text, true);
  };

  const moodLabel = (value: string) =>
    [...MOODS, ...(profile?.customMoods ?? [])].find((m) => m.value === value)?.label ?? value;

  // Each chip names its value once set, so the bar doubles as a summary of
  // what's attached. A default date of today isn't a choice, so it stays plain.
  const chips: { key: string; icon: IconName; label: string; set: boolean; onPress: () => void }[] = [
    {
      key: "photo",
      icon: "image-outline",
      label: photos.length ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}` : "Photo",
      set: photos.length > 0,
      onPress: () => {
        Keyboard.dismiss();
        photoPickerRef.current?.openPicker();
      },
    },
    // The part of the song: only once there's a song to point into.
    ...(song
      ? [
          {
            key: "part",
            icon: "musical-note-outline" as IconName,
            label: songPartMs != null ? `At ${formatSongTime(songPartMs)}` : "Part",
            set: songPartMs != null,
            onPress: () => openSheet("part"),
          },
        ]
      : []),
    {
      key: "mood",
      icon: "happy-outline",
      label: selectedMoods.length ? withMore(moodLabel(selectedMoods[0]), selectedMoods.length) : "Mood",
      set: selectedMoods.length > 0,
      onPress: () => openSheet("mood"),
    },
    {
      key: "people",
      icon: "people-outline",
      label: people.length ? withMore(`With ${people[0]}`, people.length) : "People",
      set: people.length > 0,
      onPress: () => openSheet("people"),
    },
    {
      key: "place",
      icon: "location-outline",
      label: locationResult?.name ?? "Place",
      set: !!locationResult,
      onPress: () => openSheet("place"),
    },
    {
      key: "date",
      icon: "calendar-outline",
      label: formatDateChip(momentDate),
      set: !!momentDate && !isSameDay(momentDate, new Date()),
      onPress: () => openSheet("date"),
    },
    {
      key: "album",
      icon: "albums-outline",
      label: selectedAlbum?.name ?? "Album",
      set: !!selectedAlbum,
      onPress: () => {
        Keyboard.dismiss();
        loadAlbums();
        setAlbumPickerVisible(true);
      },
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      {/* While there's something to keep: the left-edge swipe asks (above). */}
      {guarding ? (
        <GestureDetector gesture={edgeSwipe}>
          <View style={styles.edgeSwipe} testID="create-edge-swipe" />
        </GestureDetector>
      ) : null}
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        {/* Leaving the task: one ✕, on the left (DESIGN.md). */}
        <IconButton
          testID="create-close"
          name="close"
          accessibilityLabel="Close"
          onPress={close}
          style={styles.closeButton}
        />
        <Button
          testID="create-save"
          label="Save"
          size="pill"
          onPress={handleSave}
          loading={loading}
          align="center"
          style={styles.saveButton}
        />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <SongPickerSection
          song={song}
          onChange={handleSongChange}
          photos={photos}
          // Not into a continued draft: its own song (or none) is what was
          // chosen, and the playing song arriving as the draft loads could
          // land on top of it.
          suggestNowPlaying={
            !params.shareCandidates && !params.shareFailedUrl && params.identify !== "1" && !params.draftId
          }
          autoIdentify={params.identify === "1"}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Button
            testID="create-full-page"
            label="Full page"
            icon="expand-outline"
            variant="text"
            tone="secondary"
            size="pill"
            onPress={openFullPage}
            accessibilityLabel="Write on a full page"
            align="center"
          />
        </View>

        {restoredDraftAt !== null ? (
          <View style={styles.draftRow} testID="create-draft-line">
            <Text style={styles.draftText}>
              Draft from {draftWhenLabel(restoredDraftAt, Date.now())} ·
            </Text>
            <Button
              testID="create-start-fresh"
              label="Start fresh"
              variant="text"
              tone="secondary"
              size="pill"
              onPress={startFresh}
              align="center"
              accessibilityLabel="Start fresh: clear this draft"
            />
          </View>
        ) : null}

        {/* Borderless, in the reading face: this is a page, not a form
            field, so it is the writer exception to TextField. */}
        <TextInput
          key={reflectionSeed.key}
          testID="create-reflection"
          style={styles.reflectionInput}
          // A pairing's question ("What was playing on the drive to Kona?")
          // asks; it never answers. Otherwise the usual prompt.
          placeholder={params.promptQuestion || "What's this song doing for you?"}
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          selectionColor={theme.colors.accentText}
          accessibilityLabel="Write about this song"
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
          defaultValue={reflectionSeed.text}
          autoFocus={reflectionSeed.focus}
          onChangeText={setReflection}
        />

        {reflection.trim().length === 0 && (
          <View style={styles.starters}>
            {STARTERS.map((starter) => (
              <Chip key={starter.label} label={starter.label} onPress={() => applyStarter(starter.text)} />
            ))}
            <Chip
              label="More prompts"
              onPress={() => {
                Keyboard.dismiss();
                setPromptPickerVisible(true);
              }}
            />
          </View>
        )}

        {params.photosDay ? (
          <DayPhotosSuggestion
            onAssetIds={rememberAssets}
            day={params.photosDay}
            range={
              params.photosFrom && params.photosTo
                ? { from: Number(params.photosFrom), to: Number(params.photosTo) }
                : undefined
            }
            photos={photos}
            onChange={setPhotos}
            onLoading={trackPhotoLoad}
          />
        ) : null}

        <View style={styles.photos}>
          <PhotoPickerSection
            ref={photoPickerRef}
            compact
            photos={photos}
            onChange={setPhotos}
            onAssetIds={rememberAssets}
            onVideos={rememberVideos}
            onApplyMeta={handleApplyMeta}
            suggestion={metaSuggestion}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* The detail bar: quiet chip-paper pills that fill with ink once they
          hold a value, so the bar doubles as a summary of what's attached. */}
      <View style={[styles.detailBar, { paddingBottom: keyboardVisible ? theme.spacing.md : Math.max(insets.bottom, theme.spacing.md) }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.detailBarContent}
        >
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              testID={`create-detail-${chip.key}`}
              label={chip.label}
              icon={chip.icon}
              variant="filled"
              selected={chip.set}
              onPress={chip.onPress}
              style={styles.detailChip}
            />
          ))}
        </ScrollView>
      </View>

      <BottomSheet visible={detailSheet === "mood"} onClose={() => setDetailSheet(null)} title="Mood" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <MoodSelector
            selectedMoods={selectedMoods}
            onChangeMoods={setSelectedMoods}
            customMoods={profile?.customMoods ?? []}
            saveCustomMood={saveCustomMood}
            deleteCustomMood={deleteCustomMood}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={detailSheet === "people"} onClose={() => setDetailSheet(null)} title="Who was there" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <PeopleInput
            people={people}
            onChangePeople={setPeople}
            links={peopleLinks}
            onChangeLinks={setPeopleLinks}
          />
        </View>
      </BottomSheet>

      {song ? (
        <SongPartSheet
          visible={detailSheet === "part"}
          onClose={() => setDetailSheet(null)}
          song={song}
          durationMs={songDurationMs}
          value={songPartMs}
          onChange={setSongPartMs}
        />
      ) : null}

      <BottomSheet visible={detailSheet === "place"} onClose={() => setDetailSheet(null)} title="Place" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <LocationField value={locationResult} onChange={setLocationResult} detectCurrentLocation={!locationResult} />
          {weatherResult ? (
            <Text style={styles.weatherText}>
              {weatherResult.condition} · {weatherResult.tempF}°F
            </Text>
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={detailSheet === "date"} onClose={() => setDetailSheet(null)} title="Date">
        <View style={styles.sheetBody}>
          {momentDate ? (
            <DateTimePicker
              value={momentDate}
              mode="date"
              display="inline"
              maximumDate={new Date()}
              onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) setMomentDate(date); }}
              themeVariant={theme.isDark ? "dark" : "light"}
              // The selected day is the sheet's one terracotta signal.
              accentColor={theme.colors.accent}
            />
          ) : (
            <Text style={styles.noDateText}>This entry has no specific date.</Text>
          )}
          <Button
            label={momentDate ? "No specific date" : "Set a date"}
            variant="text"
            size="pill"
            onPress={() => setMomentDate(momentDate ? null : new Date())}
          />
        </View>
      </BottomSheet>

      <AlbumPicker
        visible={albumPickerVisible}
        collections={albums}
        selectedId={selectedAlbum?.id ?? null}
        onSelect={(a) => {
          setSelectedAlbum(a);
          setDraftAlbum(null);
        }}
        onClose={() => setAlbumPickerVisible(false)}
        onRequestCreate={() => {
          // The picker's Modal has to be gone before the next sheet presents
          // (iOS drops a Modal that presents mid-dismiss): open from onClosed.
          createAlbumAfterPicker.current = true;
          setAlbumPickerVisible(false);
        }}
        onClosed={() => {
          if (!createAlbumAfterPicker.current) return;
          createAlbumAfterPicker.current = false;
          setCreateAlbumVisible(true);
        }}
      />

      {user ? (
        <CreateAlbumSheet
          visible={createAlbumVisible}
          userId={user.id}
          defaultShared={false}
          onCreated={(album) => {
            setAlbums((prev) => [...prev, album]);
            setSelectedAlbum(album);
            setCreateAlbumVisible(false);
          }}
          onClose={() => setCreateAlbumVisible(false)}
        />
      ) : null}

      <PromptPickerModal
        visible={promptPickerVisible}
        onSelect={(prompt) => {
          setTemplates((list) => [...list, prompt]);
          draftGiven.current = {
            ...draftGiven.current,
            templates: [...(draftGiven.current.templates ?? []), prompt],
          };
          replaceReflection(prompt, true);
        }}
        onClose={() => setPromptPickerVisible(false)}
        customCategories={profile?.customPromptCategories ?? []}
      />

      {/* Closing with writing: keep it as a draft or discard it. Its own
          sheet, not confirmSheet(): dismissing it means "stay", a third
          answer confirmSheet can't give. Capture is a push, so this presents
          like any screen's sheet. */}
      <BottomSheet
        visible={keepAsk}
        onClose={() => setKeepAsk(false)}
        onClosed={onKeepAskClosed}
        title="Keep as a draft?"
        headerAction="none"
        testID="capture-draft-sheet"
      >
        <View style={styles.keepBody}>
          <Text style={styles.keepMessage}>You can finish it from + later.</Text>
          <Button testID="capture-draft-keep" label="Keep draft" onPress={() => chooseKeep("keep")} />
          <Button
            testID="capture-draft-discard"
            label="Discard"
            variant="text"
            tone="destructive"
            fullWidth
            onPress={() => chooseKeep("discard")}
            style={styles.keepDiscard}
          />
        </View>
      </BottomSheet>

      {/* Spotify candidate selection — quick pick, so a compact sheet */}
      <BottomSheet
        visible={showCandidateModal}
        onClose={() => setShowCandidateModal(false)}
        title="Select the right match"
        maxHeight="75%"
      >
        <Text style={styles.candidateSubtitle}>
          We found several Apple Music matches for this Spotify song.
        </Text>
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.candidateList}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.candidateRow, pressed && styles.pressed]}
              onPress={() => handleSelectCandidate(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title} by ${item.artistName}`}
            >
              {item.artworkUrl ? (
                <AppImage source={{ uri: item.artworkUrl }} style={styles.candidateArtwork} />
              ) : (
                <ArtworkPlaceholder style={styles.candidateArtwork} />
              )}
              <View style={styles.candidateInfo}>
                <Text style={styles.candidateSongTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.candidateArtist} numberOfLines={1}>{item.artistName}</Text>
              </View>
            </Pressable>
          )}
        />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    edgeSwipe: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: EDGE_SWIPE_WIDTH,
      zIndex: 10,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    // The ✕ glyph sits optically at the gutter, not its 44pt box.
    closeButton: {
      marginLeft: -12,
    },
    // Holds its width while the spinner replaces the label.
    saveButton: {
      minWidth: 72,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing["3xl"],
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
    draftRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    // The keep-or-discard question: laid out like ConfirmSheet's.
    keepBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    keepMessage: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    keepDiscard: {
      marginTop: theme.spacing.xs,
    },
    draftText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    // The writer: Newsreader at 22/33 on paper, no field chrome.
    reflectionInput: {
      minHeight: 200,
      padding: 0,
      fontFamily: theme.fonts.reading,
      fontSize: theme.fontSize.xl,
      lineHeight: theme.fontSize.xl * 1.5,
      color: theme.colors.text,
    },
    starters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    photos: {
      marginTop: theme.spacing.xl,
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.lg,
    },
    detailBar: {
      paddingTop: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
    },
    detailBarContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    detailChip: {
      minHeight: 40,
      maxWidth: 200,
    },
    sheetBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
    },
    weatherText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.md,
    },
    noDateText: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      paddingVertical: theme.spacing.lg,
    },
    pressed: { opacity: 0.6 },
    // Candidate selection sheet
    candidateSubtitle: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
    },
    candidateList: {
      paddingHorizontal: theme.spacing.xl,
    },
    candidateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    candidateArtwork: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    candidateInfo: {
      flex: 1,
    },
    candidateSongTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    candidateArtist: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}
