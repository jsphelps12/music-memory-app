# 1.5 plan

Drafted 2026-11-23 from Josh's scope (docs/ROADMAP.md, "1.5"). This is the
working plan: what each piece is, how it's built, what needs a new binary
and what can go over the air first, and the decisions still open. Update it
as pieces land; the roadmap keeps the one-line status.

## Scope

| # | Feature | Needs the 1.5 binary? |
|---|---------|------------------------|
| 1 | Memory widget: one moment a day on the Home Screen, opening into the film | Yes (widget views, app-group writer) |
| 2 | The part of the song, set automatically (Playing now, Identify) | Yes (player position, Shazam offset) |
| 3 | Voice entries, recordings kept | Recording and playback: **no**, can ship now. Transcription: yes |
| 4 | Siri / Shortcuts / Action button: "Remember this song" (stretch) | Yes (App Intent in the app) |
| — | Journaling Suggestions | Waits on Apple's entitlement (Josh: request it now) |

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

## 2. The part of the song, set automatically

Version 1 (picking it by hand) is live on 1.4.1. In 1.5 it fills itself in:
- **Playing now:** the system player knows its position
  (`MPMusicPlayerController.currentPlaybackTime`). Add `positionMs` to the
  now-playing snapshot; when capture fills the song from Playing now, it also
  sets the part to where the song was when you opened capture.
- **Identify:** ShazamKit reports how far into the song the match was
  (`SHMatchedMediaItem.predictedCurrentMatchOffset`). Return it from
  `modules/shazam-kit`; the part becomes the exact second you heard.
- The chip shows "At 2:41" either way, and Clear is one tap.

**Effort:** about 1 day (two small native changes and the wiring in capture).

## 3. Voice entries

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

## 4. Siri: "Remember this song" (stretch)

An App Intent in the app, so it works from Siri, Shortcuts and the Action
button:
- **1.5 version:** opens straight into capture with the playing song and its
  part already filled in. Simple, and uses the same capture screen.
- **Later version:** saves in the background without opening the app, with
  the screen off. That needs the session shared with the intent (shared
  keychain), a native save path, and a "finish this one" nudge later. It's a
  bigger piece, so not in 1.5.

**Effort:** about 1 day for the 1.5 version.

## Order

1. **Now, over the air to 1.4.1:** voice recording, upload and playback
   (migration first, then the update). Josh can use it before 1.5 exists.
2. **Branch `native/1.5`** off `native/1.4.1` once 1.4.1 is released and
   merged into `main`.
3. **Native batch:** player position and Shazam offset, the app-group writer,
   transcription, the alert tint. Then the widget views, the film deep link,
   and the Siri intent.
4. **Build:** EAS cloud builds are back 2026-12-01; a Mac build works too
   (record it with `scripts/record-local-build.mjs` so updates reach it).
5. **Test:** Maestro flows for voice capture and the auto part; the widget
   by hand on Josh's phone (Maestro can't drive the Home Screen). TestFlight,
   then the App Store.

## Decisions for Josh

1. **Words on the widget:** show a line of your words, or only the song and
   date (words behind a setting)?
2. **Which moment:** "on this day" first, then something at least 30 days old.
   OK?
3. **Voice to friends:** owner-only at first (proposed), or shareable from day one?
4. **Voice length:** a 3-minute cap OK?
5. **Auto part:** set it automatically (proposed, one tap to clear), or ask
   ("Use 2:41?")?
6. **Voice before 1.5:** ship recording and playback as an update to 1.4.1
   now (proposed)?
7. **Offline saves** were on the earlier 1.5 list (save with no signal, sync
   later). In or out?
