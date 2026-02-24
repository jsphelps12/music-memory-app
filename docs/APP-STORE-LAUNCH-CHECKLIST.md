# Tracks — App Store Launch Checklist

Last updated: February 2026. This is the single source of truth for everything that needs
to happen before and after launch. Cross-reference `PRODUCTION-READINESS.md` for deep
context on technical items.

---

## Milestone 1 — Hard Blockers (Must ship before App Store submission)

These are non-negotiable. Apple will reject without them.

### Features
- [ ] **Delete Account** — Button in profile/settings, confirmation dialog, Supabase edge
  function (service role) that deletes all moments, photos, collections, profile row, and
  auth.users entry. Cascading deletes already set up on most tables; verify storage cleanup.
  _Effort: 2–3 days_

- [ ] **Phase B: Shared Collections Join Flow** — Anyone with the invite link can join.
  Required before launch so the viral/acquisition loop is closed.
  - [ ] `collection_members` table migration (collection_id, user_id, joined_at — no roles yet)
  - [ ] Handle `tracks://join/{invite_code}` deep link in root `_layout.tsx`
  - [ ] Join screen — collection name, owner display name, moment count, "Join" button
  - [ ] Contributor attribution — who added each moment in the collection view
  - [ ] Update web CTA to "Open in Tracks →" linking to `tracks://join/{invite_code}`
  - See `docs/SOCIAL-ARCHITECTURE.md` for the full spec
  _Effort: 3–4 days_

### Legal / App Store Admin
- [ ] **Privacy Policy** — Write or generate a policy covering: data collected (email, name,
  photos, music metadata, location, device ID), storage (Supabase, US), third parties
  (Apple MusicKit, Expo push, iTunes API), user rights (access + deletion). Host at
  `music-memory-app.vercel.app/privacy`. Submit URL in App Store Connect.
  _Effort: 2–4 hours_

- [ ] **Apple Nutrition Label** — Declare in App Store Connect:
  - Email address (auth, linked to identity)
  - Name/display name (profile, linked to identity)
  - Photos/videos (moment photos, linked to identity)
  - Music/audio (song metadata + artwork, linked to identity)
  - Location (reverse-geocoded from EXIF/GPS at moment creation, linked to identity)
  - User content (reflection text, people tags, linked to identity)
  - Device identifiers (push notification token, linked to identity)
  _Effort: 1–2 hours in App Store Connect_

### Observability
- [ ] **Sentry** (`@sentry/react-native`) — crash reporting + error tracking. Without this
  you will not know why users are crashing or where they drop off. Free tier is fine.
  _Effort: 2–3 hours_

### Process
- [ ] **Deployment Runbook** — Write `docs/DEPLOY.md`:
  - How to bump version + build number in `app.json`
  - How to cut a preview vs production EAS build
  - What to manually test before submitting to review
  - How to roll back if a bad build ships
  _Effort: 1–2 hours_

---

## Milestone 2 — Onboarding, Activation & Retention

**Why this is a milestone, not a polish item:** Most apps lose 60–80% of users in the
first week. The core retention mechanic in Tracks (On This Day, Reflections) only pays off
after users have enough moments and time. The job of onboarding is to get users invested
before they churn. The activation target is **5 moments logged** — empirically, users who
hit this are far more likely to stick.

### First-Run Onboarding Flow
- [ ] **Welcome screens** (2–3 screens, shown once after sign-up):
  - Screen 1: Value prop — "Tracks remembers what music means to you"
  - Screen 2: "Start with a song" — drop them into create screen immediately,
    pre-filled with Now Playing if available
  - Screen 3: "We'll resurface it" — show a preview of what On This Day looks like
    ("In a year, we'll remind you of this moment")
  - Keep it short. Users skip long onboarding. Get them to their first moment fast.
  _Effort: 1–2 days_

- [ ] **Share extension primer** — After the first moment is saved, show a one-time
  banner: "Tip: Share any song from Apple Music directly to Tracks →". Most users
  will never discover the share extension on their own. This is the highest-value
  feature to surface early.
  _Effort: 2–3 hours_

