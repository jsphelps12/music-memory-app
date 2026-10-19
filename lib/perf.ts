/**
 * Lightweight timing for the moments that decide whether the app feels
 * snappy: cold start and capture. Measure first, then tune what's actually
 * slow. Each flow reports one PostHog event with its step timings in ms.
 *
 * Pure bookkeeping (no native imports), so it's importable from tests and
 * from module scope before React mounts.
 */

type Sink = (event: string, props: Record<string, number | string | boolean | null>) => void;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Module evaluation is as early as JS gets: the bundle has loaded and run.
const jsStart = now();

let startupMarks: Record<string, number> = {};
let startupReported = false;

/** Record a startup step the first time it happens (later calls are ignored). */
export function markStartup(step: string) {
  if (startupReported || step in startupMarks) return;
  startupMarks[step] = Math.round(now() - jsStart);
}

/**
 * Send the startup timings once, when the first real screen is up. `context`
 * carries what explains the numbers (signed in, cached profile, entry route).
 */
export function reportStartup(sink: Sink, context: Record<string, string | boolean | null> = {}) {
  if (startupReported) return;
  markStartup("first_screen");
  startupReported = true;
  const props: Record<string, number | string | boolean | null> = { ...context };
  for (const [step, ms] of Object.entries(startupMarks)) props[`${step}_ms`] = ms;
  sink("app_startup", props);
}

/** A timer for a user flow, e.g. capture opened → saved. */
export function startTimer() {
  const t0 = now();
  return () => Math.round(now() - t0);
}

/** Test hook. */
export function __resetPerfForTests() {
  startupMarks = {};
  startupReported = false;
}
