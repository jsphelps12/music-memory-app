/**
 * A photo tapped in capture's day-photos strip whose original was still
 * loading from iCloud: the file it became and its library id, or null when it
 * couldn't be loaded.
 */
export type LoadedPhoto = { uri: string; assetId: string } | null;

/**
 * The photos to save once photos still loading at Save have arrived. The form
 * state Save read was taken before they landed, so they're added here (after
 * the ones already attached, as the strip would have put them), each once,
 * with its library id so it links instead of uploading.
 */
export function withLoadedPhotos(
  photos: readonly string[],
  assets: Readonly<Record<string, string>>,
  loaded: readonly LoadedPhoto[]
): { photos: string[]; assets: Record<string, string> } {
  const nextPhotos = [...photos];
  const nextAssets = { ...assets };
  for (const photo of loaded) {
    if (!photo) continue;
    nextAssets[photo.uri] = photo.assetId;
    if (!nextPhotos.includes(photo.uri)) nextPhotos.push(photo.uri);
  }
  return { photos: nextPhotos, assets: nextAssets };
}
