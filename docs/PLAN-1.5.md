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
| 2 | Voice entries, recordings kept | Yes: no native code for recording and playback, but build 16's microphone text only covers Identify (decided 2026-11-23). Transcription: native |
| 3 | "Remember this song" from Siri, Shortcuts and the Action button, saved in the background | Yes (App Intent in the app) |
| 4 | Journaling Suggestions: Apple's picker of your day's songs, photos and places | Yes (a capability; no request to Apple) |
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

**Built (2026-11-23, branch `native-1.5/widget`, needs the 1.5 binary):**
- Picks: `lib/widgetPicks.ts` (tested). Each day: a moment from the same
  day in an earlier year first ("3 years ago today"), else one at least 30
  days old not shown in the 30 days before that day and not already picked
  that week. Ties go to a hash of user, day and moment, so a day's pick
  doesn't change on every rewrite. A day with nothing old enough is left
  empty ("Your moments will show here").
- Writer: `lib/widgetData.ts`, fed the whole library from the Journal's
  shared `["browseMeta", uid]` cache (`hooks/useMemoryWidget.ts`, no new
  query). Artwork is downloaded at 300 px and copied in by the native side;
  `widget/moments.json` is versioned (`version: 1`). Runs when the library
  loads or changes, on return to the app (at most every 30 minutes unless
  the day changed), and when the words setting or the app lock changes.
- Words: Settings → Privacy → "Show my words on the widget", off by
  default, per account. With it on, the first line of the picked moments'
  reflections (one read of at most 7 of the owner's rows); never with the
  app lock on. The widget only ever gets the song's artwork, never photos.
- Native: `writeWidgetData`, `clearWidgetData`, `reloadWidgets` and
  `appGroupPath` on `modules/now-playing` (`WidgetStore.swift`), null-safe
  on older binaries. The extension's App Group is named in
  `targets/widget/expo-target.config.js` (it was already mirrored).
- Views: `targets/widget/MemoryWidget.swift`, small (artwork full-bleed,
  date and title over a night scrim), medium (artwork, song, artist, date,
  optional line), Lock Screen rectangular (date, song, artist). The gallery
  shows a made-up moment. Tap: `<scheme>:///moment/<id>?film=1`; the
  moment screen opens the film once when the moment has photos.
- Sign-out and account deletion: `clearMemoryWidget()` in AuthContext's
  teardown; the settings go with the `widget_` sign-out prefix.
- Still to check on a phone: light/dark and tinted Home Screen, artwork
  sharpness at 300 px on the small size, the film opening from a cold
  start, and the widget turning over at midnight.

## 2. Voice entries

**What it is.** Hold a button in capture to say what the song is doing for
you. The recording is kept with the moment, and on the phone it's transcribed
into the reflection, which you can then edit. Your voice plays on the moment
and in the film, with the song turned down under it, and later feeds "Your life
as a radio show".

**In 1.5, all of it (decided 2026-11-23).** Recording, upload and playback
need no native code (`expo-audio` already records), but build 16's
microphone permission text says the app only listens while identifying a
song, so voice waits for 1.5's new text instead of going over the air:
- **v1 (built):** record (AAC, mono, about 0.5 MB a minute, 3-minute cap),
  upload, play on the moment.
- **Then:** on-device transcription (Apple's speech recognizer with
  on-device recognition only; nothing leaves the phone), plus the
  speech-recognition permission string.

**Transcription (built 2026-11-23, branch `native-1.5/speech`).**
- Native, in `modules/on-device-ai` (`ios/SpeechTranscription.swift`):
  `transcribeFile(uri, localeId?)` returns `{ text, segments: [{ text,
  startMs, durationMs }], locale }`. On iOS 26 it uses Apple's
  SpeechAnalyzer (always on-device) when the phone supports the language;
  otherwise SFSpeechRecognizer with `requiresOnDeviceRecognition`. If the
  phone can't recognize the language on-device it stops with
  `unsupported`; it never sends audio to Apple's servers. If iOS 26's
  speech model for the language isn't on the phone yet and the older
  recognizer can do it, the older one takes this recording and the model
  downloads in the background for next time (a model download; the audio
  stays put). Errors have stable codes: `denied`, `unsupported`,
  `no_speech`, `failed`. Also `speechAuthorizationStatus()` and
  `requestSpeechAuthorization()`; `transcribeFile` asks for permission
  itself the first time.
- JS: the module's `index.ts` wraps them null-safely (a binary before 1.5
  gets `{ ok: false, reason: "unavailable" }`). `lib/transcription.ts` has
  `transcribeRecording(uri)` → `{ ok: true, text } | { ok: false, reason }`
  (text tidied by `cleanTranscript`: spacing, a capital, a full stop; never
  reworded), and `applyTranscript(reflection, text, templates)` →
  `fill` / `offer` / `none` (Decision 7). Tested in
  `lib/__tests__/transcription.test.ts`.
