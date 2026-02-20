# CLAUDE.md

## Project Overview

Tracks — an iOS app for capturing and revisiting music-linked memories ("moments"). Users attach a song (via Apple Music), a reflection, photos, mood tags, and people to each moment, building a personal timeline of musical memories.

## Tech Stack

- **Framework**: Expo SDK 54 (React Native) with Expo Router v6 (file-based routing)
- **Language**: TypeScript
- **Backend**: Supabase (auth, Postgres database, storage)
- **Music**: Apple MusicKit via `@lomray/react-native-apple-music`, custom NowPlaying Expo module for system player
- **Share Extension**: `expo-share-intent` for receiving shared songs from Apple Music & Spotify
- **Audio**: `expo-av` for preview playback
- **Auth**: Supabase Auth (email/password with PKCE flow, Apple Sign-In via native `expo-apple-authentication`)
- **State**: React Context (AuthContext with profile state, PlayerContext)
- **Builds**: EAS Build + Submit for TestFlight distribution

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
- Deep link scheme is `tracks://`; used for email confirmation redirects via PKCE auth flow
- Profile data (display_name, avatar_url) lives in `profiles` table; AuthContext fetches and exposes it
- Error handling uses `friendlyError()` from `lib/errors.ts` — never show raw Supabase/network errors to users
- Use `ErrorState` for full-screen errors (load failures) and `ErrorBanner` for inline errors (background refresh failures that shouldn't replace existing content)
- Timeline uses `SectionList` grouped by month ("February 2026", etc.)
- Share extension handles Apple Music URLs directly (iTunes Lookup API) and Spotify URLs via oEmbed cross-search to Apple Music
- Local Expo native modules live in `modules/` directory; `nativeModulesDir` is configured in package.json for autolinking; each module needs a podspec in its `ios/` folder
- Now playing detection uses `MPMusicPlayerController.systemMusicPlayer` (not the library's `ApplicationMusicPlayer` which only sees app-initiated playback)

## Current Status

MVP complete. App runs on iPhone 17 Pro (iOS 26), Supabase live, first TestFlight build submitted. All auth, timeline, moment create/edit/delete, photo support, search/filtering, share extension, and now-playing auto-fill features are implemented. See `docs/ROADMAP.md` for roadmap.
