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
check (`scripts/fingerprint-gate.mjs`) and fails the job rather than publishing
an update that reaches nobody.

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
- `preview-simulator`: what E2E Smoke installs. A commit run uses only a
  simulator build of that exact commit (EAS records its git hash) and builds
  one from the commit if none exists (~15 min with an empty queue), so cutting
  it now from the release commit saves the wait. The scheduled weekly run just
  reuses the newest build.

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

---

## Manual Regression Checklist

Run this on a physical device before every App Store submission: once on the
beta build (staging data, "Soundtracks β") and, for the short pass at the end,
on the TestFlight build (production data). Check each item; don't skim.

Rewritten 2026-10-14 for the post-Sharing-v2 app (tabs: Moments · Reflections ·
Albums · Me). The old Browse and Shared tabs no longer exist.

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
- [ ] Edit a moment, then delete one (long-press card and detail screen); the styled confirm sheet appears both times
- [ ] Photo viewer: swipe between photos, pinch to zoom

### Moments tab
- [ ] Timeline loads in month sections; scrolling is smooth
- [ ] Cards show bare mood emoji(s) beside the date
- [ ] Calendar and map toggles work, and switching back keeps your scroll position
- [ ] The search icon lands on Reflections with search focused

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
- [ ] Notification toggles save
- [ ] Delete Account (use a throwaway account): all data gone afterwards (check Supabase)

### Misc
- [ ] Dark mode: flip it in iOS settings, the app follows
- [ ] Min-build gate stays inert: the app opens normally (`app_config.min_supported_build` is still 1)
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
`scripts/fingerprint-gate.mjs` is what turns that silence into a failed job.

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

# Emergency manual OTA — no reachability gate; may publish to zero users
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
- [ ] Manual regression checklist complete on physical device
- [ ] Sentry is connected and receiving events
- [ ] Release notes written (what's new in this version)
- [ ] Privacy policy URL confirmed live at `soundtracks.app/privacy`
- [ ] No console.log statements with sensitive data in the build
- [ ] Supabase Pro plan active (before any real user scale)
