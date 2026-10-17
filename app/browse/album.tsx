import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchAlbumMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { BrowseScreen } from "@/components/BrowseScreen";

const keyOf = (albumName: string, artist: string) => `${albumName}|||${artist}`;

export default function AlbumScreen() {
  const { user } = useAuth();
  const { album: initialAlbum, artist: initialArtist } = useLocalSearchParams<{ album: string; artist: string }>();
  const [activeKey, setActiveKey] = useState(keyOf(initialAlbum ?? "", initialArtist ?? ""));

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

  const activeAlbum = allAlbums.find((a) => keyOf(a.albumName, a.artist) === activeKey);

  const { data: moments = [], isLoading } = useQuery({
    queryKey: ["albumMoments", user?.id, activeAlbum?.albumName, activeAlbum?.artist] as const,
    queryFn: ({ queryKey }) => fetchAlbumMoments(queryKey[1]!, queryKey[2]!, queryKey[3]!),
    enabled: !!user && !!activeAlbum,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  return (
    <BrowseScreen
      title={activeAlbum?.albumName ?? initialAlbum ?? ""}
      subtitle={activeAlbum?.artist ?? initialArtist}
      items={allAlbums.map((a) => ({
        key: keyOf(a.albumName, a.artist),
        label: a.albumName,
        artworkUrl: a.artworkUrl || undefined,
      }))}
      activeKey={activeKey}
      onSelect={setActiveKey}
      moments={moments}
      // Until browseMeta resolves there's no album to query, which isn't "empty".
      isLoading={isLoading || (!activeAlbum && meta.length === 0)}
    />
  );
}
