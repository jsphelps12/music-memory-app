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
over: `cp .env.prod.local .env`. Copy it back when you're done. Don't hand-edit
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

The workflow checks that a live App Store build actually serves this commit's
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

**1. Bump the version**

In `app.config.ts` (there is no `app.json`):
```ts
version: "1.2.0",
```

- `version`: bump patch for bug fixes, minor for new features, major for breaking changes
- Do **not** set a build number by hand: `eas.json` uses
  `appVersionSource: "remote"` with `autoIncrement`, so EAS assigns it. Editing
  it locally has no effect.

**2. Cut a preview build (internal distribution, not TestFlight)**
```bash
eas build --platform ios --profile preview
```
The `preview` profile is `distribution: "internal"` — EAS emails an install
link; it does not go to TestFlight. For TestFlight use the `production`
profile via the "Production Build" workflow. Takes 15–30 minutes.

**3. Test on TestFlight**

Run through the manual regression checklist (see below) before submitting to App Store.

**4. Cut the production build**
```bash
eas build --platform ios --profile production
```

**5. Submit to App Store**
```bash
eas submit --platform ios --profile production
```
Or submit manually in App Store Connect. Attach the new build, fill in release notes,
submit for review.

**6. After approval — push a matching OTA update**
```bash
eas update --branch production --message "v1.2.0 release"
```
This ensures users who update via the App Store also get the latest JS bundle immediately,
without waiting for the next background update check.

---

## Manual Regression Checklist

Run this on a physical device before every TestFlight build and before every App Store
submission. Check each item — don't skim.

### Auth
- [ ] Sign up with email
- [ ] Sign in with email
- [ ] Apple Sign-In
- [ ] Sign out — confirm push token is cleared (verify in Supabase profiles table)
- [ ] Token refresh — sign in, background the app for 1+ hour, reopen, confirm still logged in

### Core Flow
- [ ] Create a moment — song search, reflection, mood, people, date
- [ ] Now Playing auto-fill — have a song playing in Apple Music, open create screen
- [ ] Share extension — share a song from Apple Music, confirm it pre-fills create screen
- [ ] Edit a moment
- [ ] Delete a moment (swipe or detail screen)
- [ ] Add a photo from camera
- [ ] Add a photo from library
- [ ] Photo viewer — swipe between photos, pinch-to-zoom

### Timeline
- [ ] Timeline loads with correct sections
- [ ] Scroll performance — no jank
- [ ] Month section headers correct
- [ ] Collection chip row — tap a collection, confirm timeline filters
- [ ] Search by song title, artist, reflection text

### Collections
- [ ] Create a collection
- [ ] Add a moment to a collection from the create screen
- [ ] Add a moment to a collection from the moment detail screen
- [ ] Switch collections in the timeline header
- [ ] Toggle a collection public
- [ ] Share the invite link via iOS share sheet
- [ ] Open the shared link on web — confirm it renders correctly
- [ ] Join flow — open a `soundtracks://join?inviteCode={code}` deep link, confirm join screen appears

### Browse Tab
- [ ] On This Day, Moods, People, Years, Calendar sections all load
- [ ] Tap a mood → mood drill-down screen loads moments
- [ ] Calendar highlights correct days

### Shared Tab
- [ ] Shared collections preview section loads
- [ ] Tagged moments preview section loads
- [ ] "See all →" navigates to full-list drill-down screens
- [ ] Pending friend requests / collection invites show as banners

### Profile
- [ ] Avatar upload
- [ ] Display name edit
- [ ] Stats are correct (moment count, storage)
- [ ] Delete Account — confirm all data removed (check Supabase dashboard)
- [ ] Sign out

### Notifications
- [ ] Confirm push token is stored in profiles table after sign-in
- [ ] Trigger a test notification from Supabase edge function

### Misc
- [ ] Dark mode — toggle in iOS settings, confirm app updates correctly
- [ ] Deep link — `soundtracks://join?inviteCode={code}` from Safari opens join screen
- [ ] No console errors or warnings that weren't there before

---

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
