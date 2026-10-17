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

## Where things stand (2026-10-17)

- **1.2.0 (build 8) is in App Review** — first App Store build since build 7
  (May). Brings Sharing v2, the Reflections reorg, design polish, expo-audio,
  the min-build gate, the push-registration fix and Spotify hardening.
- **Usage:** 77 users; 10 created a moment in the last 90 days. Josh's own
  last moment: 2026-08-05. Friends tried it and drifted.
- **Beta:** Soundtracks β build 27 (staging) gets every merge to `main` OTA.
  Weekly Health and E2E crons run Mondays; see `DEPLOY.md`.

## Now

### Ship 1.2.0
- [ ] App Review approval → release with Phased Release → watch Sentry and
  PostHog for a week.
- [ ] E2E green on `main` so the promote path works for JS fixes
  (search-input race fix + Maestro driver-death retry, branch
  `fix/search-input-race`).

### Phase 1 — Feel
*Cleaner, more intuitive, professional-grade; capture in two taps.*
Owner's read: "doesn't feel great" — colors, generic menu icons, borders,
clutter, navigation.

- [ ] **Design critique of every screen** against those complaints, then agree
  a direction *before* writing code.
- [ ] **Cut and simplify the structure.** Decide what to remove or demote
  (candidates: map, calendar, albums tab prominence, friends surfaces, the
  people/location fields up front).
- [ ] **Visual system refresh:** palette, one coherent icon set, fewer borders
  and nested cards, a clear type hierarchy.
- [ ] **Two-tap capture:** pick a song → save. Writing is optional; details
  collapsed by default.
- [ ] **A real writing view** for long entries (the journal case).
- [ ] **New App Store assets** once the redesign lands: 6.9" screenshots
  (1320×2868) and, optionally, the iOS 27 product-page header.

## Next — Phase 2: Pull
*The app comes to you with something worth reacting to.*

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
- [ ] **Signed-out access to SECURITY DEFINER RPCs** — PR #31 (PUBLIC grant
  was never revoked; dry-run verified on staging).
- [ ] **Song-search input race + Maestro driver retry** — branch
  `fix/search-input-race`.
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
- [ ] **Authorize the Sentry MCP** so crash data is readable during the 1.2.0
  rollout.
- Known limit: after 60 days without a commit GitHub disables the scheduled
  workflows (including the staging keepalive), and staging pauses. On
  return: re-enable in the Actions tab and restore staging.

## Open questions

- What gets cut? (Decided in the Phase 1 critique.)
- Is the journal case different enough to deserve its own entry type, or is
  it just a moment with a long reflection?