- **How the voice sheet calls it** (a few lines once both land): after a
  recording stops, `transcribeRecording(uri)`; on `ok`, `applyTranscript`
  with capture's `reflection` and `templates`. `fill` puts the words in the
  reflection (replacing a starter or prompt); `offer` shows "Use what you
  said" under the recording; `none` and any failure show nothing, and the
  recording is kept either way. A recording that couldn't be transcribed
  is still a voice entry.
- Permission string: `NSSpeechRecognitionUsageDescription` (`SPEECH_USAGE`
  in `app.config.ts`). The microphone string still says it only listens
  for Identify; it needs updating with voice recording.
- To check in the 1.5 build: the permission prompt, accuracy with music
  in the background, a language the phone can't do on-device (expect no
  text, no error shown), iOS 26 vs older, and the first run on iOS 26
  before the speech model is downloaded.

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

**Status (2026-11-23): v1 built, shipping in 1.5.** Decided 2026-11-23: it
moved from an over-the-air update to 1.4.1 into the 1.5 build, because
build 16's microphone permission text says the app only listens while
identifying a song. 1.5's `app.config.ts` says "…to identify a song playing
around you, and to record what you say about a moment. It only listens
while you're identifying a song or recording." Built on
`feat/voice-entries`: record (up to 3:00, mono AAC m4a at 64 kbps), save,
play on the moment, for the owner only, with no native changes. Capture's
"Voice" chip and Edit's "Your voice" row open
`components/VoiceRecorderSheet.tsx`; drafts keep the take on the phone
(`lib/voiceFiles.ts`); `lib/saveMoment.ts` uploads it with the photos and
writes `voice_path`/`voice_duration_ms` (dropped and the upload deleted on a
database without the columns); the moment plays it through a signed URL
(`hooks/useVoicePlayer.ts`), pausing the song; deleting the moment deletes
the file. Still to do: apply the migration before 1.5 ships, check
recording and the audio session on a device, then transcription and the
film.

## 3. "Remember this song", saved in the background

An App Intent in the app, so it works from Siri ("Hey Siri, remember this
song"), Shortcuts and the Action button, with the screen off and without
opening the app. It saves what's playing as a moment (song, date, time; no
part of the song: that's only ever picked by hand, the player's position
isn't accurate enough). Siri says what it saved ("Saved Holocene by Bon
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
- The intent reads the playing song (`MPMusicPlayerController`) and sends it
  with the key to an edge function (`quick-capture`), which checks the key,
  looks the song up in the iTunes catalog and saves the moment.
- Sign-out (global, like the app's) revokes every device's key and deletes
  this one from the keychain; account deletion cascades. The server revokes
  every key when a user's last session ends (global sign-out, sessions
  revoked by an admin, expiry) and when the password changes; the app also
  drops its key whenever it finds itself without a session. Keys
  expire after 90 days regardless (the app replaces its key every 30 days).
  Keys can be listed and revoked per device later.
- No song playing, no signal: the intent says so ("Nothing's playing") and
  saves nothing; with no signal it offers to open the app instead.

**Effort:** about 3–4 days (two edge functions, a table for keys, the intent).

**Built (2026-11-25, branch `native-1.5/bgsave`; not deployed):**
- Migration `20261125000000_capture_keys.sql`: `capture_keys` (SHA-256 of
  the secret, a per-install `device_id`, label, created/last used/revoked;
  owners can read the bookkeeping columns, never the hash; no client writes)
  and `'background'` added to `moments.capture_source`; triggers revoke a
  person's keys when their password changes (`auth.users`) and when their
  last session ends (`auth.sessions`, skipped with a warning if that table
  is missing or the migration role can't add triggers to it).
- `capture-key` (signed in): POST `{deviceId, deviceLabel}` returns a new
  key once and revokes that install's old one (10 live keys a person, the
  least recently used retired past that; 20 new keys an hour); DELETE
  revokes all the caller's keys (sign-out) or one install's.
- `quick-capture` (`Authorization: Capture <key>`, verify_jwt off): checks
  the key by hash, looks the song up on iTunes for the preview and details,
  saves the moment with the service role as the key's owner (date and time
  of day where the phone was; no words, no part of the song), 30 an hour,
  and the same song again within 2 minutes returns the first moment. Keys
  over 90 days old are refused. DELETE lets a key revoke itself.
