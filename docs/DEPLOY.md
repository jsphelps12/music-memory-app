# Soundtracks — Deployment Runbook

Reference this before every build and submission. Update it when the process changes.

---

## The Two Types of Updates

| Type | When | Review | Time to users |
|------|------|--------|---------------|
| OTA update (EAS Update) | JS/TS changes only | None | Minutes |
| Binary build (EAS Build) | Native changes | App Store review | 1–3 days |

**Default to OTA.** Only cut a binary when you have to.

**OTA-safe changes:**
- Bug fixes in TypeScript/React
- New screens, UI changes
- New Supabase queries
- New JS-only npm packages

**Requires a binary build:**
- New npm package with native code
- New iOS permission (camera, location, etc.)
- Expo SDK version bump
- New or changed native module
- Changes to `app.config.ts` permissions, entitlements, or bundle ID

---

## EAS Setup (One-Time)

If EAS Update isn't configured yet:

```bash
npx eas update:configure
```

Ensure `eas.json` maps builds to channels:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "autoIncrement": true, "simulator": false },
      "env": { "EXPO_PUBLIC_APP_ENV": "preview" }
    },
    "production": {
      "distribution": "store",
      "channel": "production",
      "ios": { "autoIncrement": true },
      "env": { "EXPO_PUBLIC_APP_ENV": "production" }
    }
  }
}
```

- `preview` channel → "Soundtracks β" (internal install link, staging Supabase)
- `production` channel → App Store users (production Supabase)

Supabase URL/key per environment come from EAS environment variables
(`eas env:list --environment preview` / `production`), not from these `env`
blocks. They must be named `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` in both — the app reads those exact names, and a
suffixed name silently ships a binary with no backend.

Both OTA workflows publish with `eas update --environment <preview|production>`,
so bundles read the *same* EAS variables the binaries are built with. There is
no separate set of GitHub secrets for these values to drift from.
`EXPO_PUBLIC_APP_ENV` is the exception — it lives in the eas.json profile `env`
block, which `eas update` does not read, so the workflows set it explicitly.

---

## Local Development

`.env` points at **staging** and builds the **beta** identity. That is deliberate:

- `EXPO_PUBLIC_APP_ENV=preview` makes `app.config.ts` produce "Soundtracks β",
  bundle `com.joshuaphelps.musicmemory.preview`, scheme `soundtracks-beta://`.
  Without it, `expo run:ios` builds `com.joshuaphelps.musicmemory` — the same
  bundle id as the App Store app, so a device build **replaces the store app on
  your phone**.
- The Supabase URL/key are the staging project (`bqyrpahvdukllasafdpv`), so
  local reads and writes never touch production data.

Your local build therefore installs *alongside* the App Store app and alongside
the beta you got from an EAS install link — same identity as the latter, so it
will replace that one.

To reproduce something against production, copy the saved production config
over: `cp scripts/.env.prod.local .env`. Copy it back when you're done. Don't hand-edit
production values into `.env`.

To see whether the current tree can safely ship an OTA to either channel:

```bash
node scripts/fingerprint-check.mjs
```

---

## OTA Update (Most Common)

Use this for JS/TS-only changes. No App Store review. Ships in minutes.

**Preview is automatic.** `.github/workflows/ota-update.yml` publishes to the
`preview` channel on every push to `main`. You do not run `eas update` by hand
for beta, and there is no way to opt out short of not merging.

### Steps

**1. Verify the change is OTA-safe**
No new native packages, no permission changes, no `app.config.ts` entitlement
changes, no `eas.json` or `package.json` `scripts` edits.
`node scripts/fingerprint-check.mjs` answers this definitively — CI runs the same
check (`scripts/fingerprint-gate.mjs`) rather than publishing an update that
reaches nobody. For preview, "no build matches this fingerprint" skips the
publish and passes with a warning (annotation + job summary: cut a preview build
to resume beta updates); gate errors still fail the job. Production always fails.

**2. Test locally**
```bash
npx expo start
```
Smoke test the affected flow on a physical device.

