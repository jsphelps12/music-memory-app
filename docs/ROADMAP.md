# Soundtracks — Roadmap

> Rewritten 2026-10-17. The previous roadmap (165 KB: shipped history, specs,
> monetization plans, feasibility research) is archived at
> [`archive/ROADMAP-2026-10.md`](archive/ROADMAP-2026-10.md). Look there for
> *why* something was built or rejected; plan from this file.

## What this is

A personal music journal. Three kinds of entry, all first-class:

- **A song that brought something back** — the original idea.
- **New music you're exploring** — present tense, most days.
- **A journal entry with a song attached** — the song is the anchor; the
  writing is the point.

It is built for Josh first: for fun, and super slick. Friends are welcome but
nothing is designed around them (they tried it; they didn't stay).

**North star: Josh opens it most days, and it feels good to.** Every item
below should move that, or it doesn't belong on this page.

## Principles

- **An entry is a song plus whatever you feel like writing**, from nothing to
  pages. Photos, people, mood and place are optional and stay out of the way.
- **Fewer, better surfaces.** Cutting a feature that doesn't earn its place is
  progress.
- **Pull, don't nag.** The app should come to you with something worth
  reacting to. Never notify on the *absence* of activity (the 2026-07 "Still
  there?" spam: an absence condition stays true forever).
- **The no-app recipient gets the whole memory.** `/m/` delivers the card,
  preview and photos; any install ask is secondary and never a gate.
- **AI may ask, organize, resurface and narrate. It never writes the
  reflection.** Your words are the asset.
- **Never paywall capture or your own history.**
- **Every surface is a screen or a quick pick** (no pageSheet cards).

## Where things stand (2026-10-19)

- **1.2.0 (build 8) is live** on the App Store (auto-released after review):
  Sharing v2, the Reflections reorg, expo-audio, the min-build gate, the
  push-registration fix and Spotify hardening.
- **1.3.0 is being cut:** the Phase 1 redesign, the full-page writer and
  drafts, the capture widget and controls, the new launch screen. Release
  manually after approval; later JS polish goes out via Promote to
  Production.
- **Usage:** 77 users; 10 created a moment in the last 90 days. Josh's own
  last moment: 2026-08-05. Friends tried it and drifted.
- **Beta:** Soundtracks β build 33 (staging) gets every merge to `main` OTA.
  Weekly Health and E2E crons run Mondays; see `DEPLOY.md`.

## Now

### Ship 1.2.0
- [x] App Review approval → released (automatic release, 2026-10).
- [ ] Watch Sentry and PostHog for a week.

### Ship 1.3.0
- [x] Version bump + beta build 33 (PR #45).
- [x] Production build 9 (owner ran it interactively to create the App Store
  widget profile) → submitted to App Store Connect 2026-10-19.
- [x] App Store Connect: 1.3.0 version, build 9, six 6.9" screenshots,
  What's New, new subtitle/keywords/description, **manual release**;
  submitted for review 2026-10-19.
- [ ] On approval: check build 9 on TestFlight, then release manually.
- [x] E2E green on `main` so the promote path works for JS fixes (PR #33:
  search-input race fix, Maestro driver-death retry, seed no longer signs out
  testers).

### Phase 1 — Feel
*Cleaner, more intuitive, professional-grade; capture in two taps.*
Owner's read: "doesn't feel great" — colors, generic menu icons, borders,
clutter, navigation.

- [x] **Design critique of every screen** (2026-10-17, on a seeded staging
  journal). Diagnosis: beige bordered boxes everywhere (dark mode already looks
  better because the boxes recede), four section-header styles, a clashing
  orange→purple gradient, emoji moods, generic icons, "Albums" meaning two
  things, form-like capture, detail-screen contrast failing on scroll.
- [x] **Clickable mockups** of Journal, Capture, Entry, Rediscover, You and
  dark mode (design canvas, 2026-10-17); reacted to before any code.

**Decided 2026-10-17:**
- **Three tabs + capture:** *Journal* (timeline; calendar and **map** stay as
  views; search in the header; shared-with-you inline only when it exists),
  *Rediscover* (On This Day, rewinds, later Phase 2), *You* (profile, albums,
  friends, settings).
- **Moods become words:** quiet text tags, no emoji.
- **Let the artwork be the color:** borderless surfaces, one accent used
  sparingly, no gradient, SF Symbols (`expo-symbols`) for icons, serif for
  titles only, long writing in a readable roman, one section-header style.

- [x] **Restructure navigation** to the three tabs above (PR: Phase 1a). Albums
  moved to a pushed `/albums` screen reached from You; the capture button
  floats; shared-album activity badges You as a dot.
- [x] **Tokens and type** (Phase 1a): Newsreader for journal text, AA-passing
  secondary/tertiary text, `divider` and `elevated` tokens, ink active tab.
- [x] **Journal rows** (Phase 1a): every moment list loses the card box;
  tap the artwork to play (equalizer while playing), moods as words,
  floating mini player, list/calendar/map segmented control. (The "Shared
  with me" pills went in Phase 1e; see You.)
- [x] **Visual system refresh:** palette, fewer borders and nested cards, one
  section-header style, serif titles and a reading face (Phases 1a–1f).
- [ ] **One coherent icon set:** SF Symbols (`expo-symbols`) instead of
  Ionicons. Native, so it rides the next binary.
- [x] **Two-tap capture** (Phase 1c): song first, and the Apple Music track
  playing now fills it in by default (a "Playing now" eyebrow says so;
  "Different song" / "Identify" sit under it, and Identify drops its match
  straight in). Then a borderless Newsreader page with "What's this song
  doing for you?", starter chips ("It takes me back to…", "Just found
  this…", "Today I…", "More prompts") while it's empty, and Save in the top
  bar. Details are a chip bar riding the keyboard (Photo, Mood, People,
  Place, date, Album); each opens a quick-pick sheet and then names its
  value. Moods are words in a wrapped picker everywhere. The writing area is
  uncontrolled: a controlled value plus `focus()` in one tick crashed RN
  0.81 natively.
- [x] **Entry screen** (Phase 1b): the blurred artwork lives in a hero band
  that scrolls away, so writing always sits on paper; a paper bar fades in
  under the Dynamic Island; ink date eyebrow with weekday, time of day and
  place; serif title over "Artist · Album"; compact play row with inline
  scrubber; Newsreader roman with real paragraph spacing; moods as words,
  "With Sam and Priya". Photos: clean full-bleed first photo with a "1 / 3"
  count (tap opens the viewer) and a strip of the rest; the swipeable hero
  was dropped because it fights swipe-to-dismiss.
- [x] **A real writing view** for long entries (Phase 1g): "Full page" on
  capture and edit opens `app/write.tsx`, a full-screen page in the reading
  face with the song up top, a word count and Done (hand-off through
  `lib/writingSession.ts`). Capture now keeps a draft (`lib/captureDraft.ts`,
  per user, a week): writing survives Cancel, a crash or iOS killing the app,
  and comes back with "Picked up where you left off · Start fresh".
- [x] **Rediscover** (Phase 1d): On this day leads with its oldest memory as
  a hero (132pt artwork, "7 years ago", Newsreader excerpt) and lists the
  rest as compact rows; Weekly Rewind reads "From September 2026"; the boxed
  mood tiles, gradient person avatars and year pills became four "Browse by"
  rows (Mood, People, Year range, Album), each a quick-pick sheet into the
  existing drill-downs; Surprise me keeps its shuffle. Eyebrow headers,
  borderless search, ink empty-state button.
- [x] **You + Settings** (Phase 1e): You is a quiet header (avatar, name,
  "11 entries since August", gear), **Shared with you** (latest three with
  unread dots, "See all" → `app/shared.tsx`), **Albums** as a two-column
  grid of artwork mosaics with "New album", then Friends and Music service
  rows. The stats dashboard, all-time favorites, this-month and milestone
  badges are gone. Notifications, prompts, invite, help, feedback, sign out
  and delete account moved to `app/settings.tsx`. The Journal's My Moments /
  Shared with me pills are replaced by a "1 new from friends" row that only
  shows when something's unread.
- [x] **Browse drill-downs** (Phase 1f): mood, person, year and album share
  `components/BrowseScreen.tsx`: back, a count eyebrow, a display title
  ("Nostalgic", "With Sam", "2019", the album over its artist), one pill
  switcher that leads with where you came in, and Journal rows. The "When"
  bar (`DistributionBar`) is gone; custom moods now appear in the mood
  switcher. Entry dates outside the current year now carry the year
  everywhere ("Oct 17, 2019"), since these lists have no month headers.
- [x] **Quick fixes:** "1 moments" pluralization (browse drill-downs, Phase
  1d); album covers as an artwork mosaic instead of a gradient placeholder
  (`components/AlbumMosaic.tsx`, on You and the Albums screen, Phase 1e);
  detail screen contrast and Dynamic Island overlap (Phase 1b).
- [x] **New App Store assets:** six 6.9" screenshots (1320×2868) in
  `docs/app-store/screenshots/` (Journal, entry, capture, widget, On this
  day, dark entry), framed by `scripts/frame-screenshots.py` from simulator
  captures of staging E2E Two. Upload with the next version (screenshots are
  locked while a version is in review). The iOS 27 product-page header is
  still optional and not made.

## Next — Phase 2: Pull
*The app comes to you with something worth reacting to.*

- [x] **Capture from anywhere** *(owner's favorite)*: `targets/widget`
  (via `@bacons/apple-targets`, iOS 17+): Home Screen small (capture) and
  medium (capture + Identify), Lock Screen circular / rectangular / inline,
  and iOS 18 controls "Capture a song" and "Identify a song" for Control
  Center, the Lock Screen buttons and the Action button. Each deep-links to
  `/create` (`?identify=1` starts listening). Rides a binary: the preview
  build first, then the next App Store version.
- [x] **Launch screen** (with the widget, 2026-10-17): the big logo on
  near-white became the app's paper (dark in dark mode) with a small serif
  wordmark, held until routing resolves and faded into the first screen, so
  a cold launch from a widget reads as the app opening onto Capture. It
  used to hide at font load and show a blank spinner screen in between.
- [ ] **Log what's playing without opening the app** (App Intent that saves
  the now-playing song straight to the journal, with a "write later" nudge).
  Needs an app group + the auth token in a shared keychain; the widget above
  opens the app instead.
- [ ] **Face ID lock** (journaling-app standard; makes private writing feel
  safe).
- [ ] **Export** your journal (PDF / plain text): trust that the words are
  yours.

- [ ] **"Songs you used to love."** Prototype on device: Apple Music library
  play counts and last-played dates (MediaPlayer `playCount` /
  `lastPlayedDate`) → *"You played this 140 times in 2023. What was going
  on?"* Unverified until the prototype runs on a real library.
- [ ] **Replay playlists.** Apple Music saves "Replay YYYY" to the library:
  ranked, per-year snapshots → *"your #3 song of 2019."*
- [ ] **"On repeat today?"** Diff recently played on app foreground. Sampled,
  not background (claiming background audio to observe playback is an App
  Review risk — don't).
- [ ] **Something new to explore:** MusicKit personal recommendations (Apple
  Music subscribers).
- [ ] **On This Day that plays:** notification → tap → the song starts → your
  words from years ago.

Feasibility notes (what APIs can and can't see) are in the archive under
"Product ideas + feasibility findings — 2026-08-02". Key fact: dated play
history is not available from any API; Replay playlists and library metadata
are.

## Later — Phase 3: Payoff
*Reading your journal back is the reward for writing it.*

- [ ] **Your month in songs:** a monthly view of what you logged and played.
- [ ] **Year in review**, December being the natural moment. AI narration is
  allowed here (delight over accuracy, once a year).
- [ ] **Reading experience:** browsing and search that make the archive a
  pleasure, not a list.
- [ ] **Thin-archive states:** Reflections strips show a teaser instead of
  disappearing when there's little data.

## Not now

Monetization, growth and invite loops, more social (friend feeds, linked
moments), new Spotify work beyond keeping it working, printed books, the
Music Memory Engine questionnaire/ML, weddings and events, Android.

## Monetization (when the habit exists)

Not before Josh uses it most days for a month *and* a few dozen people use it
weekly; charging earlier teaches nothing.

- **Free forever:** capture, writing, reading your own history.
- **Paid depth** (small subscription priced like a journaling app; test the
  number): the Phase 2 intelligence, rich recaps, more media storage, maybe AI
  reflection help. Phases 2–3 are built so they can become this tier without a
  redesign.
- **One-time keepsakes:** a printed "year in songs", gifts like "our
  relationship in 20 songs". Seasonal, high-value, no scale required.
- **Never:** ads, selling data, gating the basics.

## Tech and backend

- [x] **Weekly checks self-heal** (2026-10-14): staging keepalive, E2E
  rebuilds expired simulator archives, fingerprint scripts read eas-cli v24
  JSON.
- [x] **Binary Build submits the build it made** (PR #30).
- [x] **Signed-out access to SECURITY DEFINER RPCs** closed (PR #31): the
  PUBLIC grant was never revoked; applied to both projects, advisor findings
  gone in production.
- [x] **Migration PRs dry-run on staging** instead of failing for being
  pending (PR #31): each pending migration runs inside a rolled-back
  transaction; production never runs PR SQL.
- [x] **Song-search input race + Maestro hardening** (PR #33).
- [x] **Tighten the iTunes preview matcher:** it accepted "Electric Feel
  (Justice Remix)" for "Electric Feel". The version descriptor (remix, live,
  acoustic, edit, "Taylor's Version"…) is now part of the match, both ways: the
  original never gets a remix's preview, and a remix you picked gets its own,
  not the original's. Picking remixes is unaffected; this is only the preview
  clip for Spotify songs.
- [x] **Version line in Settings:** binary version/build plus which OTA bundle
  is running ("built-in bundle" if none), so a phone that isn't picking up beta
  updates is visible from the phone.
- [ ] **Build-23 caboose:** drop `tagged_moments`, `moment_reactions`,
  `collection_invites`, `moments.visibility`, `profiles.profile_visibility`,
  three RPCs and `notify-friend` once build 7 is gone from PostHog (the
  min-build gate can force it).
- [ ] **Leaked-password protection** (Supabase Auth dashboard toggle; check
  plan support).
- [ ] **Pin `eas-cli`.** It runs unpinned via `npx`; v24's JSON rename broke
  the fingerprint gate silently.
- [ ] **Wire `lib/authRouting.ts` into `_layout.tsx`** (extracted and tested,
  never wired).
- [ ] **Authorize the Sentry MCP** so crash data is readable during the
  1.2.0 / 1.3.0 rollout.
- Known limit: after 60 days without a commit GitHub disables the scheduled
  workflows (including the staging keepalive), and staging pauses. On
  return: re-enable in the Actions tab and restore staging.

## Open questions

- ~~What gets cut?~~ Decided in the Phase 1 critique (stats dashboard,
  milestone badges, emoji moods, the Shared pills).
- ~~Is the journal case its own entry type?~~ No: a moment with a long
  reflection, served by the full-page writer and drafts.