- [ ] **Now Playing auto-fill explanation** — First time the Now Playing banner appears
  on the create screen, add a brief tooltip: "We detected what's playing — tap to fill in
  the song automatically." One-time, dismissible.
  _Effort: 1–2 hours_

### Getting Started — Feature Discovery Checklist (Profile Tab)
A persistent checklist in the profile tab that helps users explore every major feature.
Visible until all items are checked, then collapses to a small "Explored everything ✓"
badge. Each item is tappable and navigates to the relevant screen or shows a brief tip.

**Checklist items:**
- [ ] Log your first moment *(auto-checked on first save)*
- [ ] Try the share extension *(links to instructions or triggers a demo)*
- [ ] Add a photo to a moment
- [ ] Explore the Reflections tab
- [ ] Use the calendar view
- [ ] Search or filter your moments
- [ ] Create a collection
- [ ] Share a collection with someone
- [ ] Tag someone in a moment

**Why the profile tab:** Non-intrusive — users find it when they're ready, not forced on
them mid-flow. Naturally where "account and app settings" live. Persists so users can
return to it. Gives a sense of progress and completeness.

_Effort: 2–3 days (UI + tracking completion state per user in DB or AsyncStorage)_

### Retention Mechanics (Near-Term)
- [ ] **Weekly in-app digest** — A simple "Your week in music" card on the Reflections tab
  or as a push notification: "You logged 3 songs this week. Your top mood: nostalgic."
  Pulls forward a Phase 6 item because the payoff is immediate. Even a basic version helps.
  _Effort: 1–2 days_

- [ ] **Retention funnel tracking in PostHog** — Instrument the activation funnel from day one:
  - `sign_up`
  - `first_moment_created`
  - `fifth_moment_created` (activation threshold)
  - `share_extension_used`
  - `collection_shared`
  - `on_this_day_notification_opened`
  Without this you cannot know where users are churning or whether changes help.
  _Effort: 2–3 hours (alongside PostHog setup in Milestone 3)_

---

## Milestone 3 — Before Wide Marketing Push (Security + Stability)

Do these before sharing invite links publicly or doing any marketing.

### Security
- [ ] **Replace service role key in web app** — Add RLS policies so public collections are
  readable without the service role, then swap to anon key in `web/lib/supabase.ts`:
  ```sql
  CREATE POLICY "Anyone can view public collections"
    ON public.collections FOR SELECT USING (is_public = true);

  CREATE POLICY "Anyone can view moments in public collections"
    ON public.moments FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.collection_moments cm
        JOIN public.collections c ON c.id = cm.collection_id
        WHERE cm.moment_id = moments.id AND c.is_public = true
      )
    );

  CREATE POLICY "Anyone can view profiles of public collection owners"
    ON public.profiles FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.collections
        WHERE user_id = profiles.id AND is_public = true
      )
    );
  ```
  _Effort: half a day_

- [ ] **Clear push token on sign-out** — One-liner in `signOut()` in `AuthContext.tsx`:
  `UPDATE profiles SET push_token = NULL WHERE id = user.id`
  _Effort: 30 minutes_

- [ ] **Remove console.logs from edge function** — `supabase/functions/send-notifications/index.ts`
  logs user IDs, push tokens, and moment data. Gate behind `LOG_LEVEL` env var or remove.
  _Effort: 30 minutes_

### Analytics
- [ ] **PostHog** (or Mixpanel) — product analytics. See retention funnel events in Milestone 2.
  Also track: collection created, invite link opened, join completed. Free tier is generous.
  _Effort: 2–3 hours_

### Build Process
- [ ] **EAS preview build profile** — Add `preview` profile to `eas.json` for internal
  TestFlight testing, separate from production.
  _Effort: 30 minutes_

- [ ] **Phase B.5: Deferred Deep Links** — Invite codes need to survive App Store installs.
  When a non-user opens `/c/{invite_code}`, try `tracks://join/{invite_code}` first;
  if app not installed, send to App Store with the code stored for after install.
  Options: Branch.io (easiest), Adjust, or custom Vercel → App Store redirect.
  _Effort: 1–2 days (mostly Branch.io setup)_

