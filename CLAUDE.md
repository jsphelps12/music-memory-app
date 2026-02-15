# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tracks — an iOS app for capturing and revisiting music-linked memories ("moments"). Users attach a song (via Apple Music), a reflection, photos, mood tags, and people to each moment, building a personal timeline of musical memories.

## Tech Stack

- **Framework**: Expo SDK 54 (React Native) with Expo Router v6 (file-based routing)
- **Language**: TypeScript
- **Backend**: Supabase (auth, Postgres database, storage)
- **Music**: Apple MusicKit via `@lomray/react-native-apple-music`
- **Audio**: `expo-av` for preview playback
- **Auth**: Supabase Auth (email/password with PKCE flow, Apple Sign-In via native `expo-apple-authentication`)
- **State**: React Context (AuthContext with profile state, PlayerContext)
- **Builds**: EAS Build + Submit for TestFlight distribution

## Project Structure

```
app/                    # Expo Router file-based routes
  _layout.tsx           # Root layout — AuthProvider, PlayerProvider, auth gate
  (auth)/               # Auth group (sign-in, sign-up)
  (tabs)/               # Tab navigator (Timeline, New Moment, Profile)
  moment/[id].tsx       # Moment detail (dynamic route, modal)
  moment/edit/[id].tsx  # Edit moment screen
components/             # Shared UI components
  ErrorState.tsx        # Full-screen error with retry button
  ErrorBanner.tsx       # Inline dismissible error banner for background failures
  Skeleton.tsx          # Loading skeleton components
contexts/               # AuthContext, PlayerContext
hooks/                  # useAuth, usePlayer (re-exports from contexts), useDeepLinkHandler
lib/
  supabase.ts           # Supabase client init
  musickit.ts           # MusicKit authorization, search, preview URL fetching
  storage.ts            # Photo & avatar upload helpers, public URL generation
  auth-linking.ts       # Deep link handling for email confirmation flows
  errors.ts             # friendlyError() — maps raw errors to user-friendly messages
types/index.ts          # Core types: Song, Moment, UserProfile, MoodOption
constants/Moods.ts      # Mood tag definitions
constants/theme.ts      # Theme system (light/dark colors, spacing, typography)
supabase/schema.sql     # Database schema (run in Supabase SQL Editor)
eas.json                # EAS Build & Submit configuration
```

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

Production values are stored as EAS environment variables (plain text — these are public client keys, RLS protects data).

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

## Current Status

App builds and runs on a physical iPhone 17 Pro (iOS 26). Supabase project is live with schema deployed. MusicKit capability is enabled on Apple Developer portal. First TestFlight build submitted, pending beta review.

Implemented so far:
1. **Auth screens** — sign-in/sign-up with email/password via Supabase Auth, PKCE flow, email confirmation deep linking, Apple Sign-In
2. **Song search** — MusicKit-powered search modal with results list, retry on failure, Open Settings for auth refusal
3. **Create moment form** — select song, write reflection, pick mood, tag people, save to Supabase
4. **Timeline feed** — month-grouped SectionList, pull-to-refresh with error banners, skeleton loading
5. **Moment detail view** — modal with full moment data, artwork, mood/people chips, contextual menu (edit/delete)
6. **Edit moment** — full edit screen with load error protection (never shows blank form on failure)
7. **30-second preview playback** — expo-av plays iTunes preview clips; play/pause button on moment detail
8. **Photo support** — attach photos to moments via camera/library, upload to Supabase Storage, display in detail view
9. **Profile screen** — avatar upload, editable display name, moment count, member-since date, sign-out with error handling
10. **Search & filtering** — debounced text search (song/artist/reflection), multi-select mood and people chip filters, composable filters with clear/reset
11. **Error handling** — consistent error states and retry patterns across all screens
12. **Theme system** — dark/light mode support with centralized theme constants
13. **Public photo URLs** — switched from signed URLs to public bucket for zero-latency photo loading

## What's Next

MVP is complete. First TestFlight build is out for beta testing. Current focus: gathering feedback, polish, and iteration.

Upcoming:
- Apple Sign-In (alternative auth)
- Continue polish items from roadmap

See `ROADMAP.md` for the full phased roadmap (7 phases from MVP through premium features, sharing, and legacy). See `music-journal-roadmap.md` for the original detailed planning document.
