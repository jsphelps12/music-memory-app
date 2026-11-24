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
where it was, date, time) and a quiet notification later offers "Add your
words", which opens that moment's Edit.

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

**Effort:** about 3–4 days (two edge functions, a table for keys, the intent,
the notification).

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
  emptiness when there are only a few moments. **Built 2026-11-24 (update to
  1.4.1):** a "Coming up" section (`lib/comingUp.ts`,
  `components/ComingUpRows.tsx`). Rediscover, while no moment is a year old:
  the first moment coming back on this day (its date), the weekly rewind's
  start while everything is from this month, and when the year in review
  opens or how many more moments it needs. Insights: each section not shown
  yet with how many more moments it needs; a section with enough moments
  but no clear pattern is never promised. Rows go away as they unlock.
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

## Decisions for Josh

1. **Words on the widget:** show a line of your words, or only the song and
   date (words behind a setting)?
2. **Which moment:** "on this day" first, then something at least 30 days old.
   OK?
3. **Voice to friends:** owner-only at first (proposed), or shareable from day one?
4. **Voice length:** a 3-minute cap OK?
5. **Voice before 1.5:** ship recording and playback as an update to 1.4.1
   now (proposed)?
6. **Background save notification:** "Add your words" a while after a
   background save (proposed: the next morning at 10, with the daily
   push rules), or right away?
