# Soundtracks — Product Strategy

> This document captures strategic thinking that lives between the vision (the why) and the roadmap (the what). It's the reasoning layer — how we make decisions, where the moat actually comes from, and how we balance tensions that don't have obvious answers.
>
> See also: `VISION.md` (product north star), `PITCH.md` (investor framing), `MARKET-RESEARCH.md` (competitive landscape).

---

## The Honest Defensibility Assessment

**The core idea is not defensible.** "Log memories with music" can be copied by Spotify, Apple, Daylio, or a YC team in a weekend. The feature is not the moat. That's true of almost every consumer app — Instagram's moat isn't filters, Spotify's moat isn't a music player.

### Where the actual moat comes from

**1. The archive (strongest moat)**
Every moment a user logs is irreplaceable — not because we've locked it, but because rebuilding years of personal memories elsewhere is psychologically impossible. The longer someone uses Soundtracks, the more it becomes *their archive*. Same moat as Spotify playlists and Apple iCloud photos. **Time-in-product is the defensibility.** The job is to get users to their first 6 months of logged moments as fast as possible.

**2. Network effects (emerging)**
Shared collections, tagging, the memory guessing game — these create social graphs that are hard to replicate. If your friends are on Soundtracks, you stay on Soundtracks. Social features aren't just engagement mechanics. They're a moat mechanism.

**3. Distribution**
Cracking the music therapy channel, landing an artist partnership, becoming the thing music journalists write about — these are distribution advantages a copycat can't buy overnight. You can copy the app. You can't copy the relationship with 500 therapists.

**4. Brand and emotional positioning**
"Soundtracks" is a good name. The emotional angle — *why* a song matters, not just *that* you played it — is a distinctive position in a market dominated by playback metrics. Own that positioning before Spotify or Apple decide to care about it.

**5. The physical artifact**
A user who has a Soundtracks book on their shelf is not switching apps. The physical object is a retention mechanism no purely digital competitor can match.

### What's structurally missing for stronger defensibility

**The intelligence layer isn't compounding yet.**
The archive stores memories but doesn't actively get smarter over time in a way the user *feels*. Letterboxd knows your taste. Spotify knows your listening patterns. Soundtracks holds your data but doesn't yet compound it into something increasingly valuable and personalized. The Music Memory Engine gets at this — but until it's built, the archive is a scrapbook, not an intelligence. A scrapbook can be recreated elsewhere. Something that truly knows your emotional relationship with music over a decade cannot.

**No real network effects yet.**
The social features are planned but not shipped. No friend graph, no social proof, no reason your friends need to be here for you to get value. Network effects are the difference between a moat and a wall. Without them, a well-funded copycat can replicate the single-user experience.

**No public-facing content layer — the biggest strategic gap.**
Everything is private. This is the right default, but it means no discovery, no SEO, no community identity, no organic acquisition loop.

**Letterboxd is the right model to study.** Letterboxd is essentially unassailable for a small company — not because of tech, but because the best film writers are there, public reviews drive massive SEO, and "I'm a Letterboxd person" is a cultural identity. Their moat is community + public content. Soundtracks has the diary. It's missing the community, the public layer, and the cultural identity. Those three together make a product hard to displace — not because switching is technically difficult, but because the community *is* the product.

**The data isn't proprietary yet.**
At 100k users with years of logged moments, we'd have something genuinely unique: the largest dataset of human emotional associations with specific songs, segmented by era, geography, age. Valuable to labels, researchers, streaming services. But right now it's user data in Postgres. The proprietary data moat requires scale + an intelligence layer.

**One-sentence gap: Soundtracks is a great private tool but not yet a community. The moat lives in the community.**

---

## The Private/Public Balance

This is the hardest product design tension in consumer apps. Most apps get it wrong in one direction or the other.

### The core tension

**Private:** The emotional honesty of the product depends on privacy. If users know their reflections are public, they'll write for an audience. "I was going through my parents' divorce and this song was the only thing that felt real" cannot exist if people are performing. You can't have authentic archives if every entry is colored by external judgment.

**Public:** Without a public layer, there's no discovery, no community identity, no network effects, no SEO. The product is invisible.

### How great apps have solved it

**Letterboxd** — the closest model. Your diary is private by default. Reviews are public by choice. The key insight: **they made the public act feel like self-expression, not exposure.** A public review feels like sharing taste, not confessing emotions. The diary and the review are *different acts* with different emotional stakes.

**Strava** — activities public, GPS routes optionally hidden. Community sees your effort, not your front door.

