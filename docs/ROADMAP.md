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

## Up Next: Beta Feedback & Polish

Priorities based on real-world usage from first beta weekend. Ordered by impact.

### Photo & Media Performance
- [ ] Photo compression on upload — resize to max 1920px, compress quality (expo-image-manipulator)
- [ ] Thumbnail generation — create small thumbnails alongside originals for fast timeline loading
- [ ] Full photo viewer — tap to open full-res with pinch-to-zoom and swipe-to-dismiss
- [ ] Storage usage tracking — per-user storage counter to manage costs at scale

### Moment Card Redesign
- [ ] Larger, more immersive timeline cards — less list-like, more visual
- [ ] Photo-first hierarchy — photos as card hero when available, artwork takes lesser role
- [ ] Artwork-first fallback — album art prominent when no photos attached
- [ ] Smooth card-to-detail transition — expand animation from timeline into moment detail
- [ ] Blurred artwork/photo backgrounds for depth

### Friends / Contacts
- [ ] Friends list — `friends` table per user, CRUD management
- [ ] People picker — replace comma-separated names with chip selector from friends list
- [ ] "Moments with [person]" — filter/view moments by friend

### Custom Moods
- [ ] User-created mood tags — free text + emoji picker
- [ ] Default mood suggestions with ability to add custom ones
- [ ] Custom moods stored per-user (custom_moods table or JSON on profile)

### Voice Notes
- [ ] Record voice memos via expo-av
- [ ] Upload to Supabase Storage alongside photos
- [ ] Playback UI with waveform visualization on moment detail

### Timeline Zoom & Calendar View
- [ ] Pinch-to-zoom out on timeline to switch from list view to calendar grid view
- [ ] Calendar grid (GitHub contributions / BeReal style) — shows days with moments, album art thumbnails
- [ ] Toggle button as non-gesture fallback for switching views
- [ ] Tap a day in calendar to zoom back into that month's moments
- [ ] Animated crossfade transition between list and calendar views

### Photo Metadata Auto-Detection
- [ ] Extract EXIF date from photos added to moments (`expo-image-picker` exif option)
- [ ] Extract GPS location from photo EXIF data and suggest as moment location
- [ ] Suggestion banner — "Photo taken on [date] at [location]" with "Use" / "Dismiss" actions
- [ ] Use earliest date when multiple photos have different dates
- [ ] Reverse geocode GPS coordinates to human-readable location name

### Video Support
- [ ] Video capture/selection via expo-image-picker
- [ ] Video compression on upload (transcode to reasonable bitrate)
- [ ] Video playback on moment detail — option to layer with song audio
- [ ] Video thumbnail generation for timeline cards

### Previous Polish (Complete)
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

---

## Phase 2: Frictionless Logging

Make logging effortless — goal is < 15 seconds to save a moment.

- [x] Share extension — receive shared songs from Apple Music & Spotify via iOS share sheet
- [x] Spotify cross-search — parse Spotify URLs via oEmbed API, cross-search Apple Music for a match with candidate picker
- [x] "Now Playing" auto-fill — detect currently playing Apple Music song, real-time suggestion banner on create screen
- [ ] Quick capture flow (song pre-filled, minimal fields, expand for details)
- [ ] iOS home screen widget — show now playing with one-tap "save moment", or recent moment / "On This Day"
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

- [x] Search by song, artist, reflection text
- [x] Filter by mood and people tags
- [x] Combination filters (search + mood + people compose together)
- [ ] Filter by date range and location
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

- [ ] Spotify support (full integration — share extension cross-search is done, but no native Spotify playback/auth)
- [ ] Accessibility (VoiceOver, dynamic type)
- [ ] Offline support (queue uploads when offline)
- [ ] Export/backup (download your data)

