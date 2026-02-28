# Tracks — Roadmap

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
- [x] Push notifications — On This Day, milestones
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

---

## NOW — Pre-Launch Checklist (9 items)

Everything here ships before App Store marketing push. Estimated 3–4 weeks total.

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | Privacy policy + Terms | 1 day | Required for submission |
| 2 | Deferred deep links | 2 days | Launch blocker |
| 3 | Onboarding tightening | 2 days | Determines activation rate |
| 4 | App Store listing + assets | 2–3 days | Screenshots, copy, Sentry, PostHog |
| 5 | Memory prompts | 2 days | Day 3–30 retention bridge |
| 6 | Early resurfacing | 1 day | Works after 30 days, not a year |
| 7 | Gift a Memory | 3–4 days | Warm acquisition loop |
| 8 | ShazamKit | 3–4 days | Closes ambient capture gap |
| 9 | Share from Photos | 2 days | Camera roll → memory trigger |

---

### 1. Privacy Policy + Terms of Use
- [ ] Hosted at `music-memory-app.vercel.app/privacy` and `/terms`
- [ ] Privacy policy must cover: email/Apple ID, reflection text, mood data, photos, location (EXIF), voice notes (future), push notification tokens, anonymous analytics
- [ ] Explicitly address: what goes to third parties (Supabase, Branch.io, PostHog, Sentry, Apple), data retention, account deletion (already built), user rights
- [ ] Emotional data deserves honest language — not just legal boilerplate
- [ ] Terms of Use: acceptable use, content ownership (user owns their reflections), no liability for data loss
- [ ] Both documents need a "last updated" date and contact email

### 2. Deferred Deep Links (Branch.io)
- [ ] Without this, shared collection invites break after App Store install — the invite code is lost
- [ ] Smart CTA: try `tracks://` first, fall back to App Store with code stored for after install
- [ ] Without this, the entire shared collections growth loop is broken for cold users

### 3. Onboarding Tightening
- [ ] Current flow exists but the activation moment — first saved moment — must be guaranteed
- [ ] Onboarding should not end until the user has logged at least one memory
- [ ] Collection-origin users (wedding, event) get a different flow: "This moment is yours now. Not just theirs. Let's build on it."
- [ ] Show their personal timeline immediately after first save — not the collection view
- [ ] Plant the hook: "On This Day next year, we'll remind you of this moment."

### 4. App Store Listing + Assets

**Crash reporting — Sentry**
- [ ] Install `@sentry/react-native`, configure DSN, wire up in app entry point
- [ ] Captures crashes, JS errors, network failures with full stack traces
- [ ] Requires native rebuild; free tier is sufficient

**Product analytics — PostHog**
- [ ] Install `posthog-react-native`, configure project key
- [ ] Free tier: up to 1M events/month
- [ ] Key events to wire up: `onboarding_started`, `first_moment_created` (the activation event), `onboarding_completed`, `moment_created`, `shazam_identify_tapped`, `shazam_success`, `prompt_used` (+category), `share_card_shared`, `collection_joined`, `gift_sent`, `reflections_tab_opened`, `on_this_day_tapped`, `notification_opened` (+type), `paywall_shown`, `subscription_started`
- [ ] Primary funnel: `onboarding_started → first_moment_created → moment_created (7 days later)` — this tells you activation + early retention at a glance

**In-app feedback**
- [ ] "Send Feedback" option on Profile screen → opens Mail with pre-filled subject "Tracks Feedback"
- [ ] Use a dedicated email address (not personal): `hello@tracks.app` or similar
- [ ] Separate from crash reporting — captures qualitative input, feature requests, complaints

**App Store Connect — required fields**
- [ ] App name (max 30 chars): "Tracks"
- [ ] Subtitle (max 30 chars): "Music Memory Journal" or "Your Songs. Your Memories."
- [ ] Description (max 4,000 chars) — lead with the emotional hook, not the feature list
- [ ] Keywords (max 100 chars total) — music journal, memory, songs, moments, music diary, reflection, Apple Music
- [ ] Support URL — the feedback email or a simple web page
- [ ] Privacy policy URL — `/privacy` (see item 1)
- [ ] Category: Music (primary), Lifestyle (secondary)
- [ ] Age rating — complete questionnaire (no mature content, no user-generated sharing to public)
- [ ] Copyright: "© 2026 [Your Name]"
- [ ] Demo account credentials for App Review team (they need to log in and use the app)
- [ ] Review notes — explain Now Playing, share extension, any non-obvious flows

**App Privacy nutrition labels (App Store Connect)**
- [ ] Data used to track you: none (don't check this unless you're running cross-app tracking)
- [ ] Data linked to you: email address, name, photos, user content (reflections, moods), usage data
- [ ] Data not linked to you: crash data (Sentry), diagnostics (PostHog if anonymized)

**Sentry alerts**
- [ ] Configure Slack or email alerts for new error types hitting production — without this you're blind between App Store review sessions

**Supabase Pro — upgrade before launch**
- [ ] Free tier: 1 day log retention, no automated backups
- [ ] Pro ($25/month): 7-day logs, daily automated backups — non-negotiable for an app storing personal emotional data

