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
- **Pick people with `PersonPicker`** (`components/PersonPicker.tsx`, with `Avatar` and `PersonRow`): inline in a sheet (5 rows, search past 8, "Show all" opens the full list instead of growing the sheet) or a virtualized list on a screen. Friends come from `useFriends()` (`hooks/useFriends.ts`, the one `["friendsList", uid]` cache), ordered with `rankPeople` (`lib/people.ts`). Look profiles up with `fetchProfilesByIds()` (100 ids a batch, throws), never a raw `.in("id", …)`
- **Icons go through `components/Icon`** (1.4): SF Symbols on iOS via `expo-symbols`, Ionicons names mapped in `lib/iconSymbols.ts`. Never import Ionicons directly (design-lint rejects it); add a mapping for a new name
- **React Compiler is on** (1.4). `node scripts/react-compiler-check.js` lists the components it skips and why; prefer Reanimated `.get()/.set()` and no ref reads in render so new code compiles
- Path aliases use `@/` (mapped to project root in tsconfig)
- DB rows are snake_case; map to camelCase `Moment` type in fetch logic (see timeline or moment detail for pattern)
- Auth gate in root layout redirects unauthenticated users to `(auth)/sign-in`
- Song data is denormalized on the `moments` table (no separate songs table)
- Preview URLs are fetched from iTunes Lookup API (`/lookup?id={appleMusicId}`) at moment creation and stored in `song_preview_url`
- **Song details and capture_source** (2026-11-20, `20261120120000_song_metadata.sql`): capture keeps the iTunes lookup's genre, release date, artist/album ids and length (`song_genre`, `song_release_date`, `song_artist_id`, `song_album_id`, `song_duration_ms`; parsed in `lib/songMetadata.ts`, null for Spotify songs) and how the moment was captured (`capture_source`, decided by `captureSourceFor()` in `lib/captureSource.ts`: a new way into capture needs a case there). Writes naming them go through `writeWithOptionalColumns()` (`lib/optionalColumns.ts`), which retries without them if the database lacks the columns (and without `capture_source` when its CHECK doesn't list a new value yet); a read selecting a new column falls back the same way (`fetchBrowseMetadata`)
- Row Level Security enforces per-user data isolation in Supabase
- Photo storage uses public `moment-photos` bucket with `{user_id}/` folder prefixes; avatars get a new versioned path per upload (`{user_id}/avatar-{timestamp}.jpg`, full-size companion `…_full.jpg`) and album covers likewise (`{user_id}/collection_covers/{collection_id}-{key}.jpg`), so a changed image gets a new URL instead of a stale cached one. Read the stored path from the row; never rebuild it
- Photo/avatar URLs are generated synchronously via `getPublicPhotoUrl()` — no API calls needed (bucket is public for reads; RLS still protects uploads/deletes)
- Deep link scheme is per-variant: `soundtracks://` in production, `soundtracks-beta://` in the preview build (`app.config.ts` switches on `EXPO_PUBLIC_APP_ENV`). Both apps installed at once would otherwise fight over one scheme
- Only bare-scheme and `/confirm` deep links are treated as auth callbacks — never add a catch-all, it races the confirm route on single-use PKCE codes
- Supabase image transformations are NOT enabled on this project: never call `getPublicUrl(path, { transform })`, it 403s. Thumbnails are pre-resized at upload
- Deleting a moment or removing a photo must also delete the storage objects (`deleteMomentPhotos` in `lib/storage.ts`) — the bucket is public and URLs are guessable
- **Voice recordings** (2026-11-23, `20261124120000_voice_entries.sql`; rules in `lib/voice.ts`): `moments.voice_path`/`voice_duration_ms`, files in the private `moment-voice` bucket under `{user_id}/`, owner-only, played only through signed URLs (`signedVoiceUrl()` in `lib/voiceStorage.ts`, never a public URL). Deleted with the moment (`deleteMomentWithCleanup` gets the path back from the delete) and with the account (delete-account); never in the shared view (`moment_view_for` strips both columns, `shapeForViewer` too) and not in `MOMENT_CARD_COLUMNS`. Unsaved takes live on the phone in `Documents/capture-voice/<user>/` (`lib/voiceFiles.ts`), kept by drafts. Transcription is 1.5
- Use `npx expo install <pkg>`, never bare `npm i`, for expo-* packages; a mismatched version silently fails to link natively
- Profile data (display_name, avatar_url) lives in `profiles` table; AuthContext fetches and exposes it
- Error handling uses `friendlyError()` from `lib/errors.ts` — never show raw Supabase/network errors to users
- Use `ErrorState` for full-screen errors (load failures) and `ErrorBanner` for inline errors (background refresh failures that shouldn't replace existing content)
- Timeline uses `SectionList` grouped by month ("February 2026", etc.)
- Share extension handles Apple Music URLs directly (iTunes Lookup API) and Spotify URLs via oEmbed cross-search to Apple Music
- Widgets and iOS 18 controls live in `targets/widget` (Swift, via `@bacons/apple-targets`); prebuild links them into Xcode. The capture widget and controls only deep-link into the app (`/create`, `?identify=1`), with the scheme picked from the extension's bundle id. The **Memory widget** (1.5, `MemoryWidget.swift`) reads one JSON file the app writes to the App Group (`widget/moments.json` + `widget/images/`; picks in `lib/widgetPicks.ts`, writer `lib/widgetData.ts` via `writeWidgetData` on `modules/now-playing`) and taps open `/moment/<id>?film=1`. It's cleared on sign-out and account deletion (`clearMemoryWidget`), shows words only with Settings → "Show my words on the widget" on, and never words when the app lock is on. Editing the targets changes the fingerprint, so it needs a binary
- Local Expo native modules live in `modules/` directory; `nativeModulesDir` is configured in package.json for autolinking; each module needs a podspec in its `ios/` folder. Current: `now-playing` (system player, library songs, recently played, Photos id lookups), `shazam-kit`, `spotify-remote`, in 1.5 `journaling-suggestions` (Apple's Journaling Suggestions picker for long-press + → Your day; pod `SoundtracksJournaling`, device-only and iOS 17.2+, mapping in `lib/yourDay.ts`), and in 1.4 `on-device-ai` (Vision + Foundation Models; null-safe via `requireOptionalNativeModule`; from 1.5 also speech transcription for voice entries, `lib/transcription.ts`: on-device only, never a server fallback, a language the phone can't do locally is `unsupported`) and `photos-video` (native view that plays a video straight from Photos)
- **Linked photos and video** (1.4, `lib/linkedMedia.ts`): `moments.media_refs[i]` lines up with `photo_thumbnails[i]`/`photo_urls[i]` and references the owner's Photos library by iCloud id. Only the thumbnail is uploaded until the moment leaves its owner; call `ensureFullMedia()` (`lib/ensureFullMedia.ts`) before any share (friend, album, link, share card) so the recipient gets full files. Only the owner's refs resolve to local Photos
- **Everything Photos/library-derived stays on device** (Last week, From before, photo analysis, nudge questions): no cloud AI, no uploads of listening history or photo locations. AI may ask a question; it never writes the reflection
- App lock (1.4): `contexts/AppLockContext.tsx` + rules in `lib/appLock.ts`; the cover is a `FullWindowOverlay` so it sits above native modals. If the phone loses its passcode the lock turns itself off and says so; a cancel just leaves the cover up
- **Ways into capture are listed in `app/help.tsx`** (Settings → Help → How to capture): add a new way in there in the same change (a widget, a menu row, a notification, a share path)
- **Capture drafts are per capture screen** (`lib/captureDraft.ts`): a capture only writes or clears its own draft id; every capture opens blank and a draft comes back only from long-press + → Continue a draft, and a share arriving into an open capture starts a new one, leaving the writing as a draft
- **Confirms on modal screens**: a screen presented as `fullScreenModal`/`transparentModal` that can call `confirmSheet()` (itself or via `MomentCard`) must mount its own `<ConfirmSheetHost />`; the root host can't present over a native modal. Only a focused screen's host answers (`lib/confirmHosts.ts`), so a host left under a pushed screen can't swallow a question. A sheet that opens another sheet chains it from `BottomSheet`'s `onClosed`, never in the same tick.
- **Read the Apple Music library through `getLibrary()`** (`lib/libraryCache.ts`, one shared read), never `getLibrarySongs` directly. Weekly play counts live one key per week (`lib/lastWeekSnapshots.ts`)
- **Offline saves** (`lib/outbox.ts`): a capture with no connection, or whose save fails for a reason a retry fixes, goes to the on-device outbox and is retried by `lib/outboxFlush.ts` under the same moment id (picked up front in capture), so it never saves twice; the Journal shows waiting ones (`components/OutboxCard.tsx`) and sign-out asks first when the outbox isn't empty
- Sign-out clears every per-user device record: add a new AsyncStorage key to `lib/signOutKeys.ts` (its test fails otherwise) and give in-memory stores a `clear…()` called from AuthContext
- The film (`components/MomentFilm.tsx`): timing rules in `lib/filmPlayback.ts`; every duck goes through `createMixRestore()` (`lib/audioMix.ts`) so each exit restores the song once. The owner's voice (1.5) plays over the song through `hooks/useFilmVoice.ts` with its own MixRestore, silenced with `quietVoice()` (voice first, then the song) on every way out; a new way to duck the song must make the voice step aside first
- Whole-library Supabase reads page past PostgREST's 1000-row cap with `fetchAllRows()` (`lib/fetchAllRows.ts`, stable order required)
- Now playing detection uses `MPMusicPlayerController.systemMusicPlayer` (not the library's `ApplicationMusicPlayer` which only sees app-initiated playback)
- **Albums** (UI/type name) = user-defined moment groupings; DB tables use `collections` / `collection_members` / `collection_moments`; types are `Album` / `AlbumPreview` in `types/index.ts`; all DB operations in `lib/albums.ts`; joining is by invite link only
- **Tabs (2026-11-20): Journal | Albums | Rediscover** (`app/(tabs)/index.tsx`, `albums.tsx`, `reflections.tsx`; `components/TabBar.tsx`). The tab bar doesn't swipe; inside Journal and Albums, `components/PaneSwitcher` swipes between **Yours** and **Shared**, where "Shared" always means "from other people" (Journal → Shared with you; Albums → albums others invited you to), and the switch hides for someone with no friends and nothing shared. The floating capture + shows only on the Journal and inside an album (`components/CaptureButton.tsx`, adds to that album); the Albums tab has "New album" instead, Rediscover has none. You is a pushed screen (`app/you.tsx`) from the avatar in the Journal header (profile, friends and friend link, Year in review, settings gear → `app/settings.tsx`). Selecting starts from a card's long-press → Select (Journal and album). Legacy pushes with `data.type "friends"` navigate to the Albums tab
- Sharing v2 (spec `docs/SOCIAL-ARCHITECTURE.md`): friendships are mutual-by-link only (`lib/friends.ts`); direct moment shares live in `moment_shares` via `lib/momentShares.ts` (send, the "Shared with you" inbox: `components/SharedWithYouList.tsx` in the Journal's Shared pane and at `app/shared.tsx`, the unread count behind the dot on the Shared label); social pushes go through the `notify-social` edge function (`share_received`) and `accept-friend-invite` (`friend_added`)
- **Non-owners read moments only through the shared view** (`get_moment_view`, `get_shared_with_me`, album/link RPCs, all via `moment_view_for`; app side `lib/momentView.ts`): no GPS, people or share token; only the owner can pass a moment on (`canPassOn`)
- **Capture keys and quick-capture** (1.5, "Remember this song"; `lib/captureKey.ts`, `supabase/functions/capture-key`, `supabase/functions/quick-capture`): Siri/Shortcuts/the Action button run `RememberThisSongIntent` (`plugins/remember-this-song/RememberThisSong.swift`, put in the main app target by `plugins/withRememberThisSong.js`; App Shortcuts only register from the app bundle). The intent never uses the Supabase session: it posts with a per-device capture key (random secret, only its SHA-256 in `capture_keys`, keychain item named in `lib/captureKeyPayload.ts`), issued on launch while signed in and replaced after 30 days; sign-out is global, so it revokes all the user's keys (capture-key DELETE, no deviceId) before signing out; cleared with the per-user teardown and discarded (it self-revokes) whenever the app sees no session; the server refuses keys over 90 days old and revokes them all on a password change or when the user's last auth session ends (triggers in `20261125000000_capture_keys.sql`). quick-capture is the only service-role write path for a user's own moments (guest contributions aside): `user_id` comes from the key row, never the request, and saves get `capture_source 'background'` and never a `song_part_ms` (the part is only picked by hand). No notification of any kind after a background save; Siri's reply is the only feedback
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

Soundtracks is a personal music journal built for the owner first ("for fun, super slick"). **1.4.1 (build 16) is live on the App Store** (released 2026-11-23): the three tabs (Journal | Albums | Rediscover), Insights, the native "…" menu, accurate permission prompts, universal links, plus over-the-air updates since (drafts that keep everything, album invites, who-was-there links, the part of the song). `native/1.4.1` was merged into `main` at release; OTAs for build 16 now come from `main` (publish by hand with `scripts/publish-ota.sh`, whose gate knows Mac builds via `scripts/local-builds.json`). Builds before 16 no longer get OTAs. The min-build gate is 16 and DB-2 is applied (2026-11-23): `moments` is owner-only (everyone else reads through `moment_view_for` and its functions) and signed-in users read only the public `profiles` columns (your own row comes from `get_my_profile()`). Simulator and development builds report build 1 and are never gated. **1.5** is planned in `docs/PLAN-1.5.md` and will be built on `native/1.5` off `main`; never merge it into `main` until the 1.5 App Store build is cut. `docs/ROADMAP.md` is the plan: north star, principles, phases, and "Where things stand". The old roadmap, with shipped history and feasibility research, is at `docs/archive/ROADMAP-2026-10.md`. Update the roadmap in the same change as the work.
