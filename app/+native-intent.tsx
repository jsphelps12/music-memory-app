import { routeForSystemPath } from "@/lib/systemPath";

// Expo Router calls this for every link iOS hands the app, before routing.
// It keeps the share extension's hand-off link from being treated as a page;
// see lib/systemPath.ts.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    return routeForSystemPath(path, initial);
  } catch {
    return initial ? "/" : null;
  }
}
