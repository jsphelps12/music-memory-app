# Music Memory App — Roadmap

See `music-journal-roadmap.md` for the full original planning document with detailed specs, wireframes, and success metrics.

This file tracks what's built, what's next, and the full feature roadmap organized by phase.

---

## Phase 1: Foundation & MVP — COMPLETE

- [x] Auth screens (email/password sign-in/sign-up)
- [x] Song search (MusicKit-powered)
- [x] Create moment form (song, reflection, mood, people tags)
- [x] Timeline feed (chronological, tap to open)
- [x] Moment detail view (full data, artwork, delete)
- [x] 30-second preview playback (iTunes preview clips via expo-av)
- [x] Photo support (camera/library, Supabase Storage, display in detail)
- [x] Profile screen (avatar upload, editable display name, stats, sign-out)

---

## Up Next: Polish & Core Gaps

These aren't from a specific phase — they're gaps in the current build that need addressing before moving forward.

- [ ] Edit moments (currently create and delete only)
- [ ] UI/UX overhaul — consistent design system, spacing, typography, colors
- [ ] Empty states ("No moments yet — create your first!")
- [ ] Loading skeletons / better loading states
- [ ] Error states and retry patterns throughout
- [ ] Pull-to-refresh on timeline
- [ ] Onboarding flow (first-launch walkthrough)
- [ ] Apple Sign-In (alternative auth)
- [ ] Dark mode

---

## Phase 2: Frictionless Logging

Make logging effortless — goal is < 15 seconds to save a moment.

- [ ] Music service connection (Spotify OAuth, MusicKit auth)
- [ ] "Currently Playing" detection (Spotify SDK + MusicKit)
- [ ] "Now Playing" widget on home screen with one-tap save
- [ ] Quick capture flow (song pre-filled, minimal fields, expand for details)
- [ ] Auto-detect location (if permissions granted)
- [ ] Auto-tag time of day

---

## Phase 3: Enhanced Playback & Engagement

- [ ] Full song playback in-app (Spotify Premium / Apple Music subscribers)
- [ ] Custom player UI (album art, progress bar, controls)
- [ ] Background playback
- [ ] Auto-play on moment open (gentle fade-in)
- [ ] "On This Day" resurfacing (time-based memories)
- [ ] Push notifications for resurfaced moments (2-3x/week)
- [ ] Milestone notifications (10, 50, 100, 250, 500, 1000 moments)
- [ ] Notification preferences / quiet hours

---

## Phase 4: Search, Filter & Organization

- [ ] Search by song, artist, album (fuzzy matching)
- [ ] Search by reflection text (full-text search)
- [ ] Filter by date range, mood, person, location
- [ ] Combination filters ("sad moments from 2023 with Sarah")
- [ ] Quick filter views (this week, this month, by mood, late night)
- [ ] Sort options (chronological, by mood, by artist, random)
- [ ] Custom collections ("Summer 2024", "My healing era")

---

## Phase 5: Reflection & Insights (Premium)

Premium tier: $7/month or $60/year.

- [ ] Paywall & subscription (RevenueCat)
- [ ] "How You're Evolving" dashboard (current era summary, comparison to past)
- [ ] Mood trajectory graph (mood over time, tap to jump to moment)
- [ ] Music taste evolution (energy, genre, tempo trends)
- [ ] Era detection (AI clustering into life chapters with generated names)
- [ ] Pattern recognition ("You log 3x more on weekends", "Bon Iver = processing emotions")
- [ ] Relationship soundtracks (filter by person, stats, exportable playlist)

---

## Phase 6: Discovery & Smart Resurfacing (Premium)

- [ ] "Songs Like Your Moments" recommendations (audio feature analysis)
- [ ] Smart resurfacing (mood-matched, pattern-based, relationship-based)
- [ ] Rediscovery ("You loved this artist in 2023, then stopped")
- [ ] Currently Playing prompt notification (gentle, once/day max)
- [ ] Weekly digest email ("Your week in music")

---

## Phase 7: Sharing, Visualization & Legacy (Premium)

- [ ] Shareable moment cards (beautiful exportable graphics, multiple templates)
- [ ] Map view (moments by location, clusters, tap to explore)
- [ ] Advanced visualizations (calendar heatmap, genre distribution, artist network)
- [ ] Yearly Recap ("Your 2024 in Moments" — Spotify Wrapped-style, shareable)
- [ ] Playlist export to Spotify/Apple Music
- [ ] Memory book creation (print-on-demand, QR codes linking to songs)
- [ ] Time capsules ("Remind me of this in 5 years")
- [ ] Legacy mode (designate someone to receive your collection)

---

## Other Ideas (Unscheduled)

- [ ] Voice recordings / voice memos attached to moments
- [ ] Spotify support (alternative to Apple Music)
- [ ] Accessibility (VoiceOver, dynamic type)
- [ ] Offline support (queue uploads when offline)
- [ ] Export/backup (download your data)
- [ ] Widget (iOS home screen widget showing recent moment or "On This Day")
