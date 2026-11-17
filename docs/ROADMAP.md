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

## What makes it an 11/10 (Josh, 2026-11-17)

Josh's list, in his order. Use it to judge what goes into each phase.

1. **Dialed-in suggestions for songs, photos and moments**, so logging is
   easy and intuitive. (Last week, From before and the on-device AI are
   the start.)
2. **Incredible presentation of a moment.** The moment film is the start;
   it may eventually mean real video editing.
3. **Song suggestions and recommendations from your taste**, maybe.
4. **Good summaries and insights** drawn from logged moments and music
   data (Year in review is the start).
5. **Incredible, beautiful output:** export, a printed book, printables,
   sharing.

Claude's additions, for Josh to accept or cut:

6. **The song brings the memory back.** When a song you've logged plays,
   its moment is there: on the now-playing screen in the app, a widget, a
   Live Activity. Of everything here, this is the most distinctive: the
   app is closed when most listening happens, so first find out what iOS
   allows here.
7. **Capture in three seconds, from anywhere:** Lock Screen, Control
   Center, Action button, Siri/Shortcuts ("remember this song"), the
   share sheet, Shazam. Write later, from a gentle "finish this one".
8. **It lasts decades.** Your journal outlives phones and this app:
   reliable backup, a full export you can read without the app (PDF plus
   photos and data), and linked photos that survive a library cleanup.
   People only pour years into something they trust to keep.
   Josh: this includes account security and data protection, without
   pretending to be SOC 2. Today the operator can read every reflection in
   the database, which may matter eventually. Options, roughly in cost
   order: a written promise and audit log for operator access; then
   client-side encryption of the reflection text (key in iCloud Keychain).
   That has a price: server-side search, `/m/` links and push text could no
   longer read the words, so decide what stays readable first.
9. **Craft you can feel:** haptics, motion, sound, and speed, everywhere.
   Every screen opens instantly, nothing jumps, and the song is always a
   tap from playing.
10. **The people who were there.** A shared moment collects each person's
    side of the same night (your words, their photos), without becoming a
    social feed. Josh tried this once (tagging and reactions, since
    retired) and it wasn't executed well; a new attempt starts from why.

More ideas (Claude, 2026-11-17). Josh liked Journaling Suggestions, the
part of the song, and CarPlay/Siri capture, plus voice entries (recordings
or on-device speech to text, already under Phase 2):

- **Apple's Journaling Suggestions** (`JournalingSuggestions`, iOS 17.2+):
  the system picker Apple's Journal uses, offering songs, photos, places,
  workouts and people from the user's day with their consent. Feeds point 1
  directly; needs an entitlement, and the picker is Apple's UI.
