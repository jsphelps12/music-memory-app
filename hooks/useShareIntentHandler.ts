import { useEffect, useRef } from "react";
import { useShareIntentContext } from "expo-share-intent";
import { useRouter } from "expo-router";
import {
  parseMusicUrl,
  lookupSongFromUrl,
  extractMusicUrl,
} from "@/lib/music-url";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Processes incoming share intents (from Apple Music / Spotify share sheets).
 * Resolves shared URLs to songs and navigates to the create screen.
 * Must be used inside ShareIntentProvider and AuthProvider.
 */
export function useShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const { session } = useAuth();
  const router = useRouter();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || !session || processingRef.current) return;

    processingRef.current = true;

    (async () => {
      try {
        // Extract URL from share intent
        let url = shareIntent.webUrl;

        // If no direct web URL, try to parse one from shared text
        if (!url && shareIntent.text) {
          url = extractMusicUrl(shareIntent.text);
        }

        if (!url) {
          resetShareIntent();
          processingRef.current = false;
          return;
        }

        const parsed = parseMusicUrl(url);
        if (!parsed) {
          resetShareIntent();
          processingRef.current = false;
          return;
        }

        const result = await lookupSongFromUrl(url);

        if (result.song) {
          const params: Record<string, string> = {
            songId: result.song.id,
            songTitle: result.song.title,
            songArtist: result.song.artistName,
            songAlbum: result.song.albumName,
            songArtwork: result.song.artworkUrl,
            songAppleMusicId: result.song.appleMusicId,
            songDurationMs: String(result.song.durationMs),
          };

          // If Spotify cross-search returned multiple candidates, pass them along
          if (result.candidates && result.candidates.length > 1) {
            params.shareCandidates = JSON.stringify(result.candidates);
          }

          router.replace({
            pathname: "/(tabs)/create",
            params,
          });
        } else {
          // Lookup failed — navigate to create with search pre-filled
          // Use the URL as a hint that something was shared but couldn't resolve
          router.replace({
            pathname: "/(tabs)/create",
            params: { shareFailedUrl: url },
          });
        }
      } catch {
        // Silently fail — don't block the user
      } finally {
        resetShareIntent();
        processingRef.current = false;
      }
    })();
  }, [hasShareIntent, session, router, resetShareIntent]);
}
