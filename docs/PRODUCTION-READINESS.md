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

### 9. Timeline Fetches All Moments with No Limit
**File:** `app/(tabs)/index.tsx`

Every timeline load fetches every moment for the user with all columns, including
`photo_urls`, `photo_thumbnails`, `reflection_text`, `people` (all potentially large).
There is no pagination, limit, or cursor.

Short-term fix: add `.limit(200)` to get under control quickly.
Proper fix: implement pagination (load the most recent 50, fetch more on scroll).

Also: `select("*")` fetches columns the timeline card never uses. Change to explicit
column list for the list view; fetch full data only when opening a moment.

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

## Prioritized Fix List

### Before App Store Submission (Blockers)
- [ ] Delete account feature (#1)
- [ ] Privacy policy at `/privacy` (#2)
- [ ] Declare location + other data in App Store Connect nutrition label (#3)

### Before Wide Marketing Push (Security)
- [ ] Replace service role key in web app with anon key + RLS policies (#4, #6)
- [ ] Clear push token on sign-out (#7)
- [ ] Remove console.logs from edge function (#12)

### Before Significant User Growth (Scalability)
- [ ] Add `.limit()` to timeline query as a quick fix (#9)
- [ ] Add composite index on `moments(user_id, moment_date)` (#10)
- [ ] Add index on `collection_moments(collection_id)` (#10)
- [ ] Upgrade Supabase to Pro plan (#11)
- [ ] Implement proper pagination (larger effort, plan separately)

### Ongoing / Nice to Have
- [ ] Fix silent failure in `loadCollections` (#8)
- [ ] Fix race condition on moment + collection create (#13)
- [ ] Add input length limits (#14)
- [ ] Full-text search index when search performance is a complaint (#10)
