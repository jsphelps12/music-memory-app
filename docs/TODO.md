# Soundtracks — Non-Development To-Do

Current, actionable items only. Last updated 2026-11-17 (dev tooling, export and App Store items reconciled with what shipped; the product plan lives in `docs/ROADMAP.md`).

---

## 🔴 Immediate (This Week)

- [ ] Verify delete account works end-to-end on a production build — trigger from Profile, confirm auth user + all moments + all photos from storage + profile row all deleted cleanly
- [ ] Set up `support@soundtracks.app` email alias → forwards to personal inbox
- [ ] Create public Notion support page: Getting Started, FAQ, Known Issues, Contact
- [ ] Set up Tally.so free form (Name, Email, Issue) → link from Notion page and from app Profile screen
- [ ] Define retention benchmarks in PostHog — create D1/D7/D30 cohort dashboards; targets: D1 >40%, D7 >20%, D30 >10% (journaling-type app baseline)
- [ ] Monitor Apple Review status — respond immediately if they request changes

---

## 🟡 First 100 Users Plan

Goal: 100 *retained* users who log 10+ moments each. Downloads don't matter. Retention does.

### Who they are
- Music-obsessed people who already annotate: playlist makers, Last.fm users, RateYourMusic contributors, music journalers
- People with a big life event coming: engaged couples, new parents, people processing a loss
- Friends and family you can onboard personally and observe using it

### Where to find them
- [ ] Post authentically (not promotionally) in: r/lastfm, r/spotify, r/ifyoulikeblank, r/Music, journaling subreddits
- [ ] Find 2–3 engaged couples via mutual connections — offer personal setup, they become word-of-mouth
- [ ] DM people who post "this song takes me back to..." content on Twitter/X or Instagram — they're pre-qualified
- [ ] Reach out to music micro-influencers (1k–10k followers) with a personal note, not a pitch deck
- [ ] Post your own moment on TikTok/Reels — show the real capture flow with a genuine memory, not a product demo

### Talk to every single one of them
- [ ] DM each new user within 24 hours of sign-up (check PostHog new users daily)
- [ ] Ask: "What song did you log first? What does it remind you of?"
- [ ] Ask: "What would make you open this every week?"
- [ ] Set up a simple offboarding Tally survey for users who go quiet — churned users teach you more than retained ones

---

## 🟡 Customer Support Infrastructure

- [ ] Notion support page live at a public URL (link from app Profile screen)
- [ ] Respond to every App Store review — positive and negative, within 48 hours
- [ ] Check Sentry weekly for new crash patterns

---

## 🟡 Compliance

- [ ] GDPR basics audit — verify privacy policy covers: right to deletion (delete account covers this), data portability, what data is shared with third parties, DPA contact email
- [x] Confirm delete account removes everything: auth user, moments, photos from storage, profile row, push token — **Done.** Sign-out clears `push_token` to null (AuthContext.tsx:244). Delete account deletes the auth user server-side which cascades to the profile row. DB trigger (`evict_push_token`, migration 20260502) also evicts the token from any other profile sharing the same device token.
- [ ] COPPA review — 12+ age rating is set; confirm privacy policy explicitly addresses under-13 exclusion
- [x] Data export — Settings → Journal → Export your journal builds a PDF of every moment (1.4, `lib/journalExport.ts`). A machine-readable JSON export is still open if GDPR portability needs it

---

## 🟡 Developer Tooling & Testing

Mostly done; details live in `docs/DEPLOY.md`.

- [x] Staging Supabase project with every migration applied (`scripts/db-migrate.mjs`, `scripts/schema-diff.mjs`). Currently **paused** on the free plan, so E2E runs against production with `e2e@soundtracks.test` (`scripts/reset-e2e-prod.mjs`)
- [x] Seeded test accounts for E2E (`scripts/seed-e2e.mjs`); credentials stay out of the repo
- [x] Unit tests: Vitest (`npm test`), pure-logic suites in `lib/__tests__/`, run in PR checks alongside `scripts/design-lint.mjs`
- [x] E2E: Maestro smoke flows in CI (`.maestro/`)
- [ ] Two-simulator workflow for social flows: boot two simulators, sign each into a different test account, and drive deep links with `xcrun simctl openurl booted "soundtracks-beta://…"`

---

## 🟡 Infrastructure (Free Wins)

- [ ] Set up Cloudflare free tier as CDN in front of Supabase storage — proxy the `moment-photos` bucket URL through Cloudflare Workers; cuts egress significantly, extends $25/mo plan to ~3–4k MAU before overages hit. Guide: Cloudflare → Workers → reverse proxy to your Supabase storage URL.
- [ ] Set Supabase billing alert at $20/month so you're not surprised
- [ ] PostHog: build D1/D7/D30 retention cohort dashboards now (before you have enough users to be meaningful) — so the data is structured and ready when you need it

---

## 🟢 App Store (Next Update)

- [x] Rewrite App Store description (1.3.0, 2026-10-19) — lead with emotional hook ("A song comes on and suddenly you're back."), not feature list; current description is too feature-forward
- [x] Keyword optimization (1.3.0) — research: "music diary", "song journal", "music memories" are underserved; use all 100 keyword characters
- [x] Update screenshots (1.3.0: six 6.9" shots; redo for 1.4) to show emotional core: moment detail with blurred artwork, Reflections tab, friends feature
- [ ] App preview video — 30s of the real capture flow with genuine memory content converts better than screenshots alone
- [ ] Update promotional text seasonally (stale since launch)

---

## 🟢 Business Model

- [ ] RevenueCat: hold until a premium feature is actually ready to ship. No point building paywall infrastructure before there's something behind the wall. Revisit when Era Clustering or Yearly Recap is close to done.
- [ ] Events tier paywall: `events_tier_unlocked` defaults to `true` (open) — flip to `false` when wedding feature is polished. Before building the paywall, validate: ask 5 real users "would you pay $39.99 for this?" first.
- [ ] Track one key events metric from day one: how many event hosts become long-term personal users? That's the conversion flywheel.

---

## 🔁 Ongoing Rhythm

- **Daily**: check PostHog for new signups; DM anyone who joined in the last 24 hours
- **Weekly**: review Sentry for new crashes; check notification tap rates in PostHog; review storage + bandwidth in Supabase dashboard
- **Monthly**: review and respond to any new App Store reviews; check Supabase plan usage vs. limits
- **Before each release**: run deployment checklist in DEPLOY.md
