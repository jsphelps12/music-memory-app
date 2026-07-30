# AGENTS.md

## Project Overview

Soundtracks — an iOS app for capturing and revisiting music-linked memories ("moments"). Users attach a song (via Apple Music), a reflection, photos, mood tags, and people to each moment, building a personal timeline of musical memories.

## Tech Stack

- **Framework**: Expo SDK 54 (React Native) with Expo Router v6 (file-based routing)
- **Language**: TypeScript
- **Backend**: Supabase (auth, Postgres database, storage)
- **Music**: Apple MusicKit via `@lomray/react-native-apple-music`, custom NowPlaying Expo module for system player, custom SpotifyRemote Expo module in `modules/spotify-remote` (lazy-loaded; see `lib/providers/`)
- **Share Extension**: `expo-share-intent` for receiving shared songs from Apple Music & Spotify
- **Audio**: `expo-av` for preview playback
- **Auth**: Supabase Auth (email/password with PKCE flow, Apple Sign-In via native `expo-apple-authentication`)
- **State**: React Context (AuthContext with profile state, PlayerContext)
- **Builds**: EAS Build + Submit for TestFlight distribution; OTA via EAS Update (preview + production channels — see `docs/DEPLOY.md`)
- **Monitoring**: Sentry (`EXPO_PUBLIC_APP_ENV` sets the environment tag), PostHog (events carry an `app_env` super property)
- **Tests**: Vitest (`npm test`) — pure-logic suites in `lib/__tests__/`

## Common Commands

