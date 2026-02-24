# Tracks — App Store Launch Checklist

Last updated: February 2026. This is the single source of truth for everything that needs
to happen before and after launch. Cross-reference `PRODUCTION-READINESS.md` for deep
context on each item.

---

## Milestone 1 — Hard Blockers (Must ship before App Store submission)

These are non-negotiable. Apple will reject without them. Estimates are rough.

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
  `music-memory-app.vercel.app/privacy`. Submit the URL in App Store Connect.
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

### Observability (Day One — you need this before any users)
- [ ] **Sentry** (`@sentry/react-native`) — crash reporting + error tracking. Without this
  you will not know why users are dropping off or what's crashing. Free tier is fine.
  _Effort: 2–3 hours_

### Process
- [ ] **Deployment Runbook** — Write a checklist in `docs/DEPLOY.md`:
  - How to bump the version + build number in `app.json` and `eas.json`
  - How to cut a TestFlight build (`eas build --profile production`)
  - How to cut a preview build vs a production build
  - What to manually test before submitting to review
  - How to roll back if a bad build ships (TestFlight previous build)
  _Effort: 1–2 hours_

---

## Milestone 2 — Before Wide Marketing Push (Security + Stability)

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
- [ ] **PostHog** (or Mixpanel) — product analytics. Track: moment created, collection
  shared, invite link opened, join completed. Free tier is generous.
  _Effort: 2–3 hours_

### Build Process
- [ ] **EAS preview build profile** — Add `preview` profile to `eas.json` for internal
  TestFlight testing, separate from production. Keeps in-progress builds off the same
  track as release candidates.
  _Effort: 30 minutes_

- [ ] **Phase B.5: Deferred Deep Links** — Invite codes need to survive App Store installs.
  When a non-user opens `/c/{invite_code}`, try `tracks://join/{invite_code}` first;
  if app not installed, send to App Store with the code stored for after install.
  Options: Branch.io (easiest), Adjust, or custom Vercel → App Store redirect.
  _Effort: 1–2 days (mostly Branch.io setup)_

### Design Refresh
- [ ] **Get Figma mocks from designer** — The app works well but the visual design could
  be more distinctive. Worth getting a designer to look at: timeline cards, moment detail,
  the color palette, typography choices, and the web preview page. Even 4–8 hours of a
  designer's time can make a meaningful difference before launch.
- [ ] **Implement design updates** — Once mocks exist, implement them. Scope depends on
  depth of changes. Start with the highest-visibility surfaces: timeline, moment detail,
  create screen.

---

## Milestone 3 — Before Significant User Growth (Scalability)

Do these before any press coverage, app store featuring, or paid marketing.

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
  more on scroll). Also: switch `select("*")` to explicit column list for list view; fetch
  full data only when opening a moment.
  _Effort: quick fix 1 hour, proper pagination 1–2 days_

### Infrastructure
- [ ] **Upgrade Supabase to Pro** ($25/month) — Free tier is 1 GB storage / 2 GB bandwidth.
  1000 users × 50 moments × 3 photos × ~300KB = ~45 GB. You will hit the free limit almost
  immediately at any real scale. Do this before any marketing push.

- [ ] **Offline detection banner** — `@react-native-community/netinfo` + persistent banner
  when connectivity lost. Currently all Supabase calls fail silently when offline.
  _Effort: 2–3 hours_

### CI/CD
- [ ] **GitHub Actions CI pipeline** — Type check + lint on every push/PR:
  ```yaml
  - run: npx tsc --noEmit
  - run: npx eslint .
  ```
  Prevents regressions from reaching TestFlight.
  _Effort: 1–2 hours_

---

## Milestone 4 — UX Polish (Ongoing, do before App Store featuring)

### Accessibility
- [ ] **Add `accessibilityLabel` to all icon-only buttons** — filter icon, calendar toggle,
  share icon, close buttons, FAB. Minimum viable VoiceOver support. Apple reviewers
  occasionally test with VoiceOver on.
  _Effort: 2–3 hours_
- [ ] **Add `accessibilityRole="button"` to touchable elements** — anywhere you're using
  `TouchableOpacity` or `Pressable` for buttons that aren't `<Button>` components.
  _Effort: 1–2 hours_
- [ ] Full Dynamic Type support — lower priority, can follow after launch.

### Error Handling
- [ ] **Fix silent collection load failure** — `loadCollections()` in `app/(tabs)/index.tsx`
  swallows errors silently. Log + show a subtle retry.
  _Effort: 30 minutes_

- [ ] **Fix race condition on moment + collection create** — `app/create.tsx` inserts a moment
  then adds to collection in a second query with `.catch(() => {})`. If second call fails,
  moment exists but isn't in the collection with no user feedback. Remove silent catch,
  show toast, let user retry from moment detail.
  _Effort: 1 hour_

### Input Validation
- [ ] **Add `maxLength` props to all text inputs**:
  - Reflection text: 5000 chars
  - Location: 200 chars
  - Display name: 60 chars
  - People tags: 50 chars each
  - Collection name: 100 chars (CreateCollectionModal already has 60 — verify consistency)
  _Effort: 1–2 hours_