### Design Refresh
- [ ] **Get Figma mocks from designer** — Worth getting a designer to look at: timeline cards,
  moment detail, color palette, typography, the web preview page. Even 4–8 hours of a
  designer's time before launch is meaningful. Include the Getting Started checklist UI
  in the brief so it's designed alongside the rest.
- [ ] **Implement design updates** — Start with highest-visibility surfaces: timeline,
  moment detail, create screen. Scope depends on depth of changes.

---

## Milestone 4 — Before Significant User Growth (Scalability)

Do these before any press coverage, App Store featuring, or paid marketing.

### Database
- [ ] **Composite index on moments** — Optimizes the core timeline query:
  ```sql
  CREATE INDEX moments_user_date_idx ON moments(user_id, moment_date DESC);
  ```
- [ ] **Index on collection_moments** — Optimizes collection filtering:
  ```sql
  CREATE INDEX collection_moments_collection_id_idx ON collection_moments(collection_id);
  ```
  _Effort: 30 minutes (migration + deploy)_

- [ ] **Pagination on timeline** — Currently fetches all moments with no limit. Short-term:
  add `.limit(200)` as a quick guard. Proper fix: cursor-based pagination (load 50, fetch
  more on scroll). Also: switch `select("*")` to explicit column list for list view.
  _Effort: quick fix 1 hour, proper pagination 1–2 days_

### Infrastructure
- [ ] **Upgrade Supabase to Pro** ($25/month) — Free tier is 1 GB storage / 2 GB bandwidth.
  You will hit it almost immediately at any real scale.

- [ ] **Offline detection banner** — `@react-native-community/netinfo` + persistent banner
  when connectivity lost. Currently all Supabase calls fail silently when offline.
  _Effort: 2–3 hours_

### CI/CD
- [ ] **GitHub Actions CI pipeline** — Type check + lint on every push/PR:
  ```yaml
  - run: npx tsc --noEmit
  - run: npx eslint .
  ```
  _Effort: 1–2 hours_

---

## Milestone 5 — UX Polish (Before App Store Featuring)

### Accessibility
- [ ] **Add `accessibilityLabel` to all icon-only buttons** — filter, calendar toggle,
  share, close, FAB. Apple reviewers occasionally test with VoiceOver.
  _Effort: 2–3 hours_
- [ ] **Add `accessibilityRole="button"` to touchable elements** that aren't native `<Button>`.
  _Effort: 1–2 hours_
- [ ] Full Dynamic Type support — lower priority, can follow after launch.

### Error Handling
- [ ] **Fix silent collection load failure** — `loadCollections()` in `app/(tabs)/index.tsx`
  swallows errors. Log + show a subtle retry.
  _Effort: 30 minutes_
- [ ] **Fix race condition on moment + collection create** — `app/create.tsx` silently swallows
  collection add failure. Remove `.catch(() => {})`, show toast, let user retry.
  _Effort: 1 hour_

### Input Validation
- [ ] **Add `maxLength` to all text inputs**: reflection (5000), location (200),
  display name (60), people tags (50 each), collection name (100).
  _Effort: 1–2 hours_

### Visual Polish
- [ ] **Image loading placeholders** — blurhash or shimmer on artwork and photo load.
  _Effort: 1–2 hours_

---

## Milestone 6 — Testing (Before App Store Submission)

- [ ] **Integration tests for critical flows** — auth (sign-in, sign-out, token refresh),
  moment create, and `tracks://join/{invite_code}` deep link. These three are where a
  bug would be catastrophic.
  _Effort: 1–2 days_

- [ ] **Manual regression checklist** — Add to `docs/DEPLOY.md`: what to manually test
  before every TestFlight build: auth, create, edit, delete, share extension, collections,
  join flow, photo viewer, notifications, Getting Started checklist.

---

## Post-Launch — Next Big Features

Intentionally deferred. Do the above first, then revisit based on real usage data.