**Goodreads** — cautionary tale. Everything public, journaling feels performative. People track books but don't write honest reflections.

### The design principle

**Private by default. Public by deliberate choice. The public act must be a different, lighter gesture than the private one.**

Never make logging honestly feel like a risk. Never make sharing feel like it requires exposing something vulnerable. The two acts must feel so distinct users don't experience them as in tension.

**What this looks like in practice:**

The private act is logging — reflection, mood, the raw reason a song matters. Stays private forever unless explicitly chosen otherwise. Never default public, never nudge toward sharing the reflection itself.

The public act is a *different, lighter thing:*
> "This song is part of my story" — one tap, no text required.

A user can publicly associate themselves with a song without exposing why. The song appears on a public profile. The reflection stays hidden. This lets you build a public taste graph without violating emotional privacy.

If they want to share a reflection, they write a *separate* public note — distinct from the private reflection. Same song, two layers. Letterboxd does this with diary entries (private) vs. reviews (public).

**The failure mode to avoid:** adding a "share this moment" button to the private reflection screen. That single UI decision makes every future reflection feel slightly performative. Keep the acts completely separate in the UI.

**Aggregate anonymity as a middle layer:**
- "23 people have a memory with this song" — aggregate, anonymous, no content exposed
- Song pages showing public notes only — never private reflections
- Shared collections remain the social core — semi-private by design, not broadcast

---

## This Is Memory, Not Content

The most important positioning distinction to maintain internally and externally.

### What Instagram/BeReal music tagging actually is

It's **context for the post**, not reflection on the song. The music is set dressing. "I added this song because it matched the vibe of this photo I'm sharing." The audience is external from the moment you open the share screen. The song is a caption, not a memory. Nobody goes back to an Instagram post from 3 years ago to find the song they tagged.

### The three real differences

**1. Temporality**
Instagram music tagging is ephemeral — it lives in a feed, gets buried, disappears. Soundtracks is permanent by design. The whole point is going back. On This Day, resurfacing, the annual book. The archive compounds in value. A feed decays.

**2. The subject**
On Instagram the subject is *you right now* — the photo, the moment you're sharing. The song is attached to that. On Soundtracks the subject is *the song* and what it means across your whole life. A song can have multiple moments attached to it. You can see how your relationship with an artist evolved over years. That's not possible when music is a tag on a post.

**3. Emotional honesty**
Nobody writes "I was falling apart when this song found me" on Instagram. The audience dynamic makes that impossible. Soundtracks is private first, which means people can actually tell the truth. That truth is what makes the archive worth having.

### The design risk

The risk isn't that users confuse Soundtracks with Instagram music tagging. The risk is that **we accidentally build toward that** — optimizing for sharing, public profiles, content that looks good externally — and slowly hollow out the private honest core that makes it different.

**The positioning distinction to repeat as a product principle: this is not content, it's memory.** Every feature decision runs through that filter.

**The sentence that travels:** *Instagram tells you what song you were listening to. Soundtracks tells you why it mattered.*

---

## Monetization Hierarchy

Physical products will likely outsell Premium subscriptions early on. The bar to buy a $89 book is lower than committing to a recurring subscription when the free tier is genuinely good. "I want this on my shelf" is a simpler decision than "I want to pay monthly forever."

**Likely order of revenue drivers (early):**

1. **Physical books** — high intent, emotional purchase, one-time easy decision; high gross margin (~$95/book); the QR-plays-music angle is a genuinely different product category from Artifact Uprising or Chatbooks
2. **Gift subscriptions** — Mother's Day / Father's Day with the pre-seeded songs mechanic is uniquely Soundtracks; high AOV, emotional occasion, potentially viral
3. **Tracks Plus subscriptions** — harder sell early when free tier is strong, but the compounding engine if conversion is cracked; break-even at ~120 annual subs
4. **Printable moment cards** — probably free/viral, not a revenue driver on its own; worth building for acquisition and retention, not monetization

**Books as retention, not just revenue:** A user with a Soundtracks book on their shelf doesn't switch. The physical artifact is a lock-in mechanism that no digital competitor can match. This is why the book matters strategically even if the margin per unit isn't transformational at small scale.

**Premium + book bundle logic:** Plus subscribers get a meaningful discount (20–30%) or one softcover included with the yearly plan. Gives Plus an additional reason to stay subscribed year-round even for light users. The annual plan becomes: "pay for Soundtracks, get your year in music on your shelf."

---

## Growth vs. Defensibility — The Sequencing

