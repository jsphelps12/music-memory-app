import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchAlbumMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { BrowseScreen } from "@/components/BrowseScreen";

const SEPARATOR = "|||";
const keyOf = (albumName: string, artist: string) => `${albumName}${SEPARATOR}${artist}`;
function parseKey(key: string): { albumName: string; artist: string } {
  const i = key.indexOf(SEPARATOR);
  return i < 0
    ? { albumName: key, artist: "" }
    : { albumName: key.slice(0, i), artist: key.slice(i + SEPARATOR.length) };
}

export default function AlbumScreen() {
  const { user } = useAuth();
  const { album: initialAlbum, artist: initialArtist } = useLocalSearchParams<{ album: string; artist: string }>();
  const [activeKey, setActiveKey] = useState(keyOf(initialAlbum ?? "", initialArtist ?? ""));

  // Only feeds the switcher. The moments below don't wait on it, so a failed
  // or outdated metadata fetch can't leave the screen loading forever.
  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const allAlbums = useMemo(() => {
    const seen = new Map<string, { albumName: string; artist: string; artworkUrl: string; count: number }>();
    for (const m of meta) {
      if (!m.songAlbumName) continue;
      const key = keyOf(m.songAlbumName, m.songArtist);
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { albumName: m.songAlbumName, artist: m.songArtist, artworkUrl: m.songArtworkUrl, count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count);
  }, [meta]);

  const active = parseKey(activeKey);

  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["albumMoments", user?.id, active.albumName, active.artist] as const,
    queryFn: ({ queryKey }) => fetchAlbumMoments(queryKey[1]!, queryKey[2], queryKey[3]),
    enabled: !!user && !!active.albumName,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });


  return (
    <BrowseScreen
      title={active.albumName}
      subtitle={active.artist || undefined}
      items={allAlbums.map((a) => ({
        key: keyOf(a.albumName, a.artist),
        label: a.albumName,
        artworkUrl: a.artworkUrl || undefined,
      }))}
      activeKey={activeKey}
      onSelect={setActiveKey}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
    />
  );
}
