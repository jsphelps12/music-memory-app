// The fetch every Supabase call goes through (wired in lib/supabase.ts).
// Kept free of React Native imports so its policy is testable under vitest.
//
// EVERY request gets an abort timeout, not just auth. iOS's default URL timeout
// is ~60s (and effectively never on a blackholed connection), and a hung REST
// call was able to stall startup indefinitely: the auth state listener awaits a
// profiles query, GoTrue serializes listener callbacks against session
// recovery, and the root layout's blocking overlay waits on the result. A
// bounded failure is always better than a hang.
//
// The bound depends on what the request carries. A storage upload's timer
// covers sending the whole body, so several full-size photos over a weak
// uplink legitimately take longer than any REST call should; they get a much
// longer bound instead of none.
export const AUTH_TIMEOUT_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

const MAX_ATTEMPTS = 3;

function methodOf(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

/** Abort timeout for a request, by endpoint and method. */
export function requestTimeoutMs(url: string, init?: RequestInit): number {
  if (url.includes("/auth/v1/")) return AUTH_TIMEOUT_MS;
  const method = methodOf(init);
  if (url.includes("/storage/v1/object/") && (method === "POST" || method === "PUT")) {
    return UPLOAD_TIMEOUT_MS;
  }
  return REQUEST_TIMEOUT_MS;
}

/**
 * 520 is what a Supabase cold start returns, so it's worth retrying, but a
 * 520 can also come back after the origin already ran the request. Resending
 * an insert then writes a second row, so only methods that are safe to repeat
 * are retried; the rest surface the error to the caller.
 */
export function shouldRetry520(init?: RequestInit): boolean {
  const method = methodOf(init);
  return method === "GET" || method === "HEAD";
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input);
  const retryable = shouldRetry520(init);
  let delay = 500;

  for (let attempt = 0; ; attempt++) {
    let reqInit = init;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Respect a caller-supplied signal (e.g. React Query cancellation) rather
    // than clobbering it.
    if (!init?.signal) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs(url, init));
      reqInit = { ...init, signal: controller.signal };
    }

    try {
      const res = await fetch(input, reqInit);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (res.status !== 520 || !retryable || attempt === MAX_ATTEMPTS - 1) return res;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    } catch (e) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      throw e;
    }
  }
}