- The intent (`plugins/remember-this-song/RememberThisSong.swift`, put in
  the app target by `plugins/withRememberThisSong.js`) with the phrases
  "Remember this song in / Save this song to Soundtracks". Apple Music only
  (the system player doesn't see Spotify).
- The app issues the key on launch while signed in (`lib/captureKey.ts`,
  keychain via expo-secure-store) and replaces it after 30 days, revokes
  every device's key before its global sign-out (this phone's key revokes
  itself if that can't reach the server) and clears it with the per-user
  teardown. Whenever the app
  finds itself without a session (the session ended some other way, a
  corrupt stored session, a signed-out launch after a reinstall) the key
  leaves the keychain and revokes itself.
- Still to do: apply the migration and deploy both functions (staging, then
  production with Josh's go), then try it on a phone: Siri, the Shortcuts
  app, the Action button, locked and unlocked.

## 4. Journaling Suggestions

Apple's own picker (the one Apple's Journal app uses) showing your day: songs
you listened to, photos, places, workouts, people. Picking a song suggestion
opens capture with it filled in; photos and the place come along.
- No request to Apple: it's the Journaling Suggestions capability
  (`com.apple.developer.journal.allow` in `app.config.ts`, both variants);
  signing turns it on for the App ID.
- iOS 17.2+; the picker is Apple's SwiftUI view, and the app only gets what
  the person picks.
- Where it lives: long-press + → Start from → "Your day (Apple)", next to
  Last week. Help's list of ways into capture gets it in the same change.

**Built 2026-11-24** (branch `native-1.5/journaling`):
- `modules/journaling-suggestions` (pod `SoundtracksJournaling`: a pod named
  `JournalingSuggestions` would shadow Apple's module). The SDK has a
  programmatic modifier, `journalingSuggestionsPicker(isPresented:onCompletion:)`
  (iOS 17.2), so no tap on Apple's `JournalingSuggestionsPicker` button is
  needed: the row presents a clear full-screen SwiftUI host over the menu
  sheet, which raises Apple's picker at once. Closing the picker leaves the
  menu up; a pick reads the suggestion's items in Apple's order and returns
  plain JSON. The framework is only in the device SDK, so the code is behind
  `canImport` + `#if !targetEnvironment(simulator)` + `@available(iOS 17.2)`,
  weak-linked for device builds; `isAvailable` is false on the simulator,
  iOS before 17.2 and binaries before 1.5 (module missing), and the row
  is hidden there.
- What a pick fills (`lib/yourDay.ts`, tested): the first Apple Music song
  (another app's media, iOS 18, only without one) matched in the Apple Music
  catalog, then the iTunes search; same title, version and artist fills it,
  several close ones use capture's "which song" picker, none keeps the
  suggestion's own title and artist (as Last week does). Photos and Live
  Photo stills as copies in `Caches/journaling-suggestions/` (up to 10;
  cleared at the next pick and on sign-out; a draft or the outbox keeps its
  own copies). The first named place (with coordinates when Apple has them),
  contacts' names as people, and the suggestion's start as the date.
  Workouts, videos, podcasts and the rest have nowhere to go yet.
- `capture_source 'your_day'`, migration
  `20261126000000_capture_source_your_day.sql` (not applied). Until it is,
  a save with a value the CHECK doesn't list retries without
  `capture_source` (`lib/optionalColumns.ts`).
- Privacy: nothing leaves the phone until Save except the song's title and
  artist to Apple's catalog search (as every song lookup does). PostHog gets
  `your_day_picked` with counts and flags only.
- Still to do: apply the migration (staging, then production with Josh's
  go), then try it on a phone: picking, closing, a suggestion with no song,
  photos from iCloud.

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

**Offline saves (engine), built 2026-11-23** (branch `feat/offline-saves`, no
screens touched):
- `lib/outbox.ts`: the outbox per user (`capture_outbox_v1_<userId>`, cleared
  by prefix in `lib/signOutKeys.ts`). Each item keeps the moment id it will
  save under, a JSON copy of the save (new fields like a voice recording
  round-trip as they are; the date as epoch ms), and its last failure:
  offline (tried again on every flush, never counts toward giving up),
  server (backoff 30 s, 2 min, 10 min, then hourly; rejected after 8), or
  rejected (a 4xx, validation or permission error; stays visible, never
  retried on its own; `retryOutboxItem` or `removeOutboxItem`). Storage calls
  run one at a time; `subscribeOutbox` tells listeners after each change.
- `lib/outboxFiles.ts`: photos and `voiceUri` are copied into
  Documents/capture-outbox/<userId>/<momentId>/ (stored relative to the app's
  folders, like drafts) and deleted when the moment saves, is discarded, or
  on sign-out. Library photos keep their asset id.
- `lib/outboxFlush.ts`: `flushOutbox` saves due items one at a time, oldest
  first (offline stops the run, a 5xx moves on, a refusal marks it
  rejected; one flush at a time); `classifyOutboxError`; `queueFailedSave`
  (queues a failed save, or returns null when retrying won't fix it);
  `startOutboxFlushing` (on start, back online, foreground, and a timer for
  the next backoff); `clearOutbox`, `outboxCount`.
- `saveMoment` takes `momentId`; a retry of a save that already landed
  (23505, or found by the read-back) returns the stored row and deletes the
  retry's own uploads.
- `hooks/useOutbox.ts`: the signed-in user's items, newest first, split into
  pending and rejected.

**Offline saves (UI), wired 2026-11-23** (same branch, JavaScript only, an
update to build 16):
- Capture (`app/create.tsx`) picks the moment id on the first Save and keeps
  it across retries of that screen (a new form gets a new one). With no
  connection (`isDeviceOnline()`, lib/appFocus.ts) it queues straight away;
  when `saveMoment` throws it calls `queueFailedSave` (null: the error shows
  as before, draft kept). Queued, it's a save for the person: the draft goes,
  capture closes, and the Journal (or the album capture came from) shows
  "Saved on your phone. It'll go up when you're back online." (the list
  notice, `setListNotice` in lib/timelineRefresh.ts). Event
  `moment_queued_offline` (reason, counts and flags only).
- Root (`app/_layout.tsx`): `startOutboxFlushing` while a user is signed in,
  stopped on sign-out or a change of account. Each save runs
  `handleOutboxSaved` (lib/outboxSaved.ts): moment and album caches,
  `markTimelineStale` with the moment, `moment_created` with the same
  properties plus `from_outbox` and `queued_ms`, the milestone check; the
  Journal, when focused, catches up at once. Server and rejected failures go
  to Sentry from the flush (tags only, no content).
- Journal (Yours): waiting moments above the first month as quieter cards
  (`components/OutboxCard.tsx`: dimmed artwork, "Saves when you're back
  online"); refused ones say "Couldn't save" and why, with Try again and
  Discard ("Discard this moment? It hasn't been saved."). No empty state
  while one is waiting. testIDs `outbox-card`, `outbox-retry`,
  `outbox-discard`.
- Sign-out (`app/settings.tsx`): with moments waiting (or an outbox that
  can't be read) it asks "2 moments haven't saved yet" / "They're only on
  this phone. Signing out deletes them." (Sign out anyway / Stay signed in).
  `clearOutbox` runs in AuthContext's teardown, account deletion included.
- Words and event properties are pure in `lib/outboxUi.ts` (tested).

To check on a phone before it goes out:
1. Airplane mode on, capture a song with writing and a photo, Save: capture
   closes, the notice shows, the card is at the top of the Journal with
   "Saves when you're back online". Long-press + → Continue a draft has no
   draft of it.
2. Airplane mode off with the Journal open: within a few seconds the card
   goes and the moment appears in its place, photo included (and in its
   album, if one was picked). One moment, not two.
3. Airplane mode on, capture, then kill the app. Airplane mode off, reopen:
   the moment saves on launch.
4. Airplane mode on, capture two, go to Settings → Sign out: it asks "2
   moments haven't saved yet"; Stay signed in keeps them; Sign out anyway
   deletes them (sign back in: no cards).
5. Rejected (hard to reach on purpose): a moment the server refuses shows
   "Couldn't save" with Try again / Discard; Discard asks first.
6. Normal online save still works and shows no notice.

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
   background intent and its edge functions, and Journaling Suggestions.
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
6. **Voice before 1.5:** first decided as an update to 1.4.1, then moved
   into the 1.5 build: build 16's microphone text only covers Identify.
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
14. **Order:** offline saves as an update first, then `native/1.5`
    (voice included).