Growth and defensibility can conflict:
- Going viral fast means broad shallow users who churn. Moat comes from deep engaged users who log for years.
- Locking features behind Premium too early slows growth but accelerates revenue.
- Opening up social too early adds complexity that can hurt retention before the core habit is formed.

**For the first 12 months: optimize for depth over breadth.** One user with 200 logged moments is worth 100 users with 2. That user is locked in, will buy the book, will gift it. Activation and habit formation matter more than acquisition right now.

**The growth strategy most consistent with defensibility:** gifting occasions + the physical book. Both naturally bring in high-intent users (not drive-by installs), and the book creates physical lock-in that's uniquely ours.

---

## The Competitor Who Actually Threatens Us

Not Spotify. Not Apple. Their businesses are streams and platforms respectively — they build broadly, not intimately.

**The real threat: a well-funded startup that reads about us and ships in 3 months.**

The answer to that threat is not patents or features — it's execution speed and user depth. The deeper the archive users have built, the higher the switching cost. Every month of logging is a month of moat. Ship fast, get users logging, let time do the work.

**Apple Journal** is the 3-year platform risk. They have distribution and integration. Mitigation: go deeper on social/shared collections and cross-temporal discovery that Apple will never prioritize for a general-purpose journal.

---

## The Feature Decision Filter (addendum to VISION.md)

Before building anything, also ask:
- Does this deepen the archive or accelerate logging? (moat-building)
- Does this bring a second person in? (network effect)
- Does this create public content without compromising private honesty? (community layer)
- Does this make the physical artifact more valuable? (lock-in)

If none of the above and it doesn't serve the core loop from VISION.md: deprioritize.

---

## Competitive Landscape — Deep Dives

### POV (Disposable Camera Events)

**What it is:** Digital disposable camera for events. Host creates a camera, guests scan a QR code — no app download required via App Clips. Everyone takes photos, collected into one shared gallery revealed during or after the event.

**Traction:** $100k+ MRR, 200k downloads/month at peak. Grew primarily through a faceless TikTok strategy — 4 accounts, UGC-style content under women's names targeting wedding emotions.

**Business model:** Per-event pricing by guest count. Free under 10 guests, $4.99 for 25, up to $89.99 for 250+. Every event is a transaction. No subscription, no compounding. Also upsells physical photobooks.

**What POV proves:**
- The wedding/event acquisition channel is real and scalable — one QR code at a reception brings 30–150 new users
- Per-event pricing works; willingness to pay scales with occasion size
- The faceless TikTok playbook targeting wedding emotions drives real installs at low cost
- Physical photobooks are a natural upsell in this space

**What POV misses:** Zero memory layer. Value dies when the event ends. Guests look at the gallery once and move on. No On This Day, no resurfacing, no reflection, no music. The event happens, the gallery fills, people look at it once.

**Relationship to Soundtracks:** Not a competitor. POV captures photos at an event in real time. Soundtracks captures what a song *meant* — before, during, and long after an event. A wedding couple could use both simultaneously. POV's $100k MRR also has no obvious path to $1M MRR — every dollar requires a new event. Soundtracks' subscription model compounds.

**What to steal:** The TikTok playbook directly. Same faceless, UGC-style approach, different angle: "the song playing when you realized you were in love," "the album that got you through that year." Runs on zero budget. Start immediately.

**The gap POV leaves open:** Soundtracks could be the layer that makes event memories last — "a year later, what song do you remember from that night?" A genuine complement, not a clone.

---

### Musicboard

**What it is:** Rate albums, write reviews, make lists. Explicitly positions itself as "Letterboxd for music." Been around since ~2020, the most established app in the music social space.

**Current status (early 2026):** Struggling badly. Servers went down February 2026, TechCrunch covered it, users organized a "Help Save Musicboard" campaign. Unresponsive dev team. Android app disappeared from Play Store at one point.

**Why the model structurally fails:**
- Music isn't consumed like film. You watch a movie once then review it. You listen to the same song 200 times across a decade in completely different emotional states.
- A rating strips out the thing that actually matters — the context you were in when it hit you.
- The critic frame ("was this album good?") is the wrong frame for music. Nobody lies awake thinking "does Bon Iver deserve 4 or 4.5 stars." They think "that album was my entire winter."
- Most telling user complaint: people want to catalog music *without rating it* — they want a "listened" option like Letterboxd's "watched." They're trying to use the app for memory and presence, not criticism. The product keeps forcing them back into the critic role.

**Relationship to Soundtracks:** Not a competitor — solving a completely different problem. Their users want better ratings tools. Soundtracks' users don't want to rate music, they want to remember it. Different pond entirely.

---

### Echo

