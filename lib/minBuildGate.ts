import * as Application from "expo-application";
import { supabase } from "@/lib/supabase";

// Min-build gate (build 23): the server's app_config.min_supported_build is
// the floor; a binary below it shows the update screen instead of the app.
// Raising the floor is how future teardowns (the caboose and everything
// after) get a clean cutoff instead of waiting on adoption charts.
//
// FAIL-OPEN is the invariant. The gate may only block when it has POSITIVE
// knowledge the build is below the floor — a failed fetch, a missing row, an
// unparseable value, or an unreadable build number must all let the app run.
// A gate that can brick the app on flaky airport wifi is worse than no gate.

/**
 * Pure comparison, exported for tests: true only when both values parse as
 * integers AND current < min. Anything unparseable is "not below".
 */
export function isBuildBelowMinimum(
  currentBuild: string | null | undefined,
  minSupported: unknown
): boolean {
  const current = Number.parseInt(String(currentBuild), 10);
  const min = typeof minSupported === "number" ? minSupported : Number.parseInt(String(minSupported), 10);
  if (!Number.isFinite(current) || !Number.isFinite(min)) return false;
  return current < min;
}

/**
 * True when this binary is below the server floor. Resolves false on any
 * failure (fail-open).
 */
export async function checkUpdateRequired(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "min_supported_build")
      .single();
    if (error || !data) return false;
    return isBuildBelowMinimum(Application.nativeBuildVersion, data.value);
  } catch {
    return false;
  }
}
