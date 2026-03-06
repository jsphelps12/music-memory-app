# Issue Tracker

## Open Issues

| # | Title | Priority | Status | Notes |
|---|-------|----------|--------|-------|
| 1 | Delete account not working | High | Open | |
| 2 | Redesign reflection page | Medium | Open | |
| 3 | Prefetch userId mismatch — data leak on account switch | High | Open | `lib/timelinePrefetch.ts` — module-level promise has no userId; fast sign-out/sign-in could show User A's moments to User B. Fix: store `{ promise, userId }` together, validate userId on consume. |
| 4 | Auth listener writes state after unmount | High | Fixed | `contexts/AuthContext.tsx` — added `isMountedRef`; guard in `getSession().then()` and `finally` block. |
| 5 | Auth state change race condition | High | Fixed | `contexts/AuthContext.tsx` — `onAuthStateChange` made async + awaits `fetchProfile`; `currentFetchUserIdRef` discards in-flight results if user changes mid-fetch. |
| 6 | Silent push token registration failure | High | Fixed | `app/_layout.tsx` — `.catch` now calls `Sentry.captureException` + `console.warn` in dev. |
| 7 | Silent shuffle error | Medium | Open | `app/(tabs)/reflections.tsx` — empty catch on shuffle; user taps button, nothing happens, no feedback. Fix: show inline error. |
| 8 | NowPlaying passes base64 artwork across native bridge | Medium | Open | `modules/now-playing/ios/NowPlayingModule.swift` — 600×600 PNG ~1MB as base64 string on every track change causes bridge jank. Fix: remove artwork from bridge payload; use MusicKit artwork URL in JS. |
| 9 | Notification permission never re-requested after denial | Medium | Open | `lib/notifications.ts` — once denied, app never checks again even if user enables in iOS Settings. Fix: re-check on app foreground via AppState listener. |
| 10 | EXIF parser missing bounds check | Medium | Open | `app/create.tsx` — custom JPEG EXIF parser has unchecked array accesses in IFD loop; malformed EXIF could cause undefined behavior. Fix: validate all offset calculations. |
| 11 | Deep link handler stale closure | Low | Open | `hooks/useDeepLinkHandler.ts` line 56 — `handleInviteCode` missing from `useEffect` dependency array; could close over stale `user` value. Fix: add `handleInviteCode` to deps. |
| 12 | Notification edge function N×2 queries on resurfacing | Medium | Open | `supabase/functions/send-notifications/index.ts` lines 168–192 — 2 Supabase queries per user in a loop on Mondays. Fine at current scale, needs batching at ~1K users. |
