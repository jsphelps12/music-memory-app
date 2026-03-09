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
