# CLAUDE.md

## Project Overview

Soundtracks — an iOS app for capturing and revisiting music-linked memories ("moments"). Users attach a song (via Apple Music), a reflection, photos, mood tags, and people to each moment, building a personal timeline of musical memories.

## Tech Stack

- **Framework**: Expo SDK 58 (React Native 0.88) with Expo Router 58 (file-based routing). App code never imports `@react-navigation/*`: Expo Router 58 exports `useFocusEffect`, `usePreventRemove`, themes etc., and the bundler rejects those imports
- **Language**: TypeScript
- **Backend**: Supabase (auth, Postgres database, storage)
- **Music**: Apple MusicKit via `@lomray/react-native-apple-music`, custom NowPlaying Expo module for system player, custom SpotifyRemote Expo module in `modules/spotify-remote` (lazy-loaded; see `lib/providers/`)
- **Share Extension**: `expo-share-intent` for receiving shared songs from Apple Music & Spotify
- **Audio**: `expo-audio` for preview playback (`contexts/PlayerContext.tsx`)
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

- **Every surface is either a screen or a quick pick** — screens get a full-screen route (card push or `fullScreenModal`); quick picks get a compact bottom sheet sized to content. Never use `presentation: "modal"`/pageSheet-style cards that cover most of the parent screen (owner rule; all former offenders were converted in Wave 2, 2026-07)
- **One design system**: build UI from the shared `components/Button`, `Chip`, `TextField`, `ScreenHeader`, `SectionLabel`, `BottomSheet`/`confirmSheet()`, `IconButton`, `Icon`, and `theme.typography` roles (DESIGN.md, Components). Never hand-roll a button, chip, field, header or sheet; never fill with terracotta (it's a signal, not a button color). `scripts/design-lint.mjs` runs in PR checks
- **Icons go through `components/Icon`** (1.4): SF Symbols on iOS via `expo-symbols`, Ionicons names mapped in `lib/iconSymbols.ts`. Never import Ionicons directly (design-lint rejects it); add a mapping for a new name
- **React Compiler is on** (1.4). `node scripts/react-compiler-check.js` lists the components it skips and why; prefer Reanimated `.get()/.set()` and no ref reads in render so new code compiles
- Path aliases use `@/` (mapped to project root in tsconfig)
- DB rows are snake_case; map to camelCase `Moment` type in fetch logic (see timeline or moment detail for pattern)
- Auth gate in root layout redirects unauthenticated users to `(auth)/sign-in`
- Song data is denormalized on the `moments` table (no separate songs table)
- Preview URLs are fetched from iTunes Lookup API (`/lookup?id={appleMusicId}`) at moment creation and stored in `song_preview_url`
- Row Level Security enforces per-user data isolation in Supabase
- Photo storage uses public `moment-photos` bucket with `{user_id}/` folder prefixes; avatars get a new versioned path per upload (`{user_id}/avatar-{timestamp}.jpg`, full-size companion `…_full.jpg`) and album covers likewise (`{user_id}/collection_covers/{collection_id}-{key}.jpg`), so a changed image gets a new URL instead of a stale cached one. Read the stored path from the row; never rebuild it
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
- Widgets and iOS 18 controls live in `targets/widget` (Swift, via `@bacons/apple-targets`); prebuild links them into Xcode. They only deep-link into the app (`/create`, `?identify=1`), with the scheme picked from the extension's bundle id. Editing them changes the fingerprint, so it needs a binary
- Local Expo native modules live in `modules/` directory; `nativeModulesDir` is configured in package.json for autolinking; each module needs a podspec in its `ios/` folder. Current: `now-playing` (system player, library songs, recently played, Photos id lookups), `shazam-kit`, `spotify-remote`, and in 1.4 `on-device-ai` (Vision + Foundation Models; null-safe via `requireOptionalNativeModule`) and `photos-video` (native view that plays a video straight from Photos)
- **Linked photos and video** (1.4, `lib/linkedMedia.ts`): `moments.media_refs[i]` lines up with `photo_thumbnails[i]`/`photo_urls[i]` and references the owner's Photos library by iCloud id. Only the thumbnail is uploaded until the moment leaves its owner; call `ensureFullMedia()` (`lib/ensureFullMedia.ts`) before any share (friend, album, link, share card) so the recipient gets full files. Only the owner's refs resolve to local Photos
- **Everything Photos/library-derived stays on device** (Last week, From before, photo analysis, nudge questions): no cloud AI, no uploads of listening history or photo locations. AI may ask a question; it never writes the reflection
- App lock (1.4): `contexts/AppLockContext.tsx` + rules in `lib/appLock.ts`; the cover is a `FullWindowOverlay` so it sits above native modals. If the phone loses its passcode the lock turns itself off and says so; a cancel just leaves the cover up
- **Ways into capture are listed in `app/help.tsx`** (Settings → Help → How to capture): add a new way in there in the same change (a widget, a menu row, a notification, a share path)
- **Capture drafts are per capture screen** (`lib/captureDraft.ts`): a capture only writes or clears its own draft id; every capture opens blank and a draft comes back only from long-press + → Continue a draft, and a share arriving into an open capture starts a new one, leaving the writing as a draft
- **Confirms on modal screens**: a screen presented as `fullScreenModal`/`transparentModal` that can call `confirmSheet()` (itself or via `MomentCard`) must mount its own `<ConfirmSheetHost />`; the root host can't present over a native modal. Only a focused screen's host answers (`lib/confirmHosts.ts`), so a host left under a pushed screen can't swallow a question. A sheet that opens another sheet chains it from `BottomSheet`'s `onClosed`, never in the same tick.
- **Read the Apple Music library through `getLibrary()`** (`lib/libraryCache.ts`, one shared read), never `getLibrarySongs` directly. Weekly play counts live one key per week (`lib/lastWeekSnapshots.ts`)
- Sign-out clears every per-user device record: add a new AsyncStorage key to `lib/signOutKeys.ts` (its test fails otherwise) and give in-memory stores a `clear…()` called from AuthContext
- The film (`components/MomentFilm.tsx`): timing rules in `lib/filmPlayback.ts`; every duck goes through `createMixRestore()` (`lib/audioMix.ts`) so each exit restores the song once
- Whole-library Supabase reads page past PostgREST's 1000-row cap with `fetchAllRows()` (`lib/fetchAllRows.ts`, stable order required)
- Now playing detection uses `MPMusicPlayerController.systemMusicPlayer` (not the library's `ApplicationMusicPlayer` which only sees app-initiated playback)
- **Albums** (UI/type name) = user-defined moment groupings; DB tables use `collections` / `collection_members` / `collection_moments`; types are `Album` / `AlbumPreview` in `types/index.ts`; all DB operations in `lib/albums.ts`; joining is by invite link only
- Tab bar (Phase 1, 2026-10): Journal | Rediscover | You plus a floating capture button (`components/TabBar.tsx`). Files: `app/(tabs)/index.tsx`, `reflections.tsx`, `profile.tsx`. Albums is a pushed screen (`app/albums.tsx`) reached from You (legacy pushes with `data.type "friends"` route there); settings live in `app/settings.tsx` behind You's gear
- Sharing v2 (spec `docs/SOCIAL-ARCHITECTURE.md`): friendships are mutual-by-link only (`lib/friends.ts`); direct moment shares live in `moment_shares` via `lib/momentShares.ts` (send, the "Shared with you" inbox at `app/shared.tsx`, the unread count behind the Journal's "new from friends" row); social pushes go through the `notify-social` edge function (`share_received`) and `accept-friend-invite` (`friend_added`)
- **Notifications** (1.4 choices, `app/notification-settings.tsx`): pull, don't nag. Never notify about absence (no streak reminders, no "still there?"). `send-notifications` sends at most one push a day at 10am local, spaced by `profiles.notif_frequency` via `last_notified_at`; friends' pushes check `notif_social` and go silent at night (`_shared/socialPush.ts`); the daily check-in and "Last week is ready" are local notifications. Pushes never carry the user's own words

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
- `lib/shareCardStore.ts` — `setShareCardData` / `consumeShareCardData`: hand the moment and its resolved photo URLs from ShareMomentSheet to the `/share-card` screen
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

## Current Status

Soundtracks is a personal music journal built for the owner first ("for fun, super slick"). **1.4.0 (build 12) is live on the App Store** (released 2026-11-19): Expo SDK 58, Face ID lock, PDF export, SF Symbols, Last week, From before, on-device AI, linked photos/video, the moment film, plus over-the-air updates since (UI consistency pass, drafts you keep, Select, the fuller long-press menu). `native/1.4` was merged into `main` at release; OTAs for 1.4 builds now come from `main`. **1.4.1** is being built on `native/1.4.1` (native "…" menu, accurate permission prompts, universal links, native fixes); its fingerprint differs, so never merge it into `main` until the 1.4.1 App Store build is cut, or OTAs stop reaching 1.4.0. After 1.4.1 is live the min-build gate goes to its build, then DB-2 and the shared view (see the sharing decisions in the roadmap). `docs/ROADMAP.md` is the plan: north star, principles, phases, and "Where things stand". The old roadmap, with shipped history and feasibility research, is at `docs/archive/ROADMAP-2026-10.md`. Update the roadmap in the same change as the work.