**RLS security audit — before launch**
- [ ] Manually verify: can User A read User B's moments? Can unauthenticated requests read anything private?
- [ ] Audit every policy in Supabase dashboard — a data leak on emotional/personal content is catastrophic
- [ ] Not a tool — an hour of careful review

**Infrastructure notes — AWS not needed**
- [ ] Storage: Supabase Storage (S3-compatible, CDN built in) covers photos, voice notes, video
- [ ] Serverless: Supabase Edge Functions cover all backend logic
- [ ] Cron jobs: `pg_cron` via Supabase for `song_stats` daily pre-compute
- [ ] Vector search: `pgvector` built into Supabase — no Pinecone needed for AI features
- [ ] Email: Resend or Loops for transactional/digest email (simpler than SES)
- [ ] Video (when built): Cloudflare Stream — no AWS MediaConvert complexity
- [ ] AI: Anthropic API (narratives) + OpenAI Whisper (transcription) via Edge Functions

**Screenshots**
- [ ] Required: iPhone 6.7" (Pro Max size)
- [ ] Recommended: iPhone 6.5" and 5.5"
- [ ] 3–6 screenshots; first one is the most important — show the emotional moment, not the feature
- [ ] Caption each screenshot with benefit language, not feature names ("Songs that take you back" not "Timeline View")
- [ ] Optional: 30-second App Preview video — significantly improves conversion

### Memory Prompts **[Free]**
- [ ] Rotating contextual starters that surface when the user doesn't know what to log
- [ ] Organized into categories; user picks a prompt then it pre-fills the reflection placeholder
- [ ] Lives in 4 places: create screen (when opened blank), Reflections tab (below On This Day), timeline empty state, weekly push notification

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

### Early Resurfacing **[Free]**
- [ ] On This Day requires a year of data — dangerous gap in early retention
- [ ] "A month ago, you logged this" — resurfaces after just 30 days
- [ ] "Your earliest memory in Tracks" — works from day 1 if they have any moments
- [ ] "A moment you haven't revisited in a while" — works after a few weeks
- [ ] "From a year like this one" — surfaces moments from the same month in past years
- [ ] These live in the Reflections tab alongside On This Day as cards

### 30-Day Retention Plan
| Day | Hook |
|-----|------|
| 0 | First moment saved before leaving onboarding |
| 0 | Collection users: "This moment is yours forever" reframe |
| 1 | Push: "What song have you had in your head this week?" |
| 3 | Prompt push: category from their likely entry point (e.g. wedding → People prompts) |
| 7 | "You've logged X moments" + a prompt to continue |
| 14 | Forgotten song (if any) or another contextual prompt |
| 30 | Mini recap card: "Your first month in Tracks" |

---

## WEDDING READY

The wedding is a Trojan horse. Guest scans QR → contributes a memory → gets prompted to download → their contribution becomes their first personal moment. One event, potentially 50–150 installs.

