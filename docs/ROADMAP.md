# Soundtracks — Roadmap

> "Hold on to moments that matter."

> "It's wild how certain songs can immediately take you back to a totally different time in your life."
> — Instagram comment, 2,962 likes

That's the product. Everything on this roadmap exists to make that feeling capturable, revisitable, and shareable.

---

## SHIPPED

### Foundation & MVP
- [x] Auth (email/password + Apple Sign-In)
- [x] Song search (MusicKit), 30-second preview playback
- [x] Create / edit / delete moments (song, reflection, mood, people, date, photos)
- [x] Timeline feed — SectionList grouped by month, pagination, prefetch on auth
- [x] Moment detail — blurred artwork backdrop, auto-play preview, swipe to close
- [x] Photo support — camera/library, compression, full viewer (pinch-to-zoom, swipe paging)
- [x] Photo EXIF date + GPS auto-detection with suggestion banner
- [x] Profile — avatar, display name, stats, storage usage
- [x] Dark mode, design system, loading skeletons, empty states, error states

### Core Features
- [x] Share extension — receive shared songs from Apple Music & Spotify
- [x] Spotify cross-search — oEmbed parse → Apple Music match with candidate picker
- [x] Now Playing auto-fill — banner on create screen when something is playing
- [x] Quick capture flow — song + optional reflection, expandable details
- [x] Auto-tag time of day + location banner
- [x] On This Day + random resurfacing — Reflections tab, grouped by year
- [x] Push notifications — On This Day, streak, prompts, resurfacing; per-type toggles in Profile; cold-launch deep link fix
- [x] Card-to-detail transition animation
- [x] Calendar view — grid with album art thumbnails, pinch-to-zoom toggle
- [x] Swipe gestures throughout (close detail, delete cards, swipe between tabs)
- [x] Song, album, artist views — all moments for a given song/album/artist
- [x] Search + filter — song, artist, reflection text, mood, people, date range, location
- [x] Personal collections — user-defined groupings, header selector on Moments tab
- [x] Shared collections Phase A+B — join flow, contributor attribution, deep link, web preview
- [x] Web app — Next.js / Vercel, `/c/{invite_code}` shared collection page with audio preview
- [x] Shareable moment cards — dark portrait card with photo/artwork hero, iOS share sheet
- [x] Onboarding flow, custom app icon
- [x] ShazamKit — native module; ambient song identification → create screen pre-fill
- [x] Share from Photos — share extension handles image files; EXIF date + location auto-populated
- [x] Gift a Memory — web page at `/m/{share_token}`; app generates + shares URL; no account required to view
- [x] Memory prompts — 8 categories × 5 prompts in create screen, Reflections tab, empty states
- [x] Early resurfacing — "A Month Ago" section (25–35 day window) in Reflections tab
- [x] Privacy policy + Terms — hosted on web app at `/privacy` and `/terms`
- [x] Deferred deep links — clipboard method; web writes invite code, app reads on first launch
- [x] Design system v2 — accentSecondary (purple), brand gradient artwork placeholders, CloseButton, standardized button/input sizing
- [x] Reflections tab reorganization — all sections conditional (hidden when empty), reordered: On This Day → A Month Ago → This Month → Random
- [x] App renamed Tracks → Soundtracks everywhere (app name, bundle ID display, share extension, privacy/terms)
- [x] Password visibility toggle on sign-in + sign-up screens
- [x] Notification prompt gated behind `onboardingCompleted` — no premature iOS dialog
- [x] Sign-in ↔ sign-up navigation uses `replace` — no screen stacking on back swipe
- [x] Report Moment — UGC moderation via mailto; appears for other users' moments in shared collections
- [x] Share Feedback button on Profile screen
- [x] Data isolation — timeline + reflections clear on user change; no flash of previous account's data
- [x] Sentry crash reporting + PostHog analytics integrated and shipping in production build
- [x] Tab redesign (May 2026) — 5-tab structure (Timeline · Browse · [+] · Shared · Me); center gradient capture button; swipe between tabs
- [x] Browse tab — personal archive browser: On This Day, Moods (drill-down + in-place switching + distribution bar), People, Years, Calendar sections; nested stack navigator
- [x] Shared tab redesign — preview sections (4 items) with "See all →" drill-downs; dedicated full-list screens; [+] new shared collection button
- [x] Onboarding rebuild (May 2026) — multi-phase flow: value-prop → capture-1 → capture-2 → moment-preview → celebration; 2 seeded moments before celebration
- [x] TanStack Query migration — timeline + collections on React Query; optimistic updates; app-wide tab prefetch on session resolve
- [x] Navigation/swipe consistency — tab swiping enabled; consistent left-edge back policy; moment detail swipe-to-dismiss with animation; custom pans removed from song/album/artist

---

## NOW — Pre-Launch Checklist (9 items, all done ✅)

Everything here ships before App Store marketing push.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Privacy policy + Terms | ✅ Done | Hosted at `/privacy` and `/terms`; cleaned up pre-submission |
| 2 | Deferred deep links | ✅ Done | Clipboard method; invite code survives install |
| 3 | Onboarding tightening | ✅ Done | Collection-origin variant deferred to post-launch |
| 4 | App Store listing + assets | ✅ Done | Screenshots, metadata, Sentry, PostHog, EAS build complete |
| 5 | Memory prompts | ✅ Done | 8 categories × 5 prompts wired throughout app |
| 6 | Early resurfacing | ✅ Done | "A Month Ago" in Reflections tab |
| 7 | Gift a Memory | ✅ Done | Web page + share URL; no account to view |
| 8 | ShazamKit | ✅ Done | Native module; ambient capture → create screen |
| 9 | Share from Photos | ✅ Done | Share extension + EXIF auto-fill |

### App Store Review — ✅ Submitted (awaiting review)
- [x] Age rating questionnaire — 12+ (UGC present)
- [x] App Privacy labels — completed
- [x] Demo account credentials added
- [x] Review notes added
- [x] 6.5" screenshots (1284×2778) uploaded
- [x] EAS production build attached
- [x] Submitted for review — awaiting Apple approval

---

## POST-LAUNCH — Shipped March 2026

Work completed after App Store submission while awaiting review.

- [x] **Wedding / Event guest contribution flow** — web form at `/c/{code}/contribute`; guests add song + reflection + photo with no account; live feed polls for new contributions every 30s; "Add Another" + App Store download CTA post-submit
- [x] **Web QR code page** — `/c/{code}/qr`; full-screen scannable QR; downloadable PNG; accessible from AlbumShareSheet in app
- [x] **Guest attribution** — `guest_name` / `guest_uuid` columns on moments; guest moments attributed by name in shared collection views (app + web)
- [x] **No-download web entry (App Clip equivalent)** — web contribution form covers the core use case (60-year-old uncle can contribute from any browser, no app required); native App Clip deferred unless web conversion data shows it's worth the build complexity
- [x] **Location autocomplete** — replaced free-text location field with Nominatim-backed search; stores `location_lat` / `location_lng` alongside display name; GPS suggestion banner and EXIF autofill both capture coordinates; foundation for map view
- [x] **Collection pre-selection** — tapping the FAB or "Add Moment" from a collection view passes `collectionId` to create screen; collection is pre-selected and details section auto-expands
- [x] **Add to Collection confirm step** — collection toggles in moment detail are now staged locally; "Save Changes" button commits; backdrop dismiss discards
- [x] **Notification null crash fix** — `moment_date` null guard in send-notifications edge function; was silently crashing the function for all users
- [x] **fetchPreviewUrl timeout** — 5s AbortController timeout on iTunes lookup; eliminates save-moment hangs when iTunes API is slow
- [x] **NEXT_REDIRECT web fix** — re-throw Next.js redirect errors in ContributeForm catch block; was showing "unexpected response" error and enabling double-submission
- [x] **Friends (Phase C)** — username + friend invite token on profiles; `friendships` + `tagged_moments` tables; friend invite link flow (direct accept via edge function, push notification); @username search; Friends tab with pending requests, tagged moment inbox, friends feed; Tag Friends in create screen; With Friends section in moment detail; friends badge polling; deep link dedup fix
- [x] **RLS performance fix** — dropped `share_token IS NOT NULL` policies that caused full table scans and query timeouts under RLS; web gift pages use service role key

---

## Shipped May 2026

Tab redesign sprint + architecture improvements.

- [x] **Tab redesign** — restructured from 4 tabs to 5 (Timeline · Browse · [+] · Shared · Me); center orange→purple gradient capture button floats above bar; material top tabs with swipe-between-tabs enabled; smooth TabBar icon + label color interpolation during swipe
- [x] **Browse tab** — full personal archive browser; On This Day (horizontal scroll of resurfaced moments), Moods (emoji grid → drill-down with distribution bar + compact rows + in-place mood switching), People (person circles), Years (year chips), Calendar (month grid, days with moments highlighted); nested Stack navigator within Browse tab
- [x] **Shared tab redesign** — replaces Friends tab; preview sections (4 items each) with "See all →" links; dedicated `shared-collections.tsx` and `tagged-moments.tsx` drill-down screens; [+] button creates new shared collections; pending requests + collection invites shown as action banners at top
- [x] **Collections → Albums rename** — UI/type name changed to "Albums" throughout (types, components, lib); DB tables unchanged (`collections`, `collection_members`, `collection_moments`); Friends tab file (`app/(tabs)/friends.tsx`) repurposed as Albums tab; direct user invites added via `collection_invites` table (`sendAlbumInvite`, `searchUsersForAlbum`, `fetchPendingAlbumInvites`); `AlbumPicker`, `AlbumShareSheet`, `CreateAlbumModal`, `NewSharedAlbumModal` replace old Collection* components
- [x] **Onboarding flow rebuild** — new multi-phase flow (index → value-prop → capture-1 → capture-2 → moment-preview → celebration); captures 2 seeded moments during onboarding before celebration screen; auth gate `replace` loop bug fixed
- [x] **TanStack Query migration** — timeline + collections migrated; optimistic updates on timeline delete/restore; `lib/sharedScreen.ts` extracted for single shared data source; app-wide tab prefetch fires immediately on session resolve (timeline, collections, browse metadata, shared screen)
- [x] **Navigation/swipe consistency** — tab swiping with `swipeEnabled: true`; consistent swipe policy: left-edge back on stack screens, swipe-down on modals, swipe-right on moment detail (translateX + opacity animation); custom pan gestures removed from song/album/artist screens
- [x] **Shared collection fixes** — deduplication fix (Set-based), instant cache update on delete/leave via `setQueryData`, double header fix on drill-down screens
- [x] **Browse UI consistency pass** — spacing, typography, and component consistency across all Browse screens; startup cache populated on session resolve
- [x] **Full Apple Music Playback** — full-length playback for Apple Music subscribers via `ApplicationMusicPlayer`; mini player persists across screens; recently played section; graceful 30s preview fallback for non-subscribers; playback polish (scrubber, NowPlaying IDs, gesture conflicts resolved)
- [x] **Web landing page** — marketing landing page on web app; guest contribution fields made optional; web viewer all-dark redesign; landing page responsive padding
- [x] **Reflections tab polish** — tab 2 now shows Reflections (was "Soon" placeholder); On This Day strip removed from Timeline (lives only in Reflections); Journal Prompt removed; simplified to 5 sections: On This Day · Person Spotlight · Mood Spotlight · Artist Spotlight · A Random Memory; Person Spotlight fixed (people column bug); Artist Spotlight added (2+ moments from same artist, day-seed rotating)

---

## Shipped July 2026

Revival sprint — production bug fixes + dual-app cleanup after June pause.

- [x] **Prod image previews fixed** — moment-card thumbnails used Supabase image-transformation URLs (`/render/image/...`), a paid feature that returns `403 FeatureNotEnabled` on this project; `getPublicPhotoThumbnailUrl()` now returns plain public URLs (thumbnails are already pre-resized to 400px at upload); all 6 call sites updated
- [x] **Thumbnail backfill** — `scripts/backfill-thumbnails.mjs` (sharp + macOS `sips` fallback for HEIC-masquerading-as-jpg guest uploads); ran against prod: 31 moments backfilled, 0 remaining
- [x] **Per-variant URL scheme** — beta now uses `soundtracks-beta://` (prod keeps `soundtracks://`) so iOS no longer routes share-extension handoffs / OAuth callbacks to the wrong app when both variants are installed; Spotify redirect URL derives from `EXPO_PUBLIC_APP_ENV`; requires new preview binary (build 20) to take effect. Manual follow-up: whitelist `soundtracks-beta://spotify-callback` in Spotify dev dashboard
- [x] **OTA workflows env fix** — `EXPO_PUBLIC_APP_ENV` now set in `ota-update.yml` (preview) and `promote-to-production.yml` (production) so beta OTA bundles stop reporting Sentry env "production"
- [x] **June WIP landed** — Reflections artist-spotlight now derives from full library via browse meta cache (was: last 50 moments); SpotifyProvider lazy-require wrapped in try/catch so binaries without the native module get a friendly error instead of a crash (prerequisite for promoting OTA to App Store build 7)
- [x] **ExpoSecureStore crash root-caused** — `expo-secure-store@56` (installed via plain `npm i` in June) is incompatible with SDK 54, so CocoaPods silently never linked the pod into ANY binary (builds 17–19); the June "REACT-NATIVE-12 New Arch" theory was wrong. Fixed: pinned `~15.0.8` via `expo install` (pod now links), removed the startup static import (it crashed pod-less binaries at launch — incl. App Store build 7 on OTA). Verified in simulator: pod-less binary + new JS launches clean → OTA promote to build 7 is safe
- [x] **Paste-prompt fix** — clipboard deferred-link check read the clipboard 3× on every launch, triggering iOS paste-permission prompts for anyone with clipboard content; now reads once and only on first launch after install (`has_launched` gate)
- [x] **Simulator verification** — Release build against prod: timeline photos render (image fix confirmed visually), auth session works, no startup crash, no paste prompt

---

## Shipped July 30 2026

- [x] **Re-engagement notification cooldown** — Priority 5 matched on "hasn't posted in N days", which stays true forever once a user goes dormant, so every dormant user got "Still there?" **every single day**. With 22 of 27 push-enabled users dormant, this was an uninstall driver rather than a re-engagement campaign. Added `profiles.last_reengagement_at` with a tiered cooldown (7/14/30 days, scaled to how dormant the user is), stamped after send. Migration applied to prod and backfilled so nobody gets one more nag before the cooldown takes effect; edge function deployed as v16 and verified booting.

---

## Shipped July 30 2026 — cold-start & cache correctness

Triggered by a real report: "for some friends the app never loads right the first time."

- [x] **Timeline first paint was always one launch behind** — the launch prefetch raced disk cache vs network, but the network result was never applied to state, and the cache path stamped `lastFetchTime` so the 30s focus cooldown suppressed the correcting refetch. A moment created last session was simply missing until pull-to-refresh. Now the fresh result is applied when it lands (`consumePrefetchNetworkPromise`). This reproduced the bug deterministically even on fast wifi.
- [x] **No request timeout outside auth** — only `/auth/v1/` calls had an abort timeout, so a hung REST call could stall startup indefinitely (iOS default ~60s, never on a blackholed connection). All requests now bounded; caller-supplied signals are respected.
- [x] **Profile I/O moved out of the auth listener** — supabase-js awaits subscriber callbacks inside its auth lock for SIGNED_IN/TOKEN_REFRESHED, so fetching the profile there stalled session recovery and the refresh tick behind our own network call. Also deduped: cold start used to fire the same profile fetch up to 3× concurrently.
- [x] **Blank-screen paths closed** — the blocking overlay now has a spinner (splash hides before auth resolves, so users saw a featureless rectangle), a 12s escape hatch, and `.catch` on the two AsyncStorage reads that gated routing and could pin it up forever.
- [x] **getSession timeout no longer masquerades as signed-out** — it used to overwrite a valid session and bounce users to the sign-in screen until the refresh landed.
- [x] **Onboarding-overwrite door closed for timeouts too** — a profile timeout now sets `profileError`, and a genuinely missing row (PGRST116) correctly does *not*, so new users still onboard.
- [x] **Duplicate OTA download removed** — the JS-side check on mount raced the native `checkOnLaunch=ALWAYS` download, two full bundles competing with startup requests on exactly the launch after a publish.
- [x] **Cache coherence after mutations** — new `lib/cacheInvalidation.ts`; moment create/edit/delete and album join/rename/cover/leave/delete/add/remove now invalidate every surface that renders them (previously the map, Browse counts, Reflections, profile stats and the Albums tab all served pre-mutation data for up to 2 min).
- [x] **`setQueryData` before `prefetchQuery` made the prefetch a no-op** — browse/shared disk caches were written on the first ever launch and never refreshed again. Fixed with `staleTime: 0`.
- [x] **Background refetch failures no longer wipe good content** — 5 screens showed a full-screen `ErrorState` on a failed revalidation; now `ErrorBanner` when data is present, per CLAUDE.md.
- [x] **Sign-out hygiene** — `queryClient.clear()` plus reset of the module-level timeline store, which carried an unscoped pending Moment that could prepend the previous user's moment to the next user's timeline.
- [x] **Removed two write-only disk caches** (`collections_cache_v1_*`, `collection_moments_v1_*`) and the wasted launch fetch that fed one of them; legacy keys cleaned up on sign-out.
- [x] Badge polls no longer run while backgrounded (`refetchIntervalInBackground: false`).

---

## Shipped July 30 2026 — six parallel workstreams (PR #6)

