# Tracks — Production Readiness

Last updated: February 2026. Revisit before each major release.

---

## TL;DR

The app has solid security fundamentals (RLS enforced everywhere, proper auth flow, no
exposed secrets in code). But there are **two hard App Store blockers**, **one real security
risk** in the web app, and **scalability debt** that becomes painful past ~500 moments per
user. None of these are insurmountable — most are 1–3 day fixes.

---

## App Store Blockers (Must Fix Before Submission)

### 1. No Account Deletion Feature 🚨
**Apple has required this since June 2022. Apps without it get rejected.**

The profile screen has a Sign Out button but no way to permanently delete an account and
its data. This is also a GDPR requirement.

What's needed:
- "Delete Account" button in the profile/settings screen (with confirmation dialog)
- Supabase edge function (service role) that deletes:
  - All moments and their photos from storage
  - All collections and collection_moments
  - The profile row
  - The auth.users entry (requires service role)
- Cascading deletes on most tables are already set up — need to verify storage cleanup

**Estimated effort:** 2–3 days

---

### 2. No Privacy Policy 🚨
Apple requires a privacy policy URL at submission. The web app (`music-memory-app.vercel.app`)
is the natural home for it.

What the policy must cover:
- What data is collected (see Apple Nutrition Label section below)
- How it's stored (Supabase, US-based)
- Third parties data is shared with (Apple MusicKit, Expo push, iTunes API)
- User rights (access, deletion — which the delete account feature covers)
- Contact email for privacy requests

**Estimated effort:** 2–4 hours (use a generator, customize, host at `/privacy`)

---

### 3. Apple Privacy Nutrition Label — Incomplete Declaration
App Store Connect requires accurate data type declarations. Based on the codebase,
the following must be declared:

| Data Type | Collected? | Linked to Identity? | Notes |
|-----------|-----------|---------------------|-------|
| Email address | Yes | Yes | Auth |
| Name/display name | Yes | Yes | Profile |
| Photos/videos | Yes | Yes | Moment photos |
| Music/audio | Yes | Yes | Song metadata, artwork |
| Location | Yes | Yes | Reverse-geocoded from EXIF or GPS |
| User content | Yes | Yes | Reflection text, people tags |
| Device identifiers | Yes | Yes | Push notification token |

The location declaration is the most likely to be missed. `expo-location` is installed
and `reverseGeocodeAsync` is called at moment creation. This must be declared.

**Estimated effort:** 1–2 hours in App Store Connect

---

## Security Issues

### 4. Service Role Key in the Web App — Real Risk, Manageable
**File:** `web/lib/supabase.ts`

The Next.js collection preview page uses the Supabase service role key, which bypasses
all RLS. If this key leaks (Vercel misconfiguration, accidental logging, breach), an
attacker has full read/write access to the entire database — all users' moments, photos,
profiles, everything.

**Current mitigations:**
- Key is in Vercel environment variables only (not in code, not in git) ✓
- Only used in server components — never bundled to the client ✓
- `.env.local` is gitignored ✓

**The proper fix:** Add RLS policies so public collections are readable without the service
role key, then downgrade to the anon key for the web app.

```sql
-- Add to a new migration
CREATE POLICY "Anyone can view public collections"
  ON public.collections FOR SELECT
  USING (is_public = true);

CREATE POLICY "Anyone can view moments in public collections"
  ON public.moments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collection_moments cm
      JOIN public.collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id AND c.is_public = true
    )
  );

CREATE POLICY "Anyone can view profiles of public collection owners"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE user_id = profiles.id AND is_public = true
    )
  );
```

