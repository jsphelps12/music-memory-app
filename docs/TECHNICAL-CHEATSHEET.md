# Tracks — Technical Cheat Sheet

Everything you need to know to talk intelligently about this project in interviews, on your resume, and in technical conversations. Organized by topic with key decisions, trade-offs, and concepts to study.

---

## Architecture Overview

Tracks is a **React Native iOS app** built with Expo (managed workflow + custom native modules), backed by Supabase (Postgres + Auth + Storage). It follows a client-heavy architecture — most logic lives on the device, with Supabase acting as a thin backend.

```
┌─────────────────────────────────────────────────┐
│  iOS Device                                      │
│  ┌───────────────────────────────────────────┐   │
│  │  React Native (Expo)                       │   │
│  │  ├── Expo Router (file-based routing)      │   │
│  │  ├── React Context (auth + player state)   │   │
│  │  ├── expo-share-intent (share extension)   │   │
│  │  └── expo-av (audio playback)              │   │
│  ├───────────────────────────────────────────┤   │
│  │  Custom Native Modules (Swift)             │   │
│  │  ├── NowPlaying                            │   │
│  │  │   (MPMusicPlayerController)             │   │
│  │  └── ShazamKit                             │   │
│  │      (AVAudioEngine + SHSession)           │   │
│  ├───────────────────────────────────────────┤   │
│  │  Third-Party Native                        │   │
│  │  └── @lomray/react-native-apple-music      │   │
│  │      (MusicKit: search, auth, playback)    │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
         ┌─────────────┴─────────────┐
         │  Supabase                  │
         │  ├── Auth (PKCE + Apple)   │
         │  ├── Postgres (RLS)        │
         │  ├── Storage (public)      │
         │  └── Edge Functions (Deno) │
         │      + pg_cron (scheduler) │
         └───────────────────────────┘
         ┌───────────────────────────┐
         │  Web (Next.js + Vercel)    │
         │  ├── /m/{token} — Gift     │
         │  └── /c/{code} — Invite    │
         └───────────────────────────┘
         ┌───────────────────────────┐
         │  External APIs             │
         │  ├── iTunes Lookup API     │
         │  ├── Spotify oEmbed API    │
         │  ├── Apple MusicKit        │
         │  └── Expo Push Service     │
         │      (→ APNs proxy)        │
         └───────────────────────────┘
```

**Be ready to explain**: Why client-heavy? Supabase + RLS means the database enforces security at the row level, so you don't need a custom backend/API layer. The client talks directly to Postgres through Supabase's REST API. This is a deliberate trade-off: faster to build, fewer moving parts, but means you trust the client more and need RLS to be airtight.

---

## Key Technical Decisions & Trade-offs

### Why Expo over bare React Native?

| Expo | Bare RN |
|------|---------|
| Managed native config via plugins | Full Xcode/Gradle control |
| OTA updates via expo-updates | Manual CodePush or similar |
| EAS Build handles CI/CD | Self-managed build pipeline |
| Local modules for custom native code | Direct native module access |
| Prebuild generates native projects | You own native projects directly |

**Trade-off**: Expo abstracts native config, which is faster for development but means you depend on their plugin system for native capabilities. The NowPlaying module proved you can still write custom Swift when needed — Expo's local module system bridges the gap.

**Study**: Understand what `npx expo prebuild` does — it generates the `ios/` and `android/` directories from `app.config.ts` + plugins. The generated native projects are disposable (regenerated on each prebuild). This is the "continuous native generation" model.

### Why Supabase over Firebase / custom backend?

- **Postgres** — relational database with real SQL, not a document store. Moments have structured relationships (user → moments → songs, moods, people)
- **Row Level Security** — security rules live in the database, not in application code. Each policy is a SQL expression evaluated per-row
- **Auth built-in** — PKCE flow, Apple Sign-In, email/password all handled without a custom auth server
- **Storage** — S3-compatible object storage with RLS for uploads, public bucket for reads

**Trade-off**: Supabase is less mature than Firebase for push notifications, analytics, and ML features. You'd need to add services for those. But you get a real Postgres database with joins, indexes, and constraints instead of Firestore's document model.

**Key concept — RLS (Row Level Security)**:
```sql
-- Example: users can only read their own moments
CREATE POLICY "Users read own moments" ON moments
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert moments for themselves
CREATE POLICY "Users insert own moments" ON moments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```
Every query goes through these policies. Even if client code has a bug, the database won't leak data. **Be ready to explain** how this replaces middleware/API-layer auth checks.

### Why React Context over Redux / Zustand?

- App has two global state concerns: auth session and audio player
- Both are simple — single source of truth, few consumers, no complex state transitions
- Context + hooks is sufficient and avoids adding a dependency

**Trade-off**: Context re-renders all consumers on any state change. This is fine for auth (changes rarely) and player (few consumers). Would not scale for a state-heavy app with frequent updates — that's when you'd reach for Zustand or Redux Toolkit.

