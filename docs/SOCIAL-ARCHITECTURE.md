# Soundtracks — Social Architecture

This document captures the agreed design for all social, sharing, and collaborative features.
Update it as decisions change. Reference it before building anything social.

Last updated: May 2026

---

## Design Principles

**1. Personal journal first.**
Soundtracks is a private memory journal. Every social feature should increase the personal
value of your own journal — not create pressure to perform for an audience.

**2. Directed, not broadcast.**
Nothing shows up for a user unless it was explicitly put there for them. No feed of
everything friends post. Social content is always intentional.

**3. Mutual consent for relationships.**
Connections are bidirectional. You can't appear in someone's social graph without their
agreement.

**4. Off-app sharing is delivery, not social.**
Sharing a memory with someone who isn't on the app is like sending a letter. It has nothing
to do with the in-app social layer.

---

## Current State (post-launch)

| Feature | Status |
|---------|--------|
| Web app (Next.js / Vercel) | ✅ Live at soundtracks.app |
| Shared collections (join via invite link) | ✅ Complete |
| Guest contributions (event/wedding mode) | ✅ Complete |
| Connections (friends: request/accept) | ✅ Complete |
| Tagged moments (you were there) | ✅ Complete — needs UX cleanup |
| Gift a Memory (web link for non-users) | ✅ Complete |
| Share Image (PNG card export) | ✅ Complete — needs design polish |
| Friend activity feed | ✅ Built — **to be removed** |

---

## The Social Model

### Connections

Mutual only. Both people must accept before anything social flows between them.
Discovery via @username search. No follower model, no public profiles.

No changes needed to data model. The `friendships` table is correct.

---

### Collections — two modes, one concept

Collections are the primary organizational unit. They serve two distinct jobs that should
be clearly communicated in the UI:

**Personal collection** — just yours. A journal, an album, a themed container.
"Road trips," "Concert memories," "Songs from college." No sharing, no collaboration.

**Shared collection** — a named space with 2–20 people. All members can add moments.
All members see a shared timeline of everyone's contributions. The invite link is how
new members join. Guest contributions (open invite link, no account required) are a
variant of shared collections, not a separate concept.

The data model already supports this. UI needs a clearer personal/shared distinction
when creating and viewing collections.

---

### Privacy Dial

Each moment has three visibility states:

| State | Who can see it |
|-------|----------------|
| **Just me** | Only you. Default. |
| **Connections** | Specific connections you choose, plus anyone in a shared collection the moment is added to. |
| **Anyone with link** | Anyone who has the share URL — used for off-app Gift a Memory. |

**DB change needed:** Add `visibility` enum to `moments` table:
```sql
ALTER TABLE moments ADD COLUMN visibility text NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'connections', 'link'));
```

Replace any current boolean sharing flags with this column.

---

### "With Me" — the social inbox

Replaces the current friend activity feed. Lives in the Friends/Connections tab as the
primary content.

**What appears here:**
- Moments friends have tagged you in (you were present in that memory)
- New moments added to shared collections you're a member of (grouped by collection,
  not as individual items in a flat list)

**What does NOT appear here:**
- Anything you weren't explicitly included in
- A chronological stream of everything your connections post

**UI structure:**
```
With Me
────────────────────────────────
  Tagged by Friends
  ↳ Sarah tagged you in "Landslide" · March 2024
  ↳ Mike tagged you in "Mr. Brightside" · Jan 2024

  Shared Collections
  ↳ Road Trip 2024  →  3 new moments
  ↳ The Wedding     →  12 moments
```

Tapping a tagged moment → full moment detail view.
Tapping a collection entry → that collection's timeline.

Tab badge counts total unread items. Clears on visit.

**Scrollable.** The distinction from a feed is what populates it, not whether it scrolls.

---

### Tagging — "We Were There"

When you create or edit a moment, you can tag friends who were physically present.
Tagging means: "you were part of this memory."

**Rules:**
- You can only tag existing connections
- A tag is only visible to the tagged person if the moment's visibility is `connections` or `link`
- If visibility is `private`, the tag exists in the DB but no notification is sent and the
  moment doesn't appear in their With Me
- **No release mechanic** — the privacy dial replaces it. Tag someone and they see it
  immediately if visibility allows. No separate "release" step.

**Tagged person's experience:**
- Gets a push notification: "Josh tagged you in a memory — Landslide, March 2024"
- Moment appears in their With Me → Tagged by Friends section
- Can view the full moment
- Can resonate (see below)
- Can add their own linked memory of the same song (see below)
- Cannot edit the original moment

**DB:** `tagged_moments` table (already exists). Remove `status = 'pending'` release gate.

---

### Resonance

A lightweight way to acknowledge a memory someone shared with you.