**3. Merge to main**
The OTA workflow publishes to `preview` automatically and uploads sourcemaps to
Sentry. Install the beta, verify the fix works and nothing else broke.

**4. Promote to production**
Run the **Promote to Production** workflow from the Actions tab. Paste the exact
SHA you verified on beta into the `sha` input — leaving it blank promotes
whatever `main` is at that moment, which may not be what you tested.

First run **E2E Smoke** with the same `sha`: promote refuses a commit without a
passing `e2e-smoke/embedded-js` status (see step 7 of "Binary Build" below).

The workflow also checks that a live App Store build actually serves this commit's
runtime version, and refuses to publish otherwise. That refusal is correct: it
means production needs a new binary, not an OTA. There is no bypass, because
bypassing it would publish an update to zero users rather than to some of them.

**5. Monitor Sentry for 30 minutes**
Watch for new crash spikes or error rate increases after the update lands.
Every event carries `update_id` (the OTA's id, or `embedded` for the bundle
inside the binary), `update_channel`, `runtime_version` and
`update_created_at` (set in `app/_layout.tsx` from `lib/sentryTags.ts`), so
`update_id:<id>` narrows an issue to one update.

### Publishing an OTA by hand

When an OTA has to go out from a laptop instead of the Promote workflow, use
the script, not a bare `eas update`:

```bash
scripts/publish-ota.sh "Fix the calendar crash"            # production
scripts/publish-ota.sh "Try the new header" preview        # preview
```

It refuses a dirty tree, moves `.env` aside for the publish and always puts it
back, runs `scripts/fingerprint-gate.mjs` (which prints the runtime version and
refuses one no installed build serves; `SKIP_GATE=1` skips the refusal in an
emergency), then runs the same `eas update --branch … --environment …
--platform ios --non-interactive` as before with `EXPO_PUBLIC_APP_ENV` set.

**Builds made on the Mac.** EAS only lists its own builds, so the gate also
reads `scripts/local-builds.json`. Record every build you archive in Xcode and
send to TestFlight, from the built app, then commit the file:

```bash
node scripts/record-local-build.mjs path/to/Soundtracks.ipa
```

It reads the runtime version from the app's `EXUpdates.bundle/fingerprint`
(what the binary asks the update server for), the channel from `Expo.plist`
and the build number from `Info.plist`; nothing is typed by hand. 1.4.1
build 16 and 1.5.0 build 20 are recorded (build 20 on `main`). With untracked files in the checkout that aren't yours to
commit, publish from a clean worktree of the commit (the script prints how).
The "Cannot find module '@expo/env'" warning during the sourcemap upload is
expected and harmless.

After publishing, it uploads the sourcemaps for that exact bundle: `eas update` exports
into `dist/` with source maps, and the script runs
`eas env:exec <env> "npx sentry-expo-upload-sourcemaps dist"`, which takes
`SENTRY_AUTH_TOKEN` from the EAS environment (nothing to set locally).
Sentry matches maps to errors by the debug id that Sentry's Metro serializer
stamps into the bundle and its map, not by release name, which is why the
upload has to use the very `dist/` that was published. A failed upload doesn't
fail the script (the update is already live) but prints a banner with the
retry command; rerun that from the same commit without exporting again.

### Rollback (if something goes wrong)

Instant rollback to the previous embedded bundle:
```bash
eas update --rollback-to-embedded --branch production
```

Or republish a specific previous update from the EAS dashboard.

---

## Binary Build (Native Changes)

Use this when native code changed. Requires App Store review.

### Steps

**1. Bump the version** (release PR)

In `app.config.ts` (there is no `app.json`):
```ts
version: "1.2.0",
```

- `version`: bump patch for bug fixes, minor for new features, major for breaking changes
- Do **not** set a build number by hand: `eas.json` uses
  `appVersionSource: "remote"` with `autoIncrement`, so EAS assigns it.
- ⚠️ **The bump moves the preview fingerprint too** (measured 2026-10-14:
  `20d72289` → `c4b85ae6`). Once it merges, the installed beta stops receiving
  OTAs and the OTA workflow goes red until a new `preview` build exists. Cut
  the preview builds right after merging (step 2).

