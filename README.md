# Soundtracks

A personal music journal for iOS. Each entry ("moment") is a song plus whatever you feel like adding: a reflection, photos, moods, people, a place. Built with Expo (React Native) and Supabase; the web app for shared moments and occasions lives in `web/`.

## Getting started

```bash
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo run:ios       # build and run on the iOS simulator
npm test               # Vitest suites in lib/__tests__/
```

## Where to look

- `CLAUDE.md` / `AGENTS.md`: stack, conventions and patterns (read before changing code)
- `DESIGN.md`: the design system; `PRODUCT.md`: who it's for and how it should feel
- `docs/ROADMAP.md`: the plan and where things stand
- `docs/DEPLOY.md`: builds, OTA updates, CI and environments
- `docs/SOCIAL-ARCHITECTURE.md`: friends and sharing
- `docs/archive/`: superseded plans, kept for the history
