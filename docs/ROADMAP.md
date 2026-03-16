# Soundtracks — Roadmap

> "It's wild how certain songs can immediately take you back to a totally different time in your life."
> — Instagram comment, 2,962 likes

That's the product. Everything on this roadmap exists to make that feeling capturable, revisitable, and shareable.

---

## SHIPPED

### Foundation & MVP
- [x] Auth (email/password + Apple Sign-In)
- [x] Song search (MusicKit), 30-second preview playback
- [x] Create / edit / delete moments (song, reflection, mood, people, date, photos)
- [x] Timeline feed — SectionList grouped by month, pagination, prefetch on auth
- [x] Moment detail — blurred artwork backdrop, auto-play preview, swipe to close
- [x] Photo support — camera/library, compression, full viewer (pinch-to-zoom, swipe paging)
- [x] Photo EXIF date + GPS auto-detection with suggestion banner
- [x] Profile — avatar, display name, stats, storage usage
- [x] Dark mode, design system, loading skeletons, empty states, error states

### Core Features
- [x] Share extension — receive shared songs from Apple Music & Spotify
- [x] Spotify cross-search — oEmbed parse → Apple Music match with candidate picker
- [x] Now Playing auto-fill — banner on create screen when something is playing
- [x] Quick capture flow — song + optional reflection, expandable details
- [x] Auto-tag time of day + location banner
- [x] On This Day + random resurfacing — Reflections tab, grouped by year
- [x] Push notifications — On This Day, streak, prompts, resurfacing; per-type toggles in Profile; cold-launch deep link fix
- [x] Card-to-detail transition animation
- [x] Calendar view — grid with album art thumbnails, pinch-to-zoom toggle
- [x] Swipe gestures throughout (close detail, delete cards, swipe between tabs)
- [x] Song, album, artist views — all moments for a given song/album/artist
- [x] Search + filter — song, artist, reflection text, mood, people, date range, location
- [x] Personal collections — user-defined groupings, header selector on Moments tab
- [x] Shared collections Phase A+B — join flow, contributor attribution, deep link, web preview
- [x] Web app — Next.js / Vercel, `/c/{invite_code}` shared collection page with audio preview
- [x] Shareable moment cards — dark portrait card with photo/artwork hero, iOS share sheet
- [x] Onboarding flow, custom app icon
- [x] ShazamKit — native module; ambient song identification → create screen pre-fill
- [x] Share from Photos — share extension handles image files; EXIF date + location auto-populated
- [x] Gift a Memory — web page at `/m/{share_token}`; app generates + shares URL; no account required to view
- [x] Memory prompts — 8 categories × 5 prompts in create screen, Reflections tab, empty states
- [x] Early resurfacing — "A Month Ago" section (25–35 day window) in Reflections tab
- [x] Privacy policy + Terms — hosted on web app at `/privacy` and `/terms`
- [x] Deferred deep links — clipboard method; web writes invite code, app reads on first launch
- [x] Design system v2 — accentSecondary (purple), brand gradient artwork placeholders, CloseButton, standardized button/input sizing
- [x] Reflections tab reorganization — all sections conditional (hidden when empty), reordered: On This Day → A Month Ago → This Month → Random
- [x] App renamed Tracks → Soundtracks everywhere (app name, bundle ID display, share extension, privacy/terms)
- [x] Password visibility toggle on sign-in + sign-up screens
- [x] Notification prompt gated behind `onboardingCompleted` — no premature iOS dialog
- [x] Sign-in ↔ sign-up navigation uses `replace` — no screen stacking on back swipe
- [x] Report Moment — UGC moderation via mailto; appears for other users' moments in shared collections
- [x] Share Feedback button on Profile screen
- [x] Data isolation — timeline + reflections clear on user change; no flash of previous account's data
- [x] Sentry crash reporting + PostHog analytics integrated and shipping in production build

---

## NOW — Pre-Launch Checklist (9 items, all done ✅)

Everything here ships before App Store marketing push.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Privacy policy + Terms | ✅ Done | Hosted at `/privacy` and `/terms`; cleaned up pre-submission |
| 2 | Deferred deep links | ✅ Done | Clipboard method; invite code survives install |
| 3 | Onboarding tightening | ✅ Done | Collection-origin variant deferred to post-launch |
| 4 | App Store listing + assets | ✅ Done | Screenshots, metadata, Sentry, PostHog, EAS build complete |
| 5 | Memory prompts | ✅ Done | 8 categories × 5 prompts wired throughout app |
| 6 | Early resurfacing | ✅ Done | "A Month Ago" in Reflections tab |
| 7 | Gift a Memory | ✅ Done | Web page + share URL; no account to view |
| 8 | ShazamKit | ✅ Done | Native module; ambient capture → create screen |
| 9 | Share from Photos | ✅ Done | Share extension + EXIF auto-fill |

### App Store Review — ✅ Submitted (awaiting review)
- [x] Age rating questionnaire — 12+ (UGC present)
- [x] App Privacy labels — completed
- [x] Demo account credentials added
- [x] Review notes added
- [x] 6.5" screenshots (1284×2778) uploaded
- [x] EAS production build attached
- [x] Submitted for review — awaiting Apple approval

---

## POST-LAUNCH — Shipped March 2026

Work completed after App Store submission while awaiting review.

- [x] **Wedding / Event guest contribution flow** — web form at `/c/{code}/contribute`; guests add song + reflection + photo with no account; live feed polls for new contributions every 30s; "Add Another" + App Store download CTA post-submit
- [x] **Web QR code page** — `/c/{code}/qr`; full-screen scannable QR; downloadable PNG; accessible from CollectionShareSheet in app
- [x] **Guest attribution** — `guest_name` / `guest_uuid` columns on moments; guest moments attributed by name in shared collection views (app + web)
- [x] **No-download web entry (App Clip equivalent)** — web contribution form covers the core use case (60-year-old uncle can contribute from any browser, no app required); native App Clip deferred unless web conversion data shows it's worth the build complexity
- [x] **Location autocomplete** — replaced free-text location field with Nominatim-backed search; stores `location_lat` / `location_lng` alongside display name; GPS suggestion banner and EXIF autofill both capture coordinates; foundation for map view
- [x] **Collection pre-selection** — tapping the FAB or "Add Moment" from a collection view passes `collectionId` to create screen; collection is pre-selected and details section auto-expands
- [x] **Add to Collection confirm step** — collection toggles in moment detail are now staged locally; "Save Changes" button commits; backdrop dismiss discards
- [x] **Notification null crash fix** — `moment_date` null guard in send-notifications edge function; was silently crashing the function for all users
- [x] **fetchPreviewUrl timeout** — 5s AbortController timeout on iTunes lookup; eliminates save-moment hangs when iTunes API is slow
- [x] **NEXT_REDIRECT web fix** — re-throw Next.js redirect errors in ContributeForm catch block; was showing "unexpected response" error and enabling double-submission

---

## PRIORITY STACK — Post-Launch Build Order

Ordered by impact across growth (new users), retention (keep existing), and revenue (conversion to paid). Updated March 2026.

### Complexity reference
- 🟢 Straightforward (days)
- 🟡 Moderate (1–2 weeks)
- 🔴 Hard (3–6+ weeks)

| Priority | Feature | Drives | Complexity | Notes |
|----------|---------|--------|-----------|-------|
| 1 | Friends (Phase C) | Growth + Retention | 🟡 | Request/accept, display name search, notifications. Unlocks Memory Game and social features. |
| 2 | Wedding refinement | Growth + Revenue | 🟡 | Shareable card generator, vanity short URLs, wedding collection template, post-event claim flow, PDF book export. Builds on shipped web contribution flow. |
| 3 | Notification refinement | Retention | 🟡 | Tap-rate tracking per type, timing optimization, unengaged user suppression, deep link targets, A/B copy. |
| 4 | Music Memory Engine Phase 1 | Retention | 🟡 | Edge function + seed dataset + existing notification infra. Questionnaire already built. |
| 5 | Era Clustering | Revenue | 🔴 | Premium conversion trigger at 25–30 moments. Hardest feature on the list. |
| 6 | Yearly Recap | Growth + Revenue | 🟡 | Must ship before December. Annual press moment. Free card + Premium full version. |
| 7 | Song Anniversaries + Forgotten Songs | Retention | 🟢 | Ship alongside Music Memory Engine work. Date math + simple query. |
| 8 | Save for Later (Song Inbox) | Retention | 🟡 | Share Extension "Save" path + drafts table + inbox UI. |
| 9 | Memory Game | Growth + Retention | 🟡–🔴 | Async version first (Wordle-style). Needs friends. Killer viral mechanic. |
| 10 | Smart Playlists (basic) | Retention + Growth | 🟡 | Time-period + mood playlists → Apple Music export. Shareable. |
| 11 | QR Code Framed Print | Revenue | 🟡 | Needs public moment pages first. Printful API. High-volume gift product. |
| 12 | Lock Screen Widget | Retention | 🔴 | App Intents, App Groups, Live Activities. Gets tech press. |
| 13 | Spotify integration (iOS) | Growth | 🟡 | Store Spotify ID + deep link out. Expands addressable market significantly. |
| 14 | Android port | Growth | 🔴 | 4–6 weeks. Swap points are clear: musickit.ts rewrite, new Kotlin modules for NowPlaying + ShazamKit → ACRCloud, Google Sign-In. Everything else cross-platform already. |
| 15 | Musical Autobiography | Revenue | 🔴 | LLM prose on personal data. Needs 2+ years of user data to be moving. Plant seeds now. |
| 16 | "You're Not Alone" | Retention | 🟡 | Needs scale (1K+ users) for meaningful numbers. |
| 17 | Community features | Retention | 🔴 | Tracks 100, memorial collections, community challenges. 5K+ users. |