- **The part of the song.** Save where in the song the moment lives ("the
  bridge at 2:41"); playback starts there. Cheap and very personal.
- **CarPlay and Siri capture.** Driving is when songs hit hardest; "Hey
  Siri, remember this song" while the screen is off.
- **Calendar context on device** (EventKit): "at Sam's wedding" suggested
  from the event that day, like weather and place are now.
- **Letters to later:** a moment sealed until a date you pick, resurfaced
  then.
- **A memory on the Home Screen:** a widget that shows one moment a day,
  artwork and a line of your words, opening straight into the film.

"WOW" ideas (Claude and Josh, 2026-11-17). Keep these; Josh liked them all.
The starred ones bring the app to you, which serves the north star:

- ★ **Your life as a radio show.** A station of your moments in date order,
  with your own words between songs (a voice memo, or the reflection read
  aloud): "Summer 2019, Big Sur…", then Holocene. For long drives.
- ★ **Places that play.** Pass the spot where you logged a moment: "You
  were here in 2021. This was playing." On device, with iOS region
  monitoring (about 20 places at once, so the strongest ones). The most
  realistic form of "the song brings the memory back", since iOS won't
  tell the app what's playing in the background.
- ★ **Your eras.** The app finds the periods on its own ("Your Bon Iver
  era, spring 2019 to winter 2020", "The Lisbon summer") with a title, a
  cover from your photos and the songs that defined them: a table of
  contents for your life. The era clustering from the Music Memory
  Engine, done on device without the questionnaire.
- **A film cut to the beat.** The moment film cuts on the song's beats
  (beat detection on the 30-second preview, on device), and photos move
  with its energy. Looks professionally edited, with no editing.
- **Trip mode.** "I'm going somewhere" collects what you played and the
  photos you took; home again, a finished trip film and a draft moment
  per day, waiting for your words.
- **One song across the years.** A song logged more than once gets a page
  of every moment with it over the years, and hearing it again adds the
  next chapter.
- **The album of your year, as a real object.** A vinyl-style sleeve: a
  cover from your photos, your moments as the tracklist, your words as
  liner notes, and an NFC tag or code that plays the year. Pressing the
  songs themselves needs licences, so the object is the sleeve and the
  code.
- **Your past self's voice.** A voice memo from the time plays over the
  intro when you reopen the moment years later (pairs with "the part of
  the song").
- **Live Photos and wallpapers.** Export the moment film as a Live Photo
  for the Lock Screen; the memory moves when pressed.
- **A Soundtracks code** (Josh's idea). Our own scannable mark for a
  moment, in the spirit of a scannable music code but ours in look,
  for example a strip drawn from the song's own waveform. It goes on share
  cards, prints, the year sleeve and stickers, and opens `/m/`. The
  no-app recipient must still get there: either a styled QR code the
  stock Camera reads, or the custom mark plus a short URL under it. Each
  code maps to the moment's existing share token.

## Where things stand (2026-11-17)

- **1.3.1 (build 10) is live** on the App Store: the "Pressed S" icon and
  the Phase 1 look as a store build. 1.3.0 (build 9) went out 2026-11-13.
- **1.4.0 is on `native/1.4`**, not cut yet: Expo SDK 58 (device-verified
  on Josh's iOS 27.2 phone), Face ID lock, PDF export, SF Symbols, React
  Compiler, working Control Center controls, Last week, From before in
  Rediscover, on-device AI, linked photos and video, and the moment film.
  The newest pieces (on-device AI, linked media, the film) still need
  Josh's phone. Left before the cut: What's New and screenshots, the
  build itself (`eas build --local`, or EAS after its free quota resets
  2026-12-01), and moving Josh's real moments to his personal account
  (awaiting his go).
- **Live over the air on 1.3.1** (Promote to Production, `956aa3e`): the
  design sweep (one set of shared components everywhere), the moment
  resume fix, the Share card screen, ordered photos, and the data
  freshness fixes (screens refresh when the app returns from the
  background).
- **On `main`, not promoted yet:** Edit moment opens full screen. It was
  pushed over the moment overlay, so iOS showed it as a page-sheet card
  (found in the 1.4 dark-mode pass).
- **Large text (2026-11-16):** checked at XXXL and AX3. Fixed: the inline
  screen title (cap 1.5x) and tab labels (cap 1.2x) no longer truncate;
  list rows stack their detail under the label and drop line limits at
  accessibility sizes; avatar initials stay inside their circles; the You
  Albums header wraps instead of colliding.
- **Usage (prod, test accounts excluded):** 82 users; 3 created a moment in
  the last 30 days, 6 in the last 90. 0 occasions. Retention, not
  activation, is still the bottleneck; Phase 2 ("Pull") is aimed at it.
- **Staging is paused** (Supabase free plan), so the beta (Soundtracks β)
  can't run and E2E Smoke runs against production with
  `e2e@soundtracks.test` (see `DEPLOY.md`). Restore staging and dispatch
  with `backend=staging` to go back.

## Now

### Ship 1.2.0
- [x] App Review approval → released (automatic release, 2026-10).
- [x] Watched through 1.3.0/1.3.1; superseded by the 1.3.x releases.

### Next native build (1.4)
Each item below changes the native build (the fingerprint), so they ship
together in one App Store version, not over the air. They're built on the
long-lived branch `native/1.4` and merged to `main` only when the 1.4 build
is cut: merging earlier would stop every OTA from reaching 1.3.1.
- [x] React Compiler (2026-11-16): `experiments.reactCompiler` +
  `babel-plugin-react-compiler`. 77 components/hooks compile; 65 are skipped
  and run as before (`node scripts/react-compiler-check.js` lists why:
  try/finally and throw-in-try the compiler can't lower yet, Reanimated
  `.value` writes, refs read in render). Follow-up: move shared values to
  `.get()/.set()` and fix the ref reads so those compile too.
- [x] SF Symbols (2026-11-16): `expo-symbols` behind one `components/Icon`
  (Ionicons names kept, mapped in `lib/iconSymbols.ts`, Ionicons on Android),
  sized to the old glyphs and scaling with text size up to 1.3x; every direct
  Ionicons use replaced, and design-lint now rejects new ones.
  Dark-mode pass on the 1.4 simulator build (2026-11-16): icons, sheets
  and screens read correctly; Place moved to `mappin.and.ellipse` (the bare
  `mappin` was lighter than its neighbours). Mood's face draws filled on
  iOS 26 whichever face symbol is used; left as is.
- [x] Face ID app lock (2026-11-16): Settings → Privacy → Lock with Face ID
  (`expo-local-authentication`; Touch ID or the passcode where there's no
  Face ID). Off by default, per device; turning it on or off asks first.
  Locks on launch and after a minute in the background (a quick trip to
  the music app doesn't count), and covers the app switcher snapshot. The
  cover is a react-native-screens `FullWindowOverlay`, kept mounted and
  remounted on foreground and route changes so it sits above native modals
  (`contexts/AppLockContext.tsx`, rules in `lib/appLock.ts`, tested).
  Verified on a local simulator build: on/off, cold-start lock, failed
  face, cancel then retry, the grace period, and the lock over an open
  moment.
- [x] **Last week** (1.4, built 2026-11-17, works on Josh's phone): the
  week just ended, handed back as material for moments. Josh's calls: no
  modal on open; a ruled row at the top of the Journal from Sunday 6pm,
  staying all week (using it doesn't clear it, only the next week or its
  ✕); named "Last week". The screen (pushed, so capture stacks on top and
  returns there) lists each day newest first: songs added (an album add is
  one row), played a lot (weekly counts from an on-device snapshot of play
  counts taken the first time the app opens each week; lifetime counts the
  first week), streamed (Apple Music's recently played via MusicKit, new
  `getRecentlyPlayed`, logged with when each song first appeared since iOS
  gives no dates), and that day's camera photos (no screenshots). A song
  opens capture filled in; a saved one shows "Saved" and opens its moment;
  a photo starts a moment with it, and either is dated when it happened
  (added, last played, first seen, or taken). Capture offers "Photos from Saturday",
  nothing attached until tapped, behind a switch on the Photos and music
  screen while Josh decides. Asks for library + photos access once, never
  again after a no. All on device; only the "Saved" check reads moments.
  `lib/lastWeek.ts` (tested), `lib/lastWeekData.ts`, `hooks/useLastWeek.ts`,
  `components/LastWeekRow.tsx`, `app/last-week.tsx`,
  `components/DayPhotosSuggestion.tsx`. Native: `getRecentlyPlayed`,
  `libraryAccessStatus`, album fields on library songs.
- [x] Polish from Josh's pass (2026-11-17): long-pressing a moment now
  uses the iOS context menu (the card lifts, the page blurs, Edit and
  Delete attach to it; `modules/context-menu`, a UIContextMenuInteraction
  around the card, actions reported after the menu closes so Delete's
  confirm can present; builds without it keep MomentActionMenu). The film
  cross-fades without the dip to black: each item is a layer keyed by its
  index (the outgoing one is never remounted, a video keeps its last
  frame), the items either side load ahead invisibly, and a fade waits up
  to 600ms for the new picture. The Journal's search icon is gone (it only
  opened Rediscover's search). Data: 21 moments from Feb–Aug 2026 stored
  their artwork as an embedded PNG (avg 2.5 MB, in every timeline fetch);
  backfilled to Apple's artwork links on production (2026-11-17, Josh's
  go; 20 matched, "DO IT" isn't in the catalog and shows the placeholder).
  Then: check-in days became a quick pick ("Days · Every day", weekdays
  with checkmarks, like Repeat in Clock) after a row of day chips looked
  wrong; a one-time hint over the + ("Hold + for Last week, From before
  and more", `components/CaptureHint.tsx`, once per device, gone after the
  first long-press); a linked video on someone else's moment shows a video
  icon, not play, and the film says it stays in its owner's Photos. (Then,
  on Josh's call: someone else's linked videos are left out entirely,
  `withoutOthersVideos`.) From the iPhone SE / iOS 18.3 pass (everything
  runs; native menu, film, capture menu fine): the Start from sheet's rows
  are inset like other sheets (icons sat on the screen edge), and the
  Journal shows one offer at a time (the check-in offer waits while Last
  week's ask is up; on an SE the two filled the first screen).
- [x] Notification choices (built 2026-11-17; Josh: "why not just do it
  now"). Settings → Notifications is its own screen
  (`app/notification-settings.tsx`) with three groups instead of five
  switches: **Your check-in** (the daily check-in, now with days as well as
  a time; streak milestones), **Things coming back** (On this day, random
  memories, and a new local "Last week is ready" on Sunday at 6pm, only
  for a week that has songs or photos), and **From friends** (shares and
  new friends; "Quiet at night" sends them silently 10pm–8am, never
  dropped). **How often** (daily / a few times a week, the default /
  weekly / off) spaces memories coming back 1, 3 or 7 days apart; Off
  stops every server push except friends'. Random memories now come
  whenever the spacing allows (a moment at least a month old, opening the
  memory card), not only on Mondays. Retired (principle 3, never notify
  about absence): streak reminders, "still there?", the day-7/14 "we miss
  you" pushes, and the Tue/Thu journal prompts (the check-in, which people
  choose, replaces them). Server: migration
  `20261117120000_notification_choices.sql` (`notif_frequency`,
  `notif_social`, `notif_quiet_hours`, `notif_last_week`,
  `last_notified_at`), `send-notifications` (tested),
  `_shared/socialPush.ts` (tested) in `notify-social` and
  `accept-friend-invite`. The server half is live on production since
  2026-11-17 (PR #107, merged to main on Josh's go; CI ran the migration
  and deployed the three functions), so 1.3.1 users get it too (their old
  streak and prompt switches now do nothing); the screen ships with 1.4. Local: `lib/dailyCheckIn.ts` (days, tested),
  `lib/lastWeekReady.ts` (tested).
- [x] Photos ↔ music prototype (built 2026-11-16; became Last week and From before):
  `getLibrarySongs` in the NowPlaying module (`dateAdded`, play count,
  last played) + `expo-media-library` photo counts for ±3 days. Hidden
  screen: long-press the version line in Settings. It shows how many songs
  were added on bulk days (syncs/imports, which would make `dateAdded`
  useless) and the top pairings ("You added Holocene June 3, 2019, the week
  of these 14 photos."). `lib/libraryMoments.ts` (tested),
  `app/dev/library.tsx`. Runs on the simulator (0 songs there); the real
  answer needs a real library.
  **Result on Josh's phone (2026-11-17): the idea works ("real cool").**
  591 songs; 138 (23%) on three bulk days, correctly left out. The best
  pairing was a trip: songs added Aug 8, 2024 with 70 photos of that week.
  What to fix before this becomes a feature:
  - Adding an album gives every song the same date, so the list repeats
    one week's photos for each track. Group by add date: one pairing per
    day, led by its most played song ("and 6 more you added that day").
  - 60 of 60 songs "had photos that week": a ±3 day window always finds
    some. Score the week against Josh's usual photo count, so a trip (70
    photos) beats an ordinary week, and narrow the window.
  - Dates aren't always right: "added" isn't "first heard", and saved or
    received images carry the save date. Count only camera photos (skip
    screenshots and saved images) and word it as a nudge, not a fact.
- [x] Local builds on Xcode 27 (2026-11-16): `plugins/withPodsMinDeploymentTarget`
  lifts pods below iOS 15 (Xcode 27 refuses them) in the Podfile, so
  `eas build --local` and local simulator builds work while EAS's free
  builds are used up. Prebuild with `--clean` (apple-targets fails to
  update an existing project) and run CocoaPods with a UTF-8 locale.
- [x] UIScene lifecycle (2026-11-16; launches on Josh's iOS 27.2 phone;
  on the simulator a cold-start widget link, a warm link and the Face ID
  background lock all work):
  iOS 27 won't launch an app built with the iOS 27 SDK that still makes
  its window in `didFinishLaunching` (the first Xcode 27 device build
  crashed on open). `plugins/withSceneLifecycle` adds a `SceneDelegate`
  and the scene manifest, and forwards cold-start and warm URLs and user
  activities back through the AppDelegate so Linking, the widgets, the
  share extension and the auth confirm link behave as before. Any 1.4
  build made with Xcode 27 needs this. It mirrors Expo SDK 58's own
  `ExpoAppSceneDelegate` (55–57 still don't use scenes) and is deleted by
  the SDK upgrade below.
- [x] Control Center / Lock Screen controls open the capture screen
  (2026-11-17, verified on Josh's phone, app running and fully closed):
  tapping "Capture a song" did nothing, in the store app too. The phone's
  log showed iOS running the intent inside the widget extension and
  dropping the `OpenURLIntent`. The intents now sit in
  `targets/widget/_shared` (built into the app as well) with
  `openAppWhenRun`; iOS still drops a returned `OpenURLIntent`, so the app
  opens the link itself through `ControlLinkOpener`, set at launch by
  `plugins/withControlLinkOpener`.
- [x] Upgrade Expo SDK 54 → 58 (RN 0.81 → 0.88, React 19.3, TypeScript 6)
  inside 1.4 (Josh, 2026-11-17): built on `native/sdk-58`, merged into
  `native/1.4` after a clean device pass the same day. What changed:
  - Every package on its SDK 58 version; third-party: expo-share-intent 9,
    apple-targets 5, Sentry 8, apple-music 1.4. Dropped a stray
    `@expo/cli@54` pin; added `@expo/config-plugins` (react-native-maps'
    plugin deep-imports it) and `react-native-tab-view` (TopTabs needs it).
  - Patches: Apple Sign-In and web browser key-window fixes are upstream
    now (deleted); the share extension's multi-photo fix is re-ported to
    v9 (`patches/expo-share-intent+9.0.0.patch`).
  - Expo's own SceneDelegate replaces `withSceneLifecycle` (deleted).
  - Expo Router 58: no `@react-navigation/*` imports in app code (now from
    `expo-router`); tabs are `TopTabs` from `expo-router/js-top-tabs`
    (TabBar uses `emitter`/`navigateToTab`, and `router.prefetch` replaces
    `preload`); `usePreventRemove` discards via `repeat()`; root
    `unstable_settings.anchor`.
  - React Native: `InteractionManager` → `lib/whenIdle.ts`;
    `absoluteFillObject` → `absoluteFill`; refs typed with
    `ViewInstance`/`ScrollViewInstance`/`TextInputInstance`.
  - `File.move()` is async (export awaited it). Minimum iOS 16.4.
  - The beta's Xcode project is now `Soundtracksb` (SDK 58 keeps the β as
    a "b"); bundle ids are unchanged.
  - Simulator: builds, launches, Face ID, tabs (tap and swipe), moment
    detail with map and preview playback, create, warm and cold links.
  - A share that cold-started the app landed on "This page doesn't exist":
    the share extension's hand-off link reached the router as a page.
    `app/+native-intent.tsx` (rule in `lib/systemPath.ts`, tested) keeps
    it off the router; `useShareIntentHandler` opens the moment as before.
  - **Device pass on Josh's iOS 27.2 phone (2026-11-17), all working:**
    sharing a song (cold and warm) and several photos, widgets and
    controls, Apple Music now playing, saving and reopening a moment,
    export, Edit Profile's discard, the photos prototype, Face ID.
    Not covered: a Spotify share (same path as Apple Music's).
- [x] Version 1.4.0 in `app.config.ts`.
- [x] Refetch on reconnect (2026-11-16): `@react-native-community/netinfo`
  feeds React Query's `onlineManager` (`wireQueryFocus` in
  `lib/appFocus.ts`, `isOnline` tested), and the Journal refetches page 0
  when the connection comes back (10s cooldown for flapping signals).
  Verified on the 1.4 simulator build: launches with NetInfo linked. The
  offline → online cycle itself still needs a device (airplane mode).
- [x] **Export your journal as a PDF** (`expo-print`; Josh chose native PDF
  over an interim text export, 2026-11-16): Settings → Journal → Export your
  journal builds a typeset book (title page, year and month heads, every
  moment oldest first with artwork, when/where/who, moods as words, up to
  four photos, and the words in Newsreader) and opens the share sheet.
  `lib/journalExport.ts` (pure, tested) + `lib/journalExportDevice.ts`.
  On branch `native/1.4`; export worked in the SDK 58 device pass
  (2026-11-17).
- [x] `mailto` in `LSApplicationQueriesSchemes` (2026-11-16): Settings >
  Share feedback checks `canOpenURL` first and goes straight to the
  copy-the-address sheet when there's no mail app.
- [x] Version bump + beta build 33 (PR #45).
- [x] Production build 9 (owner ran it interactively to create the App Store
  widget profile) → submitted to App Store Connect 2026-10-19.
- [x] App Store Connect: 1.3.0 version, build 9, six 6.9" screenshots,
  What's New, new subtitle/keywords/description, **manual release**;
  submitted for review 2026-10-19.
- [x] Approved; released manually 2026-11-13.

### Ship 1.3.1 (the new look)
Build 9 was cut on 2026-10-19, a day before the "Pressed S" icon (#53) and
the review waves (#58–#64) merged, so the store's 1.3.0 doesn't have them.
Beta build 36 does. 1.3.1 is that beta, as a store build. No app code
changed since build 36.
- [x] Version bump to 1.3.1 (release PR).
- [x] Beta builds from the release commit (`preview`, `preview-simulator`);
  the bump moves the preview fingerprint.
- [x] Production build (build 10), submitted to App Store Connect.
- [x] New 6.9" store screenshots of the new look (2026-11-14). Taken from a
  demo account on prod (`demo@soundtracks.test`, notifications off), since
  staging is paused. The widget frame is unchanged. App Store Connect now
  requires the medium iPhone size (1206 × 2622, "6.3-inch"); 6.9" is
  optional. Both sets are in `docs/app-store/screenshots/`. The new Header
  and Search Results creative assets (Oct 2026) are optional; none yet.
- [x] **Josh:** TestFlight pass, 1.3.1 in App Store Connect with the new
  screenshots, submitted and released (live by 2026-11-15).
- [ ] Raise the min-build gate to 10, which unblocks DB-2 (RLS hardening
  step 2). Josh, 2026-11-16: wait a few days so people on 1.3.0 auto-update
  first instead of hitting the update-required screen.
- [x] E2E green on `main` so the promote path works for JS fixes (PR #33:
  search-input race fix, Maestro driver-death retry, seed no longer signs out
  testers).

### Design sweep (2026-11): one system, everywhere
Josh found screens still on the old look (the Mood and people sheets, Friends,
Edit Profile, Help, Rediscover search's orange Cancel). An inventory found
~60 hand-rolled buttons, 22 chip styles, 14 text-field styles, 9 sans titles
and 26 uppercase labels. Plan: shared primitives first, then every screen on
them, OTA-only (no native changes).
- [x] Wave 1: tokens (`typography` roles, `scrim`, paper button text) and the
  shared `Button`, `Chip`, `TextField`, `ScreenHeader`, `SectionLabel`; the
  sheet rebuilt (warm scrim that fades, serif title, Done, clipped content);
  ConfirmSheet on `Button`.
- [x] Wave 2 (four parallel workstreams): every screen and sheet on the
  primitives. No terracotta fills or back links, every Text has a DM Sans /
  Newsreader / serif family, no uppercase labels, hairlines in `divider`.
  Friends, Edit Profile (discard guard on back/swipe), Help (rewritten for
  every real capture path), Settings, You, auth, onboarding, Rediscover
  (ink Cancel, "Your artists" on empty search), New album (compact, no
  autofocus), Share (one list, no 92% sheet), album settings, one context
  menu (`MomentActionMenu`), moods as sentence-case words, calendar and map
  off the retired accent, ShareCard on paper/ink.
- [x] Wave 3: friends and profile-edit push with the edge swipe (song,
  artist and album stay full screen: pushed over the moment overlay, iOS
  shows them as a page-sheet card); the map allows the edge swipe; capture and edit-moment photo
  strip: tap to view, hold and drag to reorder (`lib/reorder.ts`); Share
  feedback falls back to a copy-the-address sheet when Mail can't open.
- [x] Guardrail: `scripts/design-lint.mjs` in PR checks (uppercase labels,
  pure colors, literal fonts, system font weights, terracotta fills, glyph
  icons, page sheets, the retired accent); escape hatch needs a reason.
- [x] Share card is its own full screen (`app/share-card.tsx`, a
  fullScreenModal over the moment overlay): Post/Story, photo picker and
  "Share image" moved out of the sheet, which closes and then opens it; the
  moment is handed over through `lib/shareCardStore.ts` (consume-once).
- [x] Edit moment saves photos in strip order (2026-11-14): `updateMoment`
  takes one ordered list of kept and new photos (`lib/photoOrder.ts`), so a
  new photo dragged ahead of a stored one stays there and can be the cover.
  Thumbnails stay index-paired; a legacy moment that gains a photo uses each
  old photo as its own thumbnail so the strip shows every photo.
- [x] Moment screen resumes a paused song (back from the background) instead
  of restarting it, and keeps the progress bar (`lib/playerAction.ts`).
- [x] Follow-ups (2026-11-15): a `ListRow` primitive, now under Settings
  (Notifications switches as `trailing`), You (Friends, Music service and
  its picker), Edit profile (Birth year, Country, both pickers, artist
  results), Rediscover's "Browse by" rows and sheets, the album picker, the
  Share sheet (verbs and friend rows) and album settings (cover, members);
  `switchOn` token; `Chip` onLongPress and `imageUri` (Browse's album
  switcher has its covers back); `Button align="center"` replaces the
  per-screen `alignSelf` overrides.
- [x] Live in production over the air (2026-11-15, `ba196ea`). The `mailto`
  query scheme moved to "Next native build (1.4)".

- [x] E2E Smoke runs against production while staging is paused (2026-11-15):
  this commit's JS swapped into the simulator build, `e2e@soundtracks.test`
  reset as itself under RLS (`scripts/reset-e2e-prod.mjs`); the promote gate
  is unchanged. `backend=staging` returns to the old path.

### Fixes (JS only, can ship OTA)
- [x] **New users landed on an empty Journal after onboarding** (found
  2026-11-13 on 1.3.1). The timeline prefetch runs at sign-up, before the two
  onboarding moments exist. The Journal tab first mounts after onboarding and
  painted that empty prefetch even though onboarding had marked it stale. Now
  a stale flag on first load skips the prefetch (`planFocusFetch` in
  `lib/timelineRefresh.ts`), and the empty state supports pull-to-refresh.
  Checked on a simulator against prod (2026-11-14): both onboarding moments
  show on the first Journal load.
- [x] **Data freshness fixes (2026-11-15)**, from an audit of stale data
  (#96, includes #88). Live in production over the air 2026-11-16
  (`956aa3e`). Checked on a simulator against prod: a moment added or moved
  server-side while backgrounded shows on resume without a pull, in the
  right month on the list and the calendar; a cold relaunch after a delete
  shows no stale row.
  - Refresh on return from the background: React Query's `focusManager`
    follows AppState (`lib/appFocus.ts`), and the Journal refetches on
    foreground after the 30s cooldown.
  - The timeline prefetch has an age limit (`isPrefetchFresh`): one older
    than 30s, or older than the last `markTimelineStale`, is discarded, and
    no new prefetch fires for a user whose timeline is already loaded. An
    old prefetch from a re-run hydration was painting over newer rows.
  - A failed launch network fetch after a cache paint shows the inline
    banner, retries once after 5s, and makes the next focus or foreground
    refresh regardless of the cooldown.
  - The timeline disk cache (first page) is written after every page-0 fetch
    and every local create/edit/delete, not only at launch
    (`writeTimelineCache`, generation-guarded against sign-out).
  - The calendar refetches whenever the list changes, not just on a pull.
  - Onboarding saves invalidate the React Query caches too.
  - A saved or edited moment is placed in its timeline position and deduped
    by id (`insertPendingMoment`), so a backdated moment lands in its month.
  - The profile disk cache is shape-checked (`parseCachedProfile`).
  - The Journal's focus effect no longer re-runs on badge updates (it fired a
    duplicate first fetch during cold start).
  - Rediscover's pull refreshes the archive, rewind and hero as well as On
    This Day; the map uses the standard 2-minute staleTime.

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
- [x] **New app icon** (2026-10-20): "Pressed S", an ink record on paper with
  a terracotta label carrying the wordmark's serif S; the orange→purple
  gradient is gone. Light, dark and tinted iOS variants, a green-label beta,
  Android adaptive and favicon, from `scripts/make-app-icon.py`. Native, so
  it rides the next binary; App Store screenshots that show the icon need
  a refresh then.
- [x] **New App Store assets:** six 6.9" screenshots (1320×2868) in
  `docs/app-store/screenshots/` (Journal, entry, capture, widget, On this
  day, dark entry), framed by `scripts/frame-screenshots.py` from simulator
  captures of staging E2E Two. Upload with the next version (screenshots are
  locked while a version is in review). The iOS 27 product-page header is
  still optional and not made.

- [x] **Phase 1 leftovers** (2026-10-20, JS only): Rediscover clears the
  capture button (120pt bottom padding); the entry screen's date, time of
  day and place moved from an uppercase eyebrow to a quiet line under the
  artist; Rediscover and You section headers are serif titles in their own
  case; Browse drill-downs put the count under the title; the auth screens
  use DM Sans everywhere (they fell back to the system font). The album
  detail screen is left for the occasions rebuild.
- **Fingerprint trap:** the root `.gitignore` is part of Expo's native
  fingerprint. Adding one line to it (2026-10-19) made every OTA from main
  unreachable; the rule moved to `.impeccable/.gitignore`.

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
- [x] **Daily check-in, v1** (2026-11-16): "What song did you listen to
  today?" at a time you choose (default 9:00 PM), as local notifications
  (no server). Skips any day you've already saved a moment: two weeks are
  scheduled ahead, saving cancels today's, and each app open re-plans them,
  so they run out after two weeks away instead of nagging someone who left.
  Opt in from Settings → Notifications → Daily check-in (switch, time and,
  since 1.4, days) or the
  Journal's one-time offer; a denied notification permission says so and
  links to iOS Settings. Tapping opens Capture with what's playing filled
  in. Settings are per device. `lib/dailyCheckIn.ts` (tested),
  `components/DailyCheckInRow.tsx`, `components/DailyCheckInOffer.tsx`.
- [ ] Daily check-in, next: voice entry with on-device transcription; later
  a real AI phone call as a paid feature, opening with a song you saved
  ("You saved Space Song a year ago today. What's different now?").
- [x] **Photos ↔ music, the past half** (1.4, built 2026-11-17; the plan
  below became two Rediscover sections instead of a range picker, Josh's
  call): **On this day** adds songs added to the library on today's date in
  past years, with that day's camera photos, after the saved moments (and
  on its own for an empty journal, so a new user has a past on day one).
  **From before** shows up to three old pairings a week (older than 90
  days, album adds as one row, sync days out, already saved and already
  shown left out), scored by the week's photos against the usual week (a
  trip beats an ordinary week) and plays; picked once a week and kept.
  Tapping either opens capture with the song, dated the day it was added,
  offering the same photos the row showed (the day for On this day, the
  week for From before). After Josh's first look: From before says it's
  "From your library and photos. Not in your journal yet.", unsaved
  pairings carry a +, each says why ("The week of 70 photos · played 89
  times"), and a week must have 1.5× the usual photos to be picked (fewer
  than three is fine). Picking from the strip ticks at once; photos already
  on the phone are looked up ahead, iCloud originals load in the background.
  `lib/pastPairings.ts` (tested),
  `lib/pastPairingsData.ts`, `components/PastPairingRow.tsx`. No local
  notification yet. The original plan:
  Josh's second look: From before moved to the end of Rediscover (after
  Surprise me), so searching, browsing and revisiting saved moments aren't
  broken up by unsaved material; it stays always available. A pairing's row
  always starts a new moment (a week can hold several); a saved one also
  offers Open. "Last week" rows work the same way.
- [x] Long-press the + for starting points (Josh's idea, built 2026-11-17):
  a tap still opens capture; holding opens a "Start from" sheet: Identify,
  Search (capture opens straight into song search), Last week, and From
  before (its own screen, `app/from-before.tsx`, same weekly picks).
  `components/CaptureMenu.tsx`.
- [x] Smarter pairings, location and favourites (built 2026-11-17): a new
  native `photoStats` reads PhotoKit metadata per week in one call (count
  without screenshots, favourites, sampled locations). Home is the busiest
  ~11 km cell of a year's photo locations; a week is "away" when most of
  its photos are 60+ km from it, and the town is named ("away in
  Kailua-Kona"). A week qualifies with a photo spike, being away, or 2+
  favourites; all three add to the score and the reason line.
- [x] From before controls (Josh: "no date range? any control?", built
  2026-11-17): the From before screen (long-press + or More in Rediscover)
  has chips (This week, All years, each year), Show more when browsing, and
  ✕ "Not this one" (never suggested again, here or in Rediscover).
- [x] Moment hero fades through the moment's photos (Josh's idea, built
  2026-11-17): ~4.5 s each, still with Reduce Motion, paused after a touch
  or off screen; tap opens the viewer at the photo showing.
  `components/HeroPhotoCycle.tsx`.
- [ ] Video in moments: short clips (≤15 s, 720p, ~2–5 MB) cost real
  storage on the Supabase plan, plus compression, upload progress,
  `expo-video` playback, thumbnails for lists and the PDF, web playback and
  deletion. Live Photos first (small, already taken), video only if asked.
- [x] **On-device AI** (1.4 mega-update, Josh 2026-11-17; built, needs his
  phone): new local module `modules/on-device-ai`. Vision (any iOS): scene
  labels, face count, text coverage; iOS 18+: Apple's aesthetics score and
  "utility" flag. `lib/photoInterest.ts` (tested): boring photos (homework,
  receipts, documents) never suggested and not counted toward a photo
  spike; best photo leads each row; weeks get a kind ("at the beach") and
  a bonus for events and group shots. Analyses cached per photo
  (`lib/photoAnalysisStore.ts`); lists never wait: they filter by what's
  cached and analyse the rest in the background. Foundation Models (iOS 26
  + Apple Intelligence): one short question per pairing from facts only
  (`lib/nudgeQuestion.ts`, tested: must be a question, under 90 chars, not
  in their voice, no invented names), generated ahead of a tap and shown
  as capture's placeholder (`promptQuestion`); templates everywhere else.
- [x] `moments.media_refs` (jsonb, default []) on staging and production
  (2026-11-17, Josh's go): linked photos/video, see the migration's notes.
- [x] **Linked photos and video** (1.4, built 2026-11-17, needs Josh's
  phone): moments reference the owner's
  Photos library by iCloud id (`PHCloudIdentifier`, same across their
  devices); a small thumbnail (video: poster frame) is always uploaded; the
  full file uploads when the moment is shared (friend, album, link, share
  card) so the no-app recipient still gets everything. Plays/shows from
  Photos on the owner's devices; only the owner's links resolve (a shared
  moment never shows the recipient's own photos). Videos: picked from the
  library (never uploaded), poster frame via native `videoPoster`, kind
  "video" with its length; a video that can't be linked is refused with a
  message. Strip tiles badge videos with their length.
- [x] **Moment film viewer** (1.4, built 2026-11-17, needs Josh's phone;
  `components/MomentFilm.tsx`, replaces PhotoViewer on the moment screen):
  photos and videos swipe in taken order,
  pinch to zoom, Stories-style progress, swipe down to close; Play turns
  the moment into a short film with the song (slow drift on photos, videos
  play through). Sound: clips muted by default; the speaker raises the
  clip and ducks the song to 20% (~−14 dB) over 0.3 s, back over 0.8 s;
  clips at 80%; full Apple Music playback (no volume API) is ducked by iOS
  via "duck others" on the app's session (verified on Josh's phone; pause
  is only the fallback) (`duck` in PlayerContext for previews,
  `setDuckOthers` in modules/photos-video, `lib/audioMix.ts` tested); never
  an exported file. One stage: Pause freezes the photo timer, the video
  and the song in place; Play carries on. Videos play through a native
  Photos player (`modules/photos-video`, no copies). Josh: "LETS GOOOO".
- [ ] Video sharing as part of a paid tier (Josh, 2026-11-17: "maybe
  paywall that?"). Fits principle 5: your own videos always play for you
  free; only sending the clip to others costs (storage). In 1.4 a shared
  moment's video goes as its poster ("Plays on the phone it came from");
  don't ship free sharing and take it away later. Needs the tier itself
  (App Store subscription, RevenueCat SDK, paywall, review); design it as a
  bundle (video sharing, prints, occasions), not one feature. On share:
  upload a 720p copy alongside the poster.
- [ ] People, later and opt-in: on-device face grouping you name once,
  linked to moment People. Not in 1.4 (face data is sensitive).
- [ ] Smarter pairings, next: learn from what Josh saves vs ignores; on-device
  Vision scene tags (beach, concert, wedding) and best-photo choice; Apple's
  on-device model for the nudge question (never the reflection); "you
  found it the week it came out". No cloud AI for this (photo locations
  and listening history stay on the phone). Photos' People aren't
  available to apps; Google Photos isn't readable at all.
- [ ] **Photos ↔ music: three moments a week.** On device only: Apple Music
  library `dateAdded` / play count / last played (+ Replay playlists) matched
  to photos from ±3 days (date, place, favorites; iOS 18 on-device aesthetic
  score picks the best photo), ranked by photo count, favorites, away from
  home and play count. "You added Holocene June 3, 2019, the week of these
  14 photos in Big Sur." Local notification, no server or AI cost. Step one:
  a prototype screen on Josh's real library to check `dateAdded` quality.
  Native (rides 1.4).
- [ ] **Log what's playing without opening the app** (App Intent that saves
  the now-playing song straight to the journal, with a "write later" nudge).
  Needs an app group + the auth token in a shared keychain; the widget above
  opens the app instead.
- [x] **Face ID lock** (in 1.4, see "Next native build"; journaling-app standard; makes private writing feel
  safe).
- [x] **Export** your journal (PDF, in 1.4: see "Next native build"): trust that the words are
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
- [x] **On This Day that plays** (2026-11-16): the On this day push reads
  "5 years ago today" / "Rivers and Roads, The Head and the Heart" (never the
  user's words, since it can show on the Lock Screen) and opens the memory
  card (`app/memory/[id].tsx`, push `data.type "memory"`): full screen on
  night, the artwork, the anniversary, your words, and the song already
  playing; "Open the moment" carries on into the entry with the song still
  going, closing stops it. Rediscover's On this day opens the same card.
  Older binaries fall back to opening the moment (`momentId`). Edge
  Functions deploy now treats a failed staging deploy (paused) as a
  warning, after production.

Feasibility notes (what APIs can and can't see) are in the archive under
"Product ideas + feasibility findings — 2026-08-02". Key fact: dated play
history is not available from any API; Replay playlists and library metadata
are.

## Later — Phase 3: Payoff
*Reading your journal back is the reward for writing it.*

- [ ] **Your month in songs:** a monthly view of what you logged and played.
- [x] **Year in review** (2026-11-16): a tap-through story of a year, each
  card playing its song on a night screen lit by its artwork: the cover
  (the year as a mosaic, first song), the loudest month, the top mood, the
  person and place that recur, the entry written about most (quoted, never
  rewritten), and a closing card with "Share my year" (the card as an
  image). Free; featured at the top of Rediscover Dec 1 – Jan 31 and under
  You → "Your years" any time, for a year with 5+ moments. Cards with
  nothing true to say are left out. `lib/yearInReview.ts` (pure, tested),
  `app/year/[year].tsx`, `components/YearReviewEntry.tsx`.
- [ ] Year in review v2: AI chapter titles and a name for the year (allowed
  once a year, never rewriting the user's words), and a recap push on
  December 1.
- [ ] **Reading experience:** browsing and search that make the archive a
  pleasure, not a list.
- [ ] **Thin-archive states:** Reflections strips show a teaser instead of
  disappearing when there's little data.

## Business: one engine, two front doors (decided 2026-10-19)

Josh chose to try to make money (path B). The journal stays the free core and
the thing people find organically; occasions and keepsakes are the paid
layer. Print is the shared output of both. Everything runs without Josh in
the loop: Stripe on the web (physical goods can't use Apple IAP, and web
sales skip the 30%), print-on-demand APIs ship direct, files are generated,
emails are triggered, guests serve themselves.

**Front door 1, the journal (free).** Landing page leads with it. Phases 2–3
make it pull.

**Front door 2, occasions (paid).** An occasion is a person, a group and a
date: weddings, group birthday gifts, anniversaries / Valentine's,
memorials, farewells, graduations, baby showers. Same engine for all.

- [ ] **Occasions, rebuilt from the ground up** (first; start now, ready
  for spring wedding season). This is albums v2; today's albums and guest
  contributions are the starting point, not the design. **Spec:
  `docs/OCCASIONS.md`** (signed off 2026-10-20: flows, data model,
  automation, phases P1–P3; web-only payment, no pilot, readable links).
  - [x] P1.1 foundation (2026-10-21): `occasions`, `occasion_entries`,
    `occasion_gallery_photos`, the private `occasion-photos` bucket, host
    policies with column grants, and account deletion cleaning up occasion
    photos.
  - [x] P1.2 guest capture (2026-10-21): `/for/{slug}` (song from the
    couple's suggestions or Apple search → a photo from tonight → name →
    words with starters), the `occasion-entry` edge function (song checked
    against Apple's catalog, photo type from its bytes, edit tokens stored
    as hashes, per-device / per-address / per-occasion limits), "Your
    songs" with add-a-photo-later on the same phone, an optional email for
    the reminder and the finished book, and `get_occasion_for_guests`.
    Retries can't duplicate (phone-made edit tokens); hosts can't read
    guests' address hashes or emails. Follow-up: Turnstile bot check.
  - [x] P1.3 couple setup (2026-10-22, payment stubbed): sign-in (email
    link or app password), "Your weddings" with `/weddings` reservations,
    setup with suggested songs and a checked link, the overview with the
    guest link and QR, printable table cards, and a staging-only "open
    without paying" step that Stripe's webhook will replace.
  - [x] P1.4 couple dashboard (2026-10-24): moments with photos, hide and
    show, auto-refresh while collecting, the group-chat ask and week-after
    photo reminder, "Just us", edit details, close early, and the close date
    following date or time-zone edits. Reveal moves to P1.5.
  - [x] P1.5 keepsake page and reveal (2026-10-25): the keepsake plays the
    night back (photo, song preview, words, name; then the next) over a
    tracklist; the couple's preview; reveal with the group-chat message;
    "most picked"; the guest page links to the book once it's out.
  - [x] P1.6 scheduled close/reveal and downloads (2026-10-24):
    `occasions_tick()` on pg_cron every ten minutes (close at the deadline,
    auto-reveal a week later); the couple's photo zip and printable notes.
    Phase 1's build is done apart from the third-party batch below.
  - [x] Link previews for the guest and keepsake links (2026-10-25).
  - [x] Guests remove their own moments; couples delete a wedding (photos
    first); partner invites as co-host (2026-10-25).
  - [x] Gallery fill (2026-10-25): upload the photographer's gallery, photos
    suggested for song-only moments by when they were taken, the couple
    approves each (pulled forward from P2).
  - [x] `/weddings` shows the real product (2026-10-26): the keepsake playing
    in the hero (a muted loop from a demo wedding on staging), the real
    guest page and couple's page, and copy matched to what's built (no
    Spotify playlist export; gallery fill, co-hosts and taking a moment back
    added).
  - [x] CI test of the paid flow (2026-10-27): `occasion-e2e.yml` runs
    guest → couple → close → reveal → keepsake against staging on every
    web/occasion PR and weekly.
  - [x] A page for each moment (2026-10-27): "Share" on the keepsake sends
    one guest's moment on its own (its own signed link, never the book's
    key), with a preview card of their photo, song and words.
  - [x] Admin view (2026-10-27): `/host/admin`. Every wedding, what's
    stuck, reservations to set up, scheduled-job health, run the tick.
    Admins are added by hand (docs/DEPLOY.md).
  - [x] Print proofs (2026-10-29): the tracklist print, thank-you cards and
    the liner-notes book, made from the real guest book and printable at
    true size. Ordering waits on Stripe and a print partner.
  - [ ] Last, the third-party batch (setup checklist for Josh:
    `docs/THIRD-PARTY-SETUP.md`): Stripe checkout + webhook, Resend
    (setup, reminder, reveal emails and a real sender for sign-in links),
    Turnstile, MusicKit full playback and "Save to Apple Music" on the
    keepsake.
  - [x] **Josh:** (done 2026-10-24) add `https://soundtracks.app/host/auth/callback` and
    `https://www.soundtracks.app/host/auth/callback` to Supabase Auth's
    redirect URLs (production and staging), or emailed sign-in links fall
    back to the Site URL.
  - **Wedding deliverable (decided 2026-10-20).** Value prop: "Your guests
    catch the songs of your night with two taps. You keep them forever."
    - Lazy capture: QR on the tables → web page → tap a suggested song (the
      couple picks a handful) or search → **a photo from tonight** (asked
      second, one tap into the camera roll; optional but expected) → name
      (required, so every song says who picked it) → Add. Words are
      optional, with one-tap starters ("The night we met…", "You two
      in…") instead of an empty box. No account, no app, no RSVP step.
    - The moment is the product (decided 2026-10-20): song, photo, words.
      The song is the index; the moment is what people keep. The page,
      the capture order and the book all lead with moments.
    - One reminder the week after, about photos: "Add your photos to your
      song." Guests attach photos to the entry they already made (same
      device, or the link in the reminder), no retyping. Collection stays
      open two weeks.
    - **Designed in from the start: the couple's photos fill the gaps.**
      The couple connects their photographer's gallery (upload or link).
      For entries without a photo we suggest the gallery photo taken
      closest to when that guest added their song (EXIF time vs the
      entry's created_at; the couple confirms or picks another). Later,
      maybe: opt-in matching of the guest's face. The data model gets a
      per-entry photo source (guest / couple gallery) and the gallery
      itself from day one, even if matching ships second.
    - The book follows the content: a full page for every entry with a
      photo or words, song-only entries gathered on tracklist pages, never
      a padded page.
    - Cut: the DJ / dance-floor list, collecting through RSVPs, and song
      identification on the web (for now). The live wall at the reception
      is parked.
    - The keepsake ($79): a listening page in the order the night went,
      playing like a radio show (MusicKit JS full songs for Apple Music
      subscribers, 30s previews otherwise; never exported as one file, the
      songs' licenses forbid it); the playlist to Apple Music / Spotify;
      every note as a PDF and every photo in one download; anniversaries
      ("One year ago tonight, Mara picked September").
    - Physical, all offered from launch: the tracklist print (the wedding as
      the back of a record sleeve, $49 / framed $129), thank-you cards with
      each guest's song ($2.50 a card), the liner-notes book ($119); "The
      whole album" bundle $279. Prices are a first guess to test.
    - The couple sees every song before anything is shared or printed and
      can hide any of them. Duplicates are a feature.
  - Later, maybe: an optional AI host between songs on the listening page
    that reads guests' words verbatim (its voice clips are our own audio,
    mixed live in the browser).
- [x] **`/weddings` demand test** (2026-10-20): "A guest book that plays."
  The hero is three guest pages (song, words, photo; and one song-only
  page, because that counts too), then the lazy capture, the $79 keepsake,
  and the physical extras at real prices beside the tracklist print. "Reserve
  your date" (names, date, guest count, email, extras they're thinking
  about) writes to `wedding_reservations` (insert-only RLS; read it from
  the dashboard) and emails Josh through Resend once `RESEND_API_KEY` and
  `RESERVATION_NOTIFY_EMAIL` are set in Vercel. Nothing is charged. Target,
  arbitrary for now: 10 reservations by March 1, 2027. Linked from the
  landing footer; not promoted anywhere yet while the page is refined.
- [ ] **Turn on reservation emails (Josh):** sign up at resend.com, create
  an API key, then in Vercel set `RESEND_API_KEY` and
  `RESERVATION_NOTIFY_EMAIL` and redeploy. The code is live and does
  nothing until both exist. Until then, check `wedding_reservations` in the
  Supabase dashboard.
- [ ] **December keepsake, lite** (after occasions, decided 2026-10-19):
  reuses the occasions print and keepsake pipeline rather than being its own
  build. Sells this December only if that pipeline is ready in time. "Your
  year in songs" from your own journal, as a printed book or a card / print pack carrying
  Soundtracks codes (branded QR, the song's real waveform as art) for walls
  and gifts. AI does the editing (picks and orders entries, crops photos,
  pulls color from artwork, titles sections, never rewrites reflections);
  templates do the layout; buyer previews before print. Partners to choose:
  Prodigi / Gelato (prints, cards, frames), Lulu / Blurb / Gelato (books).
- [ ] **Own pages for search:** gifts and other occasions (`/weddings` is
  live); target "wedding guest
  book ideas", "song guest book", "audio guest book" alternatives.
- **Subscription last**, once people use the journal weekly: the Phase 2
  intelligence, recaps, AI calls, more storage. Never paywall capture or
  your own history; never ads or selling data.
- **Video:** exported video can only use stock music (licensing). Later, if
  at all.

## Not now

More social (friend feeds, following), new Spotify work beyond search and
links (extended API access needs ~250k MAU), the Music Memory Engine
questionnaire/ML, NFC products, Android.

## Tech and backend

- [x] **Landing page rebuilt** (2026-10-19): "One song's life": a night
  drive, then one song (Space Song) captured,
  written about and returned to seven years later, with a sticky phone
  whose screen and date advance with the scroll. Demo journal entries shown
  as entries, a founder note (Josh's words: songs that take him back to
  specific places and people), real app screens, an
  Unsplash photo. `PRODUCT.md` and `.impeccable/` hold the design context.
  Follow-up (2026-10-20): the hero is the night drive (softened) with
  a famous sleeve (Blonde, "Nights") and the app icon's record sliding
  out of it: the song is theirs, the record is yours. The nav and a bar that slides in
  after the hero carry the icon tile + wordmark and the App Store badge.

- [x] **Weekly checks self-heal** (2026-10-14): staging keepalive, E2E
  rebuilds expired simulator archives, fingerprint scripts read eas-cli v24
  JSON.
- [x] **Binary Build submits the build it made** (PR #30).
- [x] **Web share pages on the new system** (2026-10-19): shared moments,
  albums, the guest book, the guest form, the QR page, friend invites,
  email confirm, privacy and terms now use paper and ink (true night in
  dark mode), DM Serif / Newsreader / DM Sans via `next/font`, hairline
  rows, moods as words and Apple's real badge. The cream keepsake card, the
  emoji and the sticky install bars are gone; the install ask sits after
  the content. Shared styles: `web/components/share.module.css` and
  `web/components/Share.tsx`.
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
- [ ] **Fix the 2026-10-19 full review** (109 verified findings). The plan
  and findings are kept out of this public repo until the security items
  ship: `.claude/review-2026-10/` in the owner's checkout.
  - [x] DB-1, RLS hardening step 1 (2026-10-20): tighter album, friendship
    and tag write rules; staging storage policies match prod. Web pages
    read through narrow RPCs.
  - [x] WS-F, backend (2026-10-20): `get_my_profile` and
    `open_shared_moment` RPCs for the app to move onto; sending a moment
    requires a friendship and the share push is tightened; legacy
    `notify-friend` is a no-op; album owners delete guest contributions
    server-side (`delete-guest-moments`), and account deletion covers them
    too and never loops or deletes the user with files left behind;
    notifications use each user's local day and page their queries.
  - [ ] DB-2, RLS hardening step 2: waits for the app changes and the
    min-build gate.
  - [x] WS-G, web, scripts and CI (2026-10-20): the guest form asks for the
    note and photo the server requires and shows its errors; the gift and
    friend clipboard handoff is written on tap; one helper for album moment
    lists; the photo sweep keeps live avatars and thumbnails, checks every
    query and pages past the row cap; E2E builds and runs the promoted
    commit's own JS and promote checks a commit status for it; the schema
    diff compares policy expressions; migrations apply to staging first.
  - [x] WS-A, auth, profile and friends (2026-10-20, branch `ws-a-auth`):
    the app reads its own profile through `get_my_profile()` (falls back to
    an explicit column list until that RPC is deployed) and friend links
    through `get_profile_by_invite_token`. All profile writes go through one
    path in AuthContext (`lib/profile.ts`), so notification toggles no
    longer snap back and Edit Profile saves only the fields that changed.
    Token refreshes no longer re-run startup hydration. Sign-out also clears
    the capture draft and the Spotify session. Friend link and Friends list
    show a retryable error instead of "invalid link" or "no friends". The
    Spotify connect fix is JS; the spotify-remote callback fix is native and
    rides the next binary.
  - [x] WS-C, capture and edit (2026-10-20): create and edit save through
    one path (`lib/momentRow.ts` + `saveMoment` / `updateMoment`). Edit uses
    `LocationField`, so coordinates move with the place name, and keeps the
    stored preview unless the song changed. Failed saves delete the photos
    they uploaded; each photo is decoded once, two at a time; preview lookup
    runs alongside uploads. Storage uploads get a 120s timeout, and only
    GET/HEAD retry on 520. Avatars get a new path per upload (old files are
    deleted). Search races fixed in song search and place search;
    custom-mood delete asks first; prompt-category errors are shown.
    Data-URI artwork is never saved. Native part (needs a binary): no
    base64 artwork from now-playing, systemMusicPlayer read on main,
    ShazamKit restores the audio session.
  - [x] WS-D, albums and browse (2026-10-20, JS only): album screens tell a
    failed request (retry, or a banner over what's already shown) from a
    missing album; invite links offer a retry when offline and land in the
    album after joining; browse drill-downs no longer spin forever or show
    an empty list on failure. Album detail and the Albums screen load in two
    round trips instead of up to five, and artworks are capped per album on
    the server. New albums no longer duplicate when the cover upload fails;
    shared albums finish their guest setup (and retry it). Album covers get
    a new path per upload and the old image is deleted, as is the cover of
    a deleted album. Still to do outside WS-D: the You tab should read the
    Albums screen's query instead of its own.
  - [x] WS-B, moment detail and sharing (2026-10-20, branch `ws-b-detail`,
    JS only): signed-in share links open through `open_shared_moment` (the
    previous lookup until it's deployed): the owner lands on the moment,
    anyone else gets a read-only screen at `/m/[token]` with "add as a
    friend". Links that arrive signed out or on a cold start are opened
    after sign-in. Only the owner can create a link, and a link whose token
    didn't save is never sent. Moment detail uses screen states, refetches
    on focus only when stale or after an edit, and keeps the moment on
    screen with a banner when a refresh fails. Add to Album shows joined
    albums' membership, shows load and save errors and keeps what saved.
    Album owners delete guest contributions through `delete-guest-moments`.
    Moment changes now refresh album lists and album detail; friend changes
    refresh the You summary. "Shared with you" only marks what it shows as
    seen, the share sheet's chips reload on every open, the onboarding
    preview has Retry/Continue on failure, and the detail photo strip uses
    thumbnails.
    Albums screen's query instead of its own (done in WS-E).
  - [x] WS-E, Journal, Rediscover, player (2026-10-20, JS only): the
    timeline disk cache is versioned and shape-checked, so a cache from
    before multi-mood can't crash the first paint. Background refresh and
    the late launch fetch merge the first page instead of dropping loaded
    pages. Playback progress lives in its own context, so cards don't
    re-render on every tick (measure: scroll the Journal during playback);
    stop, pause and previews cancel a pending full play, and ended tracks
    release their listeners. Rediscover and You mount lazily and preload
    after startup; session restore overlaps font loading (measure:
    `app_startup` first_screen and profile marks). On This Day follows the
    current date. Search quotes its terms; undated moments sort last in
    song/album/artist lists; the map frames its moments and tells loading
    and errors from "none"; push taps are routed once. Cards use the tested
    image helper, smaller artwork everywhere in lists, hide deleted custom
    moods, take the user id as a prop, and wait for the action menu to close
    before confirming a delete. Browse drill-downs keep the switcher on
    errors. The You tab reads the shared albums overview.
  - [x] Cleanup (2026-10-20, branch `review/cleanup`): moment detail draws
    playback progress in a child, so the screen no longer re-renders per
    tick; card-column data is typed as `MomentCardData` through the card,
    cache hand-off, calendar and detail preview; the delete confirm opens
    once the action menu has dismissed; one public photo URL helper;
    `friendInviteUrl`; album membership read moved into `lib/albums.ts`;
    `create-guest-user` can be retried safely; the album web page writes
    the invite handoff on tap; DEPLOY.md describes the per-commit E2E gate.
    Still open: list queries (timeline, browse, Rediscover, albums, search,
    shares) still map card rows to a full `Moment`.
- [x] **Pin `eas-cli`** to 25.2.0 in every workflow and the fingerprint
  scripts (v24's JSON rename had broken the gate silently).
- [x] **Wire `lib/authRouting.ts` into `_layout.tsx`:** AuthGate now runs
  the tested `resolveAuthRoute` and only carries out its side effects.
- [x] **Measure before tuning:** `lib/perf.ts` sends `app_startup` (fonts,
  session, cached/fresh profile, gate, first screen, in ms) and
  `moment_created` carries `capture_ms` / `save_ms` / `source`. Tune from
  these numbers, not guesses.
- [x] **React Compiler** (`experiments.reactCompiler` + the babel plugin):
  on in 1.4 (see "Next native build").
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
