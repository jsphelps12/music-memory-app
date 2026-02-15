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
│  │  Native Modules                            │   │
│  │  ├── @lomray/react-native-apple-music      │   │
│  │  │   (MusicKit: search, auth, playback)    │   │
│  │  └── NowPlaying (custom Expo module)       │   │
│  │      (MPMusicPlayerController)             │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
         ┌─────────────┴─────────────┐
         │  Supabase                  │
         │  ├── Auth (PKCE + Apple)   │
         │  ├── Postgres (RLS)        │
         │  └── Storage (public)      │
         └───────────────────────────┘
         ┌───────────────────────────┐
         │  External APIs             │
         │  ├── iTunes Lookup API     │
         │  ├── Spotify oEmbed API    │
         │  └── Apple MusicKit        │
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

## Things to Study Deeper

These are concepts that come up in interviews and are directly relevant to this project:

### Fundamentals
- [ ] OAuth2 + PKCE flow — draw the sequence diagram from memory
- [ ] JWT structure — decode one by hand, explain each part
- [ ] SQL joins, indexes, and query optimization — your data is in Postgres
- [ ] REST API design — Supabase uses PostgREST, understand how it maps SQL to REST
- [ ] WebSocket vs. polling vs. SSE — Supabase Realtime uses WebSockets

### Mobile-Specific
- [ ] React Native bridge architecture — how JS talks to native code
- [ ] iOS app lifecycle (foreground, background, suspended, terminated)
- [ ] Deep linking and universal links — how `tracks://` URLs route to your app
- [ ] iOS share extension lifecycle and memory constraints
- [ ] CocoaPods dependency management — what a podspec actually does
- [ ] App Transport Security and HTTPS requirements on iOS

### React / React Native
- [ ] React Context and the re-render problem
- [ ] Hooks lifecycle (`useEffect` cleanup, dependency arrays, stale closures)
- [ ] Controlled components and form state management
- [ ] Navigation patterns (stack, tabs, modals) and how Expo Router maps to React Navigation
- [ ] File-based routing — how the filesystem becomes the route table

### System Design (Interview Prep)
- [ ] "Design a music journaling app" — you literally built one, walk through the schema, API design, and scaling considerations
- [ ] How would you scale this beyond Supabase? (Dedicated Postgres, Redis caching, CDN for photos, separate auth service)
- [ ] How would you add real-time features? (Supabase Realtime, WebSocket subscriptions for collaborative moments)
- [ ] How would you handle offline support? (Local SQLite queue, sync on reconnect, conflict resolution)

### AI/ML (If Asked)
- [ ] Content-based vs. collaborative filtering — know the difference and when to use each
- [ ] Cold start problem — how do you recommend with no data?
- [ ] On-device vs. cloud ML trade-offs — privacy, latency, cost, capability
- [ ] Embedding models — how would you represent a "moment" as a vector for similarity search?

---

## Resume Bullet Points

Tailor these to the job you're applying for:

**Full-stack / Mobile**:
- Built an iOS music journaling app with React Native (Expo), Supabase (Postgres + RLS), and Apple MusicKit, distributed via TestFlight
- Implemented iOS share extension for cross-app song sharing with Spotify-to-Apple Music cross-search via oEmbed API
- Created a custom Expo native module in Swift bridging MPMusicPlayerController for real-time now-playing detection with event-driven updates

**Backend / Systems**:
- Designed a Postgres schema with Row Level Security policies eliminating the need for a custom API layer while maintaining per-user data isolation
- Implemented PKCE OAuth2 flow with deep link handling for secure mobile authentication without client secrets
- Built a public storage architecture with RLS-protected uploads, achieving zero-latency photo loading vs. signed URL approach

**AI/ML (once built)**:
- Developed on-device sentiment analysis pipeline using Apple's NaturalLanguage framework for privacy-preserving reflection analysis
- Built a personalized mood prediction model trained on per-user music feature vectors with cold-start fallback
- Designed a hybrid recommendation system combining content-based audio feature similarity with mood and reflection context
