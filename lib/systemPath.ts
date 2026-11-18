// Links iOS hands the app that aren't pages. The share extension opens the
// app with `<scheme>://dataUrl=<key>?nonce=…#weburl` (expo-share-intent 9);
// ShareIntentProvider reads that URL itself and useShareIntentHandler opens
// the new moment, so the router must not try to show it as a route. Before
// app/+native-intent.tsx existed, a share that cold-started the app landed on
// "This page doesn't exist".

export function isShareIntentPath(path: string): boolean {
  return path.includes("dataUrl=");
}

/**
 * Where the router should go for an incoming system path: a share hand-off
 * stays on the current screen (null), or starts on the Journal when it
 * launched the app; anything else passes through untouched.
 */
export function routeForSystemPath(path: string, initial: boolean): string | null {
  if (isShareIntentPath(path)) return initial ? "/" : null;
  const invite = albumInviteCode(path);
  if (invite) return `/join?inviteCode=${invite}`;
  return path;
}

/**
 * An album invite universal link (`/c/{code}`, apex or www, or the bare
 * path) has no screen of its own: it opens the join screen. Null otherwise.
 */
export function albumInviteCode(path: string): string | null {
  const m = path.match(/^(?:https:\/\/(?:www\.)?soundtracks\.app)?\/c\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}