### Visual Polish
- [ ] **Image loading placeholders** — Artwork and photos snap in with no transition on slow
  connections. Add blurhash or shimmer shimmer animation.
  _Effort: 1–2 hours_

- [ ] **First-run onboarding** — New users don't know about: share extension (receiving songs
  from Apple Music), Now Playing auto-fill, or collections. Consider a one-time tooltip
  or "what's here" sheet on first launch.
  _Effort: half a day_

---

## Milestone 5 — Testing (Before App Store Submission)

- [ ] **Integration tests for critical flows** — auth (sign-in, sign-out, token refresh),
  moment create, and the `tracks://join/{invite_code}` deep link flow. Don't try to
  retrofit unit tests everywhere — these three are where a bug would be catastrophic.
  _Effort: 1–2 days_

- [ ] **Manual regression checklist** — Write a short doc (`docs/DEPLOY.md`) of what to
  manually test before every TestFlight build: auth, create moment, edit, delete, share
  extension, collections, join flow, photo viewer, notifications.

---

## Post-Launch — Next Big Features

These are intentionally deferred. Do the above first, then revisit based on real usage data.

### Platform Expansion
- [ ] **Android app** — Doubles addressable market. Biggest effort item on this list.
  MusicKit is iOS-only; Android equivalent for song search/preview needs investigation
  (Spotify Web API, iTunes Search API for metadata, or a different approach).
  Start planning after App Store launch is stable.

- [ ] **Full Apple Music integration** — Full in-app playback for Apple Music subscribers
  (not just 30-second previews). Requires `DEVELOPER_TOKEN` and MusicKit entitlement.
  Background playback, custom player UI, Now Playing controls.

- [ ] **Full Spotify integration** — Spotify native auth + full playback for Spotify Premium
  subscribers. Cross-search from Spotify → Apple Music is already done. Full integration
  requires Spotify SDK and separate entitlement/review. Investigate Spotify's app review
  process before starting.

### Social / Sharing
- [ ] **Friends + social tagging** (Phase C/D) — `friendships` table, request/accept UI,
  social tagging that creates `tagged_moments`, inbox for accepting/hiding tagged moments.
  Revisit after App Store launch with real usage data. See `docs/SOCIAL-ARCHITECTURE.md`.

- [ ] **Shareable moment cards** — Exportable graphic: artwork + song + reflection quote + date.
  Vertical/story format for Instagram & TikTok. Multiple templates.

- [ ] **Web app enrichment** (Phase E) — Profile pages, shareable moment cards on web,
  full web companion (keyboard create/edit). See `docs/SOCIAL-ARCHITECTURE.md`.

### Premium / Monetization
- [ ] **RevenueCat paywall** — $4.99/month or $39.99/year. Conversion trigger: at 25–30
  moments, show a locked Era card.
- [ ] **Era clustering** (AI premium) — Cluster moments into life chapters with generated names.
  Needs 25+ moments to be meaningful. THE conversion trigger for premium.
- [ ] **Insights + analytics** — Mood trajectory, music taste evolution, pattern recognition.

### Other
- [ ] **Full-text search index** — When search performance becomes a real complaint:
  ```sql
  CREATE INDEX moments_search_idx ON moments
    USING GIN(to_tsvector('english', coalesce(song_title, '') || ' ' ||
                                      coalesce(song_artist, '') || ' ' ||
                                      coalesce(reflection_text, '')));
  ```
- [ ] **iOS home screen widget** — Now Playing with one-tap "save moment," or On This Day.
- [ ] **Apple Watch app** — One tap on wrist logs current song.
- [ ] **Export/backup** — Let users download their data.
- [ ] **Offline support** — Queue uploads when offline (significant effort).

---

## Rough Launch Sequence

```
Now            → Milestone 1 (blockers): delete account, Phase B join flow,
                 privacy policy, nutrition label, Sentry, runbook

+2–4 weeks     → Milestone 2 (pre-marketing): security fixes, analytics,
                 EAS preview profile, Phase B.5 deferred deep links,
                 design refresh (get mocks, implement)

+4–6 weeks     → Submit to App Store (first submission)

Post-approval  → Milestone 3 (scalability): indexes, pagination, Supabase Pro,
                 offline banner, CI pipeline

Ongoing        → Milestone 4 (UX polish): accessibility, error handling,
                 image placeholders, onboarding

Post-launch    → Android, full music integrations, friends/social, premium
```

---

## Open Decisions (Decide before building each phase)

| Question | Status |
|----------|--------|
| Phase B.5: Branch.io vs custom deferred deep link? | Undecided |
| Design refresh: scope + designer engagement? | Undecided |
| Android: MusicKit alternative for song search? | Needs investigation |
| Spotify full integration: entitlement path? | Needs investigation |
| Monetization: soft paywall at 25 moments or hard gate? | Tentative: soft |
| Phase E web: profile pages public or friends-only? | Undecided |
