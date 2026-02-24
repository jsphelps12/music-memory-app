# Tracks — Roadmap

This file tracks what's built, what's next, and the full feature roadmap organized by phase.

---

## Complete

### Phase 1: Foundation & MVP
- [x] Auth (email/password + Apple Sign-In)
- [x] Song search (MusicKit), 30-second preview playback
- [x] Create / edit / delete moments (song, reflection, mood, people, date, photos)
- [x] Timeline feed with SectionList grouped by month
- [x] Moment detail view with blurred artwork backdrop
- [x] Photo support — camera/library, compression, full photo viewer (pinch-to-zoom, swipe)
- [x] Photo EXIF date + GPS auto-detection with suggestion banner
- [x] Profile screen — avatar, display name, stats, storage usage, sign-out
- [x] Dark mode, design system, loading skeletons, empty states, error states

### Core Feature Additions (Complete)
- [x] Share extension — receive shared songs from Apple Music & Spotify via iOS share sheet
- [x] Spotify cross-search — oEmbed parse → Apple Music match with candidate picker
- [x] Now Playing auto-fill — real-time suggestion banner on create screen
- [x] Quick capture flow — song + optional reflection, one tap save, expandable details
- [x] Auto-tag time of day & location — device clock + optional GPS location banner
- [x] On This Day & random resurfacing — Reflections tab, grouped by year
- [x] Push notifications — On This Day (2–3x/week), milestones (10, 50, 100, 250, 500, 1000)
- [x] Smooth card-to-detail transition — shared-element style expand animation
- [x] Calendar view — grid with album art thumbnails, tap day to jump, pinch-to-zoom toggle
- [x] Swipe gestures — swipe to close moment detail, swipe to delete cards, swipe-back on all screens
- [x] Swipe tab navigation — swipe left/right between Moments / Reflections / Profile tabs
- [x] Song & album views — all moments for a specific song or album, tappable from moment detail
- [x] Search by song, artist, reflection text; filter by mood, people, date range, location
- [x] Onboarding flow, custom app icon

---

## Now Building

### 1. Auto-play on moment open
- [ ] When opening a moment detail, gently fade in the 30-second preview automatically
- [ ] Respect system volume; don't interrupt other audio in a jarring way
- [ ] Option to disable in settings

### 2. Era clustering (AI) — THE core differentiator
- [ ] Cluster moments into life chapters using date, mood, artist, and reflection patterns
- [ ] Generate a name for each era (e.g. "Winter of Letting Go", "The Comeback Summer")
- [ ] Show eras as a navigable timeline — see your life organized into chapters
- [ ] Trigger paywall at 25–30 moments: "Unlock the chapter you just lived"
- [ ] Era detail view: cover art collage, top songs, dominant moods, reflection excerpts
- [ ] See `docs/AI-FEATURES.md` for implementation notes

### 3. Shareable era & moment cards — the viral surface
- [ ] Moment card: artwork, song, quote from reflection, date — exportable graphic
- [ ] Era summary card: collage of artwork, era name, date range, key stats
- [ ] Vertical/story-format card designed for Instagram & TikTok
- [ ] Multiple visual templates — clean, filmic, retro
- [ ] Share via iOS share sheet; moment cards free, era cards premium

### 4. Collections — personal and shared
**Personal** (build first):
- [ ] User-defined groupings ("Summer 2024", "My healing era", "Road trip playlist")
- [ ] Add/remove moments, collection detail view, lives in Reflections tab

**Shared** (the social growth engine — see FEATURE-IDEAS.md for full spec):
- [ ] Invite link + QR code; contributors add their own moments
- [ ] Same song logged by multiple people → side-by-side perspectives view
- [ ] Wedding/event mode: open-join QR at a venue
- [ ] Collection summary card — shareable artifact after the event
- [ ] Web read-only preview for non-app users (lowers invite friction)
- [ ] Why urgent: 1 wedding = potentially 30 new users

---

## Phase 2: Frictionless Logging (Remaining)

- [ ] iOS home screen widget — now playing with one-tap "save moment", or On This Day
- [ ] Weather auto-tagging — silently attach weather at moment creation; enables "rainy day songs" [Free]
- [ ] Lyric anchoring — highlight a specific lyric as the emotional anchor for a moment [Free]
- [ ] Apple Watch app — one tap on wrist logs current song instantly [Free]

