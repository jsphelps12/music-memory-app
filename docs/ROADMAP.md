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

### 1. Auto-play on moment open — COMPLETE
- [x] When opening a moment detail, gently fade in the 30-second preview automatically
- [x] Respect system volume; don't interrupt other audio in a jarring way

### 2. Personal collections — COMPLETE
- [x] User-defined groupings ("Summer 2024", "My healing era", "Road trip playlist")
- [x] Add/remove moments from collections
- [x] Tappable header selector on Moments tab (Day One-style)

### 3. Web app (Next.js / Vercel) — COMPLETE
- [x] Next.js 16 project in `web/`, deployed to Vercel at `https://music-memory-app.vercel.app`
- [x] `/c/{invite_code}` — shared collection preview (song, artwork, reflection, photos, audio preview)
- [x] Expandable moment cards with in-page audio playback
- [x] Sticky "Add your moment → Download Tracks" CTA
- [x] App: toggle collection public + share invite link via iOS share sheet
- [x] FAB for creating moments (moved + out of header)

### 4. Shared collections — Phase B — COMPLETE
- [x] Handle `tracks://join?inviteCode={code}` deep link in the app
- [x] Join screen — collection name, owner display name, moment count, "Join" button
- [x] `collection_members` table — collection_id, user_id, joined_at (no roles)
- [x] Contributor attribution — who added each moment in the collection view
- [x] Collection auto-select after joining via `lib/pendingCollection.ts`

**App Store launch gate (do before public launch):**
- [ ] Deferred deep links (Branch.io or similar) — passes invite code through App Store install
- [ ] Smart web CTA: try `tracks://` first, fall back to App Store with code stored for after install

### 5. Friends + social tagging — DEFERRED
Deferred until after App Store launch and real usage data. Link-based sharing covers the
near-term social use case without needing a social graph.
- [ ] `friendships` table — bidirectional request/accept model
- [ ] Friend discovery (search by display name) + request/accept UI
- [ ] Social tagging: when you tag a friend, creates a `tagged_moments` record
- [ ] Tagged moments inbox — friend sees it, chooses "Add to my timeline" or "Hide"
- [ ] Auto-suggest shared collection when two friends have 3+ mutual moments
- [ ] See docs/SOCIAL-ARCHITECTURE.md for full spec

### 6. Shareable moment cards — the viral surface
- [ ] Moment card: artwork, song, quote from reflection, date — exportable graphic
- [ ] Vertical/story-format card designed for Instagram & TikTok
- [ ] Multiple visual templates — clean, filmic, retro
- [ ] Share via iOS share sheet; free feature

### 7. Gift a Memory
- [ ] Log a moment and send it directly to one person — not a collection, a private one-to-one share
- [ ] Recipient gets a notification; opens via web link (no account required to view)
- [ ] To reply with their own memory of that song, they download the app — acquisition through intimacy
- [ ] No new data model needed beyond a share token on the moment; free feature

### 9. Era clustering (AI) — premium, needs data first
- [ ] Requires users to have 25+ moments before it's meaningful — bad early conversion trigger
- [ ] Cluster moments into life chapters using date, mood, artist, and reflection patterns
- [ ] Generate a name for each era (e.g. "Winter of Letting Go", "The Comeback Summer")
- [ ] Show eras as a navigable timeline — see your life organized into chapters
- [ ] Paywall: "Unlock the chapter you just lived"
- [ ] Era detail view: cover art collage, top songs, dominant moods, reflection excerpts
- [ ] Shareable era summary card (pairs with #3 above)
- [ ] See `docs/AI-FEATURES.md` for implementation notes

---

## Phase 2: Frictionless Logging (Remaining)

- [ ] iOS home screen widget + Dynamic Island — Now Playing one-tap save, On This Day; ShazamKit "identify" button captures ambient audio (concerts, parties, someone else's speakers — anything MPMusicPlayerController misses) [Free]
- [ ] ShazamKit native module — wraps Apple's ShazamKit framework for ambient audio fingerprinting; same pattern as existing NowPlaying module; cross-references result against MusicKit for full song metadata [Free]
- [ ] Weather auto-tagging — silently attach weather at moment creation; enables "rainy day songs" [Free]
- [ ] Lyric anchoring — highlight a specific lyric as the emotional anchor for a moment [Free]
- [ ] Apple Watch app — one tap on wrist logs current song instantly [Free]
- [ ] Apple Shortcuts integration — app intents for "log current song," automation triggers (e.g. "when I add a song to my Library, prompt me to log a memory") [Free]

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
- [ ] Memory prompts — rotating contextual starters ("Songs my parents played," "Song from your first heartbreak," "Song that defined a specific summer") shown in empty states and low-logging periods; universal emotional hooks that drive logging without requiring existing data [Free]
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
- [ ] **Anonymous stats + Discover** — "You're Not Alone" callout inside moment detail ("83 people logged this song during a breakup"); global Discover surface: top songs this week, top songs by mood, trending now — aggregate and anonymous, no social graph needed; data moat: intentional emotional annotations at scale that no competitor can replicate. Requires `birth_year` on profiles for generation cuts and a daily pre-compute cron writing to `song_stats` table; minimum 50+ logs per song before showing percentages [Free]
- [ ] `birth_year` on profiles — optional field at onboarding ("helps us show how your generation connects with music"); seed this now, data compounds — enables generation-demographic stats once user base grows [Free]
- [ ] Grief & memorial moments — songs tied to people who have passed; surfaces on significant dates
- [ ] Map view (moments by location, clusters, tap to explore)
- [ ] Weekly Recap — in-app summary of the week's moments
- [ ] Yearly Recap ("Your 2026 in Moments" — Spotify Wrapped-style, shareable)
- [ ] Voice notes — record via expo-av, transcribe for searchability, playback on detail
- [ ] Video support — capture, compress, playback, thumbnail on timeline card
- [ ] Mood-based playlist export — "songs I logged as 'peaceful'" → Apple Music playlist; built from your own tagged data, something no other app can generate [Free]
- [ ] Playlist export to Spotify/Apple Music from any collection or era
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
- [ ] Referral program — give a friend 3 months Plus free, get a month free; ship once paying subscriber base exists; frame as a gift not a discount
