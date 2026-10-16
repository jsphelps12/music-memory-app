/**
 * Every way Spotify can fail, named, with the words we show for it.
 *
 * Spotify is a minority path that most users can't fully use: the app is in
 * Spotify's development mode (only accounts approved in the dashboard can call
 * the Web API), full playback needs Premium and the Spotify app, and tokens can
 * be revoked from Spotify's side at any time. So failures are expected, and
 * each one must end in a sentence the user can act on, never a silent empty
 * list or a generic "something went wrong".
 *
 * Pure (no native imports) so the mapping is unit-tested.
 */

export type SpotifyFailure =
  /** The user backed out of Spotify's sign-in sheet. Not an error; say nothing. */
  | "cancelled"
  /** The SpotifyRemote native module isn't in this binary or failed to load. */
  | "unavailable"
  /** 403 from the Web API: the account isn't on the dev-mode allowlist. */
  | "not_registered"
  /** We had a session and lost it (refresh rejected, token revoked, never connected). */
  | "signed_out"
  /** Couldn't reach Spotify, or Spotify is rate-limiting / erroring. */
  | "network"
  /** Anything else. */
  | "failed";

export class SpotifyError extends Error {
  readonly reason: SpotifyFailure;
  constructor(reason: SpotifyFailure, options?: { cause?: unknown }) {
    super(`spotify_${reason}`, options);
    this.name = "SpotifyError";
    this.reason = reason;
  }
}

export function spotifyFailureOf(err: unknown): SpotifyFailure {
  return err instanceof SpotifyError ? err.reason : "failed";
}

/** Map a Web API HTTP status to a failure. */
export function spotifyFailureFromStatus(status: number): SpotifyFailure {
  if (status === 401) return "signed_out";
  if (status === 403) return "not_registered";
  if (status === 429 || status >= 500) return "network";
  return "failed";
}

/** What to tell the user. null means stay quiet (they cancelled on purpose). */
export function spotifyFailureMessage(reason: SpotifyFailure): string | null {
  switch (reason) {
    case "cancelled":
      return null;
    case "unavailable":
      return "Spotify isn't available in this version of Soundtracks. Apple Music still works.";
    case "not_registered":
      return "Spotify only lets a limited set of accounts connect to Soundtracks while we wait for Spotify's approval, and yours isn't one of them yet. Apple Music works for everyone in the meantime.";
    case "signed_out":
      return "Spotify signed you out. Reconnect it from Me → Music Service, or switch to Apple Music there.";
    case "network":
      return "Couldn't reach Spotify. Check your connection and try again.";
    case "failed":
      return "Couldn't connect to Spotify. Try again in a moment.";
  }
}

/**
 * Banner copy when Spotify search fails and iTunes results are shown instead.
 * Short on purpose: ErrorBanner shows two lines.
 */
export function spotifySearchFallbackNotice(reason: SpotifyFailure): string {
  switch (reason) {
    case "signed_out":
      return "Spotify signed you out, so these are Apple Music results. Reconnect in Me → Music Service.";
    case "not_registered":
      return "Spotify isn't enabled for your account yet, so these are Apple Music results.";
    case "network":
      return "Couldn't reach Spotify, so these are Apple Music results.";
    case "unavailable":
      return "Spotify isn't available in this version, so these are Apple Music results.";
    default:
      return "Spotify search didn't work, so these are Apple Music results.";
  }
}

/** Shown after a successful connect when the account can't do full playback. */
export const SPOTIFY_FREE_NOTICE =
  "Full songs need Spotify Premium and the Spotify app, so you'll hear 30-second previews instead. Search and saving work the same.";

/** Reject with a "network" failure if `promise` hasn't settled in `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SpotifyError("network")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