```bash
npx expo start           # Start dev server
npx expo run:ios          # Build and run on iOS simulator
npx expo run:ios --device # Build and run on physical device
npx expo prebuild --clean # Regenerate native projects
npx eas-cli build --platform ios --profile production   # Build for TestFlight
npx eas-cli submit --platform ios --profile production  # Submit to App Store Connect
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

## Key Conventions

- Path aliases use `@/` (mapped to project root in tsconfig)
- DB rows are snake_case; map to camelCase `Moment` type in fetch logic (see timeline or moment detail for pattern)
- Auth gate in root layout redirects unauthenticated users to `(auth)/sign-in`
- Song data is denormalized on the `moments` table (no separate songs table)
- Preview URLs are fetched from iTunes Lookup API (`/lookup?id={appleMusicId}`) at moment creation and stored in `song_preview_url`
- Row Level Security enforces per-user data isolation in Supabase
- Photo storage uses public `moment-photos` bucket with `{user_id}/` folder prefixes; avatars stored at `{user_id}/avatar.jpg`
- Photo/avatar URLs are generated synchronously via `getPublicPhotoUrl()` — no API calls needed (bucket is public for reads; RLS still protects uploads/deletes)
- Deep link scheme is per-variant: `soundtracks://` in production, `soundtracks-beta://` in the preview build (`app.config.ts` switches on `EXPO_PUBLIC_APP_ENV`). Both apps installed at once would otherwise fight over one scheme
- Only bare-scheme and `/confirm` deep links are treated as auth callbacks — never add a catch-all, it races the confirm route on single-use PKCE codes
- Supabase image transformations are NOT enabled on this project: never call `getPublicUrl(path, { transform })`, it 403s. Thumbnails are pre-resized at upload
- Deleting a moment or removing a photo must also delete the storage objects (`deleteMomentPhotos` in `lib/storage.ts`) — the bucket is public and URLs are guessable
- Use `npx expo install <pkg>`, never bare `npm i`, for expo-* packages; a mismatched version silently fails to link natively
- Profile data (display_name, avatar_url) lives in `profiles` table; AuthContext fetches and exposes it
- Error handling uses `friendlyError()` from `lib/errors.ts` — never show raw Supabase/network errors to users
- Use `ErrorState` for full-screen errors (load failures) and `ErrorBanner` for inline errors (background refresh failures that shouldn't replace existing content)
- Timeline uses `SectionList` grouped by month ("February 2026", etc.)
- Share extension handles Apple Music URLs directly (iTunes Lookup API) and Spotify URLs via oEmbed cross-search to Apple Music
- Local Expo native modules live in `modules/` directory; `nativeModulesDir` is configured in package.json for autolinking; each module needs a podspec in its `ios/` folder
- Now playing detection uses `MPMusicPlayerController.systemMusicPlayer` (not the library's `ApplicationMusicPlayer` which only sees app-initiated playback)
- **Albums** (UI/type name) = user-defined moment groupings; DB tables use `collections` / `collection_members` / `collection_moments` / `collection_invites`; types are `Album` / `AlbumPreview` in `types/index.ts`; all DB operations in `lib/albums.ts`
- Tab bar: Moments | Reflections | Albums | Me — the Albums tab file is `app/(tabs)/friends.tsx` (route name unchanged from when it was the Friends tab)
- Direct invite system: `collection_invites` table; `sendAlbumInvite` / `fetchPendingAlbumInvites` / `acceptAlbumInvite` / `deleteAlbumInvite` / `searchUsersForAlbum` in `lib/albums.ts`

## Data Fetching (React Query / TanStack Query)

All server state uses `@tanstack/react-query`. Follow these patterns for every new feature:

- **staleTime**: `2 * 60 * 1000` (2 min) for screen-level queries; `60_000` for badge/count queries
- **Query keys**: `["queryName", user?.id]` — always include user ID for per-user cache isolation
- **enabled**: Always guard with `!!user` (add `!!id` for detail screens); never omit it
- **Focus refetch**: Use `useFocusEffect` + check `Date.now() - dataUpdatedAt > STALE_TIME` before calling `refetch()` — never refetch unconditionally on focus
- **Pull-to-refresh**: Pass `refreshing={isFetching && !isLoading}` to `RefreshControl` (not just `isFetching`)
- **Fetch functions**: Define outside the component; use `Promise.all` for parallel supabase queries; enrich data (join owner names, etc.) inside the fetch function, not in render
- **Invalidation after mutations**: `queryClient.invalidateQueries({ queryKey: [...] })`; prefer `setQueryData` for optimistic local updates
- **View toggling (critical)**: Keep BOTH views mounted simultaneously; use `Animated.View` + `pointerEvents` + `useSharedValue` opacity to switch — **never** conditionally unmount a `SectionList`/`FlatList` to show a different view, as this causes a full remount and scroll-position loss. See the list/calendar toggle in `app/(tabs)/index.tsx` for the canonical pattern.
- **Pagination**: Use `pageRef.current` + `.range(from, to)` on the Supabase query; `append` parameter controls concat vs replace on state update

## Module-Level Consume-Once Store Pattern

Several libs use a module-level variable with a setter and a `consume*()` that reads and resets to null. This is the standard pattern for one-shot cross-screen data passing without React context or AsyncStorage:

- `lib/momentCache.ts` — `setCachedMoment` / `consumeCachedMoment`: pass full Moment data from card tap into detail screen to avoid re-fetch on entry
- `lib/cardTransition.ts` — `setCardOrigin` / `consumeCardOrigin`: measured card position for entry animation in detail screen
- `lib/timelineRefresh.ts` — `markTimelineStale` / `markTimelineDeleted` / `consumeTimelineStale`: signal from create/edit/delete that timeline needs refresh on next focus; optionally carries a newly created Moment for instant prepend

All follow the same shape: module-level `let x = null`, setter, and `consume()` that returns the value and resets it.

## Data Fetching — Non-Query Screens (Timeline)

The timeline screen does **not** use React Query — it manages its own state with `useState` + `useRef`. Key patterns:

- **`MOMENT_CARD_COLUMNS`** constant in `lib/momentColumns.ts` — always use this string for moment list queries; never write column lists inline
- **`mapRowToMoment(row)`** in `lib/moments.ts` — single canonical DB→TypeScript mapping; always use this, never map fields manually
- **Prefetch**: `prefetchTimeline(userId)` fires on auth resolve (before the tab mounts); stale-while-revalidate — AsyncStorage cache returns instantly, network fetch updates cache in background; `consumePrefetchPromise()` avoids a duplicate request in the component
- **Focus refetch**: `lastFetchTime.current` + `REFETCH_COOLDOWN_MS = 30_000` — only refetch on focus if a stale flag was set or 30s have elapsed; check `consumeTimelineStale()` first
- **Pagination**: `pageRef.current` tracks current page; `.range(from, to)` on Supabase query; `append` param controls whether new page data is concatenated or replaces existing state

## Styling Pattern

All screens with theme-dependent styles use:
```ts
const styles = useMemo(() => createStyles(theme), [theme]);
// ...
function createStyles(theme: Theme) { return StyleSheet.create({ ... }); }
```
`createStyles(theme: Theme)` is defined at the bottom of the file. Never use inline style objects for values that depend on theme colors — always put them in `createStyles`.

Fonts come from `theme.fonts` (DM Serif Display for display text, DM Sans for body, Space Mono for mono). Spacing from `theme.spacing.*`, font sizes from `theme.fontSize.*`, border radii from `theme.radii.*`. Never hardcode these values.

## Screen State Machine Pattern

Use a discriminated string-literal union (not boolean flags) for screen loading states:
```ts
type ScreenState = "loading" | "not_found" | "ready" | "error";
const [state, setState] = useState<ScreenState>("loading");
```
This avoids impossible state combinations (e.g. `loading && error` both true).

## Shared/Albums Tab Data

`lib/sharedScreen.ts` is the single data source for the Albums tab — fetches pending friend requests, friends list, shared album activity, and pending album invites in parallel via `Promise.all`. Has its own AsyncStorage cache (`shared_screen_{userId}`). Always fetch via `fetchSharedScreenData` to get all of this in one shot.

## Current Status

MVP complete. App runs on iPhone 17 Pro (iOS 26), Supabase live, first TestFlight build submitted. All auth, timeline, moment create/edit/delete, photo support, search/filtering, share extension, and now-playing auto-fill features are implemented. See `docs/ROADMAP.md` for roadmap.
