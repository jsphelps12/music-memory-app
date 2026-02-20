# Tracks — Roadmap

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

## Up Next (ordered priority)

### 1. Smooth card-to-detail transition — COMPLETE
- [x] Shared-element style expand animation from timeline card into moment detail modal
- [x] Card scales/expands into detail screen on tap; reverses on close
- [x] Coordinate with blurred backdrop already in place on detail screen

### 2. Timeline calendar view
- [ ] Pinch-to-zoom out on timeline to switch from list view to calendar grid view
- [ ] Calendar grid (GitHub contributions / BeReal style) — shows days with moments, album art thumbnails
- [ ] Toggle button as non-gesture fallback for switching views
- [ ] Tap a day in calendar to zoom back into that month's moments
- [ ] Animated crossfade transition between list and calendar views

### 3. Storage usage tracking
- [ ] Per-user storage counter — track bytes used across moment-photos bucket
- [ ] Display on profile screen (e.g. "12.4 MB used")
- [ ] Manage costs at scale; foundation for future storage limits/upsell

### 4. Quick capture flow
- [ ] Song pre-filled from share extension or Now Playing suggestion
- [ ] Minimal create screen (song + optional reflection, one tap save)
- [ ] "More details" expand for mood, people, date, photos
- [ ] Goal: < 15 seconds from intent to saved moment

### 5. Auto-tag time of day & location
- [ ] Stamp time-of-day on new moments (morning / afternoon / evening / late night) from device clock
- [ ] Auto-detect device location on create (if permissions granted) — separate from photo EXIF geocoding
- [ ] Show time-of-day label on moment detail and cards
- [ ] Location suggestion banner on create screen ("Currently in Nashville — use as location?")

### 6. "On This Day" & random resurfacing
- [ ] "On This Day" tab or banner — surface moments from the same calendar date in past years
- [ ] Random "rediscovery" button or card — tap to see a surprise moment from your history
- [ ] Push notifications for On This Day moments (opt-in, 2-3x/week max)
- [ ] Milestone notifications (10, 50, 100, 250, 500, 1000 moments)

### 7. Swipe to dismiss / go back — COMPLETE
- [x] Swipe left on moment detail modal to close (back-navigate)
- [x] Swipe left on timeline cards to reveal delete action
- [x] Swipe left on artist screen cards to reveal delete action
- [ ] Consistent swipe-back gesture across all push screens (artist, song, album views) — native iOS stack gesture already active

### 8. Song & album views
- [ ] Song view — all moments tied to a specific song (similar to artist view)
- [ ] Album view — all moments tied to a specific album, with album artwork header
- [ ] Tappable song title and album name on moment detail navigate to respective views
- [ ] Artist view already exists; song/album views follow the same pattern

---

## Backlog

### Friends / Contacts
- [ ] Friends list — `friends` table per user, CRUD management
- [ ] People picker — replace comma-separated names with chip selector from friends list
- [ ] "Moments with [person]" — filter/view moments by friend

### Voice Notes
- [ ] Record voice memos via expo-av
- [ ] Upload to Supabase Storage alongside photos
- [ ] Playback UI with waveform visualization on moment detail

### Video Support
- [ ] Video capture/selection via expo-image-picker
- [ ] Video compression on upload (transcode to reasonable bitrate)
- [ ] Video playback on moment detail — option to layer with song audio
- [ ] Video thumbnail generation for timeline cards

### Previously Completed Polish
- [x] Edit moments
- [x] UI/UX overhaul — consistent design system, spacing, typography, colors
- [x] Empty states ("No moments yet — create your first!")
- [x] Loading skeletons / better loading states
- [x] Error states and retry patterns throughout
- [x] Pull-to-refresh on timeline
- [x] Onboarding flow (first-launch welcome screen)
- [x] Custom app icon
- [x] Apple Sign-In (alternative auth)
- [x] Dark mode
- [x] Photo loading optimization — switched to public bucket with synchronous URL generation
- [x] Photo compression + thumbnails (expo-image-manipulator)
- [x] Full photo viewer (pinch-to-zoom, swipe between photos)
- [x] Photo EXIF date + GPS auto-detection with suggestion banner
- [x] Blurred artwork backdrop on moment detail
- [x] Card press spring animation (Reanimated)
- [x] MomentCard shared component

---

## Phase 2: Frictionless Logging

Make logging effortless — goal is < 15 seconds to save a moment.

- [x] Share extension — receive shared songs from Apple Music & Spotify via iOS share sheet
- [x] Spotify cross-search — parse Spotify URLs via oEmbed API, cross-search Apple Music for a match with candidate picker
- [x] "Now Playing" auto-fill — detect currently playing Apple Music song, real-time suggestion banner on create screen
- [ ] Quick capture flow — see Up Next #4
- [ ] iOS home screen widget — show now playing with one-tap "save moment", or recent moment / "On This Day"
- [ ] Auto-detect location / auto-tag time of day — see Up Next #5

---

## Phase 3: Enhanced Playback & Engagement

- [ ] Full song playback in-app (Spotify Premium / Apple Music subscribers)
- [ ] Custom player UI (album art, progress bar, controls)
- [ ] Background playback
- [ ] Auto-play on moment open (gentle fade-in)
- [ ] "On This Day" resurfacing — see Up Next #6
- [ ] Push notifications for resurfaced moments / milestones — see Up Next #6
- [ ] Notification preferences / quiet hours

---

## Phase 4: Search, Filter & Organization

- [x] Search by song, artist, reflection text
- [x] Filter by mood and people tags
- [x] Combination filters (search + mood + people compose together)
- [ ] Filter by date range and location
- [ ] Quick filter views (this week, this month, by mood, late night)
- [ ] Sort options (chronological, by mood, by artist, random)
- [x] Artist view — browse moments grouped by artist (dedicated artist page with all moments for that artist)
- [ ] Song view + Album view — see Up Next #8
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

- [ ] Mood-aware suggestions — detect current mood and suggest songs/moments to match or improve it
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

- [ ] Multiple songs per moment — attach more than one song to a single memory (e.g. a whole playlist or set of songs tied to an event); UI/data model changes needed
- [ ] Spotify support (full integration — share extension cross-search is done, but no native Spotify playback/auth)
- [ ] Accessibility (VoiceOver, dynamic type)
- [ ] Offline support (queue uploads when offline)
- [ ] Export/backup (download your data)