### Notification refinement — what's missing
Current state: infrastructure exists (edge function, per-type prefs, cold-launch fix, scheduling). What's not done:
- [ ] Tap-rate tracking per notification type (are On This Day taps higher than streak taps?)
- [ ] Timing optimization — send at each user's historically active hour, not a fixed UTC time
- [ ] Unengaged user suppression — don't send to users who haven't opened in 30+ days; re-engagement campaign instead
- [ ] Deep link targets — each notification type should deep link to the right screen, not just open the app
- [ ] A/B testing notification copy — small copy changes drive significant tap-rate differences
- [ ] Weekly prompted song (Music Memory Engine) — not yet wired to edge function
- [ ] Weekly text prompt — not yet wired to edge function
- [ ] Collection activity notifications — member adds to your shared collection (real-time, not batched)

### Wedding / Event invite flow — full spec

**The insight:** POV's QR-code-at-every-table approach is the wrong aesthetic for weddings. Brides don't want tech hardware on their tables. The distribution should be invisible — built into things that already exist at a wedding.

**Distribution channels (no QR codes on tables):**
- Wedding website (Zola, The Knot) — "Join Our Soundtrack" section with a link; guests are already visiting for RSVPs
- Physical invitation insert — a small card at home, not mid-reception; different emotional context
- Wedding party text the morning of — they're already on their phones coordinating
- Ceremony program footnote — short link at the bottom, subtle
- DJ/band announcement — one mention at a natural moment (first dance, end of night)

**Who to target:** The wedding party and immediate family (15–20 people), not all 150 guests. These people care most, will log the most meaningful moments, and are most likely to become long-term Soundtracks users. One maid of honor who logs five moments and stays for years is worth more than 50 strangers who log once.

**What to build (remaining):**
- [ ] Shareable card generator — beautiful image with couple's names, date, short link (Priority 2)
- [ ] Vanity short URLs — `soundtracks.app/join/sarah-and-james` (Priority 2)
- [ ] Wedding/event collection template (Priority 2)
- [ ] Post-event claim flow (Priority 2)
- [ ] PDF book export (Priority 2)

**No-download web entry — ✅ shipped via web form.** Guests contribute from any browser at `/c/{code}/contribute`. Native App Clip deferred unless web conversion data justifies the build complexity (separate Xcode target, App Store Connect configuration, App Clip experience URL setup).

**The competitive advantage over POV:** Soundtracks' window is forever, not just the event. The memory doesn't have to happen at the table — it can happen during the first dance, the next morning, or a month later when the song comes on shuffle.

### Platform expansion
- **Android**: Not before 1,000+ active iOS users + revenue. Abstraction is reasonable — swap points are clean:
  - `lib/musickit.ts` → full rewrite for Spotify SDK (one file)
  - `modules/now-playing/` → new Kotlin native module via MediaSession API (same TS interface)
  - `modules/shazam-kit/` → new Kotlin native module via ACRCloud API (same TS interface)
  - `expo-apple-authentication` → add Google Sign-In
  - Everything else (UI, Supabase, navigation, photos, notifications) is already cross-platform
  - Estimated effort: 4–6 weeks focused work, not a full rewrite
- **Spotify integration on iOS**: Before Android. Store `spotify_track_id`, search Spotify catalog, deep link out. 6–12 months out.

### Onboarding questionnaire — decision
Keep birth year + country in onboarding (required — Music Memory Engine needs it). Cut favorite artists, songs, genre prefs from onboarding; move to Profile → Taste as optional enrichment surfaced after 3rd logged moment. Reduces drop-off while preserving cold-start data.

### Known technical debt
- Notification edge function: queries all profiles at once — needs pagination at 10K+ users
- Spotify oEmbed cross-search: fragile, no fallback if format changes
- No offline support: moments can't be logged without network
- No per-request timeout/retry (global 520 retry added, but not per-request)
- RLS policies: one gap already found and fixed; edge cases in shared collections may exist
- Invalid/expired invite code handling: not gracefully surfaced to user

---

### 1. Privacy Policy + Terms of Use ✅
- [x] Hosted at `music-memory-app.vercel.app/privacy` and `/terms`
- [x] Covers email/Apple ID, reflection text, mood data, photos, location (EXIF), push notification tokens
- [x] Addresses third parties, data retention, account deletion, user rights
- [x] Terms: acceptable use, content ownership, no liability for data loss

### 2. Deferred Deep Links ✅
- [x] Clipboard method — web writes `soundtracks-invite:{code}`, app reads on first launch
- [x] Invite code survives App Store install; auto-presented join flow after sign-up

### 3. Onboarding Tightening ⬜ (mostly done)
**Done:**
- [x] Celebration screen — single "Turn on notifications" button, no skip; notification cold-launch deep link fixed
- [x] Notification permission: full-screen transparent ask, trust-building framing, manage in Settings
- [x] Per-type notification toggles in Profile (On This Day, streak, prompts, resurfacing)
- [x] Signup questionnaire — birth year + country, favorite artists/songs, genre prefs (5 steps, optional skip on steps 2 + 5)
- [x] Gate: after onboarding completes, routes to create screen as first action
- [x] "How to capture a memory" collapsible card in Profile — all 5 capture methods with descriptions
- [x] Genre preferences editable post-onboarding in Edit Profile

**Remaining (post-launch):**
- [ ] Collection-origin users: "This moment is yours now. Not just theirs." reframe after joining

### 4. App Store Listing + Assets ✅

**Crash reporting — Sentry** ✅
- [x] `@sentry/react-native` installed, DSN configured, `Sentry.wrap(RootLayout)` in app entry point
- [x] `SENTRY_AUTH_TOKEN` added as EAS secret (Project R&W + Release R&W + Org Read scopes)
- [x] Source maps upload automatically on EAS build

**Product analytics — PostHog** ✅
- [x] `posthog-react-native` installed, `PostHogProvider` wraps app in `_layout.tsx`
- [x] `posthog.identify()` on sign-in, `posthog.reset()` on sign-out
- [x] Events tracked: `signed_up`, `signed_in`, `onboarding_completed`, `moment_created`, `shazam_used`, `moment_deleted`, `moment_shared`, `song_searched`, `song_selected`, `collection_joined`, `notifications_enabled`, `notification_preferences_changed`
- [x] Dashboard: https://us.posthog.com/project/331689/dashboard/1331385

**In-app feedback** ✅
- [x] "Share Feedback" button on Profile screen (above Sign Out) → mailto to `founder@soundtracks.app`

**UGC moderation** ✅
- [x] Report Moment — in `...` menu on moments by other users; mailto pre-filled with moment ID + contributor name
- [x] Collection owners can remove moments and kick members

**Data integrity fix** ✅
- [x] Timeline + Reflections state cleared immediately on `user.id` change — prevents data flash between accounts