**Study**: Understand the Context re-render problem and how `useMemo` on context values mitigates it (see `PlayerContext` for this pattern).

### Why denormalize song data on the moments table?

Songs are stored as flat columns on `moments` (`song_title`, `song_artist`, `song_apple_music_id`, etc.) instead of a separate `songs` table with a foreign key.

**Why**: A moment's song data is a snapshot — if Apple Music changes metadata, the moment should preserve what the user saw when they created it. Also avoids a join on every timeline query.

**Trade-off**: Duplicate data if the same song appears in multiple moments. Harder to query "all moments with this song" (string matching vs. FK join). Acceptable because moments are personal — you're not building a music catalog, you're building a journal.

**Study**: Normalization vs. denormalization. When is each appropriate? This is a classic database design interview question.

---

## Native Module Architecture (NowPlaying)

This is the most technically interesting piece for interviews. You wrote a custom Expo native module in Swift.

### How Expo Modules Work

```
modules/now-playing/
  expo-module.config.json   ← Tells autolinking this is a module
  index.ts                  ← JS/TS interface (requireNativeModule)
  ios/
    NowPlaying.podspec      ← CocoaPods build config
    NowPlayingModule.swift  ← Swift implementation
```

**Flow**:
1. `expo-module.config.json` declares the module name and platform
2. Expo autolinking (configured via `nativeModulesDir` in `package.json`) discovers it
3. CocoaPods reads the `.podspec` to compile the Swift code and link frameworks
4. `requireNativeModule("NowPlaying")` in JS creates a bridge to the native class
5. Native methods (`AsyncFunction`) are callable from JS as promises
6. Native events (`Events` + `sendEvent`) push data from Swift → JS via `EventEmitter`

### ApplicationMusicPlayer vs SystemMusicPlayer

This is a great interview talking point — you hit a real architectural distinction:

- **`ApplicationMusicPlayer`** — plays songs the app queues. Your app controls it. This is what `@lomray/react-native-apple-music` uses
- **`SystemMusicPlayer` / `MPMusicPlayerController.systemMusicPlayer`** — reads/controls the system Music app. Can see what's playing even if another app started it

The library's `Player.getCurrentState()` returned nothing because it uses `ApplicationMusicPlayer` — the app never started playback, so there's nothing to report. The fix was a custom module using `MPMusicPlayerController.systemMusicPlayer` from the MediaPlayer framework.