Follow-on from the cold-start work: two audits found the app issuing ~28-38 REST calls in the first ~2s of a signed-in cold start, ~1/4 of them warming caches for unreachable screens. Six workstreams ran in parallel on isolated worktrees with disjoint file ownership; all merged with zero conflicts.

- [x] **Cold start**: deleted the launch prefetch feeding an unreachable screen (**5-10 fewer REST calls per cold start**); made `deleteAccount` share `signOut`'s teardown (a deleted account's moments were persisting on disk across four caches); versioned two unversioned cache prefixes with shape guards.
- [x] **Privacy**: `clearTimelineCache` couldn't cancel an in-flight fetch, which then rewrote the cache it had just cleared — signing out mid-prefetch put that user's moments back on disk. Superseded via a generation counter. *Found by a test that had pinned the buggy behavior.*
- [x] **Analytics**: every Me-tab focus and profile mutation wrote `email: null` over the user's PostHog identity and dropped it from Sentry. Now resolved from a fallback chain and **omitted** when unresolvable, so a failure can never clear a stored value.
- [x] **Stale UI**: new `invalidateFriendCaches`; two existing invalidations targeted `["friendsBadge"]`, a key **no query uses**; remove-friend and cancel-request invalidated nothing at all. `markAlbumViewed` now clears its badge. Unified a `staleTime` observed at three different values across six sites (mount order silently decided freshness).
- [x] **Search/perf**: browse search fired one triple-column `ilike` per keystroke, blanked results each character, and issued invalid-UUID queries before auth settled — now debounced 275ms with `keepPreviousData`. Me-tab profile refetch gated.
- [x] **Moment-detail scroll** (reported bug): the hero sat *outside* the ScrollView, so the top ~280-310pt was inert and an `absoluteFill` touchable ate drags; the scrubber seeked on touch-*down*. Hero moved inside, seek moved to activation. Two on-device corrections: `simultaneousWithExternalGesture(scrollRef)` **silently does nothing** (RN ScrollView carries no `handlerTag`) → used `Gesture.Native()`; and the first threshold values let a fast flick dismiss the screen instead of seeking → re-tuned and A/B'd on device.
- [x] **Push reliability**: Expo's response was parsed and discarded, so dead tokens accumulated until Expo rate-limits the project. Now reaps `DeviceNotRegistered`. Cascade extracted to a pure `selectNotifications`, **verified behavior-preserving** by diffing old-vs-new over 3,000 randomized scenarios (11,202 messages, byte-identical) plus 18 injected mutations. Deployed to prod as **v17**.
- [x] **Tests 59 → 183**: fixed vitest collecting duplicate worktree copies (the "118 tests" figure was double-counting; CI really ran 59) and `__DEV__` being undefined on the exact error paths tests exercise. Shared mocks at the supabase client boundary. Covers the shipped regression, the auth-routing state table, moment mapping + column contract, and image-URL construction.

**Not device-verified:** the cold-start changes. Check before promoting: create a moment → force-quit → reopen → present on the *first* paint.

**Follow-ups:** wire `MomentCard` / `app/_layout.tsx` to the extracted functions; decide on `guest_name` (selected every page, silently dropped); `supabase/functions` is outside tsconfig/eslint so the new edge module isn't type-checked; WS-I (E2E) still pending.

- [x] **`runtimeVersion` → `fingerprint`** (with the `preview-simulator` profile, batched since both feed the fingerprint): the label EAS matches on is now derived from native inputs instead of the hand-edited `version` string, so serving JS to a binary lacking its native modules is impossible. The crash class is gone; the remaining failure is publishing to nobody, which is *silent*, so both gates were rewritten from "do fingerprints match?" to "does a live build serve this runtime version?" `skip_fingerprint_check` deleted — bypassing now means reaching zero users, not some. **Every existing binary is stranded by design**: builds 5–20 all serve `1.1.0` and can never receive a fingerprint-labelled update. Beta needs build 21; production stays on build 7 until an App Store submission. *(Resolved 2026-07-31: build 21 errored; **build 22** — preview profile, `a35ceac` — is the fingerprint-era beta binary and is installed; build 23 is the `preview-simulator` E2E build. All commits since `a35ceac` are fingerprint-neutral, so OTA from main reaches build 22.)*
- [x] **WS-I — E2E smoke flow GREEN locally** (2026-07-30): full pass on simulator — sign-in → create → live Apple Music search → save → force-quit → relaunch → moment on first paint. Debugging findings baked into `.maestro/smoke.yaml` comments: system dialogs blank the whole XCUITest hierarchy (handle *before* waits, with optional waits — the Apple Account alert is OS-throttled and nondeterministic); the floating "+" has a broken accessibility frame (element taps no-op; flow uses the empty-state CTA the seed guarantees); seed must set `onboarding_completed`; `hideKeyboard` unreliable. **CI wiring complete (2026-07-31):** repo secrets set, `preview-simulator` build 23 on EAS, and a green run on main at `efcfda8` (run 30608171462) — the exact SHA the promote gate will query. WS-I fully done; the weekly Monday run now guards against rot.
- [~] **WS-I (superseded by the line above) — original plan**: `.maestro/smoke.yaml` signs in → creates a moment → `stopApp` → `launchApp` → asserts the moment on the **first paint** (5s timeout on purpose — a generous one would let a network refetch hide the exact cold-start regression this guards). `scripts/seed-e2e.mjs` resets the staging account and refuses to run against the prod project ref. `.github/workflows/e2e.yml` (macOS, weekly + `workflow_call`) installs the newest `preview-simulator` build rather than building in CI. Promote now requires a passing E2E run for the **exact SHA**. 8 testIDs added on the critical path only. **Blocked on:** the `preview-simulator` eas.json profile (batched below), a simulator build, and three repo secrets — `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_PASSWORD`.
- **Sequencing correction:** `eas.json` is a fingerprint input (`file:easBuild`), so adding the `preview-simulator` profile moves the preview fingerprint (`084fc315` → `f95ee354`) and would fail the new preview gate on every merge until a fresh build. It is therefore batched with the `runtimeVersion: fingerprint` switch so **one** build (21) absorbs all native-config churn. Verified fingerprint-neutral: JS/TSX edits, files under `scripts/`, and everything in `.github/`.
- [x] **CI/CD hardening (July 2026)**: the fingerprint gate added the week before had **never executed** — the one promote (`f7d7c94`) ran the pre-gate workflow and the gate landed five hours later, so that promote shipped JS to App Store build 7 unverified. It survived only because the June work was written to tolerate a pod-less binary. Gate now runs on preview too (every merge, no human in the loop) via shared `scripts/fingerprint-{check,gate}.mjs`; sourcemaps upload on both channels (beta crash reports were minified all along); promote takes a `sha` input; the "no live build / no recorded fingerprint" branches now fail instead of warn-and-proceed. `eas update --environment` replaces the GitHub-secret remap whose failure mode was shipping prod credentials to beta. `production-build.yml` → `Binary Build` with a profile input.
- [x] **Local dev off production**: `.env` pointed at the prod project and, with no `EXPO_PUBLIC_APP_ENV`, built bundle `com.joshuaphelps.musicmemory` — so `expo run:ios --device` replaced the App Store app and every local write hit prod data. Now staging + beta identity; prior config saved to `scripts/.env.prod.local` (not project root — Metro bundles unrecognized root `.env.*` files as JS and red-screens the app).
- **Gotcha found the hard way:** package.json's `scripts` block feeds the native fingerprint (Expo can't distinguish a benign script from `postinstall: patch-package`). Adding one line moved preview from `084fc315` → `a44b261e` with zero native change. Under `policy: "fingerprint"` that would strand every installed binary — keep helper scripts out of package.json. Files under `scripts/` are fine.
- [x] **WS-J — unreachable screens deleted**: `app/shared-albums.tsx` and `app/tagged-moments.tsx` plus their route registrations. Two corrections to the original scope: `["taggedMoments"]` and `fetchTaggedMomentsSharedTab` are **live** in the timeline tab, so the drill-down key stays; and `lib/sharedScreen.ts` shrank to `clearSharedCache` rather than being deleted — installs predating this still hold `shared_screen_v1_{userId}` on disk (a full copy of friends + shared albums) and sign-out is the only thing that sheds it. Orphaned `["sharedScreen"]` invalidations removed from `lib/cacheInvalidation.ts` and `app/album/[id].tsx`; the leave-album path was already covered by `invalidateAlbumCaches`. Lint warnings 65 → 63.

---

## User feedback — July 2026 (beta tester)

Four suggestions from a beta user, triaged 2026-07-30. **Wave 1 shipped 2026-07-31** (branch `wave-1-capture-timeline`): items 1, 3, 5, 6 below plus the song-search full-screen conversion from item 10. All JS-only → OTA-able to build 22.

1. [x] **Stop music when leaving the app** *(Wave 1)* — `AppState` listener in `PlayerContext` pauses on `background` (not `inactive` — that fires on Control Center pulls). Pause, not stop, so position survives. expo-av previews already halted on suspension; the leak was provider playback driving the system player.
2. [x] **Tap avatar to view it full-size** *(Wave 3)* — `uploadAvatar` now uploads full-size (1920px, `avatar_full.jpg`) + 400px (`avatar.jpg`) in parallel; `avatar_url` keeps pointing at the 400px file so every list/header display site and old builds are untouched. Me-tab avatar tap probes `avatar_full.jpg` with a HEAD request (public bucket, no API call budget) and opens `PhotoViewer` with it, falling back to the 400px file for avatars uploaded before the dual-size change.
3. [x] **Hear the song while choosing it** *(Wave 1)* — artwork on each result row is now a preview toggle: fetches the preview URL on demand via `provider.fetchPreviewUrl` (cached per session; badge hidden when a track has none), plays via `PlayerContext.playPreview` (newly exposed on the context), stops on select/dismiss without killing playback started before entering the screen. New event: `song_preview_played`.
4. [x] **Multiple moods per moment** *(Wave 4)* — phase 1 of the DEPLOY.md multi-phase pattern. Migration `20260731170000_add_moments_moods.sql`: `moods text[]` + backfill (`array[mood]`) + GIN index + **`sync_mood_to_moods` trigger** (an old binary editing a moment writes only `mood`, which would strand a stale `moods` array; the trigger syncs it, and stays out of the way when a multi-mood client moved both columns). App dual-writes `mood = moods[0]` in `lib/saveMoment.ts` + edit screen; `mapRowToMoment` dual-reads (`moods ?? [mood]`). `MoodSelector` is multi-select (selection order matters — first = legacy primary); detail renders one chip per mood (unknown values fall back to a raw chip); browse counts/drilldown count every mood (`.or(moods.cs, mood.eq)` filter); Top Mood stats flatten all moods; browse cache bumped v1→v2 (shape change). `mood_count` added to `moment_created`/`moment_edited` PostHog events. Deliberately still single-mood: ShareCard + web `/m/` share page (compact layouts, primary mood via dual-write), Reflections' `.not("mood","is",null)` fetch filter. **Phase 3 (drop `mood`, single-write) blocked until binaries ≤22 are stranded by a fingerprint move — weeks out minimum.** **Verified end-to-end in simulator post-OTA (2026-07-31)**: multi-select create (Nostalgic+Joyful both stay selected, survive the song-picker round trip), DB dual-write confirmed on staging (`mood=nostalgic`, `moods=[nostalgic,joyful]`), detail renders one chip per mood, edit pre-selects both + dual-writes on deselect (`mood=joyful`, `moods=[joyful]`, primary reassigned), Reflections "When you felt Joyful" row reflects the edit, browse Moods grid counts correctly (Joyful 1) and drilldown or-filter returns the moment. Staging migration applied same day (migration-history repair session), lifting PR #15's merge gate.

Owner-reported (2026-07-31):

5. [x] **Song search ranking** *(Wave 1)* — `rankSongResults` in `lib/musicSearch.ts` (accent/case-normalized; exact title → prefix → provider order, stable), applied in both providers' `search()`. 8 vitest cases. Exact title typed = first result, always.
6. [x] **Long-press a timeline card → edit/delete** *(Wave 1; reworked same day per owner feedback)* — `onLongPress` (own moments only) → haptic → **`MomentActionMenu`, a floating context menu anchored just above the pressed card** (falls below when the card is at the top; replaced the detached bottom `ActionSheetIOS`). Delete goes through shared `lib/deleteMoment.ts` (`deleteMomentWithCleanup`: row + storage objects + stale signal), which the detail screen also uses; both delete paths **stop playback if the deleted moment's song is the one playing**. Timeline hosts pass `onDeleted` for in-place removal (also decrements the header count — found stale via simulator check). Post-ship fix: `user_id` had to be added to `MOMENT_CARD_COLUMNS` — the ownership gate compared against a field the card query never fetched. **Entire wave verified live in the simulator** (preview-simulator build + OTA channel, 2026-07-31): exact-match ranking ("Otro Atardecer" #1), full-screen search, tap-to-preview badges, anchored menu, delete-stops-playback, count updates.

11. [x] **Add a moment from inside an album → auto-added to that album** *(owner request 2026-07-31, Wave 3)* — "+" IconButton in the album screen's floating controls pushes `/create?collectionId=…`. The create side already existed in full (param-driven album preselect, details auto-expand, `collection_moments` write via `lib/saveMoment.ts`, album-cache invalidation on save) — only the entry point was missing. Empty-state copy now points at the +. No role gate: everyone who can open the screen is the owner or a member, and members can already contribute.