**App Store Connect — required fields** ✅
- [x] App name: "Soundtracks"
- [x] Subtitle: "Your music. Your memories."
- [x] Description + promotional text written
- [x] Keywords set
- [x] Privacy policy URL: `/privacy`
- [x] Category: Music (primary), Lifestyle (secondary)
- [x] 9 screenshots uploaded (6.5" slot: resized to 1284×2778)
- [x] Age rating: 12+ (UGC present)
- [x] App Privacy labels completed
- [x] Demo account credentials added
- [x] Review notes added
- [x] EAS production build attached + submitted for review

**EAS Build** ✅
- [x] `eas.json` configured with production profile, auto-increment build number
- [x] All secrets added to EAS: Supabase URL/key, Sentry DSN, PostHog key/host, Sentry auth token
- [x] Production build completed successfully

**Sentry alerts**
- [ ] Configure email alerts for new error types hitting production

**Supabase Pro — upgrade before launch**
- [ ] Free tier: 1 day log retention, no automated backups
- [ ] Pro ($25/month): 7-day logs, daily automated backups — non-negotiable for personal emotional data

### Memory Prompts ✅
- [x] Rotating contextual starters — 8 categories × 5 prompts
- [x] Lives in create screen, Reflections tab, empty states; user picks a prompt → pre-fills reflection placeholder
- [ ] Weekly push notification with a prompt (not yet wired to edge function)

**Prompt Library — organized by type:**

*People*
- "A song your parent played that you didn't understand until later"
- "The song that was yours and one specific friend's"
- "A song that makes you think of someone you've lost"
- "A song someone dedicated to you, or that you dedicated to someone"
- "The song playing during your relationship's best moment"

*Place & Time*
- "The song that takes you back to a specific summer"
- "A song you associate with one room, one apartment, one city"
- "The song you heard in another country that stuck with you"
- "The song from your first road trip"
- "A song that always plays in your head when you think of where you grew up"

*Firsts*
- "The first song you chose for yourself — not something you heard, something you found"
- "The first concert you ever went to"
- "The song playing during your first drive alone"
- "The first song that made you cry"
- "A song you remember discovering and immediately sending to someone"

*Loss & Endings*
- "A song you played when something ended"
- "The song playing the last time you saw someone"
- "A song you can't listen to anymore because of who it reminds you of"
- "A song you wish you could share with someone who's gone"
- "The song from the hardest season you've lived through"

*Becoming*
- "A song that got you through something you couldn't explain"
- "The song playing when you realized you were becoming someone different"
- "A song that felt like it was written for a version of you that no longer exists"
- "A song from a chapter of your life you've never fully written about"
- "The song you played when you made a decision that changed everything"

*Late Night*
- "A song you played at 2am when you couldn't sleep"
- "The song that hit differently when you were driving alone at night"
- "A song that only makes sense after midnight"
- "The song you played when the party was over and you were the last one awake"
- "A song you've cried to in a car alone"

*Joy*
- "The song playing when you got news that changed everything (in the best way)"
- "A song that makes you feel invincible"
- "The song from the best summer you can remember"
- "A song you put on when you need to feel like yourself again"
- "The song you played on repeat when something finally worked out"

*Rediscovery*
- "A song you haven't thought about in years that just came back"
- "A song that meant something completely different to you at different ages"
- "A song you ignored when it first came out, then fell in love with later"
- "A song that will always take you back even though you try to move on"
- "A song from a playlist you forgot you made"

### Early Resurfacing ✅
- [x] "A Month Ago" section in Reflections tab — 25–35 day window, bridges the On This Day gap
- [x] "On This Day" grouped by year (existing)
- [x] Random memory resurfacing in Reflections tab
- [ ] "Your earliest memory in Tracks" card — works from day 1
- [ ] "From a year like this one" — same month in past years

### 30-Day Retention Plan
| Day | Hook |
|-----|------|
| 0 | First moment saved before leaving onboarding |
| 0 | Collection users: "This moment is yours forever" reframe |
| 1 | Push: "What song have you had in your head this week?" |
| 3 | Music Memory Engine fires first prompted song: "What does '[Song]' remind you of?" |
| 7 | "You've logged X moments" + streak acknowledgment |
| 14 | Second prompted song or forgotten song if applicable |
| 30 | "A Month Ago" appears in Reflections; mini recap card: "Your first month in Tracks" |

**Notification coalescing rule:** max 1 notification per day; priority order: On This Day > streak at risk > weekly prompted song > weekly prompt text. Weekly cadence for resurfacing — never daily.

---

## WEDDING READY

The wedding is a Trojan horse. Guest scans QR → contributes a memory → gets prompted to download → their contribution becomes their first personal moment. One event, potentially 50–150 installs.

### Web Contribution Form (no account required) ✅ **[Free to contribute / Events tier to unlock]**
- [x] Guest navigates to `soundtracks.app/c/{invite_code}/contribute`
- [x] Song search via iTunes Search API (public, no auth needed)
- [x] Reflection text + mandatory photo upload
- [x] Submits without an account — per-collection guest Supabase auth user; per-submission `guest_uuid` for claim flow
- [x] Web server inserts via service role key (bypasses RLS)
- [x] After submit: "Memory added ✓" banner + live feed (incremental polling every 30s) + "Add Another" + "Download Soundtracks" CTA
- [ ] After sign-up: claim flow links guest moments to new user_id (post-event claim — not yet built)
- [x] `events_tier_unlocked` flag on collections (default true); server action checks before allowing contributions

### QR Code Generation ✅ **[Events tier]**
- [x] Collection owner taps "Get QR Code" → web page at `/c/{code}/qr` opens in browser
- [x] Full-screen scannable QR; renders with `qrcode` npm package on canvas
- [x] Downloadable as PNG
- [x] CollectionShareSheet: copy link + share sheet + Get QR Code button

### Wedding Refinement **[Priority 2 — next up]**
- [ ] Shareable card generator — beautiful image with couple's names, date, short link; looks like an invitation not a tech product; designed to be texted or embedded in wedding website
- [ ] Vanity short URLs — `soundtracks.app/join/sarah-and-james` instead of UUID
- [ ] Wedding/event collection template — pre-sets name style, cover, prompt ("What song defined this day for you?")
- [ ] Post-event claim flow — guests who contributed via web get "Your memories from Sarah & James's wedding are waiting for you" after downloading
- [ ] PDF book export — each page: contributor name, reflection, song + artist, photo; back: full song list with QR codes; cover: tiled album art collage; print-on-demand partner (Artifact Uprising, Blurb); $80 softcover / $130 hardcover

*ShazamKit moved to Growth — it's a core everyday capture feature, not event-specific. See Growth section.*

### ShazamKit Native Module ✅
- [x] Custom native module at `modules/shazam-kit/` (same pattern as NowPlaying module)
- [x] Wraps Apple's ShazamKit — microphone → 3-second audio fingerprint → song ID
- [x] Cross-references `SHMediaItem` against MusicKit for full song metadata
- [x] "Identify" button on create screen; wired into create flow
- [ ] Lock screen widget "Identify" tap — zero-friction ambient capture (future)

**The use case that defines this feature:**
You're walking down the street. A restaurant is playing a song that immediately takes you back. You tap Identify — 3 seconds — the song resolves. You write the memory right there on the sidewalk. That moment would have been lost. That *is* the Instagram comment with 2,962 likes. ShazamKit captures it.

| | Now Playing | ShazamKit |
|---|---|---|
| Detects | Music playing *through your device* | Music playing *anywhere near you* |
| Trigger | You chose to play it | It found you |
| Examples | Your own Spotify, Apple Music | Restaurant, street, friend's speakers, wedding, concert |

### Share from Photos ✅
- [x] Share extension accepts image file types
- [x] Create screen opens with photo pre-filled, EXIF date + location auto-populated
- [x] Visual trigger (old photo) → musical memory captured

### Smart Playlists **[Free basic / Premium full]**
- [ ] Auto-generated playlists from your logged moments, organized by dimension — not manually curated, built from your data
- [ ] **By time period** — "My 2021," "Summer 2019," "Last Winter" — date-bounded song lists, one tap to open in Apple Music [Free]
- [ ] **By mood** — "Songs I logged as peaceful," "My heartbreak playlist" — the honest version, not an algorithmic recommendation [Free]
- [ ] **By person** — "Moments with Jordan" as a playlist — the relationship soundtrack, listenable [Free with export, Premium for insights]
- [ ] **By location** — "Songs from New York," "Road trip moments" — requires location data on moments [Premium]
- [ ] **By era** — auto-detected clusters ("The Comeback Summer") rather than calendar year [Premium, needs era clustering]
- [ ] These are distinct from personal collections (which are manually curated) — smart playlists are generated, not assembled
- [ ] Playlist Export from Collections handles the Apple Music side; smart playlists use the same export mechanism

### Playlist Export from Collections **[Free]**
- [ ] Any collection (personal or shared) can be exported as an Apple Music playlist
- [ ] One tap → playlist created via MusicKit `MusicLibrary.shared.add()`
- [ ] Shared collection export: "The Wedding Soundtrack" playlist with all contributed songs
- [ ] Personal collection export: "My Road Trip Playlist" — a playlist you actually remember making
- [ ] Every export is shareable as a playlist → more impressions for Tracks

### Physical Book **[Events / Book tier — design conversation TBD]**
- [ ] Requires public individual moment pages on web (`/m/{moment_id}`) for QR codes to link to
- [ ] Each page spread: contributor name, reflection, song + artist, photo, QR code that plays the song
- [ ] Back of book: every song in the collection, each with a QR code → Apple Music
- [ ] Cover: tiled collage of every album artwork from songs in the collection
- [ ] PDF generation server-side; sent to print-on-demand partner (Artifact Uprising, Blurb)
- [ ] $80 softcover / $130 hardcover pricing — pure margin after print cost
- [ ] Dependency: public moment pages must exist first

---

## GROWTH — Closes the Acquisition Loop

Features that turn users into acquisition channels.

### Gift a Memory ✅
- [x] Web page at `web/app/m/[share_token]/page.tsx` — song + reflection, no account required to view
- [x] App generates share token and surfaces iOS share sheet from moment detail
- [x] Acquisition through emotional resonance — recipient sees your memory, CTA to download

### Resurfacing Weight Control **[Free]**
- [ ] After a moment surfaces in Reflections, let the user explicitly signal: "Show this more" / "Not now" / "Bury this"
- [ ] Implicit version: if you engage with a resurfaced moment (tap into detail, add a new reflection, or share it), it gets upweighted automatically; if you swipe past it three times, it gets downweighted
- [ ] Explicit version: long-press on any moment card → "Resurface often" / "Leave it in the past"
- [ ] Some memories people want back constantly. Others they logged to process and don't need to relive. The app should learn the difference.
- [ ] This is essentially spaced repetition for emotional memories — the Anki model applied to your past
- [ ] Builds trust: users who feel in control of what surfaces stay longer

### Lyric Anchoring + Cross-Era Lyric Connections **[Free anchor / Premium connections]**
- [ ] When logging, optionally highlight a specific lyric as the emotional anchor [Free]
- [ ] Stored as `lyric_anchor` field on the moment
- [ ] Displayed prominently on detail view — the exact line that hit you
- [ ] Years later, the lyric is more specific and powerful than just the song title
- [ ] Surfaced after song is selected; optional, zero friction
- [ ] **Cross-era lyric connections [Premium]** — when a lyric or theme reappears across multiple moments in different eras, the app surfaces it: *"This line from Bon Iver shows up in 3 different phases of your life. Here's who you were each time."* Requires NLP matching on lyric text + reflection text. The most poetic feature in the product — the idea that certain words follow you through life.

### Voice Notes **[Free]**
- [ ] Record a voice note alongside (or instead of) typed reflection — expo-av already installed
- [ ] Record to local file → upload to Supabase Storage (same pattern as photos)
- [ ] `audio_url` field on moments; playback on detail view
- [ ] Your actual voice, from that moment in time — photos and text can't replicate this
- [ ] Optional: pipe through OpenAI Whisper edge function for transcription + searchability
- [ ] Hear your own voice from the past — deeply personal, no other app does this

### Music Memory Engine **[Free — the engagement core]**
> Full algorithm design, data model, and phased build plan: see `docs/MUSIC-MEMORY-ENGINE.md`


The highest-leverage retention feature in the product. A push notification saying "What does 'Lady in Red' remind you of?" — with a tap that opens the create screen with that song pre-filled — is not a nudge. It's a direct invitation to relive something. No other journaling app can send this because no other app knows which songs are loaded with meaning for each specific person.

**The core loop:**
```
birth year + country + favorite artists → formative era → candidate songs
→ score + rank → filter already-logged → pick 1 song/week
→ push: "What does '[Song]' remind you of?"
→ tap → create screen opens with song pre-filled
→ user writes reflection → moment saved
→ song marked as prompted+logged; loop repeats with richer signal
```

**Data model:**
- [ ] `profiles`: add `birth_year int`, `country text`, `favorite_artists jsonb[]`, `favorite_songs jsonb[]`, `genre_preferences text[]` — collected at signup questionnaire
- [ ] `suggested_songs` table: `(id, title, artist, apple_music_id, release_year, country_codes text[], genres text[], cultural_weight float)` — the curated seed dataset
- [ ] `prompted_songs` table: `(user_id, song_id, prompted_at, tapped bool, logged bool)` — tracks what was sent and whether user engaged

**Song dataset — hybrid approach:**
- [ ] Curated seed dataset (~500–1,000 songs) in `suggested_songs` table: Billboard/chart hits by era + region that reliably trigger memories — think "Lady in Red," "Wonderwall," "Mr. Brightside," "Lose Yourself," etc.; one-time build, maintained manually
- [ ] Apple Music catalog enrichment: for each `favorite_artist` the user provides, use the existing MusicKit integration to pull their top songs + related artists → dynamic expansion of candidates beyond the curated set; no extra API key needed
- [ ] Over time, collaborative signal (see Phase 3 below) can surface long-tail songs the curated set would miss

**Notification types and cadence:**

| Type | Cadence | Default | Notes |
|---|---|---|---|
| Prompted Song | Once/week | On | Core engine output — "What does '[Song]' remind you of?" |
| On This Day | Day-of, conditional | On | Only fires when there's an actual match |
| Streak at risk | Daily if active | On | Haven't logged today + active streak |
| Weekly Prompt (text) | Once/week | Off | Rotating writing prompt, no song |
| Collection activity | Real-time | Off | Member adds to your shared collection |

Preferences UI in Profile → Notifications settings screen (new screen, accordion in profile).

**The Algorithm — three phases:**

*Phase 1: Rule-based scoring (cold start — day 1)*
Every candidate song gets a score against the user profile:
```
score(song, user) =
  era_weight(song.release_year, user.birth_year)      // peaks at ages 13–25; Gaussian decay beyond
  × country_weight(song.countries, user.country)       // 1.0 match, 0.7 English-adjacent, 0.4 global
  × genre_weight(song.genres, user.genre_preferences)  // cosine similarity on genre vectors
  × artist_affinity(song.artist, user.favorite_artists) // 1.5× if exact match, 1.2× if Apple Music "related"
  × (0 if already logged or recently prompted)
```
Era weight uses a Gaussian curve peaked at birth_year + 18, capturing the reminiscence bump. A user born in 1985 gets maximum weight for songs from 1998–2003, tapering toward 1990 and 2010.

*Phase 2: Content-based filtering / VSM (weeks 2+)*
Represent each song as a feature vector in a shared space:
```
song_vector = [year_normalized, genre_one_hot[], country_one_hot[], cultural_weight]
```
As the user logs moments, build a user preference vector from their logged songs using TF-IDF-style weighting (rare genre preferences get higher weight than common ones — same logic as VSM document retrieval). Cosine similarity between the user vector and each candidate song vector gives a ranked list that gets more accurate with every moment logged. This is content-based filtering using Vector Space Model — computationally cheap, interpretable, no cold start problem.

*Phase 3: Collaborative filtering (months 2+, needs user base)*
Build a user × song affinity matrix from logged moments. Apply SVD (or ALS for sparsity) to factorize into latent feature space. Users with similar latent vectors (similar birth year, country, genre, logging patterns) surface songs their neighbors logged that the current user hasn't. "Users born in 1985 in the US who logged these 5 songs also had memories to [Song X]." This is where the Netflix analogy becomes real — not just "songs from your era" but "songs people exactly like you carry."

*Phase 4: Hybrid + contextual bandits (when data is rich)*
Blend Phase 1 score with Phase 3 CF score, weighted by how much data the user has generated. Use contextual bandits (explore/exploit) on notification timing and song selection — track which prompted songs get tapped vs. ignored; optimize the selection policy over time. Engagement signal (tap → created moment) is the reward function.

**pgvector in Supabase** handles Phase 2 and 4 natively — no Pinecone, no external ML infrastructure. The full recommendation pipeline runs inside Supabase.

**Why this is a moat:**
Spotify knows you played "Lady in Red" 47 times. Tracks knows it was your parents' wedding song and you played it at your dad's funeral. The annotation is the moat. The recommendation engine trained on annotated emotional data is categorically different from one trained on play counts — and the more moments users log, the better it gets for everyone.

- [ ] Phase 1 (build now): signup questionnaire + `suggested_songs` table (curated seed) + Edge Function that scores + sends weekly notification
- [ ] Phase 2 (build at 100+ active users): VSM scoring layer using pgvector, replace/augment Phase 1 scoring
- [ ] Phase 3 (build at 1,000+ users): collaborative filtering via SVD in Edge Function or external Python job writing results back to Supabase
- [ ] Phase 4 (build at 10,000+ users): full hybrid + bandit optimization

### Plant Seeds for Anonymous Stats / Discover **[Free — data-seeding tasks]**
- [ ] `birth_year`, `country`, `favorite_artists`, `genre_preferences` — collected at signup (see Music Memory Engine above); also feeds generational Discover cuts; seed now, data compounds over time
- [ ] `song_stats` table — pre-compute daily: song_id, mood, log_count, week; start accumulating before the UI exists
- [ ] Minimum threshold: 50+ logs per song before any percentages are shown
- [ ] These are infrastructure tasks; the UI comes in the Social phase once data exists

### Pattern-Based Resurfacing **[Free basic / Premium deep patterns]**
- [ ] Time-based resurfacing (On This Day, A Month Ago) is table stakes — the more interesting angle is *behavioral* patterns
- [ ] **Artist drift** — "You logged 8 moments with Phoebe Bridgers but haven't touched her in 6 months. Here's one." Low query complexity, high emotional hit.
- [ ] **Day-of-week patterns** — "You save a lot on Sunday nights — here's one from last month." Detect over-indexed days from moment timestamps; serve on that day.
- [ ] **Mood resonance** — "Your mood was similar then to how you're feeling now." Match current session mood tag (from the last moment logged) against historical moments with same or adjacent tag. Show the moment + reflection as a mirror.
- [ ] **Listening rhythm** — "You tend to log more in winter. Here's what you were listening to last February." Seasonal pattern without needing a full year of data — just same-month-last-year if it exists, or same-season average.
- [ ] All of these surface as cards in the Reflections tab, slotted between On This Day and the prompt cards
- [ ] Basic variants (artist drift, day-of-week, mood resonance) are Free; deeper statistical patterns (multi-variable correlations, predictive surfacing) are Premium
- [ ] These compound — the more moments logged, the more pattern signal, the better the cards get; makes long-term retention self-reinforcing

### Forgotten Songs **[Free]**
- [ ] Surface songs logged exactly once and never revisited
- [ ] "You logged this once in March 2024 and never came back to it."
- [ ] Haunting in a good way — reinforces the logging habit
- [ ] Simple query: moments grouped by song, count = 1, surface randomly in Reflections tab

### Song Anniversaries **[Free]**
- [ ] "One year ago today, you first logged this song."
- [ ] Pure date math, deeply personal
- [ ] Lives in Reflections tab alongside On This Day

### "Log With Others" Nudge Strategy **[Free]**
- [ ] After logging a moment, soft prompt: "Who were you with when this song hit you?"
- [ ] If they tag a person: next session, "You have 3 moments with Jordan — want to share them?"
- [ ] Tagging people is the first step of the social loop; it feels like meaningful metadata, not a feature
- [ ] People who log moments with others are more likely to invite those people → shared collections → installs
- [ ] Track: moments with people tagged vs. not — if correlation with retention is strong, make the prompt more prominent

### Community Entrenchment **[Free — the stickiness layer]**

*The strongest retention mechanic is artifacts that feel like loss to abandon. Each of these creates something that doesn't exist anywhere else and can't be reconstructed if the user leaves.*

- [ ] **Shared histories as exit barriers** — once two people have built a shared collection together (wedding, road trip, friendship), that history lives in Tracks. Leaving means losing it. Not manipulative — just the natural weight of something real being built. The job is to make the artifact feel valuable enough that this exit cost registers.
- [ ] **"You both have a memory here"** — when two friends have independently logged the same song, the app notices: *"You and Alex both have a moment tied to this song — for completely different reasons."* No explicit sharing required; just the recognition that your history and someone else's overlap. Creates an impulse to share your reflection and see theirs.
- [ ] **Memorial collections** — collections dedicated to someone who has passed, maintained by multiple people contributing their memories of that person's soundtrack. Deeply personal, practically impossible to replicate elsewhere, and the kind of thing families maintain for years. This is one of the most emotionally significant things the product could enable.
- [ ] **Community challenges with temporal anchoring** — weekly or monthly prompts the whole community responds to together: *"Log the song from your best summer."* *"What were you listening to the week everything changed?"* Individual responses are private; the aggregate result (most common eras, moods, artists) is shared. Creates shared temporal experience — the feeling of doing something together — without a social graph.
- [ ] **"The Tracks 100"** — annual list of the 100 most emotionally significant songs logged by the community, ranked by annotation depth (not play count). Different from every other chart because it's based on what songs *meant*, not how often they were played. Released each December alongside Yearly Recaps. Press-worthy. Something users look forward to.
- [ ] **Collaborative era naming** — community votes on what to call shared musical eras: *"What do you call the post-pandemic music moment?"* *"Name the 2010s indie folk era."* Users who participate feel ownership over the product's language. Small feature, high community investment.
- [ ] **First Tracks anniversary** — *"One year ago today, you logged your first memory here."* The app becomes part of your personal history. Leaving means the anniversary disappears.

### Save for Later — Song Inbox **[Free]**
- [ ] One-tap intent capture: user hears a song but doesn't have time to write a reflection; saves song metadata to a personal inbox to complete later
- [ ] Reduces the most common source of missed memories: "I was going to log that but forgot"
- [ ] Entry points (in order of build effort):
  - **Share extension** — add "Save for Later" option alongside "Log Now"; saves song metadata without opening the create screen; lowest effort, reuses existing infrastructure
  - **Widget** — "Save what's playing" single-tap button using App Intents (iOS 17+); triggers background action without opening the app; reads now-playing from shared UserDefaults, writes to drafts
  - **Siri Shortcut** — "Hey Siri, save this to Tracks"; same App Intent as the widget, free once that infra exists
- [ ] Storage: `drafts` table — `user_id`, `song_name`, `artist`, `apple_music_id`, `artwork_url`, `saved_at`
- [ ] Inbox UI: "To Log" section at top of timeline (dismissable), or a badge on the create button; tapping a draft pre-fills the create screen with that song; draft disappears once logged or explicitly dismissed
- [ ] Optional: push reminder after 48h — "You saved '[Song]' to log later. Still want to?"
- [ ] Build order: (1) share extension "Save for Later" path + `drafts` table + inbox UI; (2) widget action after the widget ships

### Milestone Tracker + Progress Counter **[Free — engagement layer]**
- [ ] **Milestone counter** — a running count of logged moments, shown prominently in Profile as part of identity ("You've built 47 memories"), not buried in a stats section
- [ ] **Milestone celebrations** — in-app moment that fires when the user crosses a threshold; not a badge, a felt beat: subtle animation, a personalized message, and a sneak peek of what's coming next

  | Milestone | Message | Sneak peek |
  |-----------|---------|------------|
  | 1st moment | "Your first memory. This is the beginning." | "Log 4 more and early resurfacing unlocks." |
  | 5 moments | "You've got something going." | Blurred Reflections card: "Your earliest memory will start surfacing here" |
  | 10 moments | "10 memories. You're building a real archive." | "At 25, your first era will start to take shape." |
  | 25 moments | "Something is forming." | Locked era card preview in Reflections — the Premium conversion moment |
  | 50 moments | "50 moments. This is a real body of work." | Blurred pattern insight teaser |
  | 100 moments | "100 memories. That's a life in music." | "What kind of music person are you" insight unlocked |
  | 365 days active | "A full year. On This Day is now fully alive." | Yearly Recap unlocked |

- [ ] **Sneak peeks at upcoming unlocks** — below each milestone celebration, show a blurred/locked preview of exactly what unlocks next and how many moments away it is: "8 moments away from your first pattern insight" with a soft preview behind it; creates anticipation instead of a hard wall
- [ ] **Progress strip in Profile** — a horizontal milestone timeline showing the user's current position and the next 2–3 upcoming unlocks; feels like a journey being assembled, not a game with levels
- [ ] **Sneak peeks at upcoming unlocks** — below each milestone celebration, show a blurred/locked preview of exactly what unlocks next and how many moments away it is: "8 moments away from your first pattern insight" with a soft preview behind it; creates anticipation instead of a hard wall
- [ ] **Progress strip in Profile** — a horizontal milestone timeline showing the user's current position and the next 2–3 upcoming unlocks; feels like a journey being assembled, not a game with levels
- [ ] **Tone: journal, not fitness app** — language like "You've built...", "Something is forming...", "This is becoming real" — never streaks broken, never XP, never badges; the metaphor is an archive growing, not a game being played
- [ ] **Streaks (secondary, gentle)** — "You've logged 4 days this week" as a warm acknowledgment, not a pressure mechanism; no streak-breaking push notifications; logging every day should feel natural, not guilted
- [ ] Monthly recap card: "You saved 12 moments in February" — surfaces in Reflections as a warm summary, shareable as an image
- [ ] Seasonal milestones: "You've been logging since winter. Here's what spring sounds like for you." — crosses into Pattern Resurfacing when enough data exists

### Mini-Achievements — Feature Discovery Layer **[Free]**
> One-time "first time you did X" moments. Not a badge wall — each fires once, in-context, as a warm acknowledgment. Never shown as a checklist to complete; discovered naturally as the user explores.

- [ ] **Implementation:** a `user_achievements` table — `(user_id, achievement_key, earned_at)`; check on relevant actions; fire a celebration sheet when a new key is inserted; never re-fire
- [ ] **Achievement set:**

  | Key | Trigger | Message |
  |-----|---------|---------|
  | `first_photo` | Attached a photo to a moment | "A face to go with the feeling." |
  | `first_person_tag` | Tagged someone in a moment | "Music sounds different with people in it." |
  | `first_shazam` | Identified a song with ShazamKit | "Caught in the wild." |
  | `first_share` | Shared a moment card | "You just gave someone a memory." |
  | `first_share_extension` | Captured via share from Apple Music/Spotify | "Straight from the source." |
  | `first_now_playing` | Used Now Playing auto-fill | "No searching. Just feeling." |
  | `first_voice_note` | Added a voice note | "Your voice, from this exact moment." |
  | `first_location` | A moment with a location tagged | "Somewhere specific." |
  | `first_collection` | Created or joined a shared collection | "Music is better shared." |
  | `first_prompt_used` | Logged a moment from a memory prompt | "The prompt found something real." |
  | `first_gift` | Sent a Gift a Memory | "That's going to mean something to them." |
  | `first_save_for_later` | Used Save for Later | "You'll come back to this." |
  | `first_reflections_tab` | Opened the Reflections tab | "Here's where it all starts to add up." |
  | `first_calendar_view` | Opened the calendar view | "Your life, mapped." |

- [ ] **Sharing nudge tied to `first_share`** — after 3+ moments logged without sharing, a soft in-app card: "Your moments are worth sharing. Here's one that might resonate." Tapping opens the share sheet for that moment; not a notification, just a card in the timeline or Reflections
- [ ] **"You've unlocked everything" state** — if a user earns all achievements, a quiet acknowledgment: "You've found everything Tracks has to offer. Now it just compounds." No fanfare — just recognition that they've explored deeply; reinforces that the value is in the archive, not the features

---

## PREMIUM — Paywall + Insights

Build the infrastructure now, launch the paywall when users have 25+ moments. Don't rush this.

### RevenueCat + Paywall **[prerequisite for everything in this section]**
- [ ] $6/month or $50/year (Plus tier)
- [ ] Events tier: $39.99 one-time per event (extended collections, QR, book export)
- [ ] Conversion trigger: at 25–30 moments, show a locked "Take Me Back" era card
- [ ] "Paywall meaning, not logging" — free users keep all capture features forever

### Data-Gated Feature Progression **[Premium retention mechanic]**
- [ ] Premium features unlock not on an arbitrary calendar but when the user's *data is mature enough for them to be meaningful* — this feels earned, not withheld
- [ ] The unlock moments create genuine "wow" beats that justify staying subscribed
- [ ] Framing matters: never say "this feature unlocks in 7 days." Say "you're close — log 5 more moments and your first pattern will emerge."

| Milestone | What unlocks | Why it requires this |
|-----------|-------------|---------------------|
| 5 moments | Early resurfacing cards (A Month Ago, Forgotten Songs) | Needs enough material to resurface anything |
| 15 moments | Mood trajectory begins — first draft of your emotional arc | Needs enough variance to be meaningful |
| 25 moments | "Take Me Back" era card appears (locked preview → conversion trigger) | Era clustering needs density |
| 50 moments | Full predictive insights, pattern-based resurfacing | Statistical patterns need volume |
| 100 moments | "What kind of music person are you" — personality insight | Needs rich annotation history |
| 1 year active | On This Day with real historical data | Literally requires a year |
| Dec 31 | Yearly Recap — "Your 2026 in Moments" | Calendar-gated, not data-gated |

- [ ] **Weekly Premium discovery** (separate from unlocking) — every Monday, a push or in-app card highlights a Plus feature the user hasn't tried yet, with a one-line explanation of why *now* is a good time to try it. Not withholding, not marketing — just guided exploration of a product that's easy to under-use.
- [ ] Progress indicator in Profile: "Your Tracks journey — X/8 chapters unlocked" — shows users how much is still ahead, makes the subscription feel like it compounds over time rather than plateauing

### "Take Me Back to This Era" **[Premium — THE conversion trigger]**
- [ ] The experience, not just the analysis — you're not showing data, you're returning someone to a chapter of their life
- [ ] At 25–30 moments, a locked era card appears in Reflections: generated name, blurred preview, "Unlock the chapter you just lived"
- [ ] Era detection: cluster moments by date, mood, artist, reflection patterns; generate a name ("Winter of Letting Go", "The Comeback Summer")
- [ ] Era experience — four surfaces working together:
  - **Artsy album art collage** — mosaic of every artwork from that period, like a visual fingerprint
  - **Auto-generated playlist** — all songs from the era, one tap to open in Apple Music
  - **Photo collage** — all photos from moments in that era
  - **AI narrative** — prose about who you were during this chapter: "In this season, you kept returning to songs about distance. Your reflections mentioned letting go 7 times."
- [ ] Shareable era card: artwork collage + era name — "This was my whole personality for 6 months"
- [ ] See `AI-FEATURES.md` for clustering approach

### Data Moat Features **[Premium — each requires intentional emotional annotation; Spotify can't replicate any of these]**

*The filter: could a streaming service produce this from play counts alone? If no, it's a moat.*

- [ ] **Emotional fingerprint of a song** — for any song, aggregate how all users emotionally tagged it: "73% nostalgic, 18% heartbreak, 9% joy." Surfaces in moment detail and song views. The first time anyone has measured what a song *means* rather than how often it was played.
- [ ] **"What kind of music person are you"** — based on your annotation patterns, a personality-style insight: *"You're an emotional processor — you log most heavily when working through something, not when celebrating."* *"You're a memory keeper — you log when a song takes you back, not when you discover something new."* Requires annotated history. Shareable. Strong Plus conversion hook.
- [ ] **Reflection theme clustering** — NLP on your reflection text, no manual tagging. Surface recurring themes you didn't consciously notice: *"The word 'letting go' appears in 23% of your reflections."* *"You mention driving in 31 moments."* Completely irreplicable without free-text emotional writing.
- [ ] **"Songs that actually helped"** — when in a low mood, surface songs from your history that you logged when feeling similar AND then logged something more positive within the following week. Your personal proof a song helped, not a generic recommendation. The music therapy feature built from your own data.
- [ ] **Cross-moment pattern recognition** — things the data shows that you didn't notice: *"You log 3x more on Sunday nights."* *"Every time your people tags drop off, your mood tags shift darker within 2 weeks."* *"You have 14 moments with Alex — 12 are tagged peaceful."* Patterns from annotated data over time.
- [ ] **Emotional DNA of an artist** — aggregate the emotional fingerprint for any artist across all users. *"Phoebe Bridgers: 64% processing grief, 22% healing, 14% nostalgia — from 4,200 annotated moments."* What an artist's catalog means to listeners, not streams. Press-worthy. Could drive artist pages publicly.
- [ ] **Trending by emotional tag** — "songs spiking in 'heartbreak' logs this week" is a Tracks-exclusive chart that Spotify cannot produce. This is the moat version of trending. Tie to cultural moments: when an album drops, show how people are emotionally logging it in real time.

### Insights Dashboard **[Premium]**
- [ ] "How You're Evolving" — current era vs. past eras
- [ ] Mood trajectory graph — mood over time, tap to jump to moment
- [ ] Music taste evolution — energy, genre, tempo trends over months
- [ ] Mood gap analysis — "You almost never log joy. The last time was 8 months ago."
- [ ] Relationship soundtracks — filter by person, stats, exportable playlist
- [ ] Mood prediction pre-fill — suggest mood based on song + your history
- [ ] See `AI-FEATURES.md` for full AI spec

### **Portfolio Centerpiece: "Take Me Back to This Era" + Emotional Intelligence System**
*This is the feature that demonstrates serious AI/ML engineering and produces something emotionally beautiful.*
- Era clustering uses feature engineering (audio features + mood + sentiment + time patterns) → unsupervised clustering (K-means / DBSCAN) → LLM integration (Claude API for era naming + narrative prose)
- Emotional fingerprint + "what kind of music person are you" demonstrates aggregate analytics + personalization + NLP
- Together: a full AI pipeline from raw annotated data → insight → beautiful output
- The demo moment: *"Here's what the system produced for my own life data."*

### Yearly Recap **[Premium]**
- [ ] "Your 2026 in Moments" — Spotify Wrapped-style, emotionally rich
- [ ] Top songs, dominant moods, most-logged people, era name for the year
- [ ] Shareable card; run as a cultural moment every December
- [ ] Wrapped tells you what you played 32,000 times. Tracks tells you why the 4th listen of one song changed everything.

### Personal Charts **[Premium]**
- [ ] Most-logged songs and artists ranked by year — like Billboard but for your actual life
- [ ] Per-year and all-time views; always-on (not just annual)

---

## SOCIAL — Highest Priority Among "Laters"

These are lower priority than Premium but higher than anything below. They're growth multipliers.

### Anonymous Stats + "You're Not Alone" **[Free]**
- [ ] Inside moment detail: "83 people logged this song during a breakup"
- [ ] Anonymous, no social graph, opt-in only
- [ ] The most shareable thing the app could produce — it's not about the app, it's about the human experience
- [ ] Requires `song_stats` table (seeded in Growth phase) + 50+ log threshold per song
- [ ] Turns a private journal into something that makes you feel connected to something larger

### Discover Surface **[Free basic / Premium generational cuts]**
- [ ] Global top songs this week — most logged across all users [Free]
- [ ] Top songs by mood — "most logged as 'heartbroken' this month" [Free]
- [ ] Trending now — songs spiking in logs (correlates with album drops, world events) [Free]
- [ ] "On repeat" — songs logged by the same users multiple times across eras [Free]
- [ ] Entirely aggregate and anonymous; makes the app feel alive even when you're not logging
- [ ] Requires meaningful user base before this surface is interesting (~1,000+ active users)
- [ ] **Generational cuts [Premium]** — demographic comparisons using `birth_year`:
  - "83% of people your age tagged this song as heartbreak. You tagged it hopeful."
  - "Your generation logs this artist more than any other right now."
  - Turns anonymous stats into personal identity — deeply shareable, worth paying for

### "With Others" Tab / Feed **[Free]**
- [ ] A fourth tab (or a section within Reflections) that aggregates everything that isn't purely personal: moments you've been tagged in + recent activity across shared collections you're a member of
- [ ] Distinct from your personal timeline — this is the social layer, the stuff that connects your memories to other people's
- [ ] **Tagged view** — moments where someone tagged you; you see their reflection + song, with an option to "add to my timeline" (creates a linked copy) or just view
- [ ] **Collections feed** — recent activity in all shared collections you belong to, newest first; shows contributor name, song, and a snippet of their reflection
- [ ] Keeps shared collections alive without requiring you to manually check each one; the feed comes to you
- [ ] No algorithmic ranking — pure chronological; the right model for an intimate product at this scale
- [ ] Empty state: "When friends tag you in a memory, or someone adds to a shared collection you're in, it shows up here." Clear value prop, no pressure to have friends yet.
- [ ] This is the feature that makes shared collections feel like a living thing rather than a static list
- [ ] Prerequisite: tagging requires the friendships system (below); collections feed can ship independently before that

### Friends + Social Tagging **[Free]**
- [ ] `friendships` table — bidirectional request/accept
- [ ] Friend discovery by display name
- [ ] When you tag a friend, creates a `tagged_moments` record; they see it in an inbox
- [ ] "Add to my timeline" or "Hide" — they control what appears in their history
- [ ] Auto-suggest shared collection when two friends have 3+ mutual song moments
- [ ] Side-by-side perspectives view: same song logged by multiple people, both reflections shown
- [ ] See `SOCIAL-ARCHITECTURE.md` for full spec

### Memory Guessing Game **[Free — social, viral potential]**
- [ ] "Here's the memory, what song do you think they chose?" — a guessing game built entirely from real logged moments
- [ ] One player's reflection is shown to friends (song hidden); friends guess the song from a multiple-choice list of 4 candidates (1 correct + 3 plausible same-era/mood songs)
- [ ] Scoring: points for correct guess, bonus for fast answer; the moment's author sees what everyone guessed
- [ ] Works in two modes: **async** (send a challenge to a friend, they answer whenever) and **live** (real-time with multiple people, like a party game)
- [ ] The loop: "I want to know if my friends really know me" → share a challenge → they play → you see results → conversation starts → they log their own memories
- [ ] Acquisition mechanic: non-users can play a challenge via web link (like Gift a Memory) — to see the full answer and play back, download the app
- [ ] Content constraint: only moments the user opts into for the game (not every memory is game material; some are private); a "make this gameable" toggle on the moment
- [ ] *Opinion: this is the most genuinely novel idea in the social section. It turns your actual memories into social currency without making the product feel gamey — the reflection is still real and personal, the game mechanic is just the delivery method. High viral coefficient if the async challenge flow works well on web. Don't build this early — needs a friend graph first — but it should be on the horizon.*

### Artist + Event Collections **[Free to join / Premium to create — way later, needs user base first]**
- [ ] Artist creates a collection for an album release: "Log your first listen to [Album]"
- [ ] Fans contribute → artist gets a genuine emotional artifact from their fanbase (emotional DNA of their album, not streams)
- [ ] Concert/festival collections — log moments from each show in real time
- [ ] Merch table integration — QR code on a card in the merch bag joins the tour collection
- [ ] Acquisition channel: one artist post → thousands of new users
- [ ] *Note: this requires enough user base to make the proposition meaningful for artists. Don't pitch this until 10,000+ users.*

---

## LATER

Worth building, not urgent.

- [ ] Web companion (full account access) — auth, timeline, moment detail, create via iTunes API; for users who want to write longer reflections on a keyboard or browse on desktop [Free]
- [ ] Handoff to Apple Music — from any moment, one tap to play the full song via `music://` deep link [Free, easy]
- [ ] Concert mode — set context once (venue, date, people), tap songs to log them quickly; auto-suggest setlist from setlist.fm API [Free]
- [ ] Full lyrics display — Apple Music MusicKit lyrics API alongside the reflection [Free]
- [ ] Listening history import — surface songs played heavily in past months, "log why?" [Free]
- [ ] Music as emotional regulation — "I'm feeling anxious" → songs from your history that helped [Free basic / Premium full]
- [ ] Through-line songs — songs that appear across multiple distinct eras [Premium, needs era clustering]
- [ ] "You're in a transition" detection — when logging patterns shift, the app notices [Premium, needs 3mo data]
- [ ] Seasonal pattern anticipation — "Last October your mood dipped. It's October." [Premium, needs 1yr data]
- [ ] Smart resurfacing — mood-matched, context-aware (not random) [Premium]
- [ ] Weekly digest email — "Your week in music" [Free]
- [ ] Grief & memorial moments — songs tied to people who have passed, surfaces on significant dates [Free]
- [ ] Mood-to-playlist export — "songs I logged as peaceful" → Apple Music playlist [Free]
- [ ] Time capsules — "Remind me of this in 5 years" [Free]
- [ ] Map view — moments by location, clustered, tap to explore [Premium]
- [ ] AI reflection prompts — "You've saved 3 moments with this artist before. What's different this time?" [Premium]
- [ ] Moment templates — concert, road trip, late night, heartbreak; pre-fill mood + prompts [Free]
- [ ] Import from Notes / Day One — parse entries, match song references, create moments [Free]
- [ ] Apple Shortcuts integration — "log current song," automation triggers [Free]
- [ ] Lock screen widget + Dynamic Island — Now Playing one-tap save, ShazamKit identify button [Free]
- [ ] Weather auto-tagging — silently attach weather at creation; enables "rainy day songs" [Free]
- [ ] Legacy mode — designate someone to receive your collection [Premium]
- [ ] Referral program — gift 3 months Plus, get 1 month free; ship once paying base exists [Free mechanic]
- [ ] Printable moment card — styled high-res PNG export of a single moment (album art, song name, date, reflection snippet); generated client-side via `react-native-view-shot`; user saves to camera roll and prints wherever; no backend needed; shareable/viral; this is the free step before in-app print fulfillment [Free]

---

## SOMEDAY

If the product is healthy and the team grows.

- [ ] Android — doubles the addressable market; not soon
- [ ] Apple Watch app — one tap on wrist logs current Apple Music song; minimal UI; draft saved for later
- [ ] Full in-app playback (Apple Music / Spotify Premium) — 30s previews are fine for now
- [ ] Multiple songs per moment — requires data model + UX changes
- [ ] Offline support — queue uploads when offline
- [ ] Export / backup — download your data
- [ ] Accessibility — VoiceOver, dynamic type
- [ ] Spotify full integration — native playback/auth (cross-search is done)
- [ ] Physical book (print-on-demand) — annual "year in music" book; QR codes link each page to the song so it plays when you point your phone at it; see monetization section for full product thinking
- [ ] Printable moment cards — individual moments exported as styled high-res images (song, photo, reflection, date); downloadable for printing at Walgreens/CVS; ideal for dorm walls, gifts, journals; free tier gets the download, Premium gets in-app print fulfillment (see LATER for the free download step)
- [ ] QR codes on individual moments — physical-digital bridge for journals, gifts, photo walls
- [ ] Playlist journals — create a playlist where each song has a reflection; export to Apple Music

---

## Monetization

### Philosophy
Paywall meaning, not logging. The person scanning a QR code at a wedding and logging their first memory should never see a paywall. The person who discovers they've built a coherent emotional chapter of their life — that's when you ask for money.

Get users first. Let usage data and user feedback drive exactly what to charge for. The free tier must be genuinely good or none of this works.

### Free Tier Limits
| Feature | Free limit |
|---------|-----------|
| Moments | Unlimited forever |
| Photos per moment | 3 |
| Video | Not available (Premium) |
| Shared collections you *create* | 3 |
| Shared collections you *join* | Unlimited |
| All capture features | Unlimited |
| Timeline, resurfacing, prompts | Unlimited |

### Subscription Tiers

| Tier | Price | What you get |
|------|-------|-------------|
| **Free** | $0 | Everything above; the full logging experience |
| **Tracks Plus** | $6/mo or $50/yr | Everything below |
| **Tracks Events** | $39.99 one-time per event | Extended collection (500+ contributors), QR code generation, event analytics, book export eligibility |
| **Tracks Book** | $89 softcover / $149 hardcover | Print-on-demand with QR-linked songs; ordered per collection |

**Tracks Plus includes:**
- Unlimited photos per moment
- Video moments
- Unlimited shared collection creation
- "Take Me Back to This Era" — the full era experience (collage, playlist, photos, AI narrative)
- Generational Discover cuts — how your generation connects with songs vs. everyone else
- Insights dashboard (mood trajectory, taste evolution, pattern recognition, mood gap analysis)
- AI narrative summaries and musical autobiography
- Smart resurfacing (context-aware, not random)
- Yearly Recap ("Your 2026 in Moments")
- Personal Charts (most-logged songs/artists by year, all-time)
- Through-line songs (songs that span multiple eras)

**Conversion trigger:** at 25–30 moments, a locked "Take Me Back" era card appears in Reflections. User can see the generated era name and blurred collage. They can't unlock it without Plus. That's the moment.

### Additional Revenue Streams

**Gift subscriptions — with pre-seeding** — buy someone a year of Plus, but with a twist: the giver can add 3–5 songs when purchasing the gift ("songs I think of when I think of you / them"). Recipient opens the app to a pre-populated set of songs waiting for them with a note: "Josh added these for you. What do they remind you of?" Forces the first moment in a way a blank app never would. Especially powerful for gifting to a parent or grandparent — you can pre-configure their generational era and seed their favorite songs so day 1 is immediately personal, not cold. Primary gifting occasions: Mother's Day, Father's Day, milestone birthdays (50th, 60th), anniversaries. *"Give your mom somewhere to put all those songs she keeps mentioning."* RevenueCat supports gift subs natively; the pre-seeding is a lightweight custom flow on top.

**Artist & label partnerships** — artists create official collections for album releases; they pay for analytics ("here's how fans emotionally responded to each track") and the cultural artifact. Indie artists free to drive adoption; major label campaigns paid placement.

**B2B music therapy** — therapists assign music journaling between sessions. Therapist-tier ($15–25/month): assign prompts, view client engagement (with consent). AMTA has 4,000+ members. Low acquisition cost, high LTV, zero consumer marketing needed.

**Physical book margin** — $149 hardcover at ~$45–55 print cost = ~$95 gross margin per book. Artifact Uprising charges $200 for a beautiful-but-silent book. Tracks books play music — point your phone at any page, the song from that moment plays. That's a genuinely different product category, not just a photo book with better paper. Positioned below Artifact Uprising on price, above Chatbooks on intention. The QR audio + emotional reflections + playlist page at the back is the differentiator. One wedding photographer who recommends it to every client makes this revenue meaningful.

*Premium + book bundle:* Tracks Plus subscribers get a meaningful discount on their annual book (e.g. 20–30% off, or one softcover included with the yearly plan at ~$50/yr). This gives Plus an additional reason to stay subscribed year-round even for light users, and makes the annual plan feel like a no-brainer if the user is already planning to buy a book. Alternative framing: the book is the annual plan's "gift to yourself" — pay for Plus, get your year in music on your shelf. Print partner candidates: Chatbooks (API-friendly, partnership programs), Artifact (AI-organized layouts), Blurb (has a developer API), Prodigi (global fulfillment). Prerequisite: public moment page URLs for QR codes to resolve.

**Growth levers — acquisition channels worth thinking about now even if not built yet:**

*Organic / content*
- **Spotify Wrapped counter-programming** — every December, people are in active music reflection mode. A campaign timed to Wrapped costs nothing: *"Wrapped tells you what you played 32,000 times. Tracks tells you why the 4th listen of one song changed everything."* Moment cards are already shareable; the cultural moment exists once a year, use it.
- **The "100 songs" challenge** — structured prompt: log 100 songs that defined your life. Share the collection publicly. Creates massive shareable content, each piece links back to the app. Seeded by a handful of users with audiences, spreads from there.
- **Shareable moment cards as organic ads** — every card shared on Instagram/TikTok is a free impression with emotional context attached. The card format is already built. The job is to make the card beautiful enough that sharing feels like self-expression, not promotion.
- **"What song takes you back" trend format** — the Instagram comment with 2,962 likes is the thesis. This emotional reaction is already happening in comments on music posts. Tracks is where it lives permanently. Seed a TikTok/Reels format, let it find its own energy.

*Earned media*
- **Press / editorial** — *"Emotional music journal"* is a distinctive angle in music tech, which is otherwise dominated by streaming. Music publications (Pitchfork, The Ringer, NME), journaling publications, lifestyle. One good feature article changes the install trajectory at this stage more than any paid channel. Write the pitch around the Instagram comment quote — it's the hook.
- **Music therapy angle** — music therapy is a real clinical discipline (AMTA: 4,000+ certified therapists). A therapist recommending Tracks as between-session homework = multiple installs per therapist referral, high-LTV users. Email outreach to a small number of therapists costs nothing. If it works, it's a channel. Write a one-page explainer on what the app does for emotional reflection.

*Gifting occasions as acquisition events*
- **Milestone birthdays** — turning 40, 50, 60, 70 is a natural "reflect on your life's soundtrack" moment. The gift pitch writes itself: *"Forty years of songs. Here's somewhere to put them."* Different from a generic gift sub — it's positioned as a life-archive tool, not an app subscription.
- **Mother's Day / Father's Day** — the highest-signal gifting occasion for this product. "Give your mom somewhere to put all those songs she keeps mentioning." The intergenerational angle (pre-seed their era + songs) is uniquely Tracks; no other journaling app can do this.
- **Anniversaries** — *"It's your 10th anniversary. What was your first dance song? What were you listening to the week you met?"* Time-boxed gifting trigger with a specific emotional prompt. Could be a landing page.

*Community channels*
- **Playlist communities** — people who build playlists on Spotify, rate music on RateYourMusic, participate in music subreddits already annotate music. They're the ideal early user. Tracks is the next step from a playlist with descriptions. Seeding in these communities (genuinely, not spammy) finds the users who will log the most.
- **Musicians as users** — musicians who publicly journal about songs that influenced them have audiences of people with the same taste and emotional relationship to music. One musician who uses Tracks publicly = their fans as the highest-quality possible leads.

**Aggregated data licensing** — anonymized, explicitly consented emotional music data is valuable to labels, streaming services, and music researchers. Plant this flag now in the privacy policy. Years out, but the data moat is real and accumulates from day one.

**Premium share card templates** — additional visual styles beyond the default card. Small unlock, adds perceived value to Plus.
