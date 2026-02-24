# Tracks — Deployment Runbook

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
- Changes to `app.json` permissions, entitlements, or bundle ID

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
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "buildConfiguration": "Release" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  }
}
```

- `preview` channel → TestFlight testers
- `production` channel → App Store users

---

## OTA Update (Most Common)

Use this for JS/TS-only changes. No App Store review. Ships in minutes.

### Steps

**1. Verify the change is OTA-safe**
No new native packages, no permission changes, no `app.json` entitlement changes.

**2. Test locally**
```bash
npx expo start
```
Smoke test the affected flow on a physical device.

**3. Push to preview first**
```bash
eas update --branch preview --message "Brief description of change"
```
Install on TestFlight, verify the fix works and nothing else broke.

**4. Push to production**
```bash
eas update --branch production --message "Brief description of change"
```

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

In `app.json`:
```json
{
  "expo": {
    "version": "1.2.0",
    "ios": {
      "buildNumber": "43"
    }
  }
}
```

- `version`: bump patch for bug fixes, minor for new features, major for breaking changes
- `buildNumber`: increment by 1 every binary build — never reuse a number

**2. Cut a preview build for TestFlight**
```bash
eas build --platform ios --profile preview
```
This uploads to TestFlight automatically. Takes 15–30 minutes to build + process.

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
- [ ] Filter by mood
- [ ] Filter by date range
- [ ] Filter by people
- [ ] Search by song title, artist, reflection text
- [ ] Clear filters

### Collections
- [ ] Create a collection
- [ ] Add a moment to a collection from the create screen
- [ ] Add a moment to a collection from the moment detail screen
- [ ] Switch collections in the timeline header
- [ ] Toggle a collection public
- [ ] Share the invite link via iOS share sheet
- [ ] Open the shared link on web — confirm it renders correctly
- [ ] Join flow — open a `tracks://join/{invite_code}` deep link, confirm join screen appears

### Reflections Tab
- [ ] On This Day section loads (or shows correct empty state if no moments on this date)
- [ ] Random resurfacing section loads
- [ ] Tap a moment — navigates to detail

### Profile
- [ ] Avatar upload
- [ ] Display name edit
- [ ] Stats are correct (moment count, storage)
- [ ] Getting Started checklist (once built) — items check correctly
- [ ] Delete Account — confirm all data removed (check Supabase dashboard)
- [ ] Sign out

### Notifications
- [ ] Confirm push token is stored in profiles table after sign-in
- [ ] Trigger a test notification from Supabase edge function

### Misc
- [ ] Dark mode — toggle in iOS settings, confirm app updates correctly
- [ ] Deep link — `tracks://join/{invite_code}` from Safari opens join screen
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

| Channel | Build profile | Who gets it |
|---------|--------------|-------------|
| `preview` | `preview` | TestFlight testers |
| `production` | `production` | App Store users |

Never push directly to `production` without testing on `preview` first.

---

## Common Commands

```bash
# Start dev server
npx expo start

# OTA update to preview (testers)
eas update --branch preview --message "Description"

# OTA update to production (all users)
eas update --branch production --message "Description"

# Rollback production OTA
eas update --rollback-to-embedded --branch production

# Binary build → TestFlight
eas build --platform ios --profile preview

# Binary build → App Store
eas build --platform ios --profile production

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

- [ ] Version and build number bumped in `app.json`
- [ ] Manual regression checklist complete on physical device
- [ ] Sentry is connected and receiving events
- [ ] Release notes written (what's new in this version)
- [ ] Privacy policy URL confirmed live at `music-memory-app.vercel.app/privacy`
- [ ] No console.log statements with sensitive data in the build
- [ ] Supabase Pro plan active (before any real user scale)