---

## Phase 3: Enhanced Playback

- [ ] Full song playback in-app (Apple Music / Spotify Premium subscribers)
- [ ] Custom player UI — album art, progress bar, controls
- [ ] Background playback
- [ ] Notification preferences / quiet hours

---

## Phase 4: Search & Organization (Remaining)

- [ ] Quick filter views (this week, this month, by mood, late night)
- [ ] Sort options (chronological, by mood, by artist, random)
- [ ] Friends list — `friends` table, people picker chip selector, "Moments with [person]" view

---

## Phase 5: Reflection & Insights (Premium)

Premium tier: $4.99/month or $39.99/year. Break-even at ~120 annual subscribers.
Paywall meaning, not logging. Free users keep all logging features forever.
Conversion trigger: at 25–30 moments, show a locked Era card — "unlock the chapter you just lived."

- [ ] Paywall & subscription (RevenueCat)
- [ ] Era clustering — see Now Building #2 (THE conversion trigger)
- [ ] "How You're Evolving" dashboard (current era summary, comparison to past)
- [ ] Mood trajectory graph (mood over time, tap to jump to moment)
- [ ] Music taste evolution (energy, genre, tempo trends)
- [ ] Pattern recognition ("You log 3x more on weekends", "Bon Iver = processing emotions")
- [ ] Mood gap analysis — surface what's absent: "You almost never log joy. The last time was 8 months ago." [Premium]
- [ ] Relationship soundtracks (filter by person, stats, exportable playlist)
- [ ] AI narrative summaries — "soft in tone, sharp in insight" interpretation of your data

---

## Phase 6: Discovery & Smart Resurfacing

- [ ] Forgotten songs — surface songs logged exactly once, never again [Free]
- [ ] Song anniversaries — "One year ago today, you first logged this song" [Free]
- [ ] Through-line songs — songs that appear across multiple distinct eras [Premium]
- [ ] Personal charts — most-logged songs/artists ranked by year, always-on [Premium]
- [ ] Mood-aware suggestions — current mood → songs/moments that historically helped
- [ ] Smart resurfacing (mood-matched, pattern-based, relationship-based)
- [ ] Rediscovery ("You loved this artist in 2023, then stopped")
- [ ] Currently playing prompt notification (gentle, once/day max)
- [ ] Weekly digest email ("Your week in music")

---

## Phase 7: Sharing, Visualization & Legacy (Premium)

- [ ] Musical autobiography — AI-generated prose narrative about who you were during an era
- [ ] Couples soundtrack — shared timeline, both perspectives, relationship era clustering
- [ ] "You're Not Alone" — anonymous matched moments when two users log same song with similar context
- [ ] Grief & memorial moments — songs tied to people who have passed; surfaces on significant dates
- [ ] Map view (moments by location, clusters, tap to explore)
- [ ] Weekly Recap — in-app summary of the week's moments
- [ ] Yearly Recap ("Your 2026 in Moments" — Spotify Wrapped-style, shareable)
- [ ] Voice notes — record via expo-av, transcribe for searchability, playback on detail
- [ ] Video support — capture, compress, playback, thumbnail on timeline card
- [ ] Playlist export to Spotify/Apple Music
- [ ] Memory book creation (print-on-demand, QR codes linking to songs)
- [ ] Time capsules ("Remind me of this in 5 years")
- [ ] Legacy mode (designate someone to receive your collection)

---

## Phase 8: Predictive & Platform (Scale)

The shift from rearview mirror to windshield — using accumulated data to serve present and future needs.

- [ ] Music as emotional regulation — "I'm feeling anxious" → your songs that helped before [Free basic, Premium full]
- [ ] Seasonal pattern anticipation — "Last October your mood dipped. It's October." [Premium]
- [ ] "You're in a transition" detection — when logging patterns shift, the app quietly notices [Premium]
- [ ] Android app — doubles the addressable market
- [ ] Web companion — read-only sharing destination, full keyboard create/edit, shareable public links
- [ ] Apple Watch app — see Phase 2 remaining

---

## Unscheduled

- [ ] Multiple songs per moment (UI/data model changes needed)
- [ ] Spotify full integration (native playback/auth; cross-search is done)
- [ ] Accessibility (VoiceOver, dynamic type)
- [ ] Offline support (queue uploads when offline)
- [ ] Export/backup (download your data)
