# Tracks — Social Architecture

This doc captures the agreed plan for the web app, shared collections, and friends/social
tagging features. Update it as decisions change. Reference it before starting each phase.

---

## The Three Pieces

### 1. Web App (Next.js / Vercel)
A read-only destination for people who don't have the app yet.

- **Primary route**: `/c/{invite_code}` — shared collection preview
- **Future routes**: public profile pages, shareable moment cards, marketing/landing
- Reads directly from Supabase (public collections via permissive RLS select policy)
- Primary CTA on every page: "Add your moment" → App Store link
- No domain needed yet — Vercel preview URL is fine to start

### 2. Shared Collections
The collaborative layer on top of existing personal collections.

**DB changes needed:**
- `collections` table: add `invite_code` (unique, random slug), `is_shared` (bool),
  `is_public` (bool), `cover_photo_url`, `date_from`, `date_to`
- New `collection_members` table: `collection_id`, `user_id`, `role` (owner / contributor / viewer),
  `joined_at`
- `collection_moments` already exists; no changes needed

**App changes:**
- Create shared collection flow (toggle: personal vs. shared)
- Invite link generation + QR code display
- Join via deep link: `tracks://c/{invite_code}`
- Collection timeline showing all contributors' moments (attributed)
- Side-by-side view when multiple contributors log the same song
- After-event summary card (shareable artifact)

**Monetization gate:**
- Free: join any shared collection; contribute moments; view timeline
- Premium: create shared collections; QR code; side-by-side perspectives; summary card

### 3. Friends + Social Tagging
The long-term social graph. Builds on shared collections infrastructure.

**Friends model: bidirectional (request / accept)**
- You send a friend request; they accept before anything social happens
- No unilateral tagging on someone's timeline — mutual consent required
- `friendships` table: `id`, `requester_id`, `addressee_id`,
  `status` (pending / accepted / declined / blocked), `created_at`

**How tagging becomes social:**
- Currently `people` is `text[]` — stays as-is for non-app contacts
- When a user tags someone who is their confirmed friend on the app, it
  also creates a `tagged_moments` record: `moment_id`, `tagged_user_id`, `status` (pending / accepted / hidden)
- The tagged friend receives a notification: "[Name] tagged you in a moment"

**Tagged moments inbox (key UX decision):**
- Tagged moments land in an **Inbox** — NOT automatically on the tagged user's timeline
- The tagged user sees the moment (song + reflection snippet), then chooses:
  - **Add to my timeline** → appears in their Moments tab like any moment they own
  - **Hide** → dismissed; never shown again
- This keeps each user's timeline fully under their own control
- Inbox lives in a new tab or as a badge on the Reflections tab (TBD)

**Auto-suggested shared collection:**
- When two friends have 3+ mutual moments (tagged each other), the app surfaces a
  suggestion: "Create 'Songs with [Name]'?" — a shared collection pre-seeded with
  those moments
- Couples / close friends use case: both contribute; both see each other's reflections
  on the same songs

---

## Build Sequence

```
Phase A  →  Next.js web app (setup, shared collection preview page)
Phase B  →  Shared collections DB schema + app UI (create, invite, join, contribute)
Phase C  →  Friends: discovery, request/accept flow, friendships table
Phase D  →  Social tagging: tagged_moments, inbox, accept/hide UX
Phase E  →  Web app enrichment (profile pages, tagged moments, shareable cards)
```

**Why this order:**
- Web app is blocked on shared collections existing — build the shell first, wire data in Phase B
- Friends/tagging is independent of the web app but the web app gets richer once they exist
- Each phase ships independently; none requires the next to be useful

---

## Open Questions (decide before building each phase)

- **Phase A**: Vercel project name / eventual domain? (no domain needed yet)
- **Phase B**: Does joining a shared collection require having the app, or can web users
  join read-only without an account?
- **Phase C**: Friend discovery — by display name search, username, or phone contacts?
- **Phase D**: Where does the inbox live — new tab, badge on Reflections, or notification center?
- **Phase E**: Are profile pages public (anyone with the link) or friends-only?