Then swap `SUPABASE_SERVICE_ROLE_KEY` for `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `web/lib/supabase.ts`.

**Priority:** Fix before any significant user growth. Fine for TestFlight scale now, but
not acceptable if the web app URL gets widely shared.

**Estimated effort:** Half a day

---

### 5. Photo Privacy — Obscurity, Not Access Control
**Bucket:** `moment-photos` is public

Photos are stored at `{user_id}/{uuid}.jpg`. The bucket being public means that anyone
who constructs a valid URL can access any photo — RLS only protects Supabase client
SDK calls, not direct HTTP GET requests to the storage URL.

**In practice:** UUID filenames are not guessable (2^128 combinations). Brute-forcing is
computationally infeasible. But:
- If a storage URL is ever exposed in a log, a share preview image, or by a user
  sharing a screenshot that includes a URL, that photo becomes accessible to anyone
  with the URL indefinitely
- User IDs (UUIDs) are exposed on the public collection web page in query results —
  an attacker who has a user_id can attempt to enumerate their photos (still hard, but
  possible in theory)

**Honest assessment:** This is the standard trade-off for public CDN photo hosting
(Instagram, Twitter, etc. all work this way). The risk is low at this scale. The
privacy policy should disclose it: "Photos are stored on a CDN and accessible by URL."

**If you want proper access control:** Switch the bucket to private and generate signed
URLs at read time. This adds latency and complexity. Not recommended for now.

---

### 6. RLS Gap — No Public Read Policy for Collections
**The `is_public` flag has no corresponding RLS policy.**

The migration added `is_public` to collections but never added a SELECT policy that
allows anonymous reads when `is_public = true`. The web page works only because it
uses the service role key to bypass RLS. If the web app ever moves to the anon key
(which it should — see issue #4), it will break without this policy.

Fix: the SQL in issue #4 above covers this.

---

### 7. Push Token Not Cleared on Sign-Out
**File:** `lib/notifications.ts`, `contexts/AuthContext.tsx`

Push tokens are stored in `profiles.push_token` but never cleared when the user signs
out. On a shared device, the next user to sign in on that device might receive the
previous user's notifications.

**Fix:** Call `UPDATE profiles SET push_token = NULL WHERE id = user.id` on sign-out.
One line in `signOut()` in AuthContext.

**Estimated effort:** 30 minutes

---

### 8. Silent Failure in Collection Loading
**File:** `app/(tabs)/index.tsx`, `loadCollections()`

```typescript
try {
  const data = await fetchCollections(user.id);
  setCollections(data);
} catch {} // silently swallowed
```

If collections fail to load, the user just sees an empty picker with no explanation.
This should log the error and optionally show a subtle retry.

---

## Scalability

### Honest Assessment

At **< 200 moments per user**, the app performs fine as-is.
At **200–1000 moments**, it gets noticeably slower (especially search and initial load).
At **1000+ moments**, the timeline load becomes a real problem.

The bottleneck is `select("*")` with no pagination on the moments table.

---

### 9. Timeline Performance — Nav Reload + Slow Initial Load
**File:** `app/(tabs)/index.tsx`

Every timeline load fetches every moment for the user with all columns, including
`photo_urls`, `photo_thumbnails`, `reflection_text`, `people` (all potentially large).
There is no pagination, limit, or cursor. Worse: the full fetch re-runs every time the
user navigates back to the tab, causing a visible reload flash.

**Fix strategy (in priority order):**

**1. Cache in context — stop refetching on nav back**
Store fetched moments in a ref/state that persists across navigation. Only invalidate when:
- A moment is created, edited, or deleted (mutation)
- User explicitly pulls to refresh
- App returns from background (optional)
This alone eliminates the reload flash.

**2. Optimistic updates on mutations**
When a moment is created/edited/deleted, update local state immediately — don't wait for
a DB round-trip. Timeline reflects changes instantly; background sync confirms.

**3. Pagination — load 30, fetch more on scroll**
Fetch the 30 most recent moments. Use `SectionList`'s `onEndReached` to load more.
Fixes both the UX lag and the 500+ moment scalability problem simultaneously.

**4. Select only what the card needs**
`select("*")` fetches full reflection text, all photo URLs, people arrays — most of which
the timeline card never renders. Switch to explicit column list for list view; fetch full
data only when a moment is opened.

**5. React Query (ties it all together)**
Handles caching, stale-while-revalidate, and mutation invalidation with minimal custom
code. `invalidateQueries(['timeline'])` after any mutation. Shows cached data instantly
on nav back while background-refreshing. Worth adding if rolling custom cache logic
becomes complex.

---

### 10. Missing Database Indexes

**Exists:**
- `moments(user_id)` ✓
- `moments(moment_date DESC)` ✓
- `collections(user_id)` ✓

**Missing:**
```sql
-- Optimizes the core timeline query (WHERE user_id AND ORDER BY moment_date)
CREATE INDEX moments_user_date_idx ON moments(user_id, moment_date DESC);

-- Optimizes collection filtering
CREATE INDEX collection_moments_collection_id_idx ON collection_moments(collection_id);

