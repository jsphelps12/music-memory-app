# 1.5 plan

Drafted 2026-11-23 from Josh's scope (docs/ROADMAP.md, "1.5"). This is the
working plan: what each piece is, how it's built, what needs a new binary
and what can go over the air first, and the decisions still open. Update it
as pieces land; the roadmap keeps the one-line status.

## Scope

Not in 1.5 (Josh, 2026-11-23): setting the part of the song automatically
from Playing now or Identify. Neither is accurate enough; picking it by hand
(live on 1.4.1) works well enough.

| # | Feature | Needs the 1.5 binary? |
|---|---------|------------------------|
| 1 | Memory widget: one moment a day on the Home Screen, opening into the film | Yes (widget views, app-group writer) |
| 2 | Voice entries, recordings kept | Recording and playback: **no**, can ship now. Transcription: yes |
| 3 | "Remember this song" from Siri, Shortcuts and the Action button, saved in the background | Yes (App Intent in the app) |
| 4 | Journaling Suggestions: Apple's picker of your day's songs, photos and places | Yes, and Apple's entitlement (Josh: request it now) |
| 5 | Offline saves: capture with no signal, saved when you're back online | **No**, can ship before 1.5 |
| 6 | Polish (below) | Mostly no |

Added 2026-11-23 (Josh): Journaling Suggestions, offline saves, the
background save, and a polish pass.

Also rides the binary: the app-wide ink tint for system alerts and the widget's
colors (from the 2026-11-19 color audit).

## 1. Memory widget

**What it is.** A Home Screen widget that shows one of your moments each day:
the artwork, the song, the date ("Three years ago today" when it is one), and
optionally a line of your words. Tapping it opens that moment and plays its
film. A Lock Screen version shows the song and when.

**How it works.**
- The widget can't sign in or query the database, so the app hands it what it
  needs. Whenever the app has fresh moments (launch, foreground, after a save),
  it picks the next 7 days of moments, downloads small artwork (300 px) and
  writes them as one small file into the App Group container the app already
  has (`group.com.joshuaphelps.musicmemory`), then asks iOS to reload the
  widget. The widget rotates through the week on its own, with no app launch.
- Which moment: "on this day" from an earlier year first; otherwise one at
  least 30 days old that hasn't been shown recently. The pick is the same
  through the day and is worked out on the phone (`lib/widgetPicks.ts`, tested).
- Native work: one function on the app's own module (`modules/now-playing`) to
  write the file and call `WidgetCenter.reloadAllTimelines()`; new SwiftUI
  views in `targets/widget` (small, medium, Lock Screen rectangular).
- Tap target: a deep link to the moment with the film open (`/moment/<id>?film=1`,
  a new param on the detail screen).

**Privacy.**
- With the app lock (Face ID) on, the widget shows only the song and date,
  never words or photos.
- Words on the Home Screen: see the open decisions below.
- Sign-out and account deletion clear the widget's file and reload it blank
  (added to the sign-out teardown, like every other per-user device record).

**Effort:** about 3–4 days, including the widget views and their light/dark checks.

## 2. Voice entries

**What it is.** Hold a button in capture to say what the song is doing for
you. The recording is kept with the moment, and on the phone it's transcribed
into the reflection, which you can then edit. Your voice plays on the moment
and in the film, with the song turned down under it, and later feeds "Your life
as a radio show".

**Can ship before 1.5.** Recording, upload and playback need nothing new in the
binary: `expo-audio` already records and the microphone permission is already
granted for Identify. Only transcription needs native work. So:
- **Now, as an update to 1.4.1:** record (AAC, mono, about 0.5 MB a minute,
  3-minute cap), upload, play on the moment.
- **In 1.5:** on-device transcription (Apple's speech recognizer with
  on-device recognition only; nothing leaves the phone), plus the
  speech-recognition permission string.

**Data and privacy.** A voice is more personal than a photo, so recordings get
stricter rules than photos do:
- A new **private** storage bucket (`moment-voice`, `{user_id}/` folders, owner
  read and write only), played through short-lived signed links. The photo
  bucket stays public; this one doesn't.
- New columns `moments.voice_path` and `voice_duration_ms`, both nullable
  (additive migration, applied before the update).
- Owner-only to start: the shared view (`moment_view_for`) leaves the voice
  out, so people a moment is shared with don't see it. Sharing voice to
  friends is a later decision.
- Deleted with the moment and with the account; drafts keep an unsent
  recording on the device.

**Effort:** recording, upload and playback about 2 days (plus the migration);
transcription about 1 day in 1.5.

## 3. "Remember this song", saved in the background