**Study**: Understand the difference between MusicKit (Apple's modern music framework) and MediaPlayer (older framework for system playback). They serve different purposes and coexist.

### Event-Driven Bridge Pattern

The NowPlaying module uses the observer pattern to push updates:

```
MPMusicPlayerController (iOS)
  → NotificationCenter (.MPMusicPlayerControllerNowPlayingItemDidChange)
    → NowPlayingModule.nowPlayingItemDidChange()
      → sendEvent("onNowPlayingChanged", ...)
        → EventEmitter (JS)
          → React state update → UI re-render
```

**Key concepts**: NotificationCenter (iOS pub/sub), native → JS bridge communication, event-driven architecture, observer pattern lifecycle (`beginGeneratingPlaybackNotifications` / `endGeneratingPlaybackNotifications`).

---

## Auth Architecture

### PKCE Flow (Proof Key for Code Exchange)

Used for email confirmation deep links. Standard OAuth2 extension for public clients (mobile apps that can't store a client secret securely).

```
1. App generates code_verifier (random string) + code_challenge (SHA256 hash)
2. Auth request includes code_challenge
3. User confirms email → redirected back with authorization code
4. App exchanges code + code_verifier for session tokens
5. Server verifies SHA256(code_verifier) === original code_challenge
```

**Why PKCE?** Mobile apps can't safely store a client secret — the binary can be decompiled. PKCE proves the app that started the flow is the same one finishing it, without a secret.

**Study**: OAuth2, PKCE flow, why implicit flow is deprecated for mobile, how deep links (`tracks://`) route back to the app.

### Apple Sign-In

Uses `expo-apple-authentication` which wraps `ASAuthorizationController`. Apple provides an identity token (JWT) which Supabase verifies server-side to create/link an account.

**Study**: JWT structure (header.payload.signature), how identity providers work, what `nonce` prevents (replay attacks).

---

## Share Extension Architecture

### How iOS Share Extensions Work

A share extension is a **separate process** — it runs in its own sandbox, not inside your main app. This is why `expo-share-intent` exists: it bridges the extension process back to your app.

```
User taps Share → iOS shows share sheet → User picks Tracks
  → Share extension process activates
  → Extension passes URL to main app via deep link (tracks://dataUrl=...)
  → Main app receives deep link via expo-linking
  → useShareIntentHandler() processes it
```

**Key constraint**: Share extensions have very limited memory (~120MB) and execution time. You can't run heavy logic in the extension itself — that's why the URL parsing and API calls happen in the main app after handoff.

### Spotify Cross-Search Pattern

Spotify URLs can't be used directly (no Spotify SDK integration). Instead:

```
Spotify URL → oEmbed API (public, no auth) → title + artist
  → Apple Music search (MusicKit) → matched Song
  → Store with appleMusicId (consistent data model)
```

**Why oEmbed?** It's a public API that returns metadata for any Spotify URL without authentication. Avoids needing Spotify OAuth just to identify a shared song.

**Trade-off**: Cross-search isn't perfect — the Apple Music match might be wrong (cover versions, remasters, regional availability). The candidate picker modal handles ambiguity.

**Study**: oEmbed protocol (standard for URL metadata), cross-platform data reconciliation, graceful degradation when exact matches fail.

---

## Storage Architecture

### Public Bucket Decision

Photos moved from signed URLs (pre-authenticated, time-limited) to a public bucket.

| Signed URLs | Public Bucket |
|------------|---------------|
| URLs expire (default 1hr) | URLs never expire |
| Requires API call to generate | Synchronous URL construction |
| Secure by default | Public for reads, RLS for writes |
| Slow (async per photo) | Zero-latency |

**Why public?** Photos are user-generated content (selfies, concert pics) — not sensitive documents. The real security boundary is upload/delete permissions (enforced by RLS), not read access. The URL pattern (`{bucket}/{user_id}/{filename}`) is unguessable enough for personal photos.

**Trade-off**: Anyone with the URL can access the photo. Acceptable for this use case. Would not be acceptable for medical records, financial docs, etc.

**Study**: Signed URLs vs. public access patterns, CDN caching implications, security-in-depth.

---

## ShazamKit Native Module

The second custom Expo native module. More complex than NowPlaying — involves audio capture, thread safety, and timeout management.

### What It Does

Captures audio from the device microphone, generates an audio fingerprint, and identifies the song via Apple's ShazamKit framework — the same engine as the Shazam app. Returns `{title, artist, artworkUrl, appleMusicId}` to JS as a Promise.

### Architecture

```
JS: identifyAudio()
  → AsyncFunction (Expo bridge)
    → AVAudioSession.setCategory(.record)   // configure for mic input
    → AVAudioEngine.inputNode.installTap()  // start capturing raw PCM buffers
    → SHSession.match(signature:)           // send buffer to ShazamKit
      → matchTimer fires every 3s           // attempt match
      → timeoutTimer fires after 15s        // give up
    → SHSessionDelegate callback            // match found
      → sendEvent("onIdentified", {...})    // bridge back to JS
```

### Thread Safety

Audio buffer appending is NOT thread-safe. A dedicated `DispatchQueue` (`com.tracks.shazam.gen`) serializes all signature generator operations:

```swift
private let genQueue = DispatchQueue(label: "com.tracks.shazam.gen")

inputNode.installTap(...) { [weak self] buffer, _ in
  self?.genQueue.async {
    try? self?.signatureGen.append(buffer, at: nil)
  }
}
```

Without this, concurrent buffer appends cause crashes or corrupted audio data.

### Why a Separate Delegate Class

`SHSessionDelegate` requires `NSObject` inheritance. Modern Expo modules use Swift classes that can't also inherit from `NSObject`. Solution: a separate `ShazamDelegate: NSObject, SHSessionDelegate` class that receives callbacks and forwards them to the module via a closure.

### Teardown Order Matters

```swift
matchTimer?.invalidate()
timeoutTimer?.invalidate()
inputNode.removeTap(onBus: 0)    // must remove BEFORE stopping engine
audioEngine.stop()
try AVAudioSession.sharedInstance().setActive(false,
  options: .notifyOthersOnDeactivation)  // return audio focus to system Music app
```

If you stop the engine before removing the tap, or deactivate the session before stopping the engine, you get audio framework crashes.

### Error Codes (Bridge-level)

Rejects the JS Promise with typed codes: `ALREADY_RUNNING`, `PERMISSION_DENIED`, `AUDIO_ERROR`, `NO_MATCH`, `TIMEOUT`. Each maps to a specific user-facing message in the UI.

**Be ready to explain**: How this differs from NowPlaying (NowPlaying reads what the device is already playing; ShazamKit actively listens to the room). Why thread safety matters in audio (buffers arrive on a real-time audio thread — any blocking or data races cause glitches or crashes).

---

## Notification Pipeline

End-to-end: device registration → Supabase → Edge Function → pg_cron → Expo push service → device.

### Client-Side Registration (`lib/notifications.ts`)

1. `Notifications.requestPermissionsAsync()` — iOS permission prompt
2. `Notifications.getExpoPushTokenAsync({ projectId })` — Expo generates a device-specific push token
3. Store token in `profiles.push_token` column via Supabase upsert
4. On every app open (not just first): re-check and re-register in case token rotated

Expo acts as a push proxy — your server sends to Expo's API, Expo translates to APNs (Apple) or FCM (Android). You never deal with APNs certificates directly.

### Server-Side: Edge Function + pg_cron

**Scheduling:**
```sql
SELECT cron.schedule('daily-notifications', '0 14 * * *',
  'SELECT net.http_post(url := ..., ...)');
```
Runs at 14:00 UTC (10am EDT) daily. The Edge Function is a Deno HTTP server deployed to Supabase's edge infrastructure.

**Priority queue logic** — one notification per user per day, in priority order:

| Priority | Type | Condition | Cadence |
|----------|------|-----------|---------|
| 1 | On This Day | Moments exist on this date in prior years | Daily if match |
| 2 | Streak | Logged yesterday, not today | Daily if streak |
| 3 | Journal prompt | No higher priority match | Tue + Thu |
| 4 | Resurfacing | Random past moment | Mon |

**Batch send to Expo:**
```typescript
// 100 messages per HTTP call to avoid timeouts
for (let i = 0; i < messages.length; i += 100) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    body: JSON.stringify(messages.slice(i, i + 100))
  });
}
```

### Cold-Launch vs Foreground Handling

Two separate code paths for notification taps:

```typescript
// Cold launch (app was killed)
Notifications.getLastNotificationResponseAsync().then(response => {
  if (response) setTimeout(() => handleTap(response), 600);
  // 600ms delay — let AuthGate finish routing before pushing new screen
});

// Foreground/background (app was running)
Notifications.addNotificationResponseReceivedListener(handleTap);
```

Without `getLastNotificationResponseAsync()`, cold-launch taps are silently dropped — the listener fires before it's registered.

**Be ready to explain**: Why Expo push tokens rotate (APNs periodically invalidates tokens; stale tokens cause silent delivery failures). Why the 600ms delay exists (the router hasn't mounted yet when cold launch fires). Why per-type prefs are on the profile table (one query gets everything; no separate prefs table join needed).

---

## Stale-While-Revalidate Timeline Caching

**File:** `lib/timelinePrefetch.ts`

Classic SWR pattern: show cached data instantly, update silently in background.

### The Flow

```
Auth completes → prefetchTimeline(userId) called
  1. Check AsyncStorage for "timeline_cache_v1_{userId}"
  2. If cache hit → return cached data immediately (zero latency)
  3. Meanwhile: fire Supabase query in parallel
  4. When query resolves → write new data to AsyncStorage + return

Tab navigates to timeline → consumePrefetchPromise()
  → Gets the in-flight or resolved promise
  → User sees data instantly (either cached or freshly fetched)
  → No loading spinner on warm launch
```

### Query Design

```typescript
.select("*")
.eq("user_id", userId)
.order("moment_date", { ascending: false, nullsFirst: false })
.order("created_at", { ascending: false })
.range(0, 29)  // first 30 moments only
```

Double `order()`: primary by `moment_date` (the memory date), secondary by `created_at` (tie-break when multiple moments on the same day). `nullsFirst: false` pushes undated moments to the bottom.

**Be ready to explain**: Why you don't just show a loading spinner (perceived performance — the gap between interaction and content is the metric that matters, not actual load time). When SWR fails (stale data is shown too long if cache TTL is too high; resolved by checking `lastFetchTime` before re-fetching).

---

## Shared Collections Architecture

### Data Model

```
collections
  id, name, user_id (owner), invite_code, is_public, cover_photo_url

collection_members           ← members ONLY (owner is NOT here)
  collection_id, user_id, joined_at

collection_moments           ← which moments are in which collection
  collection_id, moment_id, added_by_user_id, added_at
```

**Key design decision**: owners are NOT in `collection_members` — they're identified by `collections.user_id`. This means ownership queries are different from membership queries. A bug here (checking only `collection_members`) will miss the owner's moments.

### Batching Pattern

Fetching collections avoids N+1 by batching profile lookups:

```typescript
// BAD: N queries
for (const collection of collections) {
  const owner = await fetchProfile(collection.user_id); // N hits
}

// GOOD: 1 query
const ownerIds = [...new Set(collections.map(c => c.user_id))];
const { data: profiles } = await supabase
  .from("profiles").select("id, display_name").in("id", ownerIds);
const profileMap = new Map(profiles.map(p => [p.id, p.display_name]));
```

`new Set()` deduplicates owner IDs (multiple collections might have the same owner).

### Invite Flow

```
Web: soundtracks.app/c/{invite_code} → "Open in App" button
  → Deep link: soundtracks://join?inviteCode={code}      ← query param (NOT path segment)
  → app/join.tsx: validates code → shows preview → inserts collection_member

First install (no app): clipboard method
  Web writes "soundtracks-invite:{code}" to clipboard
  App reads clipboard on first launch → extracts code → join flow
```

**The query param detail matters**: `soundtracks://join/{code}` (path segment) causes an "Oops" screen because Expo Router tries to match it as a nested route. `soundtracks://join?inviteCode={code}` (query param) routes correctly to `app/join.tsx`.

**Be ready to explain**: How RLS handles this — members can read moments in their collections, but owners need a separate policy to read member-contributed moments (one was initially missing and had to be added in production).

---

## Root Layout Auth State Machine

**File:** `app/_layout.tsx`

The most complex routing logic in the app. Prevents navigation before auth resolves and handles 6 distinct states.

```
Loading (initial)
  └─ show blocking overlay (prevents flash of wrong screen)

Not authenticated
  ├─ First launch → /(auth)/welcome
  └─ Returning user → /(auth)/sign-in

Authenticated, onboarding incomplete
  └─ /onboarding

Authenticated, onboarding complete
  ├─ Pending invite code? → /(tabs) then → /join
  └─ No invite → /(tabs)
```

### Key Flags

| Flag | Storage | Purpose |
|------|---------|---------|
| `HAS_LAUNCHED_KEY` | AsyncStorage | welcome vs sign-in screen |
| `onboardingCompleted` | profiles table | gate to main tabs |
| `PENDING_INVITE_CODE_KEY` | AsyncStorage | deferred join after auth |
| `first_moment_saved_{userId}` | AsyncStorage | celebration screen once |
| `profileReady` | React state | don't route until profile loaded |
| `suppressAuth` | ref | prevent listener firing during signup |

**Be ready to explain**: Why `profileReady` exists (session resolves before profile data — routing on session alone causes flash of wrong content). Why `suppressAuth` is a ref not state (refs don't cause re-renders; state would cause the auth listener to re-subscribe).

---

## Web App Architecture

**Stack**: Next.js 14 (App Router) + Vercel + Supabase

### Two Page Types

**Shared Collection** (`/c/{invite_code}`):
- Server component — reads Supabase directly using service role key
- Bypasses RLS (service role ignores policies) — necessary because web visitors aren't authenticated
- Renders collection metadata + moment list
- Sticky CTA: "Add your moment" → deep link → App Store fallback

**Gift a Memory** (`/m/{share_token}`):
- Server component — fetches moment by `share_token` UUID column
- Constructs photo URLs from storage bucket prefix (no API call needed — public bucket)
- Includes audio preview player (HTML5 `<audio>` element with iTunes preview URL)
- Dynamic OG meta tags — `og:title`, `og:image`, `og:description` populated from moment data so social link previews show the album art and song name

### Why Server Components

The web pages are read-only previews, not interactive apps. Server components:
- Direct DB access (no API layer needed)
- HTML rendered server-side (good for social link previews — crawlers see full content)
- No client-side JS bundle for the initial render (fast on slow connections)

**Be ready to explain**: Service role key vs anon key (service role bypasses RLS — only safe in server contexts where the key is never exposed to the browser). Why OG tags matter (Slack, iMessage, Twitter unfurl previews from these tags — every shared moment link shows a rich preview with album art).

---

## Photo Compression Pipeline

**File:** `lib/storage.ts`

### Two-Pass Manipulation

```typescript
// Pass 1: get actual dimensions (no transforms)
const info = await ImageManipulator.manipulateAsync(uri, []);

// Pass 2: resize if needed + compress
const actions = info.width > maxDimension
  ? [{ resize: { width: maxDimension } }]   // maintain aspect ratio
  : [];

const result = await ImageManipulator.manipulateAsync(uri, actions, {
  compress: 0.8,
  format: SaveFormat.JPEG,   // always JPEG regardless of source format
});
```

Always outputs JPEG for consistent format. PNG, HEIC, WebP inputs all become JPEG outputs — predictable URLs, predictable storage costs.

### Parallel Upload

```typescript
const [fullPath, thumbPath] = await Promise.all([
  uploadToStorage(fullUri, `${userId}/${uuid}.jpg`),
  uploadToStorage(thumbUri, `${userId}/${uuid}_thumb.jpg`),
]);
```

Same UUID for both — deterministic relationship between full and thumbnail path without a DB column for thumbnails.

**Be ready to explain**: Why two-pass (can't know dimensions without reading the file; can't resize proportionally without knowing the original dimensions). Why JPEG not WebP (React Native's `expo-image` supports WebP, but HEIC from the camera on older iOS versions doesn't always convert cleanly — JPEG is safest baseline).

---

## Observability: Sentry + PostHog

### Sentry (Crash Reporting)

- `@sentry/react-native` initialized with `Sentry.wrap(RootLayout)` in `app/entry.tsx`
- Source maps uploaded automatically by EAS Build via `SENTRY_AUTH_TOKEN`
- Symbolicated stack traces in production — line numbers map to original TypeScript source

**Why source maps matter**: React Native JS bundles are minified. Without source maps, a crash at `bundle.js:1:47832` is useless. With them, Sentry resolves to the exact TypeScript file and line.

### PostHog (Product Analytics)

- `PostHogProvider` wraps the app in `_layout.tsx`
- Screen tracking: `posthog.screen(pathname)` on every route change via `usePathname()`
- User identity: `posthog.identify(user.id)` on auth, `posthog.reset()` on sign-out
- SDK disabled if env var not set (safe for dev without analytics configured)

**Identify vs anonymous**: Before sign-in, events are recorded anonymously. `posthog.identify()` retroactively links pre-auth events (like onboarding steps) to the authenticated user.

**Be ready to explain**: Why reset on sign-out (PostHog would otherwise attribute the next user's actions to the previous user's identity — critical in a multi-user app).

---

## OTA Updates (expo-updates + EAS)

### What Can Be OTA Updated

Any JS/TS code change. What can't:
- Native module changes (Swift/Kotlin)
- New native dependencies (anything with a podspec)
- `app.config.ts` changes that affect native config

### The Deploy Flow

```
Code change (JS only)
  → npx eas-cli update --branch production --message "..."
  → New JS bundle uploaded to EAS servers
  → App checks for update on next launch
  → Downloads and applies on subsequent launch
  → No App Store review required
```

For native changes: full EAS Build → TestFlight → App Store review.

**The 520 retry fix** was shipped as an OTA update — `lib/supabase.ts` is pure JS, no native changes needed. Deployed in minutes, not days.

**Be ready to explain**: How expo-updates checks for updates (polls EAS servers on launch, downloads in background, applies on next launch). Why this is powerful (critical bugs fixed in minutes; Apple review bypassed for JS changes). The limitation (Apple's guidelines technically require app behavior to stay consistent — don't use OTA to add substantial new features without review).

---

## Performance Patterns

### Debounced Search

Timeline search uses debouncing — waits 300ms after the user stops typing before firing the query. Prevents hammering the database on every keystroke.

**Study**: Debounce vs. throttle (when to use each), controlled vs. uncontrolled inputs in React.

### SectionList for Timeline

Uses React Native's `SectionList` (virtualized) instead of `ScrollView` + `.map()`. Only renders visible rows, critical for long timelines.

**Study**: Virtualized lists, windowing, `getItemLayout` optimization, why `FlatList`/`SectionList` exist.

### Memoization

`PlayerContext` value is memoized with `useMemo` to prevent unnecessary re-renders of all consumers when unrelated state changes.

**Study**: `useMemo`, `useCallback`, React's reconciliation algorithm, when memoization helps vs. hurts.

---

## Scalability Considerations

Good to know for system design questions — the app is built correctly for current scale, but here's where it breaks and how to fix it.

| Component | Breaks at | Why | Fix |
|-----------|-----------|-----|-----|
| Notification edge function | ~10K users | N×2 Supabase queries in a loop (one COUNT + one range query per user) | Batch with `IN` clause + local randomization, or use `TABLESAMPLE` |
| Timeline prefetch | N/A (per-user) | Module-level promise doesn't track userId — fast sign-out/sign-in can serve wrong user's data | Track userId alongside promise |
| Photo storage bandwidth | ~5K active users | All photos served directly from Supabase Storage (S3) with no CDN | Add Cloudflare or CloudFront in front |
| `ilike %term%` search | ~50K moments/user | No full-text index | Add `pg_trgm` GIN index or `tsvector` column |
| NowPlaying native bridge | Immediate (any user) | Album artwork converted to base64 (~1MB) and passed across bridge on every track change | Return URL or omit artwork; fetch separately |
| Supabase free tier queries | ~100 users | Cold starts (520 errors) on shared infrastructure — global retry added as mitigation | Upgrade to Supabase Pro |

---

## Production Hardening — Issues Found & Fixed

This section documents real bugs and trade-offs found during a production audit. Good interview material — shows you know how to think about edge cases.

### Race condition: timeline prefetch userId mismatch
**File:** `lib/timelinePrefetch.ts`
**Issue:** Module stores a `Promise<Moment[]>` at the module level without tracking which user it belongs to. If User A authenticates and prefetch starts, then User A signs out and User B signs in before the prefetch resolves, `consumePrefetchPromise()` returns User A's data to User B's timeline.
**Fix:** Store `{ promise, userId }` together; `consume()` validates userId before returning.
**Interview angle:** Classic TOCTOU (time-of-check to time-of-use) bug. Module-level mutable state + async operations = race condition surface.

### Apparent bug: trailing fetch after retry loop
**File:** `lib/supabase.ts`
**Issue:** The retry function loops 3 times, then has a `return fetch(input, init)` after the loop — looks like a 4th request. In a code review, this jumps out as an off-by-one error.
**Reality:** The loop always returns on its final iteration. The trailing line is unreachable dead code, required only because TypeScript's control flow analysis doesn't prove that a `for` loop with an early return inside always terminates via that return. Added an `// Unreachable` comment to document intent.
**Interview angle:** Code review catches things that look wrong but aren't. Knowing when to add clarifying comments vs. restructure code is a judgment call. TypeScript's control flow analysis has limits — it can't prove all loop termination cases.

### Native bridge: base64 artwork string
**File:** `modules/now-playing/ios/NowPlayingModule.swift`
**Issue:** Album artwork is fetched at 600×600px, converted to PNG, base64-encoded, and passed across the React Native bridge as a string on every track change. A 600×600 PNG can be ~800KB–1.5MB as base64. This causes jank on track changes and is unnecessary — the app already has the album artwork URL from MusicKit.
**Fix:** Remove artwork from the bridge payload; use the MusicKit artwork URL already available in the JS layer.
**Interview angle:** The React Native bridge is synchronous for serialization — large payloads block the JS thread. Always minimize what crosses the bridge.

### URL scheme validation gap
**File:** `hooks/useDeepLinkHandler.ts`
**Issue:** Deep link regex `/^[a-z]+:\/\/join\?inviteCode=.../` matches any lowercase protocol. A crafted `http://join?inviteCode=...` link would be treated as a valid join request.
**Fix:** Hardcode `soundtracks://` in the regex.
**Interview angle:** Input validation on security boundaries. Even with RLS protecting the actual data, trusting untrusted URL inputs is a bad pattern.

### Silent error swallowing
**Multiple files**
**Issue:** Several catch blocks silently swallow errors: shuffle in `reflections.tsx`, push registration in `_layout.tsx`, prefetch failure in `timelinePrefetch.ts`. Users hit broken state with no feedback.
**Fix:** At minimum, log to Sentry + capture to PostHog. Show inline error where UX warrants it.
**Interview angle:** Error handling is a first-class feature. "We'll fix it if it happens" means you won't know when it happens.

### Notification edge function: unbounded per-user queries
**File:** `supabase/functions/send-notifications/index.ts`
**Issue:** For random moment resurfacing, runs two Supabase queries per user (a COUNT then an offset range query). At 10K users this is 20K queries per function invocation. Supabase bills per query.
**Fix:** Fetch all candidate moments with `IN (user_ids)` in a single query, then group and randomize in memory.
**Interview angle:** N+1 query problem. Classic ORM/BaaS pitfall — always look at total query count, not just per-operation cost.

---

## Strong Patterns Worth Highlighting in Interviews

### `friendlyError()` — centralized error UX
**File:** `lib/errors.ts`
Maps Supabase/network errors to human-readable messages in one place. Shows: centralized error handling, separation of concerns, user-first thinking. "Never show a raw database error to a user" is a professional instinct.

### Stale-while-revalidate timeline caching
**File:** `lib/timelinePrefetch.ts`
On auth, prefetch the timeline before the user navigates to it. On navigation, return cached data immediately, revalidate in background. Pattern: render fast → update silently. Used by every major consumer app. Shows understanding of perceived vs. actual performance.

### Consume-once module pattern
**Files:** `lib/pendingCollection.ts`, `lib/timelineRefresh.ts`
Module-level mutable state with a consume-once getter. Solves cross-navigation data passing without React Context, props drilling, or URL params. Simple and effective for low-frequency, one-way data handoff.

### Custom EXIF parser — zero dependencies
**File:** `app/create.tsx`
Binary JPEG parsing from scratch: reads JPEG markers, IFD entries, GPS rational numbers, timezone normalization. No library. Shows: low-level binary protocol knowledge, deliberate dependency avoidance, awareness of bundle size.

### Auth state nuance: `suppressAuth` + `profileReady`
**File:** `contexts/AuthContext.tsx`
`suppressAuth` ref prevents the `onAuthStateChange` listener from firing during the signup flow (which has its own state machine). `profileReady` prevents routing until profile data is loaded. These solve real race conditions that you only hit in production, not dev. Shows experience with async auth edge cases.

### RLS as the real security boundary
Supabase RLS policies enforce per-user data isolation at the database level — not in application code. Even if there's a bug in the JS, the database won't return another user's rows. The explicit state cleanup on user change (`useEffect` on `user?.id`) is defense-in-depth: belt + suspenders. Shows understanding that client-side state and server-side auth are separate layers.

---

## Things to Study Deeper

These are concepts that come up in interviews and are directly relevant to this project:

### Fundamentals
- [ ] OAuth2 + PKCE flow — draw the sequence diagram from memory
- [ ] JWT structure — decode one by hand, explain each part
- [ ] SQL joins, indexes, and query optimization — your data is in Postgres
- [ ] REST API design — Supabase uses PostgREST, understand how it maps SQL to REST
- [ ] WebSocket vs. polling vs. SSE — Supabase Realtime uses WebSockets

### Mobile-Specific
- [ ] React Native bridge architecture — how JS talks to native code, serialization overhead, why large payloads (base64 images) cause jank
- [ ] iOS app lifecycle (foreground, background, suspended, terminated)
- [ ] Deep linking and universal links — how `soundtracks://` URLs route to your app, query params vs path segments
- [ ] iOS share extension lifecycle and memory constraints (~120MB limit)
- [ ] CocoaPods dependency management — what a podspec actually does
- [ ] App Transport Security and HTTPS requirements on iOS
- [ ] AVAudioEngine + AVAudioSession — audio capture pipeline, session categories, `setActive(false)` to return audio focus
- [ ] DispatchQueue and GCD — serial vs concurrent queues, why audio buffer appending requires serialization
- [ ] Core Audio real-time thread constraints — what you can and cannot do on a real-time audio thread
- [ ] ShazamKit / audio fingerprinting — how SHSession generates acoustic signatures and matches against Apple's catalog
- [ ] OTA updates with expo-updates — what can be updated without App Store review, how EAS channels work

### React / React Native
- [ ] React Context and the re-render problem
- [ ] Hooks lifecycle (`useEffect` cleanup, dependency arrays, stale closures)
- [ ] Controlled components and form state management
- [ ] Navigation patterns (stack, tabs, modals) and how Expo Router maps to React Navigation
- [ ] File-based routing — how the filesystem becomes the route table

### Backend / Serverless
- [ ] pg_cron — Postgres-native job scheduler, cron syntax, how it calls `net.http_post` to trigger Edge Functions
- [ ] Supabase Edge Functions — Deno runtime, deploying, environment variables, invocation via HTTP
- [ ] N+1 query problem — classic ORM/BaaS pitfall; how `IN` clauses and in-memory grouping eliminate it
- [ ] Serverless cold starts — why free-tier Supabase has 520 errors, how retries with backoff mitigate them

### Web / Next.js
- [ ] Server Components vs Client Components — when each is appropriate, what can't run on the server
- [ ] Next.js App Router — file-based routing, layouts, loading states
- [ ] Service role key vs anon key — why service role bypasses RLS, when it's safe (server-only) vs dangerous (exposed to browser)
- [ ] Open Graph meta tags — `og:title`, `og:image`, `og:description`; how Slack/iMessage/Twitter build link previews from them

### System Design (Interview Prep)
- [ ] "Design a music journaling app" — you literally built one, walk through the schema, API design, and scaling considerations
- [ ] How would you scale this beyond Supabase? (Dedicated Postgres, Redis caching, CDN for photos, separate auth service)
- [ ] How would you add real-time features? (Supabase Realtime, WebSocket subscriptions for collaborative moments)
- [ ] How would you handle offline support? (Local SQLite queue, sync on reconnect, conflict resolution)
- [ ] "Design a push notification system" — you built one: client token registration, server priority queue, Expo proxy to APNs, cold-launch handling

### AI/ML (If Asked)
- [ ] Content-based vs. collaborative filtering — know the difference and when to use each
- [ ] Cold start problem — how do you recommend with no data?
- [ ] On-device vs. cloud ML trade-offs — privacy, latency, cost, capability
- [ ] Embedding models — how would you represent a "moment" as a vector for similarity search?

---

## Resume Bullet Points

Tailor these to the job you're applying for:

**Full-stack / Mobile**:
- Built and shipped an iOS music journaling app (Soundtracks) with React Native (Expo), Supabase (Postgres + RLS), and Apple MusicKit, live on the App Store
- Implemented iOS share extension for cross-app song sharing with Spotify-to-Apple Music cross-search via oEmbed API
- Created two custom Expo native modules in Swift: real-time now-playing detection (MPMusicPlayerController + MediaPlayer framework) and audio-fingerprint song identification (AVAudioEngine + ShazamKit) with thread-safe buffer serialization
- Built shared collections feature end-to-end: invite code deep links, deferred clipboard-based deep links for new installs, RLS policies for cross-user data access, and member management UI
- Shipped a Next.js web preview layer (server components, Supabase service role, dynamic OG meta tags) so shared moments generate rich social link previews

**Backend / Systems**:
- Designed a Postgres schema with Row Level Security policies eliminating the need for a custom API layer while maintaining per-user data isolation
- Implemented PKCE OAuth2 flow with deep link handling for secure mobile authentication without client secrets
- Built a prioritized push notification pipeline: client-side Expo token registration, Supabase Edge Function (Deno) with priority queue logic (On This Day > Streak > Prompt > Resurfacing), pg_cron scheduling, and cold-launch tap handling
- Built a public storage architecture with RLS-protected uploads, achieving zero-latency photo loading vs. signed URL approach
- Shipped critical bug fixes as OTA updates via EAS (expo-updates) — no App Store review cycle required for JS-only changes

**Performance / Reliability**:
- Implemented stale-while-revalidate timeline caching (AsyncStorage + parallel Supabase fetch) — users see data on first frame, no loading spinner on warm launch
- Audited production codebase for race conditions (TOCTOU prefetch bug, auth listener state-after-unmount), silent error swallowing, and N+1 query patterns; documented all findings with reproduction steps and fixes
- Added Sentry crash reporting with symbolicated stack traces (source maps via EAS) and PostHog product analytics with identify/reset pattern for correct multi-user attribution

**AI/ML (once built)**:
- Developed on-device sentiment analysis pipeline using Apple's NaturalLanguage framework for privacy-preserving reflection analysis
- Built a personalized mood prediction model trained on per-user music feature vectors with cold-start fallback
- Designed a hybrid recommendation system combining content-based audio feature similarity with mood and reflection context