-- Optimizes search (currently full table scan via ilike)
-- Add when search performance becomes a real complaint
CREATE INDEX moments_search_idx ON moments
  USING GIN(to_tsvector('english', coalesce(song_title, '') || ' ' ||
                                    coalesce(song_artist, '') || ' ' ||
                                    coalesce(reflection_text, '')));
```

The composite index and collection_moments index are worth adding now. The full-text
search index can wait until search is a pain point.

---

### 11. Supabase Plan Limits

At 1000 users with ~50 moments and 3 photos each:
- ~150,000 photos × ~300KB avg = ~45 GB storage

The free tier gives 1 GB storage and 2 GB bandwidth/month. **You will hit this
almost immediately at any real user scale.** The Pro plan ($25/month) gives 100 GB
storage and 200 GB bandwidth — sufficient for early growth.

**Recommendation:** Upgrade to Pro before TestFlight goes wide or any marketing push.

---

## Code Quality / Technical Debt

### 12. Console.logs in Edge Function (Privacy)
**File:** `supabase/functions/send-notifications/index.ts`

Multiple `console.log` statements log user IDs, push tokens, and moment data to
Supabase function logs. These logs are visible to anyone with access to the Supabase
dashboard and are retained for some time.

Remove or gate behind a `LOG_LEVEL` environment variable.

---

### 13. Race Condition: Moment Create → Add to Collection
**File:** `app/create.tsx`

Moment is inserted, then added to collection in a second query:
```typescript
if (selectedCollection && inserted?.id) {
  await addMomentToCollection(selectedCollection.id, inserted.id).catch(() => {});
}
```

If the second call fails, the moment exists but isn't in the collection, and the
`.catch(() => {})` silently swallows it. The user has no feedback.

Fix: remove the silent catch, show a toast if it fails, let the user try again from
the moment detail screen.

---

### 14. No Input Length Limits
Text fields accept unlimited input. Add `maxLength` props:
- Reflection text: 5000 chars
- Location: 200 chars
- Display name: 60 chars
- People tags: 50 chars each
- Collection name: 100 chars (already has 60 in CreateCollectionModal, confirm others)

---

---

## UX Quality

### What's Strong
The app has genuinely good UX fundamentals:
- **Loading states:** Skeleton screens on timeline, moment detail, and profile. Spinners on
  save buttons. Nothing shows blank during data fetches.
- **Error states:** Centralized `friendlyError()` converts raw errors to readable messages.
  `ErrorState` for full-screen failures, `ErrorBanner` for background refresh failures.
- **Empty states:** Every list has a helpful empty state with a CTA. Search with no results
  shows "Clear Filters."
- **Keyboard handling:** `KeyboardAvoidingView` on all forms, inputs scroll into view, keyboard
  dismisses on list drag.
- **Navigation:** No dead ends. Back navigation works everywhere. Deep links work.
- **Haptics:** Used correctly — success on save, error on delete, selection on mood/people.
- **Animations:** Reanimated v4, spring physics on card transitions, smooth view mode switch.
  No jank detected.

### 15. Accessibility — Critical Gap
**Zero accessibility attributes in the entire codebase.**

No `accessibilityLabel`, `accessibilityHint`, or `accessibilityRole` anywhere. Icon-only
buttons (filter, calendar toggle, share, close) have no labels for VoiceOver. Font sizes
are fixed — no Dynamic Type support.

This is both a legal/ethical issue and an App Store consideration. Apple's guidelines
encourage accessibility and reviewers occasionally test with VoiceOver.

**Minimum viable fix before launch:**
- Add `accessibilityLabel` to all icon-only buttons
- Add `accessibilityRole="button"` to touchable elements that aren't `<Button>`
- Test with VoiceOver enabled

Full Dynamic Type support can come later, but the button labels are a quick win.

---

### 16. No Offline Handling
No network detection library. When offline:
- All Supabase calls fail silently or hang
- No "You're offline" banner
- Partially filled forms may appear to submit but fail without feedback

This is acceptable for a TestFlight MVP. Add `@react-native-community/netinfo` before
a wide launch and show a persistent banner when connectivity is lost.

---

### 17. Image Loading — No Placeholders
Artwork and photos load in with no transition. On a slow connection the card shows a
gray box until the image arrives, then snaps in. Adding a `blurhash` placeholder or a
shimmer animation would make this feel more polished. Low priority but noticeable on
slower connections.

---

### 18. No Onboarding for Key Features
New users land on the empty timeline after sign-up. The empty state CTA is clear, but
there's no guidance on:
- The share extension (receiving songs from Apple Music)
- What "Now Playing" auto-fill does
- Collections

These are non-obvious features that users may never discover. Consider a one-time
tooltip or a "what's here" sheet on first launch. Not a blocker — but worth tracking.

---

## CI/CD and DevOps

### 19. Zero Test Coverage
No test files exist. No Jest config. No testing-library setup. `react-test-renderer`
is in devDependencies but unused.

**Risk:** Regressions reach TestFlight undetected. As the codebase grows this becomes
painful to manage manually.

**Pragmatic approach for a solo/small team:**
- Don't try to retrofit unit tests everywhere
- Write integration tests for the two or three flows where a bug would be catastrophic:
  auth (sign-in, sign-out, token refresh), moment create, and the join-collection deep link
- Add snapshot tests for components that change frequently

---

### 20. No CI Pipeline
No `.github/workflows/` directory. No automated checks on pull requests or pushes.

**Minimum useful CI (GitHub Actions, ~1 hour to set up):**
```yaml
# On every push/PR: type check + lint
- run: npx tsc --noEmit
- run: npx eslint .
# On push to main: trigger EAS build for TestFlight
- run: npx eas-cli build --platform ios --profile production --non-interactive
```

The Vercel web app auto-deploys on push to main already — that part is fine.

---

### 21. No Crash Reporting or Analytics
Production crashes are currently invisible. There is no way to know if users are
hitting errors, which screens they use most, or why they stop using the app.

**Before App Store launch, add both:**
- **Sentry** (`@sentry/react-native`) — crash reporting, error tracking, session replays.
  Free tier is sufficient for early scale. Setup is ~2 hours.
- **PostHog** (or Mixpanel) — product analytics. Track: moment created, collection shared,
  invite link opened, join completed. Free tier is generous. Setup is ~2 hours.

Without these you're flying blind after launch.

---

### 22. Single EAS Build Profile (No Staging)
`eas.json` has only a `production` profile. Every test build goes directly to the same
TestFlight track as release candidates.

**Add a development profile:**
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
      "ios": { "buildConfiguration": "Release" }
    },
    "production": { ... }
  }
}
```

