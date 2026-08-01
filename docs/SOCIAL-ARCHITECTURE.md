# Soundtracks — Social Architecture v2

This document captures the agreed design for all social, sharing, and collaborative features.
Update it as decisions change. Reference it before building anything social.

Last updated: 2026-07-31 (v2 — full redesign, replaces the May 2026 doc)

**Why v2:** the 2026-07-31 audit found v1 had grown to 10 primitives across 6 DB tables
(5 of them empty in prod) serving ~3 real jobs, with one live privacy defect: share links
minted tokens without touching `visibility`, the anon RLS policy ignores `visibility`
entirely, and no revoke path exists — so 17 moments were world-readable while their
owners' UI said "Just me." v2 collapses everything onto four primitives and makes
"private by default" structural instead of a label.

---

## Design Principles (unchanged from v1 — v2 finally honors them)

**1. Personal journal first.**
Every social feature should increase the personal value of your own journal — not create
pressure to perform for an audience.

**2. Directed, not broadcast.**
Nothing shows up for a user unless it was explicitly put there for them. No feed.

**3. Mutual consent for relationships.**
Connections are bidirectional. You can't appear in someone's social graph without their
agreement.

**4. Off-app sharing is delivery, not social.**
Sharing with someone not on the app is like sending a letter. No hidden social mechanics.

**5. (new) Privacy is the absence of grants, not a dial.**
A moment is private because no grant rows exist for it. Every way a moment becomes
visible to someone is an explicit, inspectable, revocable row. There is no visibility
enum to fall out of sync with reality.

---

## The Four Primitives

Everything social is exactly one of these. Anything that isn't one of these gets deleted.

### 1. People (`friendships`)

Mutual connections, added **by link/QR only**: you share your friend link (or show your
QR); they open it; the pair is instantly mutual. **No requests, no pending state, no
accept/decline, no badges polling for them.** One row per pair. "Remove" deletes the row.

Used for: the share-target picker, notification recipients, the Friends list on Profile.
Discovery is your link — no username search, no phone contacts (v1 decision, kept).

### 2. Moment shares (`moment_shares`)

```sql
CREATE TABLE moment_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  UNIQUE (moment_id, recipient_id)
);
```

(`sender_id` is denormalized from `moments.user_id`, added at build time in Phase C:
the moments SELECT policy references `moment_shares`, so `moment_shares` policies must
be self-contained — a policy on this table that looked up `moments` for ownership
would be mutual recursion, which Postgres rejects at query time. It also gives
"Shared with me" its sender attribution without a join through moments.)

Created from the share sheet's "Send to a person" picker (recipients = your People).
Recipient gets one push ("Josh shared September with you") and the moment appears in
their **Shared with me**. Sender can unsend (delete the row). Replaces the entire
`tagged_moments` apparatus — no release states, no tag tokens, no statuses, no silent
visibility upgrades.

### 3. Albums (`collections` + `collection_members` + `collection_moments`)

Unchanged core. Personal or shared; joined via invite link `/c/{invite_code}`; guest
contributions (web form, no account) remain the open-invite variant of a shared album.
The direct username-invite path (`collection_invites`) is deleted — the link is the
only door.

### 4. Share links (`moments.share_token`)

Minted **and revocable** from the share sheet. Consumed at `/m/{share_token}` on the web.
Opening a link while signed in shows the moment in-app — with **no automatic social side
effect**. The share sheet always shows honest link state: *Not shared* / *Link active
(Copy · Revoke)*. Revoke = `share_token = NULL`.

**Gift flow (kept from v1, made consent-based):** the `/m/` page still writes
`soundtracks-gift:{token}` to the clipboard for the signed-out → signup path, and the
moment greets the new user after onboarding. But it lands in their **Shared with me**
only if they tap **"Keep this"** on the moment — a recipient-initiated action that
creates the `moment_shares` row. Nothing is created silently.

---

## The Access Rule (this IS the RLS policy)

> You can see a moment iff: you own it, OR a `moment_shares` row grants it to you, OR
> it's in an album you're a member of, OR you hold its share link (anon path:
> `share_token IS NOT NULL`).

`moments.visibility` and the VisibilityPicker are **deleted**. The 17-moment class of bug
becomes unrepresentable: "shared" is exactly "grant rows exist," and the share sheet
displays those rows.

---

## Surfaces

**Share sheet (the one social surface)** — three verbs plus state, replacing the current
three-mental-models sheet:
- **Send to a person** → People picker → `moment_shares` insert + push
- **Add to album** → album picker (existing)
- **Share a link** → mint/copy; card export lives here too
- Link-state row: *Not shared* / *Link active (Copy · Revoke)*
- "Shared with" summary: chips for every person/album/link grant, each removable

**Timeline pills** — `My Moments | Shared with me`. "Shared with me" (renamed from
"Tagged") is driven by `moment_shares`, badge from unviewed rows, and queries only on
signal — not an always-mounted second list firing empty queries every app open.

**Albums tab** — owned + joined albums in one grid (as today). The invites section
disappears with `collection_invites`.

