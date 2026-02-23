# Tracks — Non-Development To-Do

Things to work on outside of coding sessions.

---

## Beta Testing & Feedback

- [ ] Get TestFlight build approved (follow up if still pending)
- [ ] Recruit 5-10 beta testers — target people who share songs, make playlists, or tie music to memories
- [ ] Watch at least 2-3 people use the app in person — note where they hesitate or get confused
- [ ] Ask each tester: "What would make you open this every day?"
- [ ] Collect and organize feedback into themes (friction points, missing features, what they love)

## UI/UX Sketching & Mocking

- [ ] Sketch the quick capture flow — what's the minimum viable moment? How fast can you go from now playing to saved?
- [ ] Mock the iOS widget — what does it show? Now playing + "save" button? Last moment? On This Day?
- [ ] Design the "On This Day" resurfacing experience — how does it appear? Push notification? In-app card? Both?
- [ ] Sketch the candidate picker for Spotify cross-search — is the current modal good enough or does it need polish?
- [ ] Think through the share extension UX end-to-end — what happens when someone shares a non-music link?

## Positioning & Messaging

Core answers (from VISION.md — read that first):
- **Category**: "Organizing nostalgia" — not journaling, not music, not wellness. Its own thing.
- **Tagline**: "Every song holds a moment. Keep them somewhere that remembers."
- **One-sentence pitch**: "Tracks is a nostalgia engine — it captures the emotional associations you already have with music and turns them into a structured, living record of who you've been."
- **Not capture, not reflect**: the app is about *resurfacing* — logging is the investment, resurfacing is the dividend.
- **Brand voice**: Soft in tone, sharp in insight. Like a thoughtful friend who read everything you wrote.

Remaining work:
- [ ] Write the App Store description using the tagline and category above (see VISION.md for brand voice reference)
- [ ] 3 apps to position against: Day One (stores entries — Tracks structures emotional memory into eras), Spotify Wrapped (one-day event — Tracks is year-round), standard journaling apps (text-forward — Tracks is music-anchored)

## App Store Prep

- [ ] Take polished screenshots in both light and dark mode with real data
- [ ] Design App Store preview screenshots (consider using a tool like Rotato or Screenshots Pro)
- [ ] Pick App Store category (likely Music or Lifestyle)
- [ ] Write a privacy policy (required for submission)
- [ ] Draft the "What's New" text for your first public release

## Business Model

Core decisions made (see VISION.md):
- **Price**: $4.99/month or $39.99/year. Break-even at ~120 annual subscribers.
- **Free forever**: unlimited logging, search, On This Day resurfacing, core features. Habit formation needs zero friction.
- **Premium**: era clustering, pattern insights, shareable era/moment cards, AI narrative summaries, unlimited photos, yearly recap.
- **Conversion trigger**: at 25–30 entries, show a locked Era card. Not "upgrade for storage" — "unlock the chapter you just lived."

Remaining work:
- [ ] Set up RevenueCat and define entitlements before building premium features
- [ ] Decide which premium features ship at launch vs. added later (era clustering should be first)

## Growth & Distribution

- [ ] Identify communities where potential users hang out (music subreddits, playlist communities, journaling groups)
- [ ] Plan a soft launch strategy — who are the first 100 users and how do you reach them?
- [ ] Consider a landing page or simple site for the app (even a Carrd or single-page site)

## Retention Thinking

Blueprint (from VISION.md emotional arc — nostalgic → grateful → grounded → seen → shocked):
- **Day 1–7**: frictionless logging builds the habit. On This Day starts working immediately if they have old moments.
- **Day 7–30**: resurfacing moments they logged earlier creates the "it remembered!" moment. Push notifications (On This Day, streaks) keep them returning.
- **Day 30+**: enough data for pattern insights and era clustering to feel meaningful. This is when premium converts.
- **Year 1+**: yearly recap ("Your 2026 in Moments") creates an emotional event that brings them back and drives sharing.

- [x] Prioritize "On This Day" resurfacing — push notifications implemented
- [ ] First-week retention: ensure a new user sees a resurfacing prompt within 7 days (even if it's just the "start your timeline" prompt)
- [ ] Notification tuning — 2–3x/week max for On This Day; don't spam
- [ ] Consider a "welcome" push on day 3: "You've logged X moments. Keep going — the magic starts at 25."