Available on any moment visible in your With Me (tagged or in a shared collection you're in).

Tapping resonates sends a **private** notification to the moment's creator:
*"Sarah resonated with your Landslide memory."*

No public count. Not shown to anyone else. Like a knowing look rather than a like button.

Optionally opens a prompt: "Add your own memory of this song →" which leads to Linked Moments.

**DB:**
```sql
CREATE TABLE moment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'resonance',
  created_at timestamptz DEFAULT now(),
  UNIQUE (moment_id, user_id)
);
```

---

### Linked Moments

Two people's independent memories of the same song, connected to each other.

Each person fully owns their own moment — separate rows, separate reflections, separate
photos. The link just says "these two memories are connected."

**How a link is created:**
1. Someone is tagged in a moment → they tap "Add your own memory of this song"
2. Someone resonates → they tap the follow-up prompt to write their own
3. Someone receives a Gift link (off-app) → signs up → moment is waiting (see below)

**UI in moment detail:**
A small card at the bottom of a moment detail screen:
> "Sarah also has a memory of this →"

Tapping opens Sarah's linked moment (if her visibility allows it).

**DB:**
```sql
CREATE TABLE moment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_a uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  moment_b uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (moment_a, moment_b),
  CHECK (moment_a < moment_b) -- prevents duplicate pairs
);
```

---

## Off-App Sharing

Completely separate from the in-app social layer. These are delivery mechanisms, not
social features.

### Gift a Memory (web link)

Shares a URL: `https://soundtracks.app/m/{share_token}`

The recipient opens it in their browser and experiences the memory: song preview plays,
they read the reflection, see the photos. For people who aren't on the app. Like sending
a letter — fire and forget, no social mechanics.

**Deferred account creation flow:**
If the recipient later signs up for Soundtracks:
1. The web page writes `soundtracks-gift:{share_token}` to their clipboard
2. On first app launch post-signup, the app reads the clipboard
3. The gifted moment appears in their With Me automatically
4. They're prompted to add their own linked memory

This uses the same clipboard deferred deep link pattern as collection invites
(`lib/pendingCollection.ts`). Implement in a new `lib/pendingGift.ts`.

This makes Gift a Memory the best onboarding hook in the app: someone receives a
heartfelt memory, signs up, and their first experience is that memory waiting for them
— with an invitation to respond.

### Share Image (PNG card)

Renders a visual card (artwork, song, your name) and exports it as a PNG via the iOS
share sheet. For posting to Instagram Stories, texting a screenshot, eventually printing.

Not a social feature. Needs design polish — the card should feel beautiful enough to
actually want to share. Lower priority than the link.

---

## What to Remove

**Friend activity feed** — the chronological stream of friend moments in the current
Friends tab. Replace entirely with the With Me inbox. No data model change needed,
just UI.

**Tagged moments "release" mechanic** — the creator manually releasing a tag before the
tagged person can see the moment. Replace with the privacy dial. If visibility is
`connections`, tagged people see it immediately. If `private`, they never see it.

---

## Build Phases

### Phase 1 — Clean up (no new features)

1. Remove friend activity feed from Friends tab
2. Build With Me inbox UI (aggregates tagged moments + shared collection activity)
3. Add `visibility` enum to moments table
4. Add privacy dial UI to create and edit screens
5. Remove the release mechanic from tagged moments

**Result:** The existing social layer feels coherent and intentional.

### Phase 2 — Complete tagging

6. Collections get clear personal/shared distinction in create flow and collection list UI
7. With Me shows shared collection updates grouped by collection (not flat)
8. Guest contributions clearly presented as a variant of shared collections

### Phase 3 — New mechanics

9. Resonance (DB + notification + UI button in moment detail when viewing from With Me)
10. Linked moments (DB + create flow from resonance/tagging + "also remembered by" card)
11. Gift link deferred account flow (`lib/pendingGift.ts` + Web page clipboard write)

---

## Decided Questions

| Question | Decision |
|----------|----------|
| Feed? | No. With Me inbox only — directed content, not broadcast. |
| Connections model | Mutual (request/accept). No following. |
| Friend discovery | By @username search. Not phone contacts. |
| Tag visibility | Controlled by moment's privacy dial, not a separate release step. |
| Collections | Personal (just you) or Shared (invite link). Same concept, two modes. |
| Guest contributions | Variant of shared collections, not a separate concept. |
| Privacy states | private / connections / link — three states on every moment. |
| Off-app sharing | Separate from social. Gift link + Share Image are delivery tools. |
| Deferred gift flow | Clipboard pattern (same as collection invites). |
| Resonance visibility | Private notification to creator only. No public count. |
| Linked moments ownership | Each person owns their own moment. Link is a soft connection only. |

---

## Future: Memory Game *(post Phase 3)*

A social game using real logged memories as content. Requires a healthy connections
graph and a good volume of moments to be compelling.

Friends opt-in moments to a shared pool. The game creates rounds from that pool:

| Mode | How it plays |
|------|-------------|
| **Guess the Song** | Read a friend's reflection → pick the song from 4 choices |
| **Whose Memory?** | See a reflection → guess which friend wrote it |
| **Mood Match** | See a moment → guess the mood tag |
| **Timeline** | Put a set of memories in chronological order |

**Why it works:** Only possible with Soundtracks data (reflections + moods + personal
context). Spotify can't build this. Forces friend invites — you need people to play.
Makes reflections worth writing well.

**Async first** (Wordle-style daily memory from your group) before real-time (Kahoot-style
hosted sessions).

**Monetization:** Basic game free (acquisition). Hosting unlimited sessions + custom
settings: paid tier.

---

## Open Questions

- Should a moment's visibility be settable per-connection (share with Sarah but not Mike)
  or all-or-nothing for all connections? Start with all-or-nothing, revisit if users ask.
- Should shared collection moments inherit the collection's visibility, or keep their own
  visibility setting independently?
- Profile pages on web — public (anyone with link) or connections only?