**Profile** — People row (list, add-by-link/QR). Request/pending UI deleted.

**Web (ships in the same wave as every app change — standing rule):**
- `/m/{token}` — redesigned moment page (see card language below)
- `/c/{code}` — album page + contribute + QR (guest flow unchanged)
- `/friend/{token}` — friend-add landing page, one accept surface (the duplicate
  `friend-request.tsx` in-app screen is deleted; universal link + clipboard both land on
  `friend/[token]`)

---

## Share Card (decided 2026-07-31)

- **Photo stays the hero when the moment has photos** (owner preference). No dark
  gradient smothering the image — the photo renders clean, edge to edge.
- Card chrome carries the app's design language: warm cream surface, DM Serif title,
  italic serif reflection excerpt (1–2 lines), artwork thumbnail + song/artist, mood
  emoji, date/location small, SOUNDTRACKS wordmark.
- No-photo moments: album art becomes the hero.
- 9:16 story variant = second render of the same component (FEATURE-IDEAS "era & moment
  cards"; templates clean/filmic/retro can come later).
- **Branded QR** (PHYSICAL-PRODUCTS.md standard: gradient dots, rounded corners, logo
  center) added to the card **later** — it links to `/m/{token}`, so it requires a live
  link and should be a toggle, not always-on.

---

## Notifications

One edge function path for social pushes (replaces `notify-friend` and its four types):
- `share_received` — "X shared {song} with you" → routes to the moment
- `friend_added` — "X added you" (link opened) → routes to People
Album activity notifications stay as-is in `send-notifications`.

---

## What v2 deletes (from the 2026-07-31 audit)

| Item | Why |
|---|---|
| `tagged_moments` + RPCs (`get_tagged_moment_data`, `claim_gifted_moment`, `check_moment_owner`) | replaced by `moment_shares` |
| `moments.visibility` + `VisibilityPicker` | replaced by the access rule |
| `moment_reactions` / Resonance | 0 rows, unreachable UI — **parked**, may return as hearts on shared moments |
| `collection_invites` + username search invite flow | duplicate of the invite link |
| Friend request/accept machinery (requests, pending, badges) | replaced by mutual-by-link |
| `app/moment/[id].tsx` dead onboarding share sheet (~150 lines, params never passed) | unreachable |
| `friend-request.tsx` (duplicate accept screen) | `friend/[token]` is the one surface |
| `lib/sharedScreen.ts` tombstone | its own comment's cutoff condition has passed |
| `notify-friend` edge function | replaced (see Notifications) |
| `profiles.profile_visibility`, `tagged_moments.tag_token`, `collections.events_tier_unlocked`, `collections.date_from/date_to` | never read or never written |
| Timeline "Tagged" pill's always-on query | becomes signal-driven "Shared with me" |

Kept: `moments.people text[]` free-text chips — the "who was there" memory aid has real
usage and is a journal feature, not a social one. The People field is free-text only in
v2; sending a moment to a person happens in the share sheet, not the People field.

---

## Build Phases

**Phase A — Honesty patch** *(small, ships first, before everything)*
Token revoke + link-state row in the current share sheet. Closes the live gap for the
17 world-readable-while-"private" moments.

**Phase B — Teardown**
The deletion table above, plus RLS rewrite to the access rule (minus the
`moment_shares` branch, added in C), migration for dropped tables/columns/indexes/
functions, `friends.tsx` → `albums.tsx` route rename at the end.

**Phase C — The new core**
`moment_shares` table + RLS branch; friendships collapsed to mutual-by-link; "Shared
with me" pill; People row on Profile; share/friend push notifications.

**Phase D — The facelift**
Share sheet rebuilt around three verbs + state; share card redesigned (photo hero,
brand chrome, story variant); web `/m/`, `/c/`, `/friend/` redesigned in the same
language.

**Phase E — Later**
Branded QR on card and `/m/`; "Keep this" gift claim; reconsider parked items
(resonance hearts, era cards, linked moments, memory game — see below).

All phases are JS + SQL — OTA-able, no binary required.

---

## Decided Questions

| Question | Decision |
|----------|----------|
| Feed? | No. "Shared with me" inbox only — directed, not broadcast. |
| Friend graph? | Yes, but mutual-by-link only. No requests/pending/username search. |
| Per-person visibility? | Yes — that's what `moment_shares` rows are. All-or-nothing tiers deleted. |
| Privacy model | Absence of grants. No visibility enum. |
| Link side effects | None automatic. "Keep this" is recipient-initiated. |
| Share card hero | Photo when present (no dark overlay), album art otherwise. QR later, as a toggle. |
| People field | Free-text memory aid only. Sending-to-people lives in the share sheet. |
| Phone contacts | No (unchanged). |
| Backend tier? | No. RLS + RPCs + edge functions remain the server. |
| Album invites | Link only. |

## Parked (not deleted from memory, just from the codebase)

Resonance hearts on shared moments · Linked moments ("Sarah also has a memory of this
song") · Era cards · Memory game (see v1 git history for full specs) · per-template
card styles (filmic/retro).
