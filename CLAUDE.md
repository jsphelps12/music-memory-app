# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Memory App — an iOS app for capturing and revisiting music-linked memories ("moments"). Users attach a song (via Apple Music), a reflection, photos, mood tags, and people to each moment, building a personal timeline of musical memories.

## Tech Stack

- **Framework**: Expo SDK 54 (React Native) with Expo Router v6 (file-based routing)
- **Language**: TypeScript
- **Backend**: Supabase (auth, Postgres database, storage)
- **Music**: Apple MusicKit via `@lomray/react-native-apple-music`
- **Auth**: Supabase Auth (email/password, Apple Sign-In planned)
- **State**: React Context (AuthContext, PlayerContext)

## Project Structure

```
app/                    # Expo Router file-based routes
  _layout.tsx           # Root layout — AuthProvider, PlayerProvider, auth gate
  (auth)/               # Auth group (sign-in, sign-up)
  (tabs)/               # Tab navigator (Timeline, New Moment, Profile)
  moment/[id].tsx       # Moment detail (dynamic route, modal)
components/             # Shared UI components
contexts/               # AuthContext, PlayerContext
hooks/                  # useAuth, usePlayer (re-exports from contexts)
lib/
  supabase.ts           # Supabase client init
  musickit.ts           # MusicKit authorization + search helpers
types/index.ts          # Core types: Song, Moment, UserProfile, MoodOption
constants/Moods.ts      # Mood tag definitions
supabase/schema.sql     # Database schema (run in Supabase SQL Editor)
```

## Common Commands

```bash
npx expo start           # Start dev server
npx expo run:ios          # Build and run on iOS simulator
npx expo run:ios --device # Build and run on physical device
npx expo prebuild --clean # Regenerate native projects
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
- Row Level Security enforces per-user data isolation in Supabase
- Photo storage uses `moment-photos` bucket with `{user_id}/` folder prefixes

## Current Status

App builds and runs on a physical iPhone 17 Pro (iOS 26). Supabase project is live with schema deployed. MusicKit capability is enabled on Apple Developer portal.

Implemented so far:
1. **Auth screens** — sign-in/sign-up with email/password via Supabase Auth
2. **Song search** — MusicKit-powered search modal with results list
3. **Create moment form** — select song, write reflection, pick mood, tag people, save to Supabase
4. **Timeline feed** — moment cards from Supabase, ordered by date, tap to open detail
5. **Moment detail view** — modal with full moment data, artwork, mood/people chips, delete action

## Next Steps (MVP features, in order)

1. **30-second preview playback** — play song snippets via MusicKit Player
2. **Photo support** — attach photos to moments, upload to Supabase Storage, display in detail view
3. **Profile screen** — user info, stats, sign-out (currently just a sign-out button)