**2. Cut the beta builds** via the "Binary Build" workflow
- `preview`: the device build for testers (internal install link, **not** TestFlight)
- `preview-simulator`: what E2E Smoke installs. A production-backend run
  swaps the commit's own JS into the binary, so the binary only has to match
  natively. A run reuses, newest first, a simulator build of that exact
  commit (EAS records its git hash), or (production runs only; a staging run
  tests the binary's embedded JS) a build of an **ancestor** commit when every
  file changed since is JS or docs (`app/`, `components/`, `lib/`,
  `contexts/`, `hooks/`, `constants/`, `types/`, `docs/`, `web/`,
  `supabase/`, `scripts/`, `.github/`, `.maestro/`, top-level `*.md`).
  Anything else (packages, `app.config.ts`, `eas.json`, `ios/`, `modules/`,
  `targets/`, `assets/`, `patches/`) means a fresh build from the commit
  (~15 min with an empty queue, and it spends EAS free-plan quota: the
  monthly iOS builds ran out on 2026-11-16 and blocked a JS-only promote
  until this rule). A `native/1.4` build is never an ancestor of `main`, so
  it can't stand in for a `main` commit.

You can dispatch these against the release branch *before* merging
(`gh workflow run production-build.yml --ref <branch> -f profile=preview`) to
test the exact release candidate on your phone without stranding anyone.

**3. Test on the beta**: run the Manual Regression Checklist below on a device.

**4. Cut and submit the production build**: "Binary Build" workflow with
profile `production` and `submit` checked. It lands in App Store Connect and
appears in TestFlight once processed (10–30 min).

**5. TestFlight pass**: install from TestFlight and run the short TestFlight
section of the checklist. This is production data.

**6. Submit for review** in App Store Connect: create the version, attach the
build, paste "What's New", confirm the demo account, submit.

**7. Later JS-only fixes** go out with the "Promote to Production" workflow,
which requires a green E2E Smoke result on the exact commit. Before a
promote, run "E2E Smoke" with `sha=<commit>`. It installs that commit's own
simulator build with OTA updates turned off, so the flow runs the JS embedded
in that build (not the newest preview OTA), and it posts the commit status
`e2e-smoke/embedded-js` on the commit. Promote reads that status, not the
run's head SHA, and the newest one wins: a later red run on the same commit
blocks the promote again. Scheduled runs post no status.

**Backend (2026-11-15):** E2E Smoke now runs against **production** by
default, because staging is paused on Supabase's free plan. The binary is
still the `preview-simulator` build; the workflow swaps in this commit's JS
exported against the EAS production environment (no native change, analytics
and Sentry off) and checks the bundle really points at production. The
account is `e2e@soundtracks.test` on production, reset by
`scripts/reset-e2e-prod.mjs` signed in *as that user* (anon key + RLS, no
service-role key), so a bug in it can only touch that account. It creates the
account on its first run with the `E2E_PASSWORD` secret. To test against
staging again once it's restored, dispatch with `backend=staging`.

---

### Local builds (Xcode 27, Expo SDK 58)

Production for the App Store (1.4.0 build 12 went this way, 2026-11-17):
`npx eas-cli build --platform ios --profile production --local --non-interactive --output <path>.ipa`
then `npx eas-cli submit --platform ios --profile production --path <path>.ipa --non-interactive`
(the App Store Connect API key is stored on EAS, so no Apple sign-in). Needs
fastlane and CocoaPods on the Mac, and a UTF-8 locale. Trap: a Homebrew
upgrade of Ruby (e.g. installing fastlane) breaks CocoaPods ("Could not
find 'ffi'"); `brew reinstall cocoapods` fixes it.

EAS's free iOS builds are used up until 2026-12-01, so builds run locally
until then (1.4.1 build 16 and 1.5.0 build 20 were both built on the Mac;
`eas build --local`, or Xcode directly). When EAS cloud builds return, check
that their provisioning profiles carry the Journaling Suggestions entitlement
and the widget's App Group before relying on them. Notes:

- Prebuild with `--clean` (apple-targets fails to update an existing project)
  and run CocoaPods with a UTF-8 locale. `plugins/withPodsMinDeploymentTarget`
  lifts pods below iOS 15, which Xcode 27 refuses.
- The preview prebuild names the project `Soundtracksb` (SDK 58 turns the β
  into a "b"): `ios/Soundtracksb.xcworkspace`, scheme `Soundtracksb`. Bundle
  ids are unchanged.
- Staging is paused, so a local build that needs to sign in uses the
  production env (`scripts/.env.prod.local`). Apple Sign-In fails on a β
  build pointed at production (its provider only accepts the store bundle
  id); use email there.
- Device build without the phone attached: `xcodebuild … -destination
  'generic/platform=iOS' -allowProvisioningUpdates`, then
  `xcrun devicectl device install app` once it's connected.
- `ios/ShareExtension` is generated and untracked. After a branch switch
  across that change, re-run the preview prebuild before building, and never
  restore old copies between a prebuild and its build (stale files carry
  production values and break the β share extension).

### IPA checks (inspect the built IPA before submitting)

Written for 1.4.1 and still run for every build: build 12's permission
prompts were too narrow and it shipped without the associated-domains
entitlement, so check the binary, not the config:

```bash
unzip -q -o <path>.ipa -d /tmp/ipa && APP=$(ls -d /tmp/ipa/Payload/*.app)
codesign -d --entitlements :- "$APP"   # applinks:soundtracks.app only (www 308-redirects to the apex); one app group, listed once
plutil -p "$APP/Info.plist" | grep -E 'UsageDescription|Temporary'
```

- The usage strings match the constants at the top of `app.config.ts`
  (Apple Music, Photos, Camera, Location when in use, Microphone, Face ID).
  No `NSSpeechRecognitionUsageDescription`: transcription was dropped from
  1.5 (voice-to-text is the keyboard's dictation).
- No `NSLocationAlways…`, `NSMotionUsageDescription` or
  `NSLocationTemporaryUsageDescriptionDictionary`: the app never asks for them.
- If associated-domains is missing from the signed app, the App ID lacks the
  Associated Domains capability (Apple Developer → Identifiers → the bundle
  id). Turn it on and regenerate the profile: EAS credentials for `eas build
  --local`, or let Xcode do it with automatic signing and
  `-allowProvisioningUpdates`. Then tap a `https://soundtracks.app/m/…` link
  in Notes: it should open the app, not Safari.

### 1.5 checks (the same IPA, on top of the checks above)

1.5 adds Journaling Suggestions, the Memory widget's App Group and the
"Remember this song" App Intent. Build 18 was rejected (ITMS-90626) for the
word "Apple" in App Intent text, so check these before every 1.5 upload:

```bash
unzip -q -o <path>.ipa -d /tmp/ipa && APP=$(ls -d /tmp/ipa/Payload/*.app)
plutil -p "$APP/Info.plist" | grep -E 'CFBundleShortVersionString|CFBundleVersion'
codesign -d --entitlements :- "$APP"
for X in "$APP"/PlugIns/*.appex; do echo "$X"; codesign -d --entitlements :- "$X"; done
plutil -p "$APP/Info.plist" | grep -E 'NSMicrophone|NSSpeech'
grep -ril "apple" "$APP/Metadata.appintents" ; echo "exit $? (1 = no match)"
```

- The version and build in `Info.plist` are the ones you mean to upload
  (build 19 went up as 1.4.1 by mistake).
- The app's entitlements: `applinks:soundtracks.app`, the app group
  `group.com.joshuaphelps.musicmemory`, and
  `com.apple.developer.journal.allow` = `["suggestions"]`.
- The widget appex has the same app group
  (`group.com.joshuaphelps.musicmemory`); without it the Memory widget is
  blank.
- `NSMicrophoneUsageDescription` is there and mentions recording what you
  say; there's no `NSSpeechRecognitionUsageDescription`.
- The App Shortcuts metadata (`Metadata.appintents`) has no "Apple" in any
  intent title, description or phrase (ITMS-90626). The grep matches
  case-insensitively, so look at any hit before deciding.

## Manual Regression Checklist

Run this on a physical device before every App Store submission: once on the
beta build (staging data, "Soundtracks β") and, for the short pass at the end,
on the TestFlight build (production data). Check each item; don't skim.

Rewritten 2026-10-14 for the post-Sharing-v2 app; updated 2026-11-17 for 1.4
(tabs: Journal · Rediscover · You, plus the floating +; Albums and Settings
live under You). Section headings below still use the old tab names.

### 0. Device-only (the simulator cannot run these; do them first)
- [ ] **Apple Music full playback**: open a moment and play the full song (not the 30s preview). Pause, resume, scrub.
- [ ] **Leaving the app pauses playback**: background the app mid-song, confirm the music stops (pull-down Control Center should *not* stop it)
- [ ] **Now Playing auto-fill**: play a song in the Music app, open create, confirm the banner offers it
- [ ] **Share extension from Apple Music**: Share → Soundtracks β, confirm the create screen is pre-filled
- [ ] **Share extension from Spotify**: share a Spotify track link, confirm the Apple Music match or candidate picker appears
- [ ] **Share from Photos**: share a photo to Soundtracks β, confirm the date and location fill in from EXIF
- [ ] **ShazamKit**: identify a song playing nearby, confirm it pre-fills create
- [ ] **Camera**: add a photo from the camera
- [ ] **Push notifications arrive**: see Sharing below (another account sends you a moment)
- [ ] **Spotify as music service** (Me → Music Service → Spotify). Visible in production, so every outcome must end cleanly:
  - Cancel the Spotify sheet → no alert, still on Apple Music
  - Account not on the Spotify dashboard allowlist → "only lets a limited set of accounts…" message, still on Apple Music
  - Connected, no Premium → "Spotify connected" alert explaining previews
  - While on Spotify: search works (or shows Apple Music results with a banner explaining why); playing a moment never opens a Spotify login
  - Switch back to Apple Music works

### Auth
- [ ] Sign in with email, sign out, sign back in
- [ ] Apple Sign-In
- [ ] Sign up with a new email: the confirmation link opens the app and lands signed in
- [ ] Background the app for an hour or more, reopen: still signed in

### Capture
- [ ] Create a moment: song search, reflection, two moods, a person, a date, photos
- [ ] Song search: tap a result's artwork to hear the preview; it stops when you pick a song
- [ ] Moment detail: the 30s preview autoplays; the progress readout shows sensible seconds (e.g. `0:05 / 0:29`) and scrubbing seeks
- [ ] Edit a moment, then delete one (long-press card: the iOS context menu lifts the card; and the detail screen's "…"); the styled confirm sheet appears both times
- [ ] Moment film: tap a photo; it auto-plays and cross-fades through photos and videos, loops, Pause freezes everything, swipe/tap moves, drag down closes

### Moments tab
- [ ] Timeline loads in month sections; scrolling is smooth
- [ ] Cards show mood words under the reflection
- [ ] Calendar and map toggles work, and switching back keeps your scroll position
- [ ] At most one offer (Last week's ask, or the check-in offer) above the timeline

### Reflections tab
- [ ] Search finds moments by title, artist and reflection text
- [ ] On This Day (when you have one), Weekly Rewind, Moods / People / Years / Albums strips, and Surprise Me all render; empty sections stay hidden
- [ ] Tap a mood → mood drill-down loads

### Sharing (two accounts: your phone + the simulator as `e2e2@soundtracks.test`; see "Testing Social Features" below)
- [ ] Share sheet shows three verbs: Send to a person · Add to album · Share a link
- [ ] **Send to a person** → the other account's "Shared with me" pill shows an unread badge → opening it clears the badge → the detail shows "by <sender>"
- [ ] **Push arrives** on the receiving phone for that share, and tapping it opens the right place
- [ ] **Share a link** → "Link is live" row appears → open the `/m/` link in Safari, confirm the cream card page → revoke → the link stops working
- [ ] Share card export: Post and Story variants both render (photo hero, or album art when no photo)
- [ ] SHARED WITH chips: unsend a share and remove an album from the sheet; the confirm sheet appears *over* the share sheet, and the tab bar still responds afterwards
- [ ] Friends: share your friend link, open it on the other account → "X added you" push, both friends lists update

### Albums tab
- [ ] Create an album, add a moment from create and from detail
- [ ] Share the invite link → open on web (`/c/` page renders) → join from the other account
- [ ] QR page opens from the album share sheet

### Me tab
- [ ] Avatar upload; tap the avatar to see it full size
- [ ] Display name edit; stats look right
- [ ] Settings → Notifications: How often, check-in time and Days, the switches all save
- [ ] Delete Account (use a throwaway account): all data gone afterwards (check Supabase)

### New in 1.4
- [ ] Hold +: Start from (Identify, Search, Last week, From before) each opens the right place; the one-time "Hold +" hint shows once
- [ ] Last week: the row appears from Sunday 6pm; a song opens capture with that day's photos suggested and the moment dated to the song
- [ ] From before (end of Rediscover, and its screen): year chips, Show more, dismiss
- [ ] Linked photos/video: add a video from Photos; it plays in the film; turning its sound on ducks the song (preview and full Apple Music)
- [ ] Sharing a moment with linked media uploads the full photos first; a friend never sees your linked videos
- [ ] Face ID lock (Settings → Privacy) asks again after a minute away
- [ ] Export your journal: the PDF builds and the share sheet opens
- [ ] Widgets and Control Center controls open capture / identify in the right app

### New in 1.5
- [ ] Voice: record from capture's Voice chip, play it back, record again, delete it; save. In Edit, the "Your voice" row plays, re-records and deletes. Recording pauses music from other apps
- [ ] Voice in the film: on your own moment with photos, the song starts and your voice comes in about 2.5 s later over the ducked song; Pause, the mic button and closing all bring the song back up
- [ ] Memory widget: small, medium and Lock Screen, in light, dark and tinted Home Screen. With "Show my words on the widget" off there are no words, on shows a line; with the app lock on there are never words (song, artist and date still show). Tapping opens the moment's film
- [ ] Siri "Remember this song" with a song playing in the Music app: unlocked and locked, Siri says what it saved and the moment is in the Journal. Run it twice within 2 minutes: one moment
- [ ] Your day (long-press + → Start from → Your day (Apple)): a pick fills the song, photos, place and people
- [ ] Sign out: the Memory widget goes blank and "Remember this song" no longer saves (the capture key is revoked)
- [ ] App Store Connect: the privacy label includes **Audio Data** (App Functionality, linked to the user) for voice recordings

### Misc
- [ ] Dark mode: flip it in iOS settings, the app follows
- [ ] Min-build gate: the build under test opens normally (`app_config.min_supported_build` is 16 since 2026-11-23; the build must be 16 or later)
- [ ] No new errors in Sentry for the build under test

### TestFlight pass (production build, production data, about 15 minutes)
The production variant has its own bundle ID, app group, scheme and
entitlements, so anything native that differs per variant is only proven here.
- [ ] Sign in with your real account (and once with Apple Sign-In); timeline and photos load
- [ ] Play a moment's song (full Apple Music playback); create one moment and delete it
- [ ] Share extension: share a song from Apple Music to **Soundtracks** (not β)
- [ ] A `soundtracks://` link opens the production app, e.g. an album invite or friend link
- [ ] Open a share link on web
- [ ] Demo account (App Store review notes) still signs in

---

## Installing the Beta on a Device

- The beta is a separate app, **Soundtracks β**, that sits next to the App Store
  app. It talks to **staging**, so sign in with a staging account.
- Builds use internal (ad hoc) distribution: open the build's install link on
  the iPhone in Safari and tap Install. The device's UDID must already be
  registered with EAS (`npx eas-cli device:create` for a new device, and a new
  build afterwards, since the device list is baked into each build).
- iOS 16+ requires **Developer Mode** for ad hoc apps (Settings → Privacy &
  Security → Developer Mode). Without it the app refuses to open.
- **Install links expire after 14 days.** An installed build keeps working and
  keeps receiving OTAs; you just can't install it anew after that.
- The app downloads OTA updates in the background and applies them on the next
  cold start, so force-quit and reopen twice after a merge.

## Testing Social Features

Two staging accounts exist for this: `e2e@soundtracks.test` and
`e2e2@soundtracks.test` ("E2E Two"), already friends with each other. The
password is `E2E_PASSWORD` in `.maestro/.env.e2e.local`.
`node scripts/seed-e2e.mjs` resets both to "friends, nothing shared".

- **Phone + simulator (recommended)**: your phone runs the beta as one account;
  the simulator runs the dev build (`npx expo start`, staging per `.env`) as the
  other. Put the *receiving* account on the phone, so you see real pushes.
- **Two simulators**: `npx expo run:ios --device "<name>"` for each; both use
  the same Metro server.
- Deep links in a simulator:
  `xcrun simctl openurl booted "soundtracks-beta://friend/<token>"`.
  Web pages (`/m/`, `/c/`, `/friend/`) open in any browser.

---

## Web: the occasion E2E

`.github/workflows/occasion-e2e.yml` runs `web/e2e/occasion-flow.mjs` on every
PR that touches `web/`, the occasion functions or migrations, weekly, and on
demand. It builds the PR's web app, serves it, and drives headless Chrome
against **staging**:
- set up a wedding, and open it with staging's dev-activate;
- a guest adds a photo moment on the real page;
- the couple signs in, sees it, closes and reveals;
- the keepsake plays;
- "Share" gives a moment link without the book's key, which opens that
  moment (and a tampered one doesn't);
- the guest page links to the book.

It always deletes its wedding at the end. Screenshots and the server log are
uploaded when it fails. It needs `ALLOW_DEV_PAYMENTS=true` on staging and the
`E2E_PASSWORD` secret.

The database and functions under test are staging's, which is main's. So a PR
that changes an occasion function is tested against the old function until
it merges. Run it locally with the command at the top of the script.

## Admin view: who can see it

`/host/admin` is for accounts in `app_admins`. That table is empty in the
migrations on purpose, because the repo is public. To add yourself, open
each project's Supabase SQL editor (staging and production separately) and
run:

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

To remove someone: `delete from public.app_admins where user_id = '…';`

## Database Migrations

### Rules

**Always safe:**
- Adding a nullable column
- Adding a new table
- Adding an index
- Adding an RLS policy

**Requires multi-phase approach (see below):**
- Renaming a column
- Deleting a column
- Making a nullable column NOT NULL

The app is live while migrations run. Old binary versions will be active for hours or days
after a migration — plan accordingly.

### Multi-phase migration pattern

When you need to rename or restructure a column:

**Phase 1** — Add new column alongside old. Ship OTA code that writes to both.
Old binary still works (reads/writes old column). New code works too.

**Phase 2** — Backfill old data into new column. Remove writes to old column in code.
Ship OTA update.

**Phase 3** — Once no old binaries in the wild (2–4 weeks after Phase 2 ships),
drop the old column in a new migration.

### Running migrations

```bash
supabase db push
```

Or apply manually in the Supabase dashboard SQL editor for quick fixes.
Always commit the migration file to `supabase/migrations/` even if applied manually.

When applying outside `supabase db push` (SQL editor, MCP tools): write the migration
file in the repo first, run its SQL with `execute_sql`, then insert the history row
yourself so the tracked version matches the filename —
`insert into supabase_migrations.schema_migrations (version, name) values ('<filename timestamp>', '<name>')`.
The MCP `apply_migration` tool stamps its own apply-time version, which drifts the
history from the repo (this is how prod and staging diverged before the 2026-07-31
history repair). Apply every migration to **both** prod and staging.

---

## Versioning Reference

```
version:      MAJOR.MINOR.PATCH
buildNumber:  increment by 1 every binary build

MAJOR — breaking change or major new capability (rare)
MINOR — new user-facing feature
PATCH — bug fix or minor improvement

OTA updates do NOT change version or buildNumber.
```

Example progression:
```
1.0.0 (build 1)  — App Store launch
1.0.1 (OTA)      — Fix crash on photo upload
1.0.2 (OTA)      — Fix collection sort order
1.1.0 (build 2)  — Add Getting Started checklist (JS-only, OTA)
1.2.0 (build 3)  — Add widget (native — requires binary)
```

---

## Channels Reference

| Channel | Build profile | Distribution | Who gets it | Published by |
|---------|--------------|--------------|-------------|--------------|
| `preview` | `preview` | `internal` (install link, **not** TestFlight) | Beta testers, "Soundtracks β" | `ota-update.yml`, automatically on every push to main |
| `production` | `production` | `store` | App Store users | `promote-to-production.yml`, manual dispatch |

Never push directly to `production` without testing on `preview` first.

Each channel only receives updates whose `runtimeVersion` exactly matches the one
compiled into the installed binary. `runtimeVersion.policy` is **`fingerprint`**,
so that label is derived from everything affecting the native build rather than
from the `version` string.

What this buys: EAS can never serve JS to a binary lacking the native modules it
references. What it costs: an update built from different native code reaches
**nobody**, and that failure is silent — it reports as a successful publish.
`scripts/fingerprint-gate.mjs` is what turns that silence into a failed job
(production) or a skipped publish with a visible warning (preview, `--skip-if-unserved`).

JS-only changes do not move the label, so ordinary OTAs keep flowing to the same
binary indefinitely. Only native-affecting changes force a new build — including
`eas.json` and the `scripts` block of `package.json`, both of which feed the
fingerprint and are easy to touch by accident.

Binaries cut before this switch carry a version-string runtime (`1.1.0`) and can
never receive a fingerprint-labelled update. They are frozen on the last JS they
got until replaced.

---

## Common Commands

Both OTA channels are published by CI — see the Channels Reference above. The
`eas update` commands below are for emergencies when Actions is unavailable.
They skip the reachability gate, so they cannot crash a binary but can silently
publish to nobody — run `fingerprint-check` first.

```bash
# Start dev server (staging + beta identity, per .env)
npx expo start

# Can this tree safely OTA? Checks both profiles against their live builds
node scripts/fingerprint-check.mjs

# Rollback production OTA
eas update --rollback-to-embedded --branch production

# Manual OTA with the reachability gate and a sourcemap upload (see
# "Publishing an OTA by hand")
scripts/publish-ota.sh "Description"            # production
scripts/publish-ota.sh "Description" preview

# Bare manual OTA: no reachability gate, no sourcemaps (errors arrive minified)
eas update --branch preview --environment preview --message "Description"
eas update --branch production --environment production --message "Description"

# Binary builds run via the "Binary Build" workflow (profile input). Locally:
eas build --platform ios --profile preview      # internal install link
eas build --platform ios --profile production   # App Store

# Submit to App Store
eas submit --platform ios --profile production

# Check build status
eas build:list

# Run Supabase migrations
supabase db push
```

---

## After a Bad Prod Incident

1. **Rollback OTA immediately** if the issue is JS-only:
   ```bash
   eas update --rollback-to-embedded --branch production
   ```
2. Check Sentry for the error — get the stack trace before fixing anything
3. Fix locally, test on preview branch, push to production
4. If it's a native crash: submit a hotfix binary build as a new version
5. Write a one-paragraph post-mortem in `docs/` — what broke, why, what changed

---

## Before Every App Store Submission

- [ ] Version bumped in `app.config.ts` (build number is automatic — `appVersionSource: remote`)
- [ ] `/audit` run (the project skill; private report in `.claude/audits/`, never committed): no open critical, highs fixed or consciously accepted
- [ ] Manual regression checklist complete on physical device
- [ ] Sentry is connected and receiving events
- [ ] Release notes written (what's new in this version)
- [ ] Privacy policy URL confirmed live at `soundtracks.app/privacy`
- [ ] No console.log statements with sensitive data in the build
- [ ] Supabase Pro plan active (before any real user scale)