**What it is:** Newer (January 2025), shinier version of the same concept as Musicboard. Rate and rank music, build a profile, discover what friends are listening to. Adds gamification — achievements, leaderboards.

**Traction:** 4.88 stars, ~1,300 ratings. Tiny but positive early buzz. Buggy on Android.

**Same fundamental problem as Musicboard:** Turns music taste into a competitive leaderboard. Fun for a while, optimizes for a behavior (ranking) that has almost nothing to do with why music matters to people. The gamification masks the same category error.

**Relationship to Soundtracks:** Same answer as Musicboard. Different question entirely.

---

### The "Letterboxd for Music" Thesis — Why It Doesn't Work

The user's thesis: *we like music because of how it makes us feel and how it can take us back to moments.* This is the correct diagnosis of why the Letterboxd model fails for music.

Film and music are consumed completely differently. When you watch a film, you sit down, give it focused attention, and it ends. Then you have an opinion. The review model works because there's a natural post-credits moment where reflection and rating happen organically.

Music doesn't work that way. The same song hits differently at 22 and 28. A rating is almost meaningless without the context. The evaluative frame misses the point of why music matters to people entirely.

**Soundtracks isn't competing with Musicboard and Echo.** It's solving a problem those apps don't even recognize exists. The positioning line: *Musicboard asks "what did you think of the album?" Soundtracks asks "what did the song take you back to?"* Two completely different questions.

**The risk:** Never add public ratings or rankings. The moment you add ratings you've joined the critic category and lost the positioning entirely. The absence of ratings is a feature.

---

## Retention Benchmarks

Context for setting realistic targets:

| Category | Average Day 30 Retention |
|---|---|
| Music apps | 3.8% |
| Social apps (good) | 15–25% |
| Top-quartile consumer apps | 40%+ |
| BeReal at peak | ~65% (6-month) — then collapsed |

**BeReal's lesson:** Strong early retention numbers can be misleading if value is novelty-driven rather than compounding. BeReal peaked at 73M users in 2022, sold to Voodoo for €500M in 2024, now has ~2.93M DAU. Retention stats at peak masked that there was no compounding value — once the novelty wore off, there was no archive pulling people back.

Soundtracks should have the opposite dynamic — slower early retention that *improves* over time as the archive builds and On This Day starts firing.

**Realistic Day 30 targets:**

| Cohort | Target | Signal |
|---|---|---|
| All users (overall) | 10–15% | Good for a memory/journaling app |
| Activated users (2+ moments in week 1) | 25–35% | Product is working |
| Activated users (5+ moments in month 1) | 40%+ | These are lifers |

The overall number will always look low — it includes everyone who downloaded once, never logged, and left. That's noise. **Activated user retention is the number that matters.** Segment this in PostHog from day one.

**The metric to watch above all others:** users who return to log (not just open the app) within 7 days organically, without a push notification. That proves habit formation, not just engagement.

---

## 14-Month Revenue Targets

Honest projections for a solo founder launching a new category with no paid budget:

| Scenario | Users | Monthly Revenue | What it requires |
|---|---|---|---|
| Conservative | 2,000–5,000 | $800–2,000 | Solid execution, no breakout |
| Moderate | 10,000–20,000 | $2,500–5,000 | One channel breaks (TikTok or Wrapped season) |
| Optimistic | 50,000+ | $10,000–15,000 | Viral moment + press + Wrapped season all hit |

Realistic honest target: **$1,500–3,000/month by month 14** with consistent execution across building, marketing, and customer feedback.

**Why this isn't POV's $100k MRR:** POV has a structurally viral mechanic (every event creates 50–150 new users automatically), a simple value prop needing zero explanation, and transactional revenue that doesn't require habit formation. Soundtracks has none of those early advantages. The value prop requires explanation. The best feature (On This Day) takes a year to land. New category = slower start.

**But the ceiling is much higher long-term:**

| Users | Conversion | Plus ARR | Events + Books | Total ARR |
|---|---|---|---|---|
| 50,000 | 4% | $100k | $50k | ~$150k |
| 200,000 | 4% | $400k | $150k | ~$550k |
| 1,000,000 | 4% | $2M | $500k | ~$2.5M |
| 10,000,000 | 4% | $20M | $2M+ | ~$22M |

POV at $100k MRR has no obvious path to $1M MRR — every dollar requires a new event. Soundtracks at $5k/month with strong retention has a credible path to $500k ARR within 5 years.

**The number to actually care about at month 14 isn't revenue — it's activated user Day 30 retention.** If that's moving in the right direction, everything else follows.
