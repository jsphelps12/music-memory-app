# Tracks — Social Architecture

This doc captures the agreed plan for the web app, shared collections, and friends/social
tagging features. Update it as decisions change. Reference it before starting each phase.

---

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| A | Next.js web app + collection preview page | ✅ Complete |
| B | Shared collections join flow (TestFlight era) | ✅ Complete |
| B.5 | Deferred deep links for App Store launch | ⏳ Before public launch |
| C | Friends: discovery, request/accept | ⏳ Deferred — post App Store |
| D | Social tagging: tagged_moments, inbox | ⏳ Deferred — post App Store |
| E | Web app enrichment (profile pages, shareable cards) | ⏳ Future |

---

## The Three Pieces

### 1. Web App (Next.js / Vercel) — COMPLETE

- **Deployed at**: `https://music-memory-app.vercel.app`
- **Primary route**: `/c/{invite_code}` — shared collection preview
- **Features**: expandable moment cards, audio preview playback, photo strip, sticky CTA
- **Current CTA**: "Add your moment → Download Tracks" (placeholder App Store link)
- Reads from Supabase via service role key (server components only, bypasses RLS)

### 2. Shared Collections

#### Phase B — Link-Based Join (TestFlight era)

**Key decision: link-based, not friend-based.**
Anyone with the invite link can join — no friend system, no `collection_members` roles
table. Like Google Docs sharing. Simple enough to ship now, covers the near-term use case.
Revisit after App Store launch when there are enough users for a social graph to matter.

**Deep link scheme**: `tracks://join/{invite_code}`

**What's already done:**
- `collections` table has `invite_code`, `is_public`, `cover_photo_url`, `date_from`, `date_to`
- App can toggle a collection public + share the invite URL via iOS share sheet
- Web preview page renders the collection

**What's left for Phase B:**
- Handle `tracks://join/{invite_code}` deep link in root `_layout.tsx`
- Join screen — show collection name, owner display name, moment count, "Join" button
- On join: insert a row into `collection_moments` for each of the joiner's moments? No —
  just record membership. The joiner adds moments themselves via the existing flow.
- Actually: join = add joiner to a `collection_members` table (minimal: collection_id, user_id, joined_at — no roles yet)
- Update web CTA: "Open in Tracks" → `tracks://join/{invite_code}`
- Contributor attribution in the collection view (show who added each moment)

**DB for Phase B (minimal):**
```sql
CREATE TABLE public.collection_members (
  collection_id uuid NOT NULL REFERENCES public.collections ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (collection_id, user_id)
);
```
No `role` column yet — the owner is always `collections.user_id`. Everyone else is a contributor.

#### Phase B.5 — App Store Launch Gate

Before going public, add deferred deep link support so invite codes survive App Store installs:
- Use Branch.io (or similar) to create smart links
- Smart web CTA: tries `tracks://join/{invite_code}` first; if app not installed, redirects
  to App Store with the invite code stored for after install
- On first launch post-install, app reads the stored code and navigates to join screen

### 3. Friends + Social Tagging — DEFERRED

Deferred until post-App Store launch with real usage data. The link-based model covers
the near-term social use case without the complexity of a social graph.

**When the time comes:**

**Friends model: bidirectional (request / accept)**
- `friendships` table: `id`, `requester_id`, `addressee_id`,
  `status` (pending / accepted / declined / blocked), `created_at`
- Friend discovery: by display name search (decided; not phone contacts — privacy)
- No unilateral following — mutual consent required before anything social

**How tagging becomes social:**
- `people` stays as `text[]` for non-app contacts
- When a tagged name matches a confirmed friend, also creates a `tagged_moments` record:
  `moment_id`, `tagged_user_id`, `status` (pending / accepted / hidden)
- Tagged friend gets a notification; tagged moments land in an **Inbox**, NOT auto on timeline
- Inbox: user sees song + reflection snippet, chooses "Add to my timeline" or "Hide"

**Auto-suggested shared collection:**
- When two friends have 3+ mutual tagged moments → surface "Create 'Songs with [Name]'?"

---

## Build Sequence

```
Phase A    ✅  Next.js web app (setup, shared collection preview page)
Phase B    🔨  Join flow: deep link + join screen + contributor attribution
Phase B.5  ⏳  Deferred deep links (App Store launch gate)
Phase C    ⏳  Friends: discovery, request/accept, friendships table
Phase D    ⏳  Social tagging: tagged_moments, inbox, accept/hide UX
Phase E    ⏳  Web app enrichment (profile pages, shareable cards)
```

---

## Decided Questions

| Question | Decision |
|----------|----------|
| Vercel URL | `https://music-memory-app.vercel.app` (no custom domain yet) |
| Join model | Link-based (anyone with link); no friend system needed yet |
| Deep link scheme | `tracks://join/{invite_code}` |
| Roles in collections | Owner = `collections.user_id`; no roles table until needed |
| Friends: when? | Post App Store launch, based on real usage data |
| Friend discovery | By display name search (not phone contacts) |
| Tagged moments inbox | Separate inbox — NOT auto-added to timeline |
| Web reads Supabase via | Service role key, server components only |

## Open Questions (decide before building each phase)

- **Phase B**: Should joining a collection require creating an account, or can web users
  view as read-only without signing up? (current answer: app-only join, web is read-only)
- **Phase B.5**: Branch.io vs. custom solution for deferred deep links?
- **Phase E**: Are profile pages public (anyone with link) or friends-only?
- **Monetization gate**: Free to join/contribute; premium to create shared collections? (tentative)