**Wave plan** (Waves 1–3 shipped 2026-07-31; each wave = one branch → PR → merge → OTA → simulator verification pass on the preview-simulator build):
- **Wave 3 — features & hygiene** (branch `wave-3-features-hygiene`, PR #14): item 2 (avatar full-size, dual-size upload), item 11 (create-from-album), item 7 (`guest_name`), item 8 (edge functions under tsconfig/eslint). Fingerprint-checked OTA-able to build 22 pre-merge. Follow-up surfaced by item 8: `submit-guest-contribution` needs a redeploy (live version predates the content-type hardening). **Verified in simulator post-OTA (2026-07-31)**: album "+" → create with album preselected → saved Vienna landed in the album with immediate refresh (1 → 2 moments, header count too); avatar re-upload wrote both sizes to staging storage (36 KB / 321 KB, HEAD-confirmed) and tapping the Me-tab avatar opened PhotoViewer with the full-size file. Item 7 verified at the unit-test level only — staging has no guest moments to open in the UI, and the `by <name>` display line is unchanged from the already-live RPC path.
- **Wave 4 — structural** (branch `wave-4-multi-mood`): item 4 (multi-mood migration + dual-write) · expo-av → expo-audio assessment (item 9, written up below). **Merge gate: the `moods` migration must be applied to the staging project (bqyrpahvdukllasafdpv) before the OTA merges** — the preview app selects `moods` and would 400 on every moment query without it. Prod (izfhbtipzuvinyacttin) already migrated + backfilled (92/92 rows, verified) via MCP 2026-07-31. No tool currently reaches staging DDL (CLI is on the Puente account, both MCP connectors point elsewhere): run the migration SQL in the staging dashboard SQL editor, or add a staging-pinned MCP server and OAuth it.
- **Wave 5 — remaining audit debt** (unscheduled): the 43 `Alert.alert` sites (split confirm/error/menu conventions), ErrorBanner-vs-Alert inconsistency, ActionSheetIOS→MomentActionMenu-style convention decision.

Carried-forward follow-ups (from PR #6/#8, now tracked here):

7. [x] **`guest_name` silently dropped** *(Wave 3)* — narrower than triaged: the shared-album RPC already coalesced `guest_name` into `contributor_name`, and the web pages already display it; the real gap was `mapRowToMoment` dropping it, so any non-RPC fetch (the moment-detail plain select on deep link/refetch) lost attribution. `mapRowToMoment` now derives `contributorName` from `guest_name` — guest rows only, keyed conditionally so non-guest moments keep the exact field set the card-column contract tests pin. Test renamed from "drops on the floor" to pin the new behavior.
8. [x] **`supabase/functions` outside tsconfig/eslint** *(Wave 3)* — scoped `supabase/functions/tsconfig.json` (Deno isn't installed locally or in CI, so: `Deno` global shim in `deno.d.ts`, esm.sh/jsr supabase-js imports path-remapped onto the app's own copy of its types) + eslint ignore removed (0 new warnings). CI runs `npx tsc -p supabase/functions` as its own pr-checks step — **deliberately not an npm script**; the `scripts` block feeds the native fingerprint. First run caught a real bug: `submit-guest-contribution` redeclared `const contentType` in one scope — a parse-time SyntaxError, proving the repo version was never deployed (live function is still v1; the guest-photo content-type hardening from `486a901` never shipped). Fixed (`photoContentType`), ~~redeploy still needed~~ **redeployed 2026-07-31** to both prod and staging (v2 each, via MCP `deploy_edge_function`; `verify_jwt` false on both — the function authenticates via invite code, and staging's seeded `true` would have blocked anonymous guest calls).
9. **expo-av → expo-audio migration** ⚪ *assessed Wave 4 (2026-07-31), verdict: small and safe — do it with the next binary.* Full expo-av surface is 8 call sites in 2 files (`contexts/PlayerContext.tsx` preview fallback, `app/onboarding/moment-preview.tsx`): `setAudioModeAsync({playsInSilentModeIOS})`, `Sound.createAsync({uri},{shouldPlay})`, `playAsync`/`pauseAsync`/`stopAsync`/`unloadAsync`/`setPositionAsync`, `setOnPlaybackStatusUpdate` (position, duration, didJustFinish). Everything maps 1:1 onto expo-audio: `setAudioModeAsync({playsInSilentMode})` (key renamed), `createAudioPlayer({uri})` + `.play()/.pause()/.remove()`, `.seekTo(seconds)`, `addListener("playbackStatusUpdate")` — mind the **seconds-vs-millis change** (expo-av positions are ms, expo-audio are s; PlayerContext already divides by 1000, so the conversion just moves). Provider playback (`@lomray/react-native-apple-music`, SpotifyRemote) is untouched — only the 30-sec preview fallback runs on expo-av. Estimate ~2–3 h including simulator regression (song-search tap-preview, detail progress + scrub, pause/resume, delete-stops-playback, onboarding preview, background-pause from Wave 1). **Swapping the package moves the fingerprint — batch with build 23**, alongside phase 2/3 of the moods migration if timing lines up.
10. [x] **Modal/sheet consolidation — Wave 2 shipped 2026-07-31** (branch `wave-2-modal-consolidation`). `components/BottomSheet.tsx` is now the only sheet implementation: one backdrop (0.6 dark/0.3 light), pan-to-dismiss on the grab zone (whole-sheet pan fights ScrollViews — root cause of the old three-way drift), CloseButton always present, optional keyboardAvoiding. All ten hand-rolled sheets migrated; the two moment-detail sheets gained their missing close affordance. All six former `presentation:"modal"` routes + the create-screen pageSheet are full-screen (join.tsx lost its fake sheet handle). `CreateAlbumSheet` replaces the CreateAlbumModal/NewSharedAlbumModal pair (create flow gains cover photo + shared toggle); dead `ShareCardModal` deleted. Raw `<Modal>` count 13 → 3, all deliberate: BottomSheet itself, PhotoViewer (opaque viewer), MomentActionMenu (anchored context menu). Remaining audit debt, deferred: 43 `Alert.alert` sites (confirm/error/menu split), ErrorBanner-vs-Alert inconsistency, ActionSheetIOS→menu convention. **Verified in simulator post-OTA (2026-07-31)**: AlbumPicker compact + content-sized; CreateAlbumSheet from both entry points (create-flow hand-back selects the album, defaults Personal; Albums-tab defaults Shared); profile-edit full-screen with Birth Year sheet + grab-zone pan-dismiss; moment-detail Add-to-Album sheet with its new CloseButton; ShareMomentSheet all three views with dynamic titles + internal back. — 13 RN `<Modal>`s built four different ways: 10 hand-rolled bottom sheets each with their own copy of backdrop + pan-dismiss (4 backdrop styles, 3 dim opacities, pan on whole-sheet vs handle-only vs none), 1 native pageSheet, 3 close-button conventions, 2 sheets with **no close affordance at all** (`moment/[id].tsx` onboarding-share + add-to-album), 43 `Alert.alert` sites mixing confirms/errors/menus. Dead code: `ShareCardModal.tsx` (no importer). Duplicates: `CreateAlbumModal` vs `NewSharedAlbumModal` (both "New Album"), `app/album.tsx` vs `app/album/[id].tsx`. Plan: one shared `BottomSheet` component (backdrop, pan, CloseButton baked in) and migrate the 10 sheets to it; owner rule — **no partial-screen covers**: substantial flows go full-screen (`fullScreenModal`/card push), quick picks go compact content-sized sheets; convert the 6 `presentation: "modal"` routes + the create.tsx pageSheet accordingly; delete `ShareCardModal`; merge the two create-album modals.

---

## Sharing v2 — locked 2026-07-31, next major project

Full spec: `docs/SOCIAL-ARCHITECTURE.md` (rewritten as v2 same day; audit that motivated it summarized in the doc's header). Four primitives — People (mutual-by-link), moment_shares, Albums, share links — replacing ten; privacy becomes "absence of grants" (visibility column + picker deleted); every wave ships its web counterpart. Culminates, with the rest of the polish batch, in the big App Store update (build 23 + expo-audio riding along).

- [x] **Phase A — honesty patch** *(shipped + simulator-verified 2026-07-31, PR #16)*: owner-only "Link is live" row with copy + revoke in ShareMomentSheet; sheet re-reads `share_token` on open (card-shaped moments carry a stale null — minting from the prop could orphan a live link). Verified on the OTA: mint → row appears → copy → revoke confirm → row gone → sheet reopen refetches DB and stays gone. Gives owners of the 17 live-linked-but-"private" moments their first off switch.
- [x] **Phase B — teardown** *(code + RLS shipped 2026-08-01)*: deleted tagging (lib + share sheet views + timeline Tagged pill + PeopleInput friend mode + saveMoment tag insert/visibility upgrade), reactions, VisibilityPicker + all visibility writes, collection_invites flow (lib/albums + AlbumShareSheet username search + Albums-tab invites section), friend request/accept ceremony (friendships are mutual-by-link only now), duplicate friend-request screen (deep links land on `friend/[token]`), the dead ~150-line onboarding share sheet in moment/[id], sharedScreen tombstone, claim_gifted_moment + get_tagged_moment_data call sites, dead badges (Me tab, pending requests). RLS: `Users can view moments` rewritten to the v2 access rule (own / own-album / member-album / has-link) via `20260801082000_rls_moments_v2_access_rule.sql`, applied to both envs. **DB objects NOT dropped on purpose** — stranded App Store build-7 binaries still write `visibility` and query `tagged_moments`; see the build-23 caboose below. `friends.tsx` → `albums.tsx` rename deferred to Phase C (it touches nav state). **Verified in simulator post-OTA (2026-08-01, PR #17)**: timeline has no Tagged toggle (map/calendar icons unconditional, calendar view fine); create details flow Photos→People→Mood→Album→Date with no visibility section; free-text People chip works; save succeeds with `visibility` taking the DB default (confirmed row: `private`, client never wrote it); detail has no heart/Shared-with; share sheet is card+link only; Albums tab grid without invites section; friends list is the plain mutual list. CI: db-migrate drift check green on the PR after secret added ("in sync" both projects), apply-mode no-op on merge.
- [ ] **Build-23 caboose (destructive drops — merge only after the PostHog `app_version` adoption check shows build 7 gone)**: drop `tagged_moments`, `moment_reactions`, `collection_invites`; drop `moments.visibility`, `profiles.profile_visibility`; drop RPCs `get_tagged_moment_data`, `claim_gifted_moment`, `check_moment_owner` + their indexes; delete `notify-friend` edge function (old binaries still invoke it until then). Ship a **min-build gate** in build 23 (launch check against a `min_supported_build` config value with a "please update" screen) so future teardowns get a clean cutoff instead of waiting on stragglers.
- [x] **Phase C — new core** *(code + DB shipped 2026-08-01)*: `moment_shares` via migration `20260801150000` (applied to both projects, history recorded with the filename version — CI apply should no-op). Table carries a denormalized `sender_id` (spec deviation, documented in SOCIAL-ARCHITECTURE): the moments SELECT policy now references `moment_shares`, so `moment_shares` policies must be self-contained or the pair is infinite RLS recursion. Policies: insert = sender is self AND owns the moment (the ownership EXISTS is what stops minting grants on other people's moments); recipient update confined to `viewed_at` by column-level GRANT (else a recipient could repoint their row's `moment_id` at any moment and see it); select/delete = sender or recipient. Moments SELECT policy gains the shared-to-me branch — the v2 access rule is now complete. App: `lib/momentShares.ts` (+4 vitest on the share-row mapper); share sheet "Send to a person" (owner-only row → friends picker with per-recipient sent-state, `moment_share_sent` event); timeline pills `My Moments | Shared with me` — signal-driven: unread-count head query on focus (60s cooldown) drives the badge, the list fetches only on first pill open, opening marks all viewed; both views stay mounted (opacity/pointerEvents), shared cards are MomentCard with sender attribution via `contributorName` (detail "by X" rides the cached moment). Pushes: new `notify-social` edge fn (`share_received`; content looked up server-side, caller must own the moment and the grant row must exist — deployed both envs v1); `accept-friend-invite` push copy → "X added you" with `data.type "people"` → routes to friends-list (prod v8 / staging v2; staging `verify_jwt` aligned to prod's `false`, fn self-authenticates). `notify-friend` stays deployed for old binaries (caboose deletes it). Route rename `friends.tsx` → `albums.tsx` (nav references updated; legacy `"friends"`-type pushes route to the Albums tab). People add-by-link polish: friends-list gains a person-add header icon + empty-state "Share your friend link" button. **Verified end-to-end in simulator post-OTA (2026-08-01, PR #18)**: pills render with unread badge (seeded Jp→E2E share showed 1), Shared with me lists the moment with sender badge, opening marks viewed in DB + clears badge, detail opens via the RLS shared-to-me branch, Send to a person → "✓ Sent" + correct DB row + notify-social 200, sent-state persists, Albums tab fine post-rename, friends-list shows the seeded friend + person-add icon; RLS negative tests (share someone else's moment, forged sender_id) both denied. **Two post-merge fixes from the verification pass:** (1) the INSERT policy's ownership EXISTS raised 42P17 — Postgres policy-recursion detection is per-RELATION, so consulting moments (whose policy references moment_shares) trips it even though the chain terminates; fixed by `20260801180000` routing the check through a SECURITY DEFINER `owns_moment()` (applied to both projects, filename-version history). Reads never hit this — the sender_id denormalization does its job there. (2) Shared-with-me detail lost its "by X" line when the background refetch replaced the cached moment (mapRowToMoment only derives contributorName for guest rows); MomentCard now passes contributorName as a route param in all cases, matching the album-card path.
- [x] **Phase D — facelift** *(code shipped 2026-08-01; simulator verification pending post-merge OTA)*: **Share card rebuilt** as the "kept artifact" — photo prints clean edge-to-edge with NO overlay/gradient (owner rule), everything written on a brand-cream mat below (serif title, DM Sans artist, italic serif reflection, one quiet meta line: mood emoji + date · location, wordmark); album art becomes the hero when there's no photo (thumb hides — it would repeat); colors deliberately fixed (not theme tokens) so the PNG is identical from a dark-mode phone; `variant "post" (4:5) | "story" (9:16)` on one component with a Post/Story toggle in the sheet. **Share sheet rebuilt to the spec's three verbs + state**: Send to a person · Add to album (new `onAddToAlbum` prop hands off to the detail screen's existing album-membership sheet — zero duplicated flow) · Share a link (link view: create/send + honest link-state row + card export lives here per spec); "SHARED WITH" chips on the options view (owner only) — one removable chip per person grant (unsend w/ confirm), album (remove w/ confirm + cache invalidation), and live link (revoke); grants load on sheet open (`fetchMomentShareRecipients` + fetchAlbums filter; `sendMomentShare` now returns the row id so a fresh send chips in without refetch). **Web redesigned to the same language** (standing rule: web ships in-wave): every share surface arrives as the same cream keepsake card with fixed artifact tokens in globals.css — `/m/` card matches the app export (clean 4:3 hero, serif title, full italic reflection, meta line; the old gradient fade + photo-overlay eyebrow deleted), `/c/` header card (cover prints clean, serif album title on the mat — replaces white-on-dark-gradient Playfair hero), `/friend/` renders the inviter as a "FRIEND INVITE" artifact card (also fixed stale "friends can tag each other" copy from pre-Phase-B). All three pages browser-verified locally against prod data in dark AND light schemes (local `web/.env.local` anon key was rotated-stale — refreshed, local-only). Checks: 195 vitest, app+functions tsc clean, eslint ≤ baseline, web production build green. **Verified post-merge (2026-08-01, PR #19)**: simulator on the OTA — three-verb sheet renders (Send to a person / Add to album / Share a link), owner gating correct, link view honest (no live-row when tokenless, card export inside), card view renders the cream artifact in BOTH variants via the Post/Story toggle (art-hero confirmed on a no-photo moment, thumb hidden), SHARED WITH chips load real grants ("Jp" on the seeded share), unsend confirm → chip gone + DB row deleted (fixture re-seeded after), Add-to-album hand-off closes the sheet and opens the detail's album sheet. Deployed web verified on soundtracks.app — /m/ serves the artifact card in production. Incidental find (pre-existing, spun off): web date formatting parses bare YYYY-MM-DD as UTC and can render a day off vs the app.
- [ ] **Phase E — later**: branded QR toggle on card + `/m/`; "Keep this" gift claim; parked items reconsidered.

## Reflections reorg — shipped 2026-08-01 (post-Sharing-v2 batch)

- [x] **Browse merged INTO Reflections** *(code shipped 2026-08-01; simulator verification pending post-merge OTA)*: the Reflections tab is now the one archive + resurfacing surface, ordered resurfacing-first: **search** (always-visible bar, results extracted to `components/MomentSearch.tsx`, same `browseSearch` query/debounce) · **On This Day** (unchanged byYear hero) · **Weekly Rewind** (NEW — ISO-week seed `year*100+week` picks one past month from the browseMeta month list, stable for seven days, targeted ≤3-moment query keyed `["weeklyRewind", userId, monthKey]`, added to cacheInvalidation drill-down keys) · **Moods / People / Years / Albums strips** (moved from browse/index; drill-down routes under `app/browse/` untouched) · **Surprise Me** (the random moment + shuffle, renamed, pinned to the bottom). The rotating person/mood/artist spotlights are deleted — the strips are the same doors without the daily reshuffle, "When you felt X" is absorbed by the Moods grid, and the reflections fetch slims from three queries to one (On This Day only; also retires the `.not("mood","is",null)` single-mood filter noted in the Wave-4 entry). `app/browse/index.tsx` deleted; the timeline's search icon now lands on Reflections with search focused via `lib/reflectionsSearch.ts` (module-level consume-once signal, the momentCache pattern — router params would re-fire on every later focus). Checks: 195 vitest, tsc clean, eslint warnings 62 → 56 (browse index deletion). **Verified in simulator post-OTA (2026-08-01, PR #20)**: timeline search icon lands on Reflections with search active; search matches across title/artist/reflection (sim `text` action dropped to a single "l" — the three results were exactly the "l" matches, confirming the ilike triple); Weekly Rewind picked July 2026 (the only eligible past month — deterministic) with its three moments; Moods strip (Joyful · 1) drills into the /browse/mood screen intact; Years (2026 · 5); People/Albums strips correctly hidden on data that has neither; Surprise Me renders at the bottom with shuffle; On This Day correctly absent (no prior-year Aug-1 moments). Rider: `scripts/seed-e2e.mjs` now maintains a **second test account** (`e2e2@soundtracks.test`, "E2E Two", same password) plus a standing friendship between the two — two-sided social testing (send → other side's inbox) no longer needs a borrowed real account; created live on staging same day.

- [x] **Timeline cards: bare mood emoji(s) near the date** *(code shipped 2026-08-01; verification pending post-merge OTA)*: `MomentCard` renders each mood's bare emoji beside the date — no chips, no labels (owner is wary of card clutter), capped at 3 so a two-mood moment shows both instead of masquerading as its primary mood. Share card and web `/m/` stay deliberately first-mood-only (compact layouts, dual-write primary).

## Design polish batch — shipped 2026-08-01

- [x] **Warm-tint neutrals** *(code shipped 2026-08-01; verification pending post-merge OTA)*: no pure grays left in `constants/theme.ts`. Light `text` is now the brand ink `#2C2C3A` (matching buttonBg, the web light theme, and the share card's artifact ink) with secondary/tertiary mixed from ink-over-cream (`#66656D` / `#9C9AA1`); borders/chips/skeletons/placeholders take the cream cast (`#E0D8CF`, `#F0E9E2`, `#EAE3DB`…). Dark neutrals warmed to match the near-black warm background (`#B3ACA8` / `#7E7672` / `#362F2C`), dark text softened to warm-white `#FAF6F2`.
- [x] **Lowercase-serif header voice**: the three capitalized tab headers join "your soundtrack" — `reflections`, `albums`, `profile` (all were already DM Serif Display; only the casing changed).
- [x] **Styled confirm sheet** *(replaces confirm-class `Alert.alert`)*: new `components/ConfirmSheet.tsx` — imperative `await confirmSheet({title, message, confirmLabel, destructive})` promise API, so call sites stay as small as `Alert.alert` was. All **12 confirm sites** migrated: delete moment (card + detail), remove-from-album (detail + share-sheet chip), unsend share, revoke link, remove friend, delete-account double-confirm chain, make-shared, remove member, leave album, delete album, delete prompt category. Deliberately NOT migrated: error alerts (`friendlyError` + Alert stays the error convention), camera-permission prompts (system-adjacent), the "Moment saved" flow choice, and the Music Service menu (ActionSheet-vs-menu convention still queued). **The flagged risk was real and is fixed (`02fe446`)**: iOS silently drops a root-level Modal presented while another Modal (an open bottom sheet) is up — verification caught the unsend chip's confirm never appearing, and worse, the stuck invisible Modal then ate tab-bar touches until relaunch. Hosts are now a **stack** (`confirmSheet()` talks to the most recently mounted host; a host unmounting mid-question resolves false), and ShareMomentSheet/AlbumShareSheet mount their own `<ConfirmSheetHost/>` inside the sheet's Modal hierarchy, where nested presentation works. **Verified in simulator across two OTAs (2026-08-01/02, PRs #21+#22+#23 + fix)**: 😊 renders beside September's date on timeline and rewind cards (mood-less cards unchanged); warm ink header/date colors visible; `reflections` lowercase serif header; root-level ConfirmSheet on card long-press delete (styled, red destructive, Cancel works); post-fix, the unsend confirm presents cleanly OVER the open share sheet.

## Ops hardening — queued 2026-07-31 (build all three)

Follow-ups from the 2026-07-31 migration-tracking repair (prod history had MCP-stamped drifted versions; staging history was empty and its schema silently missed three changes; `submit-guest-contribution` sat fixed-in-repo but undeployed for ~10 weeks). Make drift impossible rather than documented:

1. [x] **CI migration apply + drift check** *(shipped 2026-08-01 with Sharing v2 Phase B)* — `.github/workflows/db-migrate.yml` + `scripts/db-migrate.mjs`: merges to main touching `supabase/migrations/` apply pending migrations to BOTH projects via the Management API, recording history with filename versions; PRs get a check-only drift run; `workflow_dispatch` for manual/caboose runs. **Needs the `SUPABASE_ACCESS_TOKEN` repo secret** (Supabase dashboard → Account → Access Tokens) before its first run. Still queued from the original item: prod-vs-staging full schema diff (history parity is now enforced, schema shape isn't).
2. [x] **Edge-function deploy-on-merge** *(shipped 2026-08-01)* — `.github/workflows/edge-functions.yml` deploys ALL functions (self-healing against drift, not changed-only) to prod AND staging when `supabase/functions/**` or the manifest lands on main, via `supabase functions deploy --project-ref` per project. `verify_jwt` per function lives in **`supabase/config.toml`** — the CLI reads it on deploy, so the manifest is the single source of truth for both projects (staging's seeded `verify_jwt:true` on submit-guest-contribution once silently blocked anonymous guests).
3. [x] **Weekly advisors sweep** *(shipped 2026-08-01)* — `.github/workflows/weekly-health.yml` (Mondays 9:15 UTC, next to the E2E cron, + workflow_dispatch) runs `scripts/advisors-check.mjs`: security lints at ERROR/WARN fail the run **only when their `cache_key` is not in `scripts/advisors-baseline.json`** — the accepted-risk register (18 standing findings snapshotted 2026-08-01: the deliberately-exposed SECURITY DEFINER RPC surface, pg_trgm-in-public, HIBP protection off, staging's bucket-listing note; the caboose-doomed RPC entries get pruned with the caboose). Baseline entries that stop firing are reported for pruning so fixes can't regress silently. Performance lints and INFO print but never gate. Verified against both projects' live advisor output before shipping.
4. [x] **Prod-vs-staging schema diff** *(shipped 2026-08-01; closes item 1's leftover)* — same weekly workflow runs `scripts/schema-diff.mjs`: public-schema shape (columns + types/nullability/defaults, RLS policies + cmd/roles/permissiveness, function signatures) fetched from both projects via the Management API and dictionary-diffed; any divergence is a red run with a per-object diff. Verified green at ship time: identical digests, 190 objects each.

## NOW — May 2026 Priorities

### 1. Polish & Bug Fixes 🔴 *In progress*

**UI consistency:**
- [x] Audit every screen against the design system — spacing, font sizes, button styles, close button usage, empty states
- [x] Consistent error messaging — all catch blocks that surface errors to users use `friendlyError()`; silent `.catch(() => {})` fire-and-forgets are intentional
- [ ] Loading states on every async action — no silent spinning or frozen UI
- [x] Modal presentation consistency — CloseButton added to AlbumPicker sheet and CreateAlbumModal header

**Known bugs to fix:**
- [x] Onboarding: username availability check — added distinct "error" status; shows "Couldn't check — try again" instead of incorrectly showing "Taken"; blocks save with a clear alert
- [x] Friends: duplicate modal stack on cold open via invite link — replaced time-based dedup with per-token Set; same token can never navigate twice in a session regardless of which source fires (URL/AsyncStorage/clipboard)
- [x] Friends: slow/black screen on login — loading spinner added to Collections screen while initial fetch completes
- [x] Edge function console.log cleanup — removed all debug logs from `send-notifications`
- [x] Untracked migration file — already committed as `20260324110000_tagged_moments_moment_id_index.sql`

**Code quality (in progress — ~40 files, net -846 lines):**
- [x] Audit for duplicated fetch logic — screens refactored; `EmptyState`, `IconButton`, `TaggedRow` extracted as shared components; `lib/momentColumns.ts` extracted
- [x] Consistent error handling pattern — every `try/catch` that shows to user uses `friendlyError()`
- [ ] Remove dead code and unused imports surfaced during audit

---

### 1b. Progressive Memory — Songless Capture + AI Soundtrack Suggestions 🟡 *Medium effort, high capture + retention value*

A memory doesn't have to be complete to be worth saving. Songs are optional at capture time — the moment is saved immediately, and the app helps the user enrich it over time. This reframes incompleteness as momentum: the memory is *growing*, not broken.

**The progression:**
1. **Capture the memory** — reflection, mood, photo, date. Song is skippable. No gate.
2. **AI-assisted soundtrack suggestions** — immediately after saving, if no song was attached, the app generates 3–5 real song candidates using the reflection text + mood + date + user taste profile. One tap to attach. These are real songs from the Apple Music / Spotify catalog, not generated audio.
3. **Skip suggestions** — moment saved as a progressive memory (not called a "draft" in UI). Missing artwork communicates incompleteness visually; an "Add song →" chip on the card invites backfill.
4. **Upgrade later** — "Add Song" is a first-class action on the moment detail screen, not buried in an edit flow. The AI suggestions can be re-surfaced at this point too.

**What to build:**
- [ ] Remove hard song requirement on create screen — "Add Song" skippable with visible "Add later" affordance
- [ ] Post-save AI suggestion sheet — appears immediately after saving a songless moment; shows 3–5 candidates with artist, title, era; one tap attaches; dismissible
- [ ] Suggestion algorithm — LLM prompt using reflection text + mood + moment date + user's taste profile (birth year, country, favorite artists) → candidate song list → cross-referenced against Apple Music catalog via MusicKit search
- [ ] Progressive memory card treatment — no artwork backdrop; distinct placeholder; "Add song →" chip; still appears on timeline and in reflections, never hidden
- [ ] Backfill from detail — "Add Song" prominently surfaced on any moment missing one; re-runs AI suggestions as starting point
- [ ] Gentle weekly notification — "A memory from March is still looking for its song." At most once/week, only if progressive memories exist, lowest priority type

**What NOT to build (yet):**
- Generated ambient scores — off-brand at the core level. Soundtracks works because *this specific song* is *your* memory. A generated score has no memory attached to it; it's a novel experience, not a remembered one. Expensive, complex, and dilutes the product identity. Revisit only if users explicitly ask for it.

**What NOT to do in the UI:**
- Don't call them "drafts" — sounds like an error
- Don't block sharing or collections on progressive memories
- Don't hide them or sort them separately — they live on the timeline alongside complete moments

**Why this matters:**
Removes the capture blocker at the worst possible moments (funerals, spontaneous memories, old memories resurfacing). The AI suggestion step means users aren't left staring at a search box when they're emotional — the app does the work. Backfill in a reflective state produces higher-quality song associations than forced search at capture time.

**Technical dependency:** AI suggestions build directly on Music Memory Engine infrastructure (taste profile, era scoring) — ship Phase 1 of Music Memory Engine first, or in parallel.

---

### 2. Full Apple Music Playback ✅ *Shipped May 2026*

- [x] Full playback via `ApplicationMusicPlayer` for Apple Music subscribers
- [x] Mini player persists across screens; recently played section
- [x] Graceful 30s preview fallback for non-subscribers
- [x] Playback polish — scrubber, NowPlaying IDs, gesture conflicts resolved
- [x] Playback fallback when native Apple Music fails

**Spotify full integration:** ✅ Shipped May 2026
- [x] Account-level music provider preference (Spotify or Apple Music) stored on profile
- [x] Spotify OAuth via `react-native-spotify-remote`; token stored in SecureStore
- [x] Search Spotify catalog via Web API; songs carry `song_provider` + `song_spotify_id` in DB
- [x] In-app playback via Spotify App Remote SDK (requires Spotify app + Premium)
- [x] 30s preview fallback via Supabase Edge Function (`spotify-preview`) for non-Premium / no-app
- [x] Share extension respects provider preference — Spotify URL + Spotify pref → Spotify song
- [x] Music Service toggle in Me tab with immediate OAuth on switch to Spotify
- [x] Each moment remembers its own `song_provider`; playback always uses the correct SDK

---

### 3. Wedding Ready 🟡 *Growth + Revenue lever*

The web contribution flow is live. The remaining items make the wedding feature sellable and self-serve. A couple should be able to set this up in 10 minutes without contacting you.

- [ ] **Shareable card generator** — beautiful image with couple's names, date, short link; looks like an invitation not a tech product; designed to be texted or embedded in wedding website
- [ ] **Vanity short URLs** — `soundtracks.app/join/sarah-and-james` instead of UUID; configured by collection owner
- [ ] **Wedding/event collection template** — pre-sets name format, cover style, default prompt ("What song defined this day for you?")
- [ ] **Post-event claim flow** — guests who contributed via web get "Your memories from Sarah & James's wedding are waiting" after downloading
- [ ] **PDF book export** — each page: contributor name, reflection, song + artist, photo; back: full song list; cover: tiled album art collage; print-on-demand via Artifact Uprising or Blurb

---

### 4. App Store Listing Improvement 🟢 *Organic discovery*

The current listing is functional but not optimized. Better screenshots and copy = more organic downloads without spending on ads.

- [ ] **Screenshots** — show the emotional core of the app (moment detail with blurred artwork, friends feature, reflections tab); current screenshots are functional but not aspirational; consider adding caption overlays
- [ ] **Description rewrite** — lead with the emotional hook ("A song comes on and suddenly you're back."), not the feature list; current description is too feature-focused
- [ ] **Keyword optimization** — research competitor keywords; "music diary", "music memories", "song journal" are underserved; use all 100 characters
- [ ] **Promotional text** — update seasonally; not reviewed since launch
- [ ] **App preview video** — optional but high-impact; 30s video showing the capture flow converts better than screenshots alone

---

### 5. Integration & End-to-End Tests 🟡 *Stability foundation*

The friends debugging session is what happens without tests. The goal isn't 100% coverage — it's covering the flows that are painful to debug manually.

**What to test:**
- [ ] Edge functions — unit tests for `accept-friend-invite` auth logic, `send-notifications` scheduling logic
- [ ] `lib/friends.ts` — `acceptFriendInvite`, `sendFriendRequest` error cases
- [ ] `lib/moments.ts` — `mapRowToMoment`, fetch functions
- [ ] Deep link handler — URL parsing, deduplication logic, pending token flow
- [ ] Supabase local dev setup — `supabase start` + seed data so edge functions can be tested locally before deploying

**What NOT to test (yet):**
- UI components — too much churn; wait until UI is stable
- Network calls — mock at the `supabase` client boundary, not per-function

---

### 6. Code Quality Audit 🟢 *Maintainability*

Do this after the bug fix pass, not before. You'll understand the codebase better after fixing things.

- [ ] Full duplicate code audit — identify shared patterns that should be extracted to lib functions
- [ ] Consistent TypeScript — remove remaining `any` types in critical paths (friends, moments, auth)
- [ ] RLS policy audit — verify all tables have correct policies; the share_token issue proved gaps exist
- [ ] Review all edge functions for missing error handling

---

## Tab Redesign — ✅ Shipped May 2026

### Tab structure
| Tab | Was | Now |
|-----|-----|-----|
| Timeline | Moments | Timeline — chronological, collection chip row, search. No filter icon, no calendar toggle. |
| Browse | Reflections | Browse — different lenses into your own catalog (see below) |
| Shared | Friends | Shared — social inbox: tagged moments + shared collection activity + friend management |
| Me | Profile | Me — profile, friends list, settings |

### Timeline simplification
- Replace title-as-collection-dropdown with a horizontal scrollable chip row: `All · [personal col 1] · [personal col 2] · ••• `
- Shared collections accessible via `•••` (opens existing bottom sheet) — no individual shared chips in the row
- Remove filter icon and calendar toggle from timeline header — both live in Browse
- Keep search on Timeline (universal enough to stay)
- Header title: **"your soundtrack"** with moment count above it (e.g. "27 MOMENTS")

### Browse tab — "rediscover your own catalog through new lenses"
Not a generic explore feed. Every tile is a re-entry point into your own memories, not new content.

Sections (top to bottom):
- **On This Day** — small strip at top when there are matches. Personal and timely.
- **Calendar** — month grid, days with moments marked. Tap a day → moments from that day. (Moves from Timeline toggle)
- **Map** — moments plotted by location. Only shown if user has geotagged moments.
- **Moods** — emoji grid of all mood types (built-in + custom). Tap → filtered timeline.
- **People** — everyone tagged across moments, sorted by frequency. Tap → "11 moments with Maya."
- **Years** — horizontal time scrubber. "Summer 2024," "Winter 2023," scrubbable.

Prompts are NOT the hero of Browse. They stay as a button in the create screen.

### Shared tab — "the social surface, on your terms"
Not a feed. Directed content only — things explicitly sent to you or that you're in.

Sections:
- **Tagged in** — moments friends tagged you in (newest first). Compact card: song artwork + title + "[Name] tagged you · date."
- **Shared Collections** — your shared collections with new activity, grouped by collection. Tap → that collection's timeline.

Friend management (requests, friends list, add friend) accessible via a button in the Shared tab header — links to existing `friends-list.tsx`.

---

## PRIORITY STACK — Post-Launch Build Order

Ordered by impact across growth (new users), retention (keep existing), and revenue (conversion to paid). Updated April 2026.

### Complexity reference
- 🟢 Straightforward (days)
- 🟡 Moderate (1–2 weeks)
- 🔴 Hard (3–6+ weeks)

| Priority | Feature | Drives | Complexity | Notes |
|----------|---------|--------|-----------|-------|
| 1 | ~~Friends (Phase C)~~ | ~~Growth + Retention~~ | ~~🟡~~ | ✅ Shipped April 2026 — friend invite links, direct accept, push notification, tagged moments. |
| 1b | ~~Tab redesign~~ | ~~Retention~~ | ~~🟡~~ | ✅ Shipped May 2026 — Browse tab, Shared tab redesign, center capture button, tab swiping, onboarding rebuild, TanStack Query migration. |
| 2 | ~~Share Profile~~ | ~~Growth~~ | ~~🟢~~ | ✅ Shipped May 2026 — share button on profile screen (person-add icon) shares `soundtracks.app/friend/{token}` via native share sheet; receiver lands on existing friend invite web page. |
| 2b | Public Profile Page | Growth | 🟢 | Replace the friend-invite share with a real public profile page: `soundtracks.app/u/{username}`. Shows the user's avatar/name/username + all their `visibility='link'` moments (song artwork, reflection, mood, date). Beautiful shareable artifact — feels like an artist profile. Also unlocks #13 (QR Print needs a public URL to encode). See spec below. |
| 3 | Wedding refinement | Growth + Revenue | 🟡 | Shareable card generator, vanity short URLs, wedding collection template, post-event claim flow, PDF book export. Builds on shipped web contribution flow. |
| 4 | ~~Spotify integration (iOS)~~ | ~~Growth~~ | ~~🟡~~ | ✅ Shipped May 2026 — full SDK integration via `react-native-spotify-remote`. Account-level provider preference, in-app playback (Spotify Premium), 30s preview fallback, share extension provider-aware, Music Service toggle in Me tab. |
| 5 | Notification refinement | Retention | 🟡 | Tap-rate tracking per type, timing optimization, unengaged user suppression, deep link targets, A/B copy. |
| 6 | Music Memory Engine Phase 1 | Retention | 🟡 | Highest-leverage empty-state fix. Edge function + seed dataset + existing notification infra. Questionnaire already built. Seeds moments from listening history; weekly prompted-song push. |
| 7 | Era Clustering | Revenue | 🔴 | Premium conversion trigger at 25–30 moments. Hardest feature on the list. |
| 8 | Yearly Recap | Growth + Revenue | 🟡 | Must ship before December. Annual press moment. Free card + Premium full version. |
| 9 | Song Anniversaries + Forgotten Songs | Retention | 🟢 | Ship alongside Music Memory Engine work. Date math + simple query. |
| 9b | Weather Metadata | Retention | 🟢 | Auto-attach weather (condition + temp) to moments at capture time using a free weather API (Open-Meteo — no key required) keyed to moment date + lat/lng. Store on `moments` table. Show as a chip in moment detail alongside location. Day One proved this drives emotional richness; "It was raining the night I heard this" is a real memory layer. |
| 10 | Save for Later (Song Inbox) | Retention | 🟡 | Share Extension "Save" path + drafts table + inbox UI. |
| 11 | Memory Game | Growth + Retention | 🟡–🔴 | Async version first (Wordle-style). Needs friends. Killer viral mechanic. |
| 12 | Smart Playlists (basic) | Retention + Growth | 🟡 | Time-period + mood playlists → Apple Music export. Shareable. |
| 13 | QR Code Framed Print | Revenue | 🟡 | Needs public moment pages first. Printful API. High-volume gift product. |
| 14 | Lock Screen Widget | Retention | 🔴 | App Intents, App Groups, Live Activities. Gets tech press. |
| 15 | Android port | Growth | 🔴 | Not before 1,000+ active iOS users + revenue. 4–6 weeks. Swap points: musickit.ts rewrite, new Kotlin modules for NowPlaying + ShazamKit → ACRCloud, Google Sign-In. Everything else cross-platform already. |
| 16 | Musical Autobiography | Revenue | 🔴 | LLM prose on personal data. Needs 2+ years of user data to be moving. Plant seeds now. |
| 17 | "You're Not Alone" | Retention | 🟡 | Needs scale (1K+ users) for meaningful numbers. |
| 18 | Community features | Retention | 🔴 | Tracks 100, memorial collections, community challenges. 5K+ users. |

### Notification refinement — what's missing
Current state: infrastructure exists (edge function, per-type prefs, cold-launch fix, scheduling). What's not done:
- [ ] Tap-rate tracking per notification type (are On This Day taps higher than streak taps?)
- [ ] Timing optimization — send at each user's historically active hour, not a fixed UTC time
- [ ] Unengaged user suppression — don't send to users who haven't opened in 30+ days; re-engagement campaign instead
- [ ] Deep link targets — each notification type should deep link to the right screen, not just open the app
- [ ] A/B testing notification copy — small copy changes drive significant tap-rate differences
- [ ] Weekly prompted song (Music Memory Engine) — not yet wired to edge function
- [ ] Weekly text prompt — not yet wired to edge function
- [ ] Collection activity notifications — member adds to your shared collection (real-time, not batched)
- [ ] Expo delivery-receipt poller — **deferred, revisit at ~5k push tokens** (27 today). `send-notifications` reaps `DeviceNotRegistered` from send *tickets*, which catch the smaller half; most uninstalls only surface in delivery *receipts* (POST `/push/getReceipts`, 15+ min after send). Needs a `push_receipts` table, a second cron'd edge function, and a 24h TTL sweep since Expo omits not-yet-ready receipts and discards them after a day. Zero cost at current scale — dead tokens don't affect live sends; the rate-limiting risk is a tens-of-thousands-of-tokens problem. See the `FOLLOW-UP:` comment on `sendBatch`.

### Wedding / Event — full spec

#### The Story Collection angle (primary pitch)

**The insight:** The best wedding use case isn't a guestbook — it's the couple's own story. They curate a collection of songs that trace how they met, fell in love, and got here. Guests discover it at the reception by scanning a QR code on their table card. Before the dancing starts, they're already emotionally connected.

**Two-phase experience:**
1. **Story phase** — QR codes on table cards, escort cards, or bar menus link to the couple's curated collection. Each table can get a different moment ("Table 7 gets the road trip song"). Guests browse the couple's story while waiting for dinner. Conversation starter. Emotional primer.
2. **Guest phase** — After dinner, one QR code at the dance floor / bar opens contributions. Guests add "the song that reminds me of love" or any memory from the evening.

**The result:** The collection couples own forever becomes the wedding artifact — their love story + the songs from that night — printable as a book.

**This is not a wedding-only feature.** Weddings are the highest-intent, highest-willingness-to-pay use case, but the exact same feature works for reunions, milestone birthdays, road trips, end-of-season team celebrations. The wedding is the wedge; the use case is "any event worth remembering."

**Pricing direction:**
- $59 one-time: unlocks QR code generation (per-moment + collection), guest contributions, permanent public link, printable card templates
- $59 softcover / $89 hardcover add-on: the physical book (wedding tax is real and expected)
- Total all-in: $118–$148 — less than a single centerpiece
- `events_tier_unlocked` defaults true now; flip default to false when adding paywall

**Distribution channels:**
- QR codes on table cards / escort cards / ceremony programs (natural, non-intrusive)
- Wedding website (Zola, The Knot) — embed the collection link in the "Our Story" section
- Wedding party group chat — share the collection link before guests arrive
- DJ/band announcement — one mention at a natural moment

**Who converts to app users:** Every guest who scans a QR, reads the couple's story, and feels the emotional pull. The CTA on the web viewer — "Remember a song that takes you back? Capture your own memories in Soundtracks" — fires at the highest-emotion moment possible. One wedding, potentially 20–80 downloads from people who genuinely felt something.

**What to build (remaining):**
- [ ] Per-moment QR code — download a QR pointing to `soundtracks.app/m/{share_token}` from moment detail screen (Priority 2)
- [ ] Shareable card generator — printable table card with QR + couple's names + "Scan to hear our story" (Priority 2)
- [ ] Vanity short URLs — `soundtracks.app/join/sarah-and-james` instead of UUID (Priority 2)
- [ ] Wedding/event collection template — pre-sets name style, cover, prompt (Priority 2)
- [ ] Post-event claim flow — guests who contributed get "Your memories from Sarah & James's wedding are waiting for you" after downloading (Priority 2)
- [ ] Pricing + paywall — flip `events_tier_unlocked` default to false; add in-app purchase flow (Priority 3)

**No-download web entry — ✅ shipped via web form.** Guests contribute from any browser at `/c/{code}/contribute`. Native App Clip deferred unless web conversion data justifies the build complexity.

**The competitive advantage:** Soundtracks' window is forever, not just the event. The memory doesn't have to happen at the table — it can happen during the first dance, the next morning, or a month later when the song comes on shuffle.

### Public Profile Page — full spec

#### The idea

Right now "Share Profile" sends a friend invite link — a transactional CTA to connect. The opportunity is something richer: a real public-facing profile page at `soundtracks.app/u/{username}` that shows who you are and the moments you've chosen to share with the world. Feels like an artist profile. Shareable in a bio, on social, texted to a friend. "This is me — the songs that made me."

#### What gets shown

- **Profile header** — avatar, display name, @username
- **Public moments** — all moments where `visibility = 'link'` ("Anyone with link"), sorted newest first. Each card shows: song artwork, title, artist, date, mood chip, first photo, truncated reflection.
- **Empty state** — if no public moments yet: "No public memories yet."
- **Sticky CTA** — "Open in Soundtracks" (deep link) + "Download Soundtracks" (App Store). Same pattern as all other web pages.
- **OG metadata** — `"{displayName} on Soundtracks"` title; first moment's artwork as og:image; rich link preview in iMessage, Twitter, etc.

#### What to build

**1. DB migration** — new anon RLS policy on `moments`:
```sql
CREATE POLICY "Anon can read link-visibility moments"
  ON public.moments FOR SELECT TO anon
  USING (visibility = 'link');
```
Current anon policy only allows reads via `share_token` or public collections — this gap must be closed for the profile page to work.

**2. Web route** — `web/app/u/[username]/page.tsx` (new server component). Mirrors `web/app/c/[invite_code]/page.tsx` structurally. Reuses `AlbumMomentList` component (already built, handles audio preview + mood chips + photos). Profile header copied from `web/app/friend/[token]/page.tsx`.

**3. App button** — update `handleShareProfile` in `app/(tabs)/profile.tsx` to share `https://soundtracks.app/u/{username}` instead of the friend invite URL. Change icon from `person-add-outline` → `share-outline`. Fallback to friend invite URL if username is somehow null.

#### Unlocks

- **#13 QR Framed Print** — the print product needs a stable public URL to encode into the QR code. `soundtracks.app/u/{username}` (or `soundtracks.app/m/{share_token}` for individual moments) is that URL.
- **Social distribution** — users can put their profile link in an Instagram bio, TikTok description, Twitter/X bio. Every view is a potential download.
- **Artist/creator identity** — power users who document their musical life have a shareable artifact that reflects their taste and story.

#### Watch out for

- Auto-generated usernames (`user_abc12345`) look ugly in a shared URL. Profile edit allows customizing this; consider adding a nudge ("Set a custom username to personalize your link") before the share sheet if the username starts with `user_`.
- Photo URL paths are relative — prepend the full Supabase storage URL as done in all other web pages.

---

### Platform expansion
- **Android**: Not before 1,000+ active iOS users + revenue. Abstraction is reasonable — swap points are clean:
  - `lib/musickit.ts` → full rewrite for Spotify SDK (one file)
  - `modules/now-playing/` → new Kotlin native module via MediaSession API (same TS interface)
  - `modules/shazam-kit/` → new Kotlin native module via ACRCloud API (same TS interface)
  - `expo-apple-authentication` → add Google Sign-In
  - Everything else (UI, Supabase, navigation, photos, notifications) is already cross-platform
  - Estimated effort: 4–6 weeks focused work, not a full rewrite
  - **Song search on Android**: MusicKit doesn't exist. Best option is the **iTunes Search API** (`itunes.apple.com/search?term=...`) — already partially used in the codebase for preview URL fetching, requires zero credentials, covers the full Apple Music catalog. Fallback option: Spotify Web API catalog search (requires OAuth). Now Playing on Android uses MediaSession (Kotlin native module, same TS interface as iOS).
- **Spotify integration on iOS**: Before Android. Store `spotify_track_id`, search Spotify catalog, deep link out. 6–12 months out.

### Onboarding questionnaire — decision
Keep birth year + country in onboarding (required — Music Memory Engine needs it). Cut favorite artists, songs, genre prefs from onboarding; move to Profile → Taste as optional enrichment surfaced after 3rd logged moment. Reduces drop-off while preserving cold-start data.

### Known technical debt
- Notification edge function: queries all profiles at once — needs pagination at 10K+ users
- Spotify oEmbed cross-search: fragile, no fallback if format changes
- No offline support: moments can't be logged without network
- No per-request timeout/retry (global 520 retry added, but not per-request)
- RLS policies: one gap already found and fixed; edge cases in shared collections may exist
- Invalid/expired invite code handling: not gracefully surfaced to user

---

### 1. Privacy Policy + Terms of Use ✅
- [x] Hosted at `music-memory-app.vercel.app/privacy` and `/terms`
- [x] Covers email/Apple ID, reflection text, mood data, photos, location (EXIF), push notification tokens
- [x] Addresses third parties, data retention, account deletion, user rights
- [x] Terms: acceptable use, content ownership, no liability for data loss

### 2. Deferred Deep Links ✅
- [x] Clipboard method — web writes `soundtracks-invite:{code}`, app reads on first launch
- [x] Invite code survives App Store install; auto-presented join flow after sign-up

### 3. Onboarding Tightening ⬜ (mostly done)
**Done:**
- [x] Celebration screen — single "Turn on notifications" button, no skip; notification cold-launch deep link fixed
- [x] Notification permission: full-screen transparent ask, trust-building framing, manage in Settings
- [x] Per-type notification toggles in Profile (On This Day, streak, prompts, resurfacing)
- [x] Signup questionnaire — birth year + country, favorite artists/songs, genre prefs (5 steps, optional skip on steps 2 + 5)
- [x] Gate: after onboarding completes, routes to create screen as first action
- [x] "How to capture a memory" collapsible card in Profile — all 5 capture methods with descriptions
- [x] Genre preferences editable post-onboarding in Edit Profile

**Remaining (post-launch):**
- [ ] Collection-origin users: "This moment is yours now. Not just theirs." reframe after joining

### 4. App Store Listing + Assets ✅

**Crash reporting — Sentry** ✅
- [x] `@sentry/react-native` installed, DSN configured, `Sentry.wrap(RootLayout)` in app entry point
- [x] `SENTRY_AUTH_TOKEN` added as EAS secret (Project R&W + Release R&W + Org Read scopes)
- [x] Source maps upload automatically on EAS build

**Product analytics — PostHog** ✅
- [x] `posthog-react-native` installed, `PostHogProvider` wraps app in `_layout.tsx`
- [x] `posthog.identify()` on sign-in, `posthog.reset()` on sign-out
- [x] Events tracked: `signed_up`, `signed_in`, `onboarding_completed`, `moment_created`, `shazam_used`, `moment_deleted`, `moment_shared`, `song_searched`, `song_selected`, `collection_joined`, `notifications_enabled`, `notification_preferences_changed`
- [x] Dashboard: https://us.posthog.com/project/331689/dashboard/1331385

**In-app feedback** ✅
- [x] "Share Feedback" button on Profile screen (above Sign Out) → mailto to `founder@soundtracks.app`

**UGC moderation** ✅
- [x] Report Moment — in `...` menu on moments by other users; mailto pre-filled with moment ID + contributor name
- [x] Collection owners can remove moments and kick members

**Data integrity fix** ✅
- [x] Timeline + Reflections state cleared immediately on `user.id` change — prevents data flash between accounts

**App Store Connect — required fields** ✅
- [x] App name: "Soundtracks"
- [x] Subtitle: "Your music. Your memories."
- [x] Description + promotional text written
- [x] Keywords set
- [x] Privacy policy URL: `/privacy`
- [x] Category: Music (primary), Lifestyle (secondary)
- [x] 9 screenshots uploaded (6.5" slot: resized to 1284×2778)
- [x] Age rating: 12+ (UGC present)
- [x] App Privacy labels completed
- [x] Demo account credentials added
- [x] Review notes added
- [x] EAS production build attached + submitted for review

**EAS Build** ✅
- [x] `eas.json` configured with production profile, auto-increment build number
- [x] All secrets added to EAS: Supabase URL/key, Sentry DSN, PostHog key/host, Sentry auth token
- [x] Production build completed successfully

**Sentry alerts**
- [ ] Configure email alerts for new error types hitting production

**Supabase Pro — upgrade before launch**
- [ ] Free tier: 1 day log retention, no automated backups
- [ ] Pro ($25/month): 7-day logs, daily automated backups — non-negotiable for personal emotional data

### Memory Prompts ✅
- [x] Rotating contextual starters — 8 categories × 5 prompts
- [x] Lives in create screen, Reflections tab, empty states; user picks a prompt → pre-fills reflection placeholder
- [ ] Weekly push notification with a prompt (not yet wired to edge function)

**Prompt Library — organized by type:**

*People*
- "A song your parent played that you didn't understand until later"
- "The song that was yours and one specific friend's"
- "A song that makes you think of someone you've lost"
- "A song someone dedicated to you, or that you dedicated to someone"
- "The song playing during your relationship's best moment"

*Place & Time*
- "The song that takes you back to a specific summer"
- "A song you associate with one room, one apartment, one city"
- "The song you heard in another country that stuck with you"
- "The song from your first road trip"
- "A song that always plays in your head when you think of where you grew up"

*Firsts*
- "The first song you chose for yourself — not something you heard, something you found"
- "The first concert you ever went to"
- "The song playing during your first drive alone"
- "The first song that made you cry"
- "A song you remember discovering and immediately sending to someone"

*Loss & Endings*
- "A song you played when something ended"
- "The song playing the last time you saw someone"
- "A song you can't listen to anymore because of who it reminds you of"
- "A song you wish you could share with someone who's gone"
- "The song from the hardest season you've lived through"

*Becoming*
- "A song that got you through something you couldn't explain"
- "The song playing when you realized you were becoming someone different"
- "A song that felt like it was written for a version of you that no longer exists"
- "A song from a chapter of your life you've never fully written about"
- "The song you played when you made a decision that changed everything"

*Late Night*
- "A song you played at 2am when you couldn't sleep"
- "The song that hit differently when you were driving alone at night"
- "A song that only makes sense after midnight"
- "The song you played when the party was over and you were the last one awake"
- "A song you've cried to in a car alone"

*Joy*
- "The song playing when you got news that changed everything (in the best way)"
- "A song that makes you feel invincible"
- "The song from the best summer you can remember"
- "A song you put on when you need to feel like yourself again"
- "The song you played on repeat when something finally worked out"

*Rediscovery*
- "A song you haven't thought about in years that just came back"
- "A song that meant something completely different to you at different ages"
- "A song you ignored when it first came out, then fell in love with later"
- "A song that will always take you back even though you try to move on"
- "A song from a playlist you forgot you made"

### Early Resurfacing ✅
- [x] "A Month Ago" section in Reflections tab — 25–35 day window, bridges the On This Day gap
- [x] "On This Day" grouped by year (existing)
- [x] Random memory resurfacing in Reflections tab
- [ ] "Your earliest memory in Tracks" card — works from day 1
- [ ] "From a year like this one" — same month in past years

### 30-Day Retention Plan
| Day | Hook |
|-----|------|
| 0 | First moment saved before leaving onboarding |
| 0 | Collection users: "This moment is yours forever" reframe |
| 1 | Push: "What song have you had in your head this week?" |
| 3 | Music Memory Engine fires first prompted song: "What does '[Song]' remind you of?" |
| 7 | "You've logged X moments" + streak acknowledgment |
| 14 | Second prompted song or forgotten song if applicable |
| 30 | "A Month Ago" appears in Reflections; mini recap card: "Your first month in Tracks" |

**Notification coalescing rule:** max 1 notification per day; priority order: On This Day > streak at risk > weekly prompted song > weekly prompt text. Weekly cadence for resurfacing — never daily.

---

## WEDDING READY

The wedding is a Trojan horse. Guest scans QR → contributes a memory → gets prompted to download → their contribution becomes their first personal moment. One event, potentially 50–150 installs.

### Web Contribution Form (no account required) ✅ **[Free to contribute / Events tier to unlock]**
- [x] Guest navigates to `soundtracks.app/c/{invite_code}/contribute`
- [x] Song search via iTunes Search API (public, no auth needed)
- [x] Reflection text + mandatory photo upload
- [x] Submits without an account — per-collection guest Supabase auth user; per-submission `guest_uuid` for claim flow
- [x] Web server inserts via service role key (bypasses RLS)
- [x] After submit: "Memory added ✓" banner + live feed (incremental polling every 30s) + "Add Another" + "Download Soundtracks" CTA
- [ ] After sign-up: claim flow links guest moments to new user_id (post-event claim — not yet built)
- [x] `events_tier_unlocked` flag on collections (default true); server action checks before allowing contributions

### QR Code Generation ✅ **[Events tier]**
- [x] Collection owner taps "Get QR Code" → web page at `/c/{code}/qr` opens in browser
- [x] Full-screen scannable QR; renders with `qrcode` npm package on canvas
- [x] Downloadable as PNG
- [x] AlbumShareSheet: copy link + share sheet + Get QR Code button

### Wedding Refinement **[Priority 2 — next up]**
- [ ] Shareable card generator — beautiful image with couple's names, date, short link; looks like an invitation not a tech product; designed to be texted or embedded in wedding website
- [ ] Vanity short URLs — `soundtracks.app/join/sarah-and-james` instead of UUID
- [ ] Wedding/event collection template — pre-sets name style, cover, prompt ("What song defined this day for you?")
- [ ] Post-event claim flow — guests who contributed via web get "Your memories from Sarah & James's wedding are waiting for you" after downloading
- [ ] PDF book export — each page: contributor name, reflection, song + artist, photo; back: full song list with QR codes; cover: tiled album art collage; print-on-demand partner (Artifact Uprising, Blurb); $80 softcover / $130 hardcover

*ShazamKit moved to Growth — it's a core everyday capture feature, not event-specific. See Growth section.*

### ShazamKit Native Module ✅
- [x] Custom native module at `modules/shazam-kit/` (same pattern as NowPlaying module)
- [x] Wraps Apple's ShazamKit — microphone → 3-second audio fingerprint → song ID
- [x] Cross-references `SHMediaItem` against MusicKit for full song metadata
- [x] "Identify" button on create screen; wired into create flow
- [ ] Lock screen widget "Identify" tap — zero-friction ambient capture (future)

**The use case that defines this feature:**
You're walking down the street. A restaurant is playing a song that immediately takes you back. You tap Identify — 3 seconds — the song resolves. You write the memory right there on the sidewalk. That moment would have been lost. That *is* the Instagram comment with 2,962 likes. ShazamKit captures it.

| | Now Playing | ShazamKit |
|---|---|---|
| Detects | Music playing *through your device* | Music playing *anywhere near you* |
| Trigger | You chose to play it | It found you |
| Examples | Your own Spotify, Apple Music | Restaurant, street, friend's speakers, wedding, concert |

### Share from Photos ✅
- [x] Share extension accepts image file types
- [x] Create screen opens with photo pre-filled, EXIF date + location auto-populated
- [x] Visual trigger (old photo) → musical memory captured

### Smart Playlists **[Free basic / Premium full]**
- [ ] Auto-generated playlists from your logged moments, organized by dimension — not manually curated, built from your data
- [ ] **By time period** — "My 2021," "Summer 2019," "Last Winter" — date-bounded song lists, one tap to open in Apple Music [Free]
- [ ] **By mood** — "Songs I logged as peaceful," "My heartbreak playlist" — the honest version, not an algorithmic recommendation [Free]
- [ ] **By person** — "Moments with Jordan" as a playlist — the relationship soundtrack, listenable [Free with export, Premium for insights]
- [ ] **By location** — "Songs from New York," "Road trip moments" — requires location data on moments [Premium]
- [ ] **By era** — auto-detected clusters ("The Comeback Summer") rather than calendar year [Premium, needs era clustering]
- [ ] These are distinct from personal collections (which are manually curated) — smart playlists are generated, not assembled
- [ ] Playlist Export from Collections handles the Apple Music side; smart playlists use the same export mechanism

### Playlist Export from Collections **[Free]**
- [ ] Any collection (personal or shared) can be exported as an Apple Music playlist
- [ ] One tap → playlist created via MusicKit `MusicLibrary.shared.add()`
- [ ] Shared collection export: "The Wedding Soundtrack" playlist with all contributed songs
- [ ] Personal collection export: "My Road Trip Playlist" — a playlist you actually remember making
- [ ] Every export is shareable as a playlist → more impressions for Tracks

### Physical Book **[Premium — one free per year on annual plan; discounted for monthly]**
Works for both personal collections and shared/event collections. The same product, different emotional context.

**Structure:**
- Cover: tiled collage of album artwork from all songs in the collection
- Inside front: collection name, date range, brief description / story
- Each spread: album art (left page) + photo + full reflection + metadata — date, location, mood, people (right page)
- Styled QR code on each spread → links to public moment page where the song plays
- Back matter: the Playlist — every song formatted as a vinyl tracklist (№, Song, Artist, Album, Year) + a QR code that opens the full playlist in Apple Music
- Back cover: Soundtracks logo + collection invite code (for shared collections)

**The playlist as the last page** is the feature. For a wedding book it's the ceremony soundtrack. For a personal annual book it's your year in music, printable and permanent. It's the "credits" of the story.

**QR codes:** styled with brand gradient (orange→purple dots, rounded corners, Soundtracks logo center) — not a generic black square. Generated via `react-native-qrcode-svg` or server-side for print resolution. Scannable by any phone camera.

**Pricing:**
- Softcover (up to 50 moments): $49 — ~$20 print cost via Blurb/Prodigi → ~$29 margin
- Hardcover (up to 100 moments): $79 — ~$35 print cost → ~$44 margin
- Annual plan subscribers: one softcover/year included free (redemption ~20–30%, economics still healthy)
- Monthly plan subscribers: 20% off any book

**Print partners:** Blurb (has developer API), Prodigi (global fulfillment), Chatbooks (partnership programs). Prerequisite: public moment page URLs (`/m/{moment_id}`) must exist for QR codes to resolve.

**The physical object does marketing you can't buy.** A wedding book sits on a coffee table, gets picked up at parties, gets photographed and posted. Every guest at the wedding who sees it is a potential user.

---

## GROWTH — Closes the Acquisition Loop

Features that turn users into acquisition channels.

### Gift a Memory ✅
- [x] Web page at `web/app/m/[share_token]/page.tsx` — song + reflection, no account required to view
- [x] App generates share token and surfaces iOS share sheet from moment detail
- [x] Acquisition through emotional resonance — recipient sees your memory, CTA to download

### Share Profile **[Free — connection driver]**

The problem with "share your profile" as a concept is that a bare link feels like LinkedIn. The goal here is making it natural to share your Soundtracks identity when meeting someone — IRL or online — in a way that actually gets them to add you as a friend, not just view a static page.

**Profile page** — `soundtracks.app/u/{username}`
- Avatar, display name, @username
- Moment count + member since
- 3–5 public "highlight" moments (user can pin these, defaults to most recent)
- "Add as friend on Soundtracks" CTA — deep links to `soundtracks://friend?token={friend_invite_token}` for instant friend request if they have the app; falls back to App Store if not
- Private by default — user explicitly turns on `profile_visibility: "public"` to enable the page

**In-app share button** — accessible from Me tab (Profile screen)
- "Share my profile" → iOS share sheet with `soundtracks.app/u/{username}` + short blurb ("Check out my music memories on Soundtracks")
- Also shows QR code option for IRL use (same `qrcode` package already in web project)

**Connection flow improvement**
- Current friend invite URL (`soundtracks.app/friend/{token}`) just writes clipboard and redirects to App Store — it works but feels like a dead end for web visitors
- Profile page replaces that landing experience: web visitor sees your highlights before being asked to install, raising the "worth downloading for" bar
- After install + onboarding, the pending `friend_invite_token` auto-resolves (already implemented via `pending_friend_token` in AsyncStorage)

**Implementation notes**
- `username` + `friend_invite_token` already on `profiles` (shipped with Friends Phase C)
- `profile_visibility` column already exists (shipped with Friends migration)
- Web page is a new route: `web/app/u/[username]/page.tsx` — server component, queries `profiles` via service role where `profile_visibility = 'public'`
- Pinned moments: add `is_profile_highlight boolean DEFAULT false` to `moments`; max 5 per user; UI to toggle from moment detail (`...` menu)
- Public moment display: only show moments the user has explicitly pinned; no private reflection text — just song + date + photo thumbnail

### Shareable Moment Card **[Free — core acquisition driver]**
Every user who shares a moment is an ad. The card is the flywheel.

**Three formats, one design system:**

**Digital share card** (9:16, optimized for Stories and TikTok)
- Album art fills top 60%, brand gradient (orange→purple) bleeds behind
- Song + artist in clean type
- 1–2 sentences of reflection — enough to feel it, not the full thing
- Small photo inset, polaroid-style
- Date + location in subtle type
- "soundtracks · add yours" CTA at bottom — this is the acquisition hook
- One tap from moment detail → native share sheet

**Print card** (4×6 or 5×7 — prints at Walgreens/CVS for $0.30)
- Same design adapted for horizontal/square
- Styled QR code on the front (brand gradient dots, Soundtracks logo center) linking to the public moment page
- 300 DPI output — generated server-side or via web for print quality
- Free for all users; making it physical costs them nothing meaningful

**Wall art** (12×12 or 18×24 — standard frame sizes)
- Album art as the dominant visual, large
- Memory in serif type below — minimal, gallery-quality
- Aesthetic: between a framed record sleeve and a concert poster
- Output as high-res PDF; user prints wherever they want or orders via partner
- Premium tier feature or small one-time unlock ($2.99)

**The conversion trigger:** viewer sees the card and thinks *"I have a song like that."* That feeling is what converts. Specificity drives it — "August 2019" lands harder than "a few years ago," a real city name lands harder than nothing. The reflection is truncated intentionally; curiosity does the rest.

**The TikTok format:** scroll through 5–6 memory cards set to one of the songs. Each card: album art + one-line memory. The sound IS the song from the last card. End card: "capture yours on Soundtracks." This format already gets millions of organic views — the app is the tool that makes it effortless.

**Yearly Recap card** (Wrapped-style, ships every November)
- X moments captured, Y songs, top mood, most active month
- Mosaic of album art from the year
- "Your 2026 Soundtrack" — shareable, beautiful, guaranteed annual viral moment
- Build it once, it markets the app every year forever

### Time Capsule **[Free basic / Premium scheduling]**
- [ ] When logging a moment, optionally set a "resurface on" date — a specific day, an anniversary, or a recurring schedule (yearly, monthly, etc.)
- [ ] Example: "Surface this every year on July 4th" or "Remind me of this in 5 years"
- [ ] Notification arrives on the chosen date: *"You sealed this memory 2 years ago — ready to open it?"* — tapping opens the moment detail
- [ ] Could also allow writing a message to future self at seal-time, revealed only when the capsule opens
- [ ] Capsule state: sealed moments show a lock icon on timeline cards until the date arrives; after opening they return to normal
- [ ] **Premium**: recurring schedules (monthly/yearly), multiple capsules per moment, "sealed until" visibility control (hide from timeline entirely until open date)
- [ ] Fits naturally into the create screen as an optional field alongside mood/people — low friction, high emotional payoff
- [ ] The intentionality of sealing something creates a ritual; the opening creates a guaranteed moment of reflection — the entire emotional arc of journaling compressed into one feature

### Resurfacing Weight Control **[Free]**
- [ ] After a moment surfaces in Reflections, let the user explicitly signal: "Show this more" / "Not now" / "Bury this"
- [ ] Implicit version: if you engage with a resurfaced moment (tap into detail, add a new reflection, or share it), it gets upweighted automatically; if you swipe past it three times, it gets downweighted
- [ ] Explicit version: long-press on any moment card → "Resurface often" / "Leave it in the past"
- [ ] Some memories people want back constantly. Others they logged to process and don't need to relive. The app should learn the difference.
- [ ] This is essentially spaced repetition for emotional memories — the Anki model applied to your past
- [ ] Builds trust: users who feel in control of what surfaces stay longer

### Lyric Anchoring + Cross-Era Lyric Connections **[Free anchor / Premium connections]**
- [ ] When logging, optionally highlight a specific lyric as the emotional anchor [Free]
- [ ] Stored as `lyric_anchor` field on the moment
- [ ] Displayed prominently on detail view — the exact line that hit you
- [ ] Years later, the lyric is more specific and powerful than just the song title
- [ ] Surfaced after song is selected; optional, zero friction
- [ ] **Cross-era lyric connections [Premium]** — when a lyric or theme reappears across multiple moments in different eras, the app surfaces it: *"This line from Bon Iver shows up in 3 different phases of your life. Here's who you were each time."* Requires NLP matching on lyric text + reflection text. The most poetic feature in the product — the idea that certain words follow you through life.

### Voice Notes **[Free]**
- [ ] Record a voice note alongside (or instead of) typed reflection — expo-av already installed
- [ ] Record to local file → upload to Supabase Storage (same pattern as photos)
- [ ] `audio_url` field on moments; playback on detail view
- [ ] Your actual voice, from that moment in time — photos and text can't replicate this
- [ ] Optional: pipe through OpenAI Whisper edge function for transcription + searchability
- [ ] Hear your own voice from the past — deeply personal, no other app does this

### Music Memory Engine **[Free — the engagement core]**
> Full algorithm design, data model, and phased build plan: see `docs/MUSIC-MEMORY-ENGINE.md`


The highest-leverage retention feature in the product. A push notification saying "What does 'Lady in Red' remind you of?" — with a tap that opens the create screen with that song pre-filled — is not a nudge. It's a direct invitation to relive something. No other journaling app can send this because no other app knows which songs are loaded with meaning for each specific person.

**The core loop:**
```
birth year + country + favorite artists → formative era → candidate songs
→ score + rank → filter already-logged → pick 1 song/week
→ push: "What does '[Song]' remind you of?"
→ tap → create screen opens with song pre-filled
→ user writes reflection → moment saved
→ song marked as prompted+logged; loop repeats with richer signal
```

**Data model:**
- [ ] `profiles`: add `birth_year int`, `country text`, `favorite_artists jsonb[]`, `favorite_songs jsonb[]`, `genre_preferences text[]` — collected at signup questionnaire
- [ ] `suggested_songs` table: `(id, title, artist, apple_music_id, release_year, country_codes text[], genres text[], cultural_weight float)` — the curated seed dataset
- [ ] `prompted_songs` table: `(user_id, song_id, prompted_at, tapped bool, logged bool)` — tracks what was sent and whether user engaged

**Song dataset — hybrid approach:**
- [ ] Curated seed dataset (~500–1,000 songs) in `suggested_songs` table: Billboard/chart hits by era + region that reliably trigger memories — think "Lady in Red," "Wonderwall," "Mr. Brightside," "Lose Yourself," etc.; one-time build, maintained manually
- [ ] Apple Music catalog enrichment: for each `favorite_artist` the user provides, use the existing MusicKit integration to pull their top songs + related artists → dynamic expansion of candidates beyond the curated set; no extra API key needed
- [ ] Over time, collaborative signal (see Phase 3 below) can surface long-tail songs the curated set would miss

**Notification types and cadence:**

| Type | Cadence | Default | Notes |
|---|---|---|---|
| Prompted Song | Once/week | On | Core engine output — "What does '[Song]' remind you of?" |
| On This Day | Day-of, conditional | On | Only fires when there's an actual match |
| Streak at risk | Daily if active | On | Haven't logged today + active streak |
| Weekly Prompt (text) | Once/week | Off | Rotating writing prompt, no song |
| Collection activity | Real-time | Off | Member adds to your shared collection |

Preferences UI in Profile → Notifications settings screen (new screen, accordion in profile).

**The Algorithm — three phases:**

*Phase 1: Rule-based scoring (cold start — day 1)*
Every candidate song gets a score against the user profile:
```
score(song, user) =
  era_weight(song.release_year, user.birth_year)      // peaks at ages 13–25; Gaussian decay beyond
  × country_weight(song.countries, user.country)       // 1.0 match, 0.7 English-adjacent, 0.4 global
  × genre_weight(song.genres, user.genre_preferences)  // cosine similarity on genre vectors
  × artist_affinity(song.artist, user.favorite_artists) // 1.5× if exact match, 1.2× if Apple Music "related"
  × (0 if already logged or recently prompted)
```
Era weight uses a Gaussian curve peaked at birth_year + 18, capturing the reminiscence bump. A user born in 1985 gets maximum weight for songs from 1998–2003, tapering toward 1990 and 2010.

*Phase 2: Content-based filtering / VSM (weeks 2+)*
Represent each song as a feature vector in a shared space:
```
song_vector = [year_normalized, genre_one_hot[], country_one_hot[], cultural_weight]
```
As the user logs moments, build a user preference vector from their logged songs using TF-IDF-style weighting (rare genre preferences get higher weight than common ones — same logic as VSM document retrieval). Cosine similarity between the user vector and each candidate song vector gives a ranked list that gets more accurate with every moment logged. This is content-based filtering using Vector Space Model — computationally cheap, interpretable, no cold start problem.

*Phase 3: Collaborative filtering (months 2+, needs user base)*
Build a user × song affinity matrix from logged moments. Apply SVD (or ALS for sparsity) to factorize into latent feature space. Users with similar latent vectors (similar birth year, country, genre, logging patterns) surface songs their neighbors logged that the current user hasn't. "Users born in 1985 in the US who logged these 5 songs also had memories to [Song X]." This is where the Netflix analogy becomes real — not just "songs from your era" but "songs people exactly like you carry."

*Phase 4: Hybrid + contextual bandits (when data is rich)*
Blend Phase 1 score with Phase 3 CF score, weighted by how much data the user has generated. Use contextual bandits (explore/exploit) on notification timing and song selection — track which prompted songs get tapped vs. ignored; optimize the selection policy over time. Engagement signal (tap → created moment) is the reward function.

**pgvector in Supabase** handles Phase 2 and 4 natively — no Pinecone, no external ML infrastructure. The full recommendation pipeline runs inside Supabase.

**Why this is a moat:**
Spotify knows you played "Lady in Red" 47 times. Tracks knows it was your parents' wedding song and you played it at your dad's funeral. The annotation is the moat. The recommendation engine trained on annotated emotional data is categorically different from one trained on play counts — and the more moments users log, the better it gets for everyone.

- [ ] Phase 1 (build now): signup questionnaire + `suggested_songs` table (curated seed) + Edge Function that scores + sends weekly notification
- [ ] Phase 2 (build at 100+ active users): VSM scoring layer using pgvector, replace/augment Phase 1 scoring
- [ ] Phase 3 (build at 1,000+ users): collaborative filtering via SVD in Edge Function or external Python job writing results back to Supabase
- [ ] Phase 4 (build at 10,000+ users): full hybrid + bandit optimization

### Plant Seeds for Anonymous Stats / Discover **[Free — data-seeding tasks]**
- [ ] `birth_year`, `country`, `favorite_artists`, `genre_preferences` — collected at signup (see Music Memory Engine above); also feeds generational Discover cuts; seed now, data compounds over time
- [ ] `song_stats` table — pre-compute daily: song_id, mood, log_count, week; start accumulating before the UI exists
- [ ] Minimum threshold: 50+ logs per song before any percentages are shown
- [ ] These are infrastructure tasks; the UI comes in the Social phase once data exists

### Pattern-Based Resurfacing **[Free basic / Premium deep patterns]**
- [ ] Time-based resurfacing (On This Day, A Month Ago) is table stakes — the more interesting angle is *behavioral* patterns
- [ ] **Artist drift** — "You logged 8 moments with Phoebe Bridgers but haven't touched her in 6 months. Here's one." Low query complexity, high emotional hit.
- [ ] **Day-of-week patterns** — "You save a lot on Sunday nights — here's one from last month." Detect over-indexed days from moment timestamps; serve on that day.
- [ ] **Mood resonance** — "Your mood was similar then to how you're feeling now." Match current session mood tag (from the last moment logged) against historical moments with same or adjacent tag. Show the moment + reflection as a mirror.
- [ ] **Listening rhythm** — "You tend to log more in winter. Here's what you were listening to last February." Seasonal pattern without needing a full year of data — just same-month-last-year if it exists, or same-season average.
- [ ] All of these surface as cards in the Reflections tab, slotted between On This Day and the prompt cards
- [ ] Basic variants (artist drift, day-of-week, mood resonance) are Free; deeper statistical patterns (multi-variable correlations, predictive surfacing) are Premium
- [ ] These compound — the more moments logged, the more pattern signal, the better the cards get; makes long-term retention self-reinforcing

### Forgotten Songs **[Free]**
- [ ] Surface songs logged exactly once and never revisited
- [ ] "You logged this once in March 2024 and never came back to it."
- [ ] Haunting in a good way — reinforces the logging habit
- [ ] Simple query: moments grouped by song, count = 1, surface randomly in Reflections tab

### Song Anniversaries **[Free]**
- [ ] "One year ago today, you first logged this song."
- [ ] Pure date math, deeply personal
- [ ] Lives in Reflections tab alongside On This Day

### "Log With Others" Nudge Strategy **[Free]**
- [ ] After logging a moment, soft prompt: "Who were you with when this song hit you?"
- [ ] If they tag a person: next session, "You have 3 moments with Jordan — want to share them?"
- [ ] Tagging people is the first step of the social loop; it feels like meaningful metadata, not a feature
- [ ] People who log moments with others are more likely to invite those people → shared collections → installs
- [ ] Track: moments with people tagged vs. not — if correlation with retention is strong, make the prompt more prominent

### Community Entrenchment **[Free — the stickiness layer]**

*The strongest retention mechanic is artifacts that feel like loss to abandon. Each of these creates something that doesn't exist anywhere else and can't be reconstructed if the user leaves.*

- [ ] **Shared histories as exit barriers** — once two people have built a shared collection together (wedding, road trip, friendship), that history lives in Tracks. Leaving means losing it. Not manipulative — just the natural weight of something real being built. The job is to make the artifact feel valuable enough that this exit cost registers.
- [ ] **"You both have a memory here"** — when two friends have independently logged the same song, the app notices: *"You and Alex both have a moment tied to this song — for completely different reasons."* No explicit sharing required; just the recognition that your history and someone else's overlap. Creates an impulse to share your reflection and see theirs.
- [ ] **Memorial collections** — collections dedicated to someone who has passed, maintained by multiple people contributing their memories of that person's soundtrack. Deeply personal, practically impossible to replicate elsewhere, and the kind of thing families maintain for years. This is one of the most emotionally significant things the product could enable.
- [ ] **Community challenges with temporal anchoring** — weekly or monthly prompts the whole community responds to together: *"Log the song from your best summer."* *"What were you listening to the week everything changed?"* Individual responses are private; the aggregate result (most common eras, moods, artists) is shared. Creates shared temporal experience — the feeling of doing something together — without a social graph.
- [ ] **"The Tracks 100"** — annual list of the 100 most emotionally significant songs logged by the community, ranked by annotation depth (not play count). Different from every other chart because it's based on what songs *meant*, not how often they were played. Released each December alongside Yearly Recaps. Press-worthy. Something users look forward to.
- [ ] **Collaborative era naming** — community votes on what to call shared musical eras: *"What do you call the post-pandemic music moment?"* *"Name the 2010s indie folk era."* Users who participate feel ownership over the product's language. Small feature, high community investment.
- [ ] **First Tracks anniversary** — *"One year ago today, you logged your first memory here."* The app becomes part of your personal history. Leaving means the anniversary disappears.

### Save for Later — Song Inbox **[Free]**
- [ ] One-tap intent capture: user hears a song but doesn't have time to write a reflection; saves song metadata to a personal inbox to complete later
- [ ] Reduces the most common source of missed memories: "I was going to log that but forgot"
- [ ] Entry points (in order of build effort):
  - **Share extension** — add "Save for Later" option alongside "Log Now"; saves song metadata without opening the create screen; lowest effort, reuses existing infrastructure
  - **Widget** — "Save what's playing" single-tap button using App Intents (iOS 17+); triggers background action without opening the app; reads now-playing from shared UserDefaults, writes to drafts
  - **Siri Shortcut** — "Hey Siri, save this to Tracks"; same App Intent as the widget, free once that infra exists
- [ ] Storage: `drafts` table — `user_id`, `song_name`, `artist`, `apple_music_id`, `artwork_url`, `saved_at`
- [ ] Inbox UI: "To Log" section at top of timeline (dismissable), or a badge on the create button; tapping a draft pre-fills the create screen with that song; draft disappears once logged or explicitly dismissed
- [ ] Optional: push reminder after 48h — "You saved '[Song]' to log later. Still want to?"
- [ ] Build order: (1) share extension "Save for Later" path + `drafts` table + inbox UI; (2) widget action after the widget ships

### Milestone Tracker + Progress Counter **[Free — engagement layer]**
- [ ] **Milestone counter** — a running count of logged moments, shown prominently in Profile as part of identity ("You've built 47 memories"), not buried in a stats section
- [ ] **Milestone celebrations** — in-app moment that fires when the user crosses a threshold; not a badge, a felt beat: subtle animation, a personalized message, and a sneak peek of what's coming next

  | Milestone | Message | Sneak peek |
  |-----------|---------|------------|
  | 1st moment | "Your first memory. This is the beginning." | "Log 4 more and early resurfacing unlocks." |
  | 5 moments | "You've got something going." | Blurred Reflections card: "Your earliest memory will start surfacing here" |
  | 10 moments | "10 memories. You're building a real archive." | "At 25, your first era will start to take shape." |
  | 25 moments | "Something is forming." | Locked era card preview in Reflections — the Premium conversion moment |
  | 50 moments | "50 moments. This is a real body of work." | Blurred pattern insight teaser |
  | 100 moments | "100 memories. That's a life in music." | "What kind of music person are you" insight unlocked |
  | 365 days active | "A full year. On This Day is now fully alive." | Yearly Recap unlocked |

- [ ] **Sneak peeks at upcoming unlocks** — below each milestone celebration, show a blurred/locked preview of exactly what unlocks next and how many moments away it is: "8 moments away from your first pattern insight" with a soft preview behind it; creates anticipation instead of a hard wall
- [ ] **Progress strip in Profile** — a horizontal milestone timeline showing the user's current position and the next 2–3 upcoming unlocks; feels like a journey being assembled, not a game with levels
- [ ] **Sneak peeks at upcoming unlocks** — below each milestone celebration, show a blurred/locked preview of exactly what unlocks next and how many moments away it is: "8 moments away from your first pattern insight" with a soft preview behind it; creates anticipation instead of a hard wall
- [ ] **Progress strip in Profile** — a horizontal milestone timeline showing the user's current position and the next 2–3 upcoming unlocks; feels like a journey being assembled, not a game with levels
- [ ] **Tone: journal, not fitness app** — language like "You've built...", "Something is forming...", "This is becoming real" — never streaks broken, never XP, never badges; the metaphor is an archive growing, not a game being played
- [ ] **Streaks (secondary, gentle)** — "You've logged 4 days this week" as a warm acknowledgment, not a pressure mechanism; no streak-breaking push notifications; logging every day should feel natural, not guilted
- [ ] Monthly recap card: "You saved 12 moments in February" — surfaces in Reflections as a warm summary, shareable as an image
- [ ] Seasonal milestones: "You've been logging since winter. Here's what spring sounds like for you." — crosses into Pattern Resurfacing when enough data exists

### Mini-Achievements — Feature Discovery Layer **[Free]**
> One-time "first time you did X" moments. Not a badge wall — each fires once, in-context, as a warm acknowledgment. Never shown as a checklist to complete; discovered naturally as the user explores.

- [ ] **Implementation:** a `user_achievements` table — `(user_id, achievement_key, earned_at)`; check on relevant actions; fire a celebration sheet when a new key is inserted; never re-fire
- [ ] **Achievement set:**

  | Key | Trigger | Message |
  |-----|---------|---------|
  | `first_photo` | Attached a photo to a moment | "A face to go with the feeling." |
  | `first_person_tag` | Tagged someone in a moment | "Music sounds different with people in it." |
  | `first_shazam` | Identified a song with ShazamKit | "Caught in the wild." |
  | `first_share` | Shared a moment card | "You just gave someone a memory." |
  | `first_share_extension` | Captured via share from Apple Music/Spotify | "Straight from the source." |
  | `first_now_playing` | Used Now Playing auto-fill | "No searching. Just feeling." |
  | `first_voice_note` | Added a voice note | "Your voice, from this exact moment." |
  | `first_location` | A moment with a location tagged | "Somewhere specific." |
  | `first_collection` | Created or joined a shared collection | "Music is better shared." |
  | `first_prompt_used` | Logged a moment from a memory prompt | "The prompt found something real." |
  | `first_gift` | Sent a Gift a Memory | "That's going to mean something to them." |
  | `first_save_for_later` | Used Save for Later | "You'll come back to this." |
  | `first_reflections_tab` | Opened the Reflections tab | "Here's where it all starts to add up." |
  | `first_calendar_view` | Opened the calendar view | "Your life, mapped." |

- [ ] **Sharing nudge tied to `first_share`** — after 3+ moments logged without sharing, a soft in-app card: "Your moments are worth sharing. Here's one that might resonate." Tapping opens the share sheet for that moment; not a notification, just a card in the timeline or Reflections
- [ ] **"You've unlocked everything" state** — if a user earns all achievements, a quiet acknowledgment: "You've found everything Tracks has to offer. Now it just compounds." No fanfare — just recognition that they've explored deeply; reinforces that the value is in the archive, not the features

---

## PREMIUM — Paywall + Insights

Build the infrastructure now, launch the paywall when users have 25+ moments. Don't rush this.

### RevenueCat + Paywall **[prerequisite for everything in this section]**
- [ ] $6/month or $50/year (Plus tier)
- [ ] Events tier: $39.99 one-time per event (extended collections, QR, book export)
- [ ] Conversion trigger: at 25–30 moments, show a locked "Take Me Back" era card
- [ ] "Paywall meaning, not logging" — free users keep all capture features forever

### Data-Gated Feature Progression **[Premium retention mechanic]**
- [ ] Premium features unlock not on an arbitrary calendar but when the user's *data is mature enough for them to be meaningful* — this feels earned, not withheld
- [ ] The unlock moments create genuine "wow" beats that justify staying subscribed
- [ ] Framing matters: never say "this feature unlocks in 7 days." Say "you're close — log 5 more moments and your first pattern will emerge."

| Milestone | What unlocks | Why it requires this |
|-----------|-------------|---------------------|
| 5 moments | Early resurfacing cards (A Month Ago, Forgotten Songs) | Needs enough material to resurface anything |
| 15 moments | Mood trajectory begins — first draft of your emotional arc | Needs enough variance to be meaningful |
| 25 moments | "Take Me Back" era card appears (locked preview → conversion trigger) | Era clustering needs density |
| 50 moments | Full predictive insights, pattern-based resurfacing | Statistical patterns need volume |
| 100 moments | "What kind of music person are you" — personality insight | Needs rich annotation history |
| 1 year active | On This Day with real historical data | Literally requires a year |
| Dec 31 | Yearly Recap — "Your 2026 in Moments" | Calendar-gated, not data-gated |

- [ ] **Weekly Premium discovery** (separate from unlocking) — every Monday, a push or in-app card highlights a Plus feature the user hasn't tried yet, with a one-line explanation of why *now* is a good time to try it. Not withholding, not marketing — just guided exploration of a product that's easy to under-use.
- [ ] Progress indicator in Profile: "Your Tracks journey — X/8 chapters unlocked" — shows users how much is still ahead, makes the subscription feel like it compounds over time rather than plateauing

### "Take Me Back to This Era" **[Premium — THE conversion trigger]**
- [ ] The experience, not just the analysis — you're not showing data, you're returning someone to a chapter of their life
- [ ] At 25–30 moments, a locked era card appears in Reflections: generated name, blurred preview, "Unlock the chapter you just lived"
- [ ] Era detection: cluster moments by date, mood, artist, reflection patterns; generate a name ("Winter of Letting Go", "The Comeback Summer")
- [ ] Era experience — four surfaces working together:
  - **Artsy album art collage** — mosaic of every artwork from that period, like a visual fingerprint
  - **Auto-generated playlist** — all songs from the era, one tap to open in Apple Music
  - **Photo collage** — all photos from moments in that era
  - **AI narrative** — prose about who you were during this chapter: "In this season, you kept returning to songs about distance. Your reflections mentioned letting go 7 times."
- [ ] Shareable era card: artwork collage + era name — "This was my whole personality for 6 months"
- [ ] See `AI-FEATURES.md` for clustering approach

### Data Moat Features **[Premium — each requires intentional emotional annotation; Spotify can't replicate any of these]**

*The filter: could a streaming service produce this from play counts alone? If no, it's a moat.*

- [ ] **Emotional fingerprint of a song** — for any song, aggregate how all users emotionally tagged it: "73% nostalgic, 18% heartbreak, 9% joy." Surfaces in moment detail and song views. The first time anyone has measured what a song *means* rather than how often it was played.
- [ ] **"What kind of music person are you"** — based on your annotation patterns, a personality-style insight: *"You're an emotional processor — you log most heavily when working through something, not when celebrating."* *"You're a memory keeper — you log when a song takes you back, not when you discover something new."* Requires annotated history. Shareable. Strong Plus conversion hook.
- [ ] **Reflection theme clustering** — NLP on your reflection text, no manual tagging. Surface recurring themes you didn't consciously notice: *"The word 'letting go' appears in 23% of your reflections."* *"You mention driving in 31 moments."* Completely irreplicable without free-text emotional writing.
- [ ] **"Songs that actually helped"** — when in a low mood, surface songs from your history that you logged when feeling similar AND then logged something more positive within the following week. Your personal proof a song helped, not a generic recommendation. The music therapy feature built from your own data.
- [ ] **Cross-moment pattern recognition** — things the data shows that you didn't notice: *"You log 3x more on Sunday nights."* *"Every time your people tags drop off, your mood tags shift darker within 2 weeks."* *"You have 14 moments with Alex — 12 are tagged peaceful."* Patterns from annotated data over time.
- [ ] **Emotional DNA of an artist** — aggregate the emotional fingerprint for any artist across all users. *"Phoebe Bridgers: 64% processing grief, 22% healing, 14% nostalgia — from 4,200 annotated moments."* What an artist's catalog means to listeners, not streams. Press-worthy. Could drive artist pages publicly.
- [ ] **Trending by emotional tag** — "songs spiking in 'heartbreak' logs this week" is a Tracks-exclusive chart that Spotify cannot produce. This is the moat version of trending. Tie to cultural moments: when an album drops, show how people are emotionally logging it in real time.

### Insights Dashboard **[Premium]**
- [ ] "How You're Evolving" — current era vs. past eras
- [ ] Mood trajectory graph — mood over time, tap to jump to moment
- [ ] Music taste evolution — energy, genre, tempo trends over months
- [ ] Mood gap analysis — "You almost never log joy. The last time was 8 months ago."
- [ ] Relationship soundtracks — filter by person, stats, exportable playlist
- [ ] Mood prediction pre-fill — suggest mood based on song + your history
- [ ] See `AI-FEATURES.md` for full AI spec

### **Portfolio Centerpiece: "Take Me Back to This Era" + Emotional Intelligence System**
*This is the feature that demonstrates serious AI/ML engineering and produces something emotionally beautiful.*
- Era clustering uses feature engineering (audio features + mood + sentiment + time patterns) → unsupervised clustering (K-means / DBSCAN) → LLM integration (Claude API for era naming + narrative prose)
- Emotional fingerprint + "what kind of music person are you" demonstrates aggregate analytics + personalization + NLP
- Together: a full AI pipeline from raw annotated data → insight → beautiful output
- The demo moment: *"Here's what the system produced for my own life data."*

### Yearly Recap **[Premium]**
- [ ] "Your 2026 in Moments" — Spotify Wrapped-style, emotionally rich
- [ ] Top songs, dominant moods, most-logged people, era name for the year
- [ ] Shareable card; run as a cultural moment every December
- [ ] Wrapped tells you what you played 32,000 times. Tracks tells you why the 4th listen of one song changed everything.

### Personal Charts **[Premium]**
- [ ] Most-logged songs and artists ranked by year — like Billboard but for your actual life
- [ ] Per-year and all-time views; always-on (not just annual)

---

## SOCIAL — Highest Priority Among "Laters"

These are lower priority than Premium but higher than anything below. They're growth multipliers.

### Anonymous Stats + "You're Not Alone" **[Free]**
- [ ] Inside moment detail: "83 people logged this song during a breakup"
- [ ] Anonymous, no social graph, opt-in only
- [ ] The most shareable thing the app could produce — it's not about the app, it's about the human experience
- [ ] Requires `song_stats` table (seeded in Growth phase) + 50+ log threshold per song
- [ ] Turns a private journal into something that makes you feel connected to something larger

### Discover Surface **[Free basic / Premium generational cuts]**
- [ ] Global top songs this week — most logged across all users [Free]
- [ ] Top songs by mood — "most logged as 'heartbroken' this month" [Free]
- [ ] Trending now — songs spiking in logs (correlates with album drops, world events) [Free]
- [ ] "On repeat" — songs logged by the same users multiple times across eras [Free]
- [ ] Entirely aggregate and anonymous; makes the app feel alive even when you're not logging
- [ ] Requires meaningful user base before this surface is interesting (~1,000+ active users)
- [ ] **Generational cuts [Premium]** — demographic comparisons using `birth_year`:
  - "83% of people your age tagged this song as heartbreak. You tagged it hopeful."
  - "Your generation logs this artist more than any other right now."
  - Turns anonymous stats into personal identity — deeply shareable, worth paying for

### "With Others" Tab / Feed **[Free]**
- [ ] A fourth tab (or a section within Reflections) that aggregates everything that isn't purely personal: moments you've been tagged in + recent activity across shared collections you're a member of
- [ ] Distinct from your personal timeline — this is the social layer, the stuff that connects your memories to other people's
- [ ] **Tagged view** — moments where someone tagged you; you see their reflection + song, with an option to "add to my timeline" (creates a linked copy) or just view
- [ ] **Collections feed** — recent activity in all shared collections you belong to, newest first; shows contributor name, song, and a snippet of their reflection
- [ ] Keeps shared collections alive without requiring you to manually check each one; the feed comes to you
- [ ] No algorithmic ranking — pure chronological; the right model for an intimate product at this scale
- [ ] Empty state: "When friends tag you in a memory, or someone adds to a shared collection you're in, it shows up here." Clear value prop, no pressure to have friends yet.
- [ ] This is the feature that makes shared collections feel like a living thing rather than a static list
- [ ] Prerequisite: tagging requires the friendships system (below); collections feed can ship independently before that

### Friends + Social Tagging **[Free]**
- [ ] `friendships` table — bidirectional request/accept
- [ ] Friend discovery by display name
- [ ] When you tag a friend, creates a `tagged_moments` record; they see it in an inbox
- [ ] "Add to my timeline" or "Hide" — they control what appears in their history
- [ ] Auto-suggest shared collection when two friends have 3+ mutual song moments
- [ ] Side-by-side perspectives view: same song logged by multiple people, both reflections shown
- [ ] See `SOCIAL-ARCHITECTURE.md` for full spec

### Memory Guessing Game **[Free — social, viral potential]**
- [ ] "Here's the memory, what song do you think they chose?" — a guessing game built entirely from real logged moments
- [ ] One player's reflection is shown to friends (song hidden); friends guess the song from a multiple-choice list of 4 candidates (1 correct + 3 plausible same-era/mood songs)
- [ ] Scoring: points for correct guess, bonus for fast answer; the moment's author sees what everyone guessed
- [ ] Works in two modes: **async** (send a challenge to a friend, they answer whenever) and **live** (real-time with multiple people, like a party game)
- [ ] The loop: "I want to know if my friends really know me" → share a challenge → they play → you see results → conversation starts → they log their own memories
- [ ] Acquisition mechanic: non-users can play a challenge via web link (like Gift a Memory) — to see the full answer and play back, download the app
- [ ] Content constraint: only moments the user opts into for the game (not every memory is game material; some are private); a "make this gameable" toggle on the moment
- [ ] *Opinion: this is the most genuinely novel idea in the social section. It turns your actual memories into social currency without making the product feel gamey — the reflection is still real and personal, the game mechanic is just the delivery method. High viral coefficient if the async challenge flow works well on web. Don't build this early — needs a friend graph first — but it should be on the horizon.*

### Artist + Event Collections **[Free to join / Premium to create — way later, needs user base first]**
- [ ] Artist creates a collection for an album release: "Log your first listen to [Album]"
- [ ] Fans contribute → artist gets a genuine emotional artifact from their fanbase (emotional DNA of their album, not streams)
- [ ] Concert/festival collections — log moments from each show in real time
- [ ] Merch table integration — QR code on a card in the merch bag joins the tour collection
- [ ] Acquisition channel: one artist post → thousands of new users
- [ ] *Note: this requires enough user base to make the proposition meaningful for artists. Don't pitch this until 10,000+ users.*

---

## LATER

Worth building, not urgent.

- [ ] Web companion (full account access) — auth, timeline, moment detail, create via iTunes API; for users who want to write longer reflections on a keyboard or browse on desktop [Free]
- [ ] Handoff to Apple Music — from any moment, one tap to play the full song via `music://` deep link [Free, easy]
- [ ] Concert mode — set context once (venue, date, people), tap songs to log them quickly; auto-suggest setlist from setlist.fm API [Free]
- [ ] Full lyrics display — Apple Music MusicKit lyrics API alongside the reflection [Free]
- [ ] Listening history import — surface songs played heavily in past months, "log why?" [Free]
- [ ] Music as emotional regulation — "I'm feeling anxious" → songs from your history that helped [Free basic / Premium full]
- [ ] Through-line songs — songs that appear across multiple distinct eras [Premium, needs era clustering]
- [ ] "You're in a transition" detection — when logging patterns shift, the app notices [Premium, needs 3mo data]
- [ ] Seasonal pattern anticipation — "Last October your mood dipped. It's October." [Premium, needs 1yr data]
- [ ] Smart resurfacing — mood-matched, context-aware (not random) [Premium]
- [ ] Weekly digest email — "Your week in music" [Free]
- [ ] Grief & memorial moments — songs tied to people who have passed, surfaces on significant dates [Free]
- [ ] Mood-to-playlist export — "songs I logged as peaceful" → Apple Music playlist [Free]
- [ ] Time capsules — "Remind me of this in 5 years" [Free]
- [ ] Map view — moments by location, clustered, tap to explore [Premium]
- [ ] AI reflection prompts — "You've saved 3 moments with this artist before. What's different this time?" [Premium]
- [ ] Moment templates — concert, road trip, late night, heartbreak; pre-fill mood + prompts [Free]
- [ ] Import from Notes / Day One — parse entries, match song references, create moments [Free]
- [ ] Apple Shortcuts integration — "log current song," automation triggers [Free]
- [ ] Lock screen widget + Dynamic Island — Now Playing one-tap save, ShazamKit identify button [Free]
- [ ] Weather auto-tagging — silently attach weather at creation; enables "rainy day songs" [Free]
- [ ] Legacy mode — designate someone to receive your collection [Premium]
- [ ] Referral program — gift 3 months Plus, get 1 month free; ship once paying base exists [Free mechanic]
- [ ] Printable moment card — styled high-res PNG export of a single moment (album art, song name, date, reflection snippet); generated client-side via `react-native-view-shot`; user saves to camera roll and prints wherever; no backend needed; shareable/viral; this is the free step before in-app print fulfillment [Free]
- [ ] **Collapse Browse into Timeline + add "For You" tab** — Browse doesn't need its own tab; a button at the top of Timeline opens it as a pushed stack screen. Freed tab slot becomes "For You" — the Music Memory Engine's home: daily prompt, On This Day, suggested song to log, streak. Do this refactor at the same time as shipping the engine so the tab isn't empty. [Navigation refactor + Music Memory Engine milestone]

---

## SOMEDAY

If the product is healthy and the team grows.

- [ ] Android — doubles the addressable market; not soon
- [ ] Apple Watch app — one tap on wrist logs current Apple Music song; minimal UI; draft saved for later
- [x] Full in-app playback (Apple Music / Spotify Premium) — shipped May 2026
- [ ] Multiple songs per moment — requires data model + UX changes
- [ ] Offline support — queue uploads when offline
- [ ] Export / backup — download your data
- [ ] Accessibility — VoiceOver, dynamic type
- [x] Spotify full integration — native playback/auth shipped May 2026
- [ ] Physical book (print-on-demand) — annual "year in music" book; QR codes link each page to the song so it plays when you point your phone at it; see monetization section for full product thinking
- [ ] Printable moment cards — individual moments exported as styled high-res images (song, photo, reflection, date); downloadable for printing at Walgreens/CVS; ideal for dorm walls, gifts, journals; free tier gets the download, Premium gets in-app print fulfillment (see LATER for the free download step)
- [ ] QR codes on individual moments — physical-digital bridge for journals, gifts, photo walls
- [ ] Playlist journals — create a playlist where each song has a reflection; export to Apple Music

---

## Monetization

### Philosophy
Paywall meaning, not logging. The person scanning a QR code at a wedding and logging their first memory should never see a paywall. The person who discovers they've built a coherent emotional chapter of their life — that's when you ask for money.

Get users first. Let usage data and user feedback drive exactly what to charge for. The free tier must be genuinely good or none of this works.

### Free Tier Limits
| Feature | Free limit |
|---------|-----------|
| Moments | Unlimited forever |
| Photos per moment | 3 |
| Video | Not available (Premium) |
| Shared collections you *create* | 3 |
| Shared collections you *join* | Unlimited |
| All capture features | Unlimited |
| Timeline, resurfacing, prompts | Unlimited |

### Subscription Tiers

| Tier | Price | What you get |
|------|-------|-------------|
| **Free** | $0 | Everything above; the full logging experience |
| **Tracks Plus** | $6/mo or $50/yr | Everything below |
| **Tracks Events** | $39.99 one-time per event | Extended collection (500+ contributors), QR code generation, event analytics, book export eligibility |
| **Tracks Book** | $89 softcover / $149 hardcover | Print-on-demand with QR-linked songs; ordered per collection |

**Tracks Plus includes:**
- Unlimited photos per moment
- Video moments
- Unlimited shared collection creation
- "Take Me Back to This Era" — the full era experience (collage, playlist, photos, AI narrative)
- Generational Discover cuts — how your generation connects with songs vs. everyone else
- Insights dashboard (mood trajectory, taste evolution, pattern recognition, mood gap analysis)
- AI narrative summaries and musical autobiography
- Smart resurfacing (context-aware, not random)
- Yearly Recap ("Your 2026 in Moments")
- Personal Charts (most-logged songs/artists by year, all-time)
- Through-line songs (songs that span multiple eras)

**Conversion trigger:** at 25–30 moments, a locked "Take Me Back" era card appears in Reflections. User can see the generated era name and blurred collage. They can't unlock it without Plus. That's the moment.

### Additional Revenue Streams

**Gift subscriptions — with pre-seeding** — buy someone a year of Plus, but with a twist: the giver can add 3–5 songs when purchasing the gift ("songs I think of when I think of you / them"). Recipient opens the app to a pre-populated set of songs waiting for them with a note: "Josh added these for you. What do they remind you of?" Forces the first moment in a way a blank app never would. Especially powerful for gifting to a parent or grandparent — you can pre-configure their generational era and seed their favorite songs so day 1 is immediately personal, not cold. Primary gifting occasions: Mother's Day, Father's Day, milestone birthdays (50th, 60th), anniversaries. *"Give your mom somewhere to put all those songs she keeps mentioning."* RevenueCat supports gift subs natively; the pre-seeding is a lightweight custom flow on top.

**Artist & label partnerships** — artists create official collections for album releases; they pay for analytics ("here's how fans emotionally responded to each track") and the cultural artifact. Indie artists free to drive adoption; major label campaigns paid placement.

**B2B music therapy** — therapists assign music journaling between sessions. Therapist-tier ($15–25/month): assign prompts, view client engagement (with consent). AMTA has 4,000+ members. Low acquisition cost, high LTV, zero consumer marketing needed.

**Physical book margin** — $149 hardcover at ~$45–55 print cost = ~$95 gross margin per book. Artifact Uprising charges $200 for a beautiful-but-silent book. Tracks books play music — point your phone at any page, the song from that moment plays. That's a genuinely different product category, not just a photo book with better paper. Positioned below Artifact Uprising on price, above Chatbooks on intention. The QR audio + emotional reflections + playlist page at the back is the differentiator. One wedding photographer who recommends it to every client makes this revenue meaningful.

*Book + subscription model (decided):* Annual plan subscribers get **one free softcover book per year** (up to 50 moments, ~$20 print cost). Monthly subscribers get 20% off. Redemption rates on physical benefits like this run 20–30% in practice — most subscribers intend to make the book but don't. At 25% redemption on 1,000 annual subscribers: $99k revenue, ~$5k in print costs, net $94k. Even at 60% redemption it's healthy. The "free book" is a headline benefit that converts annual over monthly — simpler and more compelling than "20% off something you haven't made yet." The annual plan's framing: "your year in music, on your shelf." Print partner candidates: Blurb (developer API), Prodigi (global fulfillment), Chatbooks (partnership programs). Prerequisite: public moment page URLs for QR codes to resolve.

**Growth levers — acquisition channels worth thinking about now even if not built yet:**

*Organic / content*
- **Spotify Wrapped counter-programming** — every December, people are in active music reflection mode. A campaign timed to Wrapped costs nothing: *"Wrapped tells you what you played 32,000 times. Tracks tells you why the 4th listen of one song changed everything."* Moment cards are already shareable; the cultural moment exists once a year, use it.
- **The "100 songs" challenge** — structured prompt: log 100 songs that defined your life. Share the collection publicly. Creates massive shareable content, each piece links back to the app. Seeded by a handful of users with audiences, spreads from there.
- **Shareable moment cards as organic ads** — every card shared on Instagram/TikTok is a free impression with emotional context attached. The card format is already built. The job is to make the card beautiful enough that sharing feels like self-expression, not promotion.
- **"What song takes you back" trend format** — the Instagram comment with 2,962 likes is the thesis. This emotional reaction is already happening in comments on music posts. Tracks is where it lives permanently. Seed a TikTok/Reels format, let it find its own energy.

*Earned media*
- **Press / editorial** — *"Emotional music journal"* is a distinctive angle in music tech, which is otherwise dominated by streaming. Music publications (Pitchfork, The Ringer, NME), journaling publications, lifestyle. One good feature article changes the install trajectory at this stage more than any paid channel. Write the pitch around the Instagram comment quote — it's the hook.
- **Music therapy angle** — music therapy is a real clinical discipline (AMTA: 4,000+ certified therapists). A therapist recommending Tracks as between-session homework = multiple installs per therapist referral, high-LTV users. Email outreach to a small number of therapists costs nothing. If it works, it's a channel. Write a one-page explainer on what the app does for emotional reflection.

*Gifting occasions as acquisition events*
- **Milestone birthdays** — turning 40, 50, 60, 70 is a natural "reflect on your life's soundtrack" moment. The gift pitch writes itself: *"Forty years of songs. Here's somewhere to put them."* Different from a generic gift sub — it's positioned as a life-archive tool, not an app subscription.
- **Mother's Day / Father's Day** — the highest-signal gifting occasion for this product. "Give your mom somewhere to put all those songs she keeps mentioning." The intergenerational angle (pre-seed their era + songs) is uniquely Tracks; no other journaling app can do this.
- **Anniversaries** — *"It's your 10th anniversary. What was your first dance song? What were you listening to the week you met?"* Time-boxed gifting trigger with a specific emotional prompt. Could be a landing page.

*Community channels*
- **Playlist communities** — people who build playlists on Spotify, rate music on RateYourMusic, participate in music subreddits already annotate music. They're the ideal early user. Tracks is the next step from a playlist with descriptions. Seeding in these communities (genuinely, not spammy) finds the users who will log the most.
- **Musicians as users** — musicians who publicly journal about songs that influenced them have audiences of people with the same taste and emotional relationship to music. One musician who uses Tracks publicly = their fans as the highest-quality possible leads.

**Aggregated data licensing** — anonymized, explicitly consented emotional music data is valuable to labels, streaming services, and music researchers. Plant this flag now in the privacy policy. Years out, but the data moat is real and accumulates from day one.

**Premium share card templates** — additional visual styles beyond the default card. Small unlock, adds perceived value to Plus.