An App Intent in the app, so it works from Siri ("Hey Siri, remember this
song"), Shortcuts and the Action button, with the screen off and without
opening the app. It saves what's playing as a moment (song, part of the song
where it was, date, time). Siri says what it saved ("Saved Holocene by Bon
Iver"). No notification follows (Josh, 2026-11-23: no more pushes); the
moment is in the Journal like any other, ready for words.

**How it saves without the app open.** The intent runs in Swift, outside the
JavaScript app, so it can't use the app's sign-in directly. Sharing the
app's session with it is risky: Supabase rotates refresh tokens, and if the
intent refreshed one the app would be signed out. Instead:
- On sign-in the app asks a new edge function (`capture-key`) for a
  **capture key**: a random secret, stored hashed on the server, that can only
  add a moment for that one person. The app keeps it in the keychain, shared
  with the intent.
- The intent reads the playing song (`MPMusicPlayerController`), looks it up
  in the iTunes catalog and sends it with the key to an edge function
  (`quick-capture`), which checks the key and saves the moment.
- Sign-out and account deletion revoke the key on the server and delete it
  from the keychain. Keys can be listed and revoked per device later.
- No song playing, no signal: the intent says so ("Nothing's playing") and
  saves nothing; with no signal it offers to open the app instead.

**Effort:** about 3–4 days (two edge functions, a table for keys, the intent).

## 4. Journaling Suggestions

Apple's own picker (the one Apple's Journal app uses) showing your day: songs
you listened to, photos, places, workouts, people. Picking a song suggestion
opens capture with it filled in; photos and the place come along.
- Needs Apple's entitlement (`com.apple.developer.journal.allow`), which
  Apple grants on request. **Josh: request it now**; it can take weeks.
- iOS 17.2+; the picker is Apple's SwiftUI view, shown from a small native
  view module, and the app only gets what the person picks.
- Where it lives: long-press + → Start from → "Your day (Apple)", next to
  Last week. Help's list of ways into capture gets it in the same change.
- If the entitlement isn't granted in time, it waits for 1.5.1; nothing
  else depends on it.

**Effort:** about 2 days once the entitlement is granted.

## 5. Offline saves

Today a capture with no signal fails to save; the words survive as a draft,
but it isn't saved. Offline saves make Save always work:
- With no connection (or a failed save), the moment goes into an on-device
  outbox (the same storage drafts use, photos copied alongside) and the
  Journal shows it at the top with "Saves when you're back online".
- When the connection returns (NetInfo, app foreground), the outbox saves
  each one in order: preview lookup, photo uploads, the row; a failure keeps
  it in the outbox and tries again later, never twice (each has its own id,
  the same id `saveMoment` already uses to check a lost response).
- Sign-out clears the outbox only after asking ("2 moments haven't saved
  yet"); that's the one place it could lose something.
- Pure JavaScript, so it can ship as an update before 1.5.

**Effort:** about 3 days.

## 6. Polish

A pass over everything before 1.5 goes to review, mostly over the air:
- The rest of the color cleanup: over-image glass tokens, one shadow token,
  a lint rule against hex colors in screens.
- Small journals: Rediscover and Insights show a teaser instead of
  emptiness when there are only a few moments.
- Reading the archive: search across words, songs and people, and browsing
  that makes old moments easy to land on.
- Josh's list from using 1.4.1 day to day (added as it comes).
- The 1.5 audit (`/audit`) before submitting, and anything it finds.

**Effort:** a few days, spread over the 1.5 work.

## Order

1. **Now, over the air to 1.4.1:** voice recording, upload and playback
   (migration first, then the update), and offline saves. Polish as it comes.
2. **Branch `native/1.5`** off `main` (1.4.1 is released and merged).
3. **Native batch:** the app-group writer, transcription, the alert tint, the
   capture-key keychain. Then the widget views, the film deep link, the
   background intent and its edge functions, and Journaling Suggestions if
   the entitlement has come through.
4. **Build:** EAS cloud builds are back 2026-12-01; a Mac build works too
   (record it with `scripts/record-local-build.mjs` so updates reach it).
5. **Test:** Maestro flows for voice capture; the widget
   by hand on Josh's phone (Maestro can't drive the Home Screen). TestFlight,
   then the App Store.

## Decisions (Josh, 2026-11-23: "go with your suggestions on all of them")

1. **Widget words:** song and date by default; "Show my words on the widget"
   in Settings turns a line of the reflection on.
2. **Widget pick:** "on this day" from an earlier year first, else one at
   least 30 days old that hasn't been shown recently.
3. **Widget sizes:** small, medium and the Lock Screen version.
4. **Voice to friends:** owner-only for now.
5. **Voice length:** 3 minutes.
6. **Voice before 1.5:** recording and playback ship as an update to 1.4.1.
7. **Transcript (1.5):** fills the reflection when it's empty; offered as
   "Use what you said" when there's already writing.
8. **Voice in the film:** over the song, with the music turned down.
9. **After a background save:** no notification at all (no more pushes).
10. **Siri's reply:** says what it saved.
11. **Signing out with unsaved moments:** asks first ("2 moments haven't
    saved yet").
12. **Journaling Suggestions:** long-press + → Start from → "Your day
    (Apple)", and in Help's ways into capture.
13. **Polish:** Josh's list from daily use goes in as it comes.
14. **Order:** voice recording and offline saves as updates first, then
    `native/1.5`.
