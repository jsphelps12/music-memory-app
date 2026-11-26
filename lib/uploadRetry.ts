// Retry rules for one storage upload. Kept free of React Native imports so
// the policy is testable under vitest.
//
// A moment's photo goes up as two objects (full size + thumbnail). On a weak
// connection one request in the pair often drops ("The network connection was
// lost", or storage answering 408 "request timed out") while the other lands,
// and with no retry the whole save failed and the cleanup deleted the half that
// made it (Sentry REACT-NATIVE-1M / 1N, 2026-11-26: a new user lost their
// second onboarding moment this way, twice in a row).

/** Waits before the 2nd and 3rd attempts. */
export const UPLOAD_RETRY_DELAYS_MS = [1_000, 3_000];

type UploadError = {
  name?: string;
  message?: string;
  status?: number;
  statusCode?: string | number;
};

/**
 * Worth sending again: the request never got a real answer (dropped
 * connection, fetch failed) or storage said try later (408, 429, 5xx).
 * Not our own abort timeout: that already waited two minutes, and three of
 * them would leave the user staring at a spinner. Not a 4xx like RLS or a
 * bad request: those fail the same way every time.
 */
export function isTransientUploadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as UploadError;
  if (e.name === "AbortError") return false;
  const status = typeof e.status === "number" ? e.status : undefined;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  if (e.name === "StorageUnknownError") return true;
  return /network|fetch failed|timed out|connection/i.test(e.message ?? "");
}

/**
 * The object is already there. On a retry that means the earlier attempt did
 * land and only its response was lost; the path is a fresh UUID, so the bytes
 * are ours and the upload counts as done.
 */
export function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as UploadError;
  return e.status === 409 || String(e.statusCode) === "409" || /duplicate|already exists/i.test(e.message ?? "");
}

/**
 * Run `attempt` (resolving to the upload's error, or null on success) up to
 * `delays.length + 1` times, retrying only transient errors. Throws the last
 * error when it gives up.
 */
export async function withUploadRetry(
  attempt: () => Promise<unknown | null>,
  delays: number[] = UPLOAD_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<void> {
  for (let i = 0; ; i++) {
    const error = await attempt();
    if (!error) return;
    if (i > 0 && isAlreadyExistsError(error)) return;
    if (i >= delays.length || !isTransientUploadError(error)) throw error;
    await sleep(delays[i]);
  }
}
