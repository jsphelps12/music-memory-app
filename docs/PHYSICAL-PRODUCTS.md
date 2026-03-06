# Soundtracks — Physical Products

Physical products are a defensible, high-margin revenue stream and a permanent word-of-mouth surface. Every physical product sits in someone's home and introduces a new person to Soundtracks.

---

## The Book *(already in roadmap — flagship)*

A hardcover memory book generated from a collection.

- Each spread: contributor's name, reflection, song + artist, photo, QR code that plays the song
- Back of book: full chronological song list with QR codes → Apple Music
- Cover: tiled collage of album artwork
- Pricing: $80 softcover / $130 hardcover
- Print partner: Artifact Uprising, Blurb, or Printful
- **The book is alive** — it plays music when you point your phone at a QR code. No photo book company can replicate this.
- See ROADMAP.md → Physical Book section for full spec

---

## QR Code Framed Print *(new — highest priority after the book)*

A single memory, beautifully printed as wall art. One song, one reflection, one QR code. Point your phone at it → the song plays.

**Why it works:**
- Perfect for a dorm room, bedroom, nursery, living room
- "The song playing when we brought you home" framed in the nursery
- "The song from our first dance" on the bedroom wall
- A concert memory from a formative show, permanently displayed
- Gift-ready out of the box — couples, parents, friends

**Format options:**
- 8×10 or 5×7 print: album artwork dominant, song title, reflection quote, small QR code
- Minimalist text-only variant: song title, artist, date, a single line from the reflection, QR code
- Poster size (18×24): full-bleed artwork collage from a collection — the "wedding soundtrack" displayed

**Pricing:** $25–45. Pure margin after print cost (~$5–8 through Printful/Gelato).

**Technical dependency:** Public individual moment pages on web (`/m/{moment_id}`) for QR codes to resolve. Same dependency as the book.

**The hardware companion angle:** This is the seed for a future digital frame integration. For now, it's a static print. Later it could be a product that *is* the frame.

---

## Digital Picture Frame Integration *(future — high concept)*

A companion product or integration that cycles through your Soundtracks memories like a screensaver — album art, the song playing softly through a speaker, the reflection shown.

**Short-term (no hardware):**
- A web view at `soundtracks.app/ambient` — designed for Chromecast, Apple TV screensaver, or any smart display
- Your memories rotate automatically: album art fills the screen, reflection text fades in, the song plays at low volume
- No new hardware required — turns any TV or smart display into a Soundtracks ambient player

**Medium-term (integration):**
- Nixplay / Aura smart frame integration via their APIs — push moment cards directly to the frame
- Frame shows a different memory each day, cycling through your archive
- "Your memory of the day" delivered without you doing anything

**Long-term (hardware):**
- A dedicated device: a small framed screen + speaker, powered by a Soundtracks subscription
- Designed for bedside tables, shelves, desks
- Morning mode: plays a random memory softly as you wake up
- This is capital-intensive but would be a category-defining product in the gift market
- Comparable: the Nixie clock, the Aura frame — but for music memories specifically

**The gift angle:** A parent giving this to a child who's going to college. A couple's wedding gift that cycles through "their songs." A memorial display in someone's home.

---

## Couples' Soundtrack Print

A relationship in music, formatted as a keepsake print.

**What's on it:**
- The songs you've both logged together — with dates and locations
- Key moments: first song, most-logged song, last anniversary song
- Timeline format: a visual arc of the relationship in music
- QR code that opens the shared collection in the app

**Variants:**
- Anniversary gift (framed print)
- Wedding gift (larger format, includes "first dance" song prominently)
- "Our First Year" print — auto-generated at the 1-year anniversary of a shared collection

**Pricing:** $35–60. Can be ordered directly from a shared collection.

**The viral mechanic:** Couples post photos of this. Every post is an acquisition impression.

---

## Annual Recap Print

"Your Year in Music Memories" — a printed artifact mailed to you each January.

**What's on it:**
- Your most captured song of the year
- Your most active month
- The moment you wrote the most about
- A mini-timeline of the year's moments
- A QR code that opens your yearly recap in the app
- Designed like a magazine spread — something worth keeping, not a printout

**Pricing:** $20 add-on (shipped in January). Or included in Plus annual plan.

**The ritual:** Subscribers look forward to it every January. It becomes a tradition. The physical artifact is more emotionally durable than a screen — people keep it.

---

## Memory Card Deck

Each card is a logged moment — song, reflection snippet, album art, date, QR code.

**Use cases:**
- A conversation starter — shuffle and share with a friend or partner
- A memorial tribute for someone who passed — their life in music, one card per memory
- A relationship artifact — "our songs" as a deck you can hold
- A concert collection — every song from a tour, each with a fan's reflection

**Format:** 50-card standard deck size, premium card stock, protective box.

**Pricing:** $45–65.

**Dependency:** Same as book — requires public moment pages for QR codes.

---

## Memorial Tribute Book *(emotionally distinct from the wedding book)*

A book for someone who has passed. Different demographic, different price sensitivity.

**What makes it different from the wedding book:**
- Contributed by multiple family members and friends
- Organized around the person's life chapters, not an event
- Each spread: a memory of that person + the song that brings them back
- Front matter: a biographical introduction with their "signature songs"
- Back: a complete list of songs people associate with them

**Pricing:** $100–175 (people pay more for memorial products; emotional price sensitivity is inverted).

**Acquisition angle:** Hospice social workers, funeral planning services, grief counselors. One professional relationship → many families.

**The product no one else offers:** There's no way to create this without Soundtracks. It requires the music + memory layer. This is genuinely irreplaceable.

---

## Build Order

| Priority | Product | Dependency | Revenue Potential |
|----------|---------|-----------|-----------------|
| 1 | QR Code Framed Print | Public moment pages (`/m/{id}`) | High volume, impulse gift |
| 2 | Physical Book (Wedding) | Already in roadmap | High margin, event-driven |
| 3 | Couples' Soundtrack Print | Shared collections | Valentine's Day, anniversaries |
| 4 | Annual Recap Print | Yearly recap feature | Recurring, low effort once built |
| 5 | Memorial Tribute Book | Grief/memorial collection type | High margin, emotional |
| 6 | Memory Card Deck | Public moment pages | Gift market |
| 7 | Digital Frame (ambient web) | Nothing — web only | Retention / premium value |
| 8 | Digital Frame (hardware) | Audience + capital | Long-term vision |

---

## Print Partner Options

| Partner | Strength | Use case |
|---------|---------|---------|
| Printful | Easy API, dropship, no minimums | Framed prints, card decks |
| Gelato | Global fulfillment, fast | Prints, books |
| Blurb | Book-quality printing, API | Memory books |
| Artifact Uprising | Premium positioning, beautiful product | Premium book tier |
| Moo | Cards, premium stock | Memory card deck |
