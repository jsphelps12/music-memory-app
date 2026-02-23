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

### 2. Timeline calendar view — COMPLETE
- [x] Calendar grid (GitHub contributions / BeReal style) — shows days with moments, album art thumbnails
- [x] Toggle button in header to switch between list and calendar views
- [x] Tap a day in calendar → switches to list view and scrolls to that moment
- [x] Animated crossfade transition between list and calendar views
- [x] Undated moments shown in "No Date" section at the bottom of the calendar
- [x] Pinch-to-zoom gesture as alternative to toggle button — pinch in on calendar → list, pinch out on list → calendar

### 3. Storage usage tracking — COMPLETE
- [x] Per-user storage counter — track bytes used across moment-photos bucket
- [x] Display on profile screen (e.g. "12.4 MB used")
- [x] Manage costs at scale; foundation for future storage limits/upsell

### 4. Quick capture flow — COMPLETE
- [x] Song pre-filled from share extension or Now Playing suggestion
- [x] Minimal create screen (song + optional reflection, one tap save)
- [x] "Add details" expand for mood, people, date, photos
- [x] Reflection made optional (no required validation)

### 5. Auto-tag time of day & location — COMPLETE
- [x] Stamp time-of-day on new moments (morning / afternoon / evening / late night) from device clock
- [x] Auto-detect device location on create (if permissions granted) — separate from photo EXIF geocoding
- [x] Show time-of-day label on moment detail
- [x] Location suggestion banner on create screen ("Currently in Nashville — use as location?")

### 6. "On This Day" & random resurfacing — COMPLETE
- [x] "On This Day" section — surface moments from the same calendar date in past years, grouped by year with "X years ago" labels (Reflections tab)
- [x] Random "rediscovery" — tap shuffle to see a surprise moment from your history (Reflections tab)
- [x] Reflections tab replaces Create in tab bar; Create moved to + button in Moments header
- [x] Push notifications for On This Day moments (opt-in, 2-3x/week max)
- [x] Milestone notifications (10, 50, 100, 250, 500, 1000 moments)

### 7. Swipe to dismiss / go back — COMPLETE
- [x] Swipe left on moment detail modal to close (back-navigate)
- [x] Swipe left on timeline cards to reveal delete action
- [x] Swipe left on artist screen cards to reveal delete action
- [x] Consistent swipe-back gesture across all push screens (artist, song, album views) — custom swipe-down gesture on all three

### 8. Song & album views — COMPLETE
- [x] Song view — all moments tied to a specific song (similar to artist view)
- [x] Album view — all moments tied to a specific album, with album artwork header
- [x] Tappable song title and album name on moment detail navigate to respective views
- [x] Artist view already exists; song/album views follow the same pattern

---

## Backlog

### Friends / Contacts
- [ ] Friends list — `friends` table per user, CRUD management
- [ ] People picker — replace comma-separated names with chip selector from friends list
- [ ] "Moments with [person]" — filter/view moments by friend

### Web Companion
- [ ] Web app (Next.js + Supabase) — same auth, same data, desktop-first UI
- [ ] Create / edit moments from a browser with a full keyboard
- [ ] Timeline and search on web (read + write parity with iOS)
- [ ] Rich text reflection editor (markdown or block-based)
- [ ] Drag-and-drop photo uploads
- [ ] Shareable public moment links (opt-in per moment)

### Voice Notes
- [ ] Record voice memos via expo-av
- [ ] Upload to Supabase Storage alongside photos
- [ ] Playback UI with waveform visualization on moment detail

### Video Support
- [ ] Video capture/selection via expo-image-picker
- [ ] Video compression on upload (transcode to reasonable bitrate)
- [ ] Video playback on moment detail — option to layer with song audio
- [ ] Video thumbnail generation for timeline cards

### 9. Swipe tab navigation — COMPLETE
- [x] Swipe left/right anywhere on a tab screen to navigate between Moments, Reflections, Profile
- [x] Backed by react-native-pager-view via material-top-tabs; tab bar stays at bottom

### Previously Completed Polish
- [x] Edit moments
- [x] UI/UX overhaul — consistent design system, spacing, typography, colors
- [x] Empty states ("No moments yet — create your first!")
- [x] Loading skeletons / better loading states
- [x] Sticky search bar and filters pinned above timeline (doesn't scroll away)
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
- [x] Quick capture flow — see Up Next #4
- [ ] iOS home screen widget — show now playing with one-tap "save moment", or recent moment / "On This Day"
- [x] Auto-detect location / auto-tag time of day — see Up Next #5

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
- [ ] Weekly Recap — in-app summary of the week's moments: top songs, moods, people, and a highlight card; shown in Reflections tab or as a push notification on Sunday evening
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