### Web Contribution Form (no account required) **[Free to contribute / Events tier to unlock]**
- [ ] Guest navigates to `music-memory-app.vercel.app/c/{invite_code}/contribute`
- [ ] Song search via iTunes Search API (public, no auth needed)
- [ ] Reflection text, optional photo upload
- [ ] Submits without an account — guest UUID stored in browser localStorage
- [ ] Web server inserts via service role key (RLS doesn't block it)
- [ ] After submit: "Want to keep this memory on your own timeline? Download Tracks — this will be your first moment."
- [ ] After sign-up: claim flow links guest token's moments to new user_id
- [ ] RLS update: allow guest inserts to collections with valid invite code

### QR Code Generation **[Events tier]**
- [ ] Collection owner taps "Get QR Code" → generates QR pointing to `/c/{code}/contribute`
- [ ] Full-screen display for easy scanning at venue
- [ ] Downloadable as image for printing on table cards, programs, venue signage

*ShazamKit moved to Growth — it's a core everyday capture feature, not event-specific. See Growth section.*

### ShazamKit Native Module **[Free]**
- [ ] Custom native module (same pattern as existing NowPlaying module)
- [ ] Wraps Apple's ShazamKit framework — microphone → 3-second audio fingerprint
- [ ] Identifies ambient audio *anywhere*: restaurant, street, bar, store, someone else's car, a wedding DJ, a concert stage
- [ ] Cross-references `SHMediaItem` result against MusicKit for full song metadata
- [ ] Microphone permission; "Identify" button on the create screen alongside search
- [ ] Eventually: lock screen widget "Identify" tap for zero-friction ambient capture

**The use case that defines this feature:**
You're walking down the street. A restaurant is playing a song that immediately takes you back. You tap Identify — 3 seconds — the song resolves. You write the memory right there on the sidewalk. That moment would have been lost. That *is* the Instagram comment with 2,962 likes. ShazamKit captures it.

| | Now Playing | ShazamKit |
|---|---|---|
| Detects | Music playing *through your device* | Music playing *anywhere near you* |
| Trigger | You chose to play it | It found you |
| Examples | Your own Spotify, Apple Music | Restaurant, street, friend's speakers, wedding, concert |

### Share from Photos **[Free]**
- [ ] User is in camera roll → old photo inspires a memory → taps Share → selects Tracks
- [ ] Share extension updated to accept image file types (NSExtensionActivationSupportsImageWithMaxCount)
- [ ] Create screen opens with photo pre-filled, EXIF date + location auto-populated
- [ ] User adds the song → moment saved
- [ ] Closes the gap: a visual trigger (old photo) pairs with a musical memory

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

### Gift a Memory **[Free]**
- [ ] Log a moment and send it privately to one person — not a collection, a direct gift
- [ ] Recipient gets a web link (no account required to view): song + your reflection
- [ ] To reply with their own memory of that song: download the app
- [ ] Acquisition through emotional resonance — the highest quality install you can get
- [ ] No new data model beyond a share token on the moment
- [ ] Requires public individual moment pages on web (`/m/{moment_id}`)

### Lyric Anchoring **[Free]**
- [ ] When logging, optionally highlight a specific lyric as the emotional anchor
- [ ] Stored as `lyric_anchor` field on the moment
- [ ] Displayed prominently on detail view — the exact line that hit you
- [ ] Years later, the lyric is more specific and powerful than just the song title
- [ ] Surfaced after song is selected; optional, zero friction

### Voice Notes **[Free]**
- [ ] Record a voice note alongside (or instead of) typed reflection — expo-av already installed
- [ ] Record to local file → upload to Supabase Storage (same pattern as photos)
- [ ] `audio_url` field on moments; playback on detail view
- [ ] Your actual voice, from that moment in time — photos and text can't replicate this
- [ ] Optional: pipe through OpenAI Whisper edge function for transcription + searchability
- [ ] Hear your own voice from the past — deeply personal, no other app does this

### Plant Seeds for Anonymous Stats / Discover **[Free — data-seeding tasks]**
- [ ] `birth_year` — optional field on profiles at onboarding ("helps us show how your generation connects with music"); seed now, data compounds over time
- [ ] `song_stats` table — pre-compute daily: song_id, mood, log_count, week; start accumulating before the UI exists
- [ ] Minimum threshold: 50+ logs per song before any percentages are shown
- [ ] These are infrastructure tasks; the UI comes in the Social phase once data exists

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

### Mood Streaks / Gentle Gamification **[Free]**
- [ ] "You've reflected 4 days this week" — warm, not competitive
- [ ] Monthly recap card ("You saved 12 moments in February")
- [ ] Seasonal milestones; keep it journal-toned, not fitness-toned

---

## PREMIUM — Paywall + Insights

Build the infrastructure now, launch the paywall when users have 25+ moments. Don't rush this.

### RevenueCat + Paywall **[prerequisite for everything in this section]**
- [ ] $6/month or $50/year (Plus tier)
- [ ] Events tier: $39.99 one-time per event (extended collections, QR, book export)
- [ ] Conversion trigger: at 25–30 moments, show a locked "Take Me Back" era card
- [ ] "Paywall meaning, not logging" — free users keep all capture features forever

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

### Friends + Social Tagging **[Free]**
- [ ] `friendships` table — bidirectional request/accept
- [ ] Friend discovery by display name
- [ ] When you tag a friend, creates a `tagged_moments` record; they see it in an inbox
- [ ] "Add to my timeline" or "Hide" — they control what appears in their history
- [ ] Auto-suggest shared collection when two friends have 3+ mutual song moments
- [ ] Side-by-side perspectives view: same song logged by multiple people, both reflections shown
- [ ] See `SOCIAL-ARCHITECTURE.md` for full spec

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
- [ ] Physical book (print-on-demand) — the long-term events revenue play; needs public moment pages first
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

**Gift subscriptions** — buy someone a year of Plus. Especially powerful at Valentine's Day, birthdays, anniversaries. *"I want you to have somewhere to put this."* High emotional fit. RevenueCat supports this natively.

**Artist & label partnerships** — artists create official collections for album releases; they pay for analytics ("here's how fans emotionally responded to each track") and the cultural artifact. Indie artists free to drive adoption; major label campaigns paid placement.

**B2B music therapy** — therapists assign music journaling between sessions. Therapist-tier ($15–25/month): assign prompts, view client engagement (with consent). AMTA has 4,000+ members. Low acquisition cost, high LTV, zero consumer marketing needed.

**Physical book margin** — $149 hardcover at ~$45–55 print cost = ~$95 gross margin per book. Artifact Uprising charges $200 for a beautiful-but-silent book. Tracks books play music — point your phone at any page, the song from that moment plays. That's a genuinely different product category, not just a photo book with better paper. Positioned below Artifact Uprising on price, above Chatbooks on intention. The QR audio + emotional reflections + playlist page at the back is the differentiator. One wedding photographer who recommends it to every client makes this revenue meaningful.

**Aggregated data licensing** — anonymized, explicitly consented emotional music data is valuable to labels, streaming services, and music researchers. Plant this flag now in the privacy policy. Years out, but the data moat is real and accumulates from day one.

**Premium share card templates** — additional visual styles beyond the default card. Small unlock, adds perceived value to Plus.