### Platform Expansion
- [ ] **Android app** — Doubles addressable market. Biggest effort item on the list.
  MusicKit is iOS-only; Android needs investigation (Spotify Web API, iTunes Search API,
  or different approach for song search/preview). Plan after App Store launch is stable.

- [ ] **Full Apple Music integration** — Full in-app playback for Apple Music subscribers
  (not just 30-second previews). Requires `DEVELOPER_TOKEN` + MusicKit entitlement.
  Background playback, custom player UI, Now Playing controls.

- [ ] **Full Spotify integration** — Spotify native auth + full playback for Spotify Premium.
  Cross-search Spotify → Apple Music is already done. Full integration requires Spotify SDK
  and separate entitlement/review process. Investigate before starting.

### Social / Sharing
- [ ] **Friends + social tagging** (Phase C/D) — `friendships` table, request/accept UI,
  social tagging → `tagged_moments`, inbox. Revisit post-launch with real usage data.
  See `docs/SOCIAL-ARCHITECTURE.md`.

- [ ] **Shareable moment cards** — Exportable graphic: artwork + song + reflection quote + date.
  Vertical/story format for Instagram & TikTok. Multiple templates.

- [ ] **Web app enrichment** (Phase E) — Profile pages, shareable moment cards on web,
  full web companion (keyboard create/edit). See `docs/SOCIAL-ARCHITECTURE.md`.

### Premium / Monetization
- [ ] **RevenueCat paywall** — $4.99/month or $39.99/year.
- [ ] **Era clustering** (AI premium) — Cluster moments into life chapters with generated names.
  Needs 25+ moments to be meaningful. THE conversion trigger for premium.
- [ ] **Insights dashboard** — Mood trajectory, music taste evolution, pattern recognition.

### Engagement (Phase 6 items worth pulling forward post-launch)
- [ ] **Forgotten songs** — Surface songs logged exactly once, never again.
- [ ] **Song anniversaries** — "One year ago today, you first logged this song."
- [ ] **Personal charts** — Most-logged songs/artists ranked by year.
- [ ] **Weekly Recap** — Spotify Wrapped-style in-app summary of the week.

### Other
- [ ] **Full-text search index** — When search performance becomes a complaint.
- [ ] **iOS home screen widget** — Now Playing one-tap save, or On This Day.
- [ ] **Apple Watch app** — One tap on wrist logs current song.
- [ ] **Export/backup** — Let users download their data.
- [ ] **Offline support** — Queue uploads when offline (significant effort).

---

## Rough Launch Sequence

```
Now            → Milestone 1 (blockers): delete account, Phase B join flow,
                 privacy policy, nutrition label, Sentry, runbook

+2–3 weeks     → Milestone 2 (onboarding): first-run flow, share extension primer,
                 Getting Started checklist in profile, weekly digest, funnel tracking

+3–5 weeks     → Milestone 3 (pre-marketing): security fixes, PostHog, EAS preview,
                 Phase B.5 deferred deep links, design refresh

+5–7 weeks     → Submit to App Store (first submission)

Post-approval  → Milestone 4 (scalability): indexes, pagination, Supabase Pro,
                 offline banner, CI pipeline

Ongoing        → Milestone 5 (UX polish): accessibility, error handling,
                 image placeholders

Post-launch    → Android, full music integrations, friends/social, premium,
                 engagement features
```

---

## Open Decisions (Decide before building each phase)

| Question | Status |
|----------|--------|
| Phase B.5: Branch.io vs custom deferred deep link? | Undecided |
| Getting Started: completion state in DB (synced) or AsyncStorage (local)? | Undecided |
| Onboarding: how many screens before first moment? | Tentative: 2 max |
| Design refresh: scope + designer engagement? | Undecided |
| Android: MusicKit alternative for song search? | Needs investigation |
| Spotify full integration: entitlement path? | Needs investigation |
| Monetization: soft paywall at 25 moments or hard gate? | Tentative: soft |
| Phase E web: profile pages public or friends-only? | Undecided |