`preview` builds go to TestFlight for testing. `production` builds go to App Store Review.
Keeps "work in progress" separate from "ready to test" separate from "shipping."

---

### 23. No Deployment Runbook
No documented process for:
- How to cut a TestFlight build
- How to bump the version before App Store submission
- What to check before submitting to review
- How to roll back if a bad build ships

Write this down — even a short checklist in `docs/` — before you submit to the App Store.
Future you will thank present you at 11pm before a deadline.

---

## Prioritized Fix List

### Before App Store Submission (Blockers)
- [ ] Delete account feature (#1)
- [ ] Privacy policy at `/privacy` (#2)
- [ ] Declare data types in App Store Connect nutrition label (#3)
- [ ] Add `accessibilityLabel` to all icon-only buttons (#15) — quick win
- [ ] Add Sentry crash reporting (#21) — you need this day one
- [ ] Write deployment runbook (#23)

### Before Wide Marketing Push (Security + Stability)
- [ ] Replace service role key in web app with anon key + RLS policies (#4, #6)
- [ ] Clear push token on sign-out (#7)
- [ ] Remove console.logs from edge function (#12)
- [ ] Add PostHog/Mixpanel analytics (#21)
- [ ] Add EAS preview build profile (#22)

### Before Significant User Growth (Scalability)
- [ ] Add `.limit()` to timeline query as a quick fix (#9)
- [ ] Add composite index on `moments(user_id, moment_date)` (#10)
- [ ] Add index on `collection_moments(collection_id)` (#10)
- [ ] Upgrade Supabase to Pro plan (#11)
- [ ] Offline detection banner (#16)
- [ ] Implement proper pagination (larger effort, plan separately)
- [ ] Add CI pipeline — type check + lint on PRs (#20)

### Ongoing / Nice to Have
- [ ] Fix silent failure in `loadCollections` (#8)
- [ ] Fix race condition on moment + collection create (#13)
- [ ] Add input length limits (#14)
- [ ] Image loading placeholders / blurhash (#17)
- [ ] First-run onboarding for non-obvious features (#18)
- [ ] Integration tests for auth + moment create + join flow (#19)
- [ ] Full-text search index when search performance becomes a complaint (#10)
- [ ] Full Dynamic Type / accessibility audit (#15)
