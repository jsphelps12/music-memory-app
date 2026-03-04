<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Soundtracks Expo app. The `posthog-react-native` SDK was installed, a PostHog client was configured in `lib/posthog.ts` using environment variables, and `PostHogProvider` was added to the root layout with manual screen tracking via `usePathname`. Users are identified on session restore, sign-in, and onboarding completion, and `posthog.reset()` is called on sign-out. Thirteen business events are now tracked across nine files.

| Event | Description | File |
|---|---|---|
| `signed_up` | User created a new account with email/password | `app/(auth)/sign-up.tsx` |
| `signed_in` | User signed in (email or Apple); `method` property distinguishes | `app/(auth)/sign-in.tsx` |
| `onboarding_completed` | User finished all onboarding steps; includes genre/artist/song counts | `app/onboarding.tsx` |
| `moment_created` | User saved a music memory; includes song, mood, photo count, reflection, location, collection flags | `app/create.tsx` |
| `shazam_used` | User tapped the ShazamKit identify button | `app/create.tsx` |
| `moment_deleted` | User deleted a moment from the detail screen | `app/moment/[id].tsx` |
| `moment_shared` | User opened the share card modal to share a moment | `app/moment/[id].tsx` |
| `song_searched` | User performed a song search; includes query length and result count | `app/song-search.tsx` |
| `song_selected` | User selected a song from search results; includes title and artist | `app/song-search.tsx` |
| `collection_joined` | User joined a shared collection via invite link | `app/join.tsx` |
| `notifications_enabled` | User granted push notification permission on celebration screen | `app/celebration.tsx` |
| `notification_preferences_changed` | User toggled a notification type on/off; includes type and new value | `app/(tabs)/profile.tsx` |

**Additional files modified:**
- `lib/posthog.ts` — Created PostHog client singleton
- `app/_layout.tsx` — Added `PostHogProvider`, screen tracking, and imported posthog
- `contexts/AuthContext.tsx` — Added `posthog.identify()` on session restore and auth state changes, `posthog.reset()` on sign-out

## Next steps

We've built a dashboard and five insights to keep an eye on user behavior:

- **Dashboard**: [Analytics basics](https://us.posthog.com/project/331689/dashboard/1331385)
- **Insight**: [Signup → Onboarding → First Moment Funnel](https://us.posthog.com/project/331689/insights/8Prau3TP)
- **Insight**: [Moments Created per Day](https://us.posthog.com/project/331689/insights/tnTVx3vd)
- **Insight**: [Active Users (DAU)](https://us.posthog.com/project/331689/insights/2cCaPgPE)
- **Insight**: [Sign-in Method Breakdown](https://us.posthog.com/project/331689/insights/6JxIMlbe)
- **Insight**: [Social Features Usage](https://us.posthog.com/project/331689/insights/pKLGlTA3)

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
