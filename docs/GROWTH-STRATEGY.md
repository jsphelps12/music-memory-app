# Tracks — Growth Strategy

**The one-liner:** *"The songs you'll always remember, and why."*

Works for every audience. Spotify can tell you what you played. Tracks captures what it meant.

---

## Revenue Streams

### 1. Subscription Tiers

| Tier | Price | What you get |
|------|-------|-------------|
| **Free** | $0 | Log moments, join collections, personal timeline |
| **Tracks Plus** | $4.99/mo or $39.99/yr | Create shared collections, era clustering, insights, advanced filters |
| **Tracks Events** | $39.99 one-time per event | Extended collections (500+ contributors), QR code generation, event analytics, book export |
| **Tracks Book** | $80–150 per book | Print-on-demand hardcover (see below) |

The Events tier is a one-time purchase tied to an occasion — lower barrier than a subscription for someone who just wants Tracks for their wedding. Most event hosts will also become long-term Plus subscribers after they see what the app can do.

---

### 2. The Physical Book

A hardcover memory book generated from a collection. No competitor does this.

**What's in it:**
- Each spread: contributor's name, their reflection, song + artist, their photos
- A QR code on every page — point your phone at it, the song preview plays instantly
- Back of book: every song in the collection listed chronologically, each with a QR code linking to Apple Music / Spotify — a printed playlist with context
- Cover: a tiled collage of every album artwork from songs in the collection

**Why it's defensible:**
- The book is *alive* — it plays music when you point your phone at it
- No photo book company (Artifact Uprising, Chatbooks, Blurb) can replicate it without the music memory layer underneath
- Every guest who picks it up at the couple's house years later gets a touchpoint with Tracks
- Emotionally irreplaceable — couples, families, friend groups will pay for this

**Technical dependency:** Requires public individual moment pages on the web app (`/m/{moment_id}`) for QR codes to link to. This is Phase E (web enrichment). PDF generation server-side via jsPDF or headless browser render, sent to a print-on-demand partner.

**Pricing anchor:** $80 softcover, $130 hardcover. Pure margin after print cost.

---

## Acquisition Channels

### B2B — Wedding Industry

Individual users are expensive to acquire. Wedding planners manage 20–40 weddings per year each.

- **Wedding planners** — they set up the collection, brief the couple, share the QR code at the reception. Tracks becomes part of their service offering, not an afterthought.
- **Venue partnerships** — venues include Tracks in day-of materials alongside the photographer and florist contact
- **DJ partnerships** — DJs already build the soundtrack. A DJ who offers "I'll set up your Tracks collection" has a premium upsell and a reason to recommend the app to every client

One partnership with an active wedding planner reaches every couple they serve. This is **B2B2C** — cheaper per acquired user than any ad channel.

**The wedding pitch:** *"Your guests will remember the music. Give them somewhere to put it."*

Wedding-specific landing page. Outreach to wedding industry press (The Knot, Brides, Style Me Pretty). Press angle: "The app that captures every guest's memory of your wedding soundtrack."

---

### Artist + Album Release Campaigns

- An artist creates a collection for their new album: "Log your first listen to *[Album]*"
- Fans contribute their reactions, the collection fills with real emotional responses to the music
- Artist shares it to their audience → thousands of new Tracks users from one campaign
- The artist gets a genuine human artifact from their fanbase; Tracks gets the acquisition
- **Free for indie artists**, paid placement for major label campaigns
- Culturally timed: Taylor Swift, Beyoncé, Kendrick drop → Tracks runs "log your first listen" campaign

---

### Concert & Festival Collections

- A touring artist or festival creates a collection per event/tour leg
- Fans log moments from each show in real time during or after
- **Merch table integration** — QR code on a card in the merch bag joins the tour collection; physical buyers get a digital artifact
- After the tour: a "Tour Soundtrack" book — setlist songs, fan reflections, artwork collage
- Festival organizers (Coachella, Bonnaroo, Lollapalooza) could white-label this for their event
- Real-time logging during a show is a compelling behavior that generates press

---

### Music Therapy Channel

Music therapy is a real clinical field. Therapists assign music journaling between sessions.

- One therapist recommends Tracks → their entire client roster gets it
- Low acquisition cost: a dedicated landing page explaining the therapeutic use case, targeted outreach to music therapy associations (AMTA — American Music Therapy Association)
- Positions Tracks alongside tools like journaling apps rather than social apps — different emotional context, lower skepticism
- These users are high-retention: the app is tied to their healing process

---

## Marketing Approach

### Occasion-Based, Not Demographic-Based

You have five distinct user types who want completely different things from the same product:

| Audience | Core desire | Entry moment |
|---|---|---|
| Solo journaler | Capture meaning, build a personal archive | Song hits different, wants to remember it |
| Couple | "Our songs" — shared relationship soundtrack | Anniversary, new relationship milestone |
| Event host | Collaborative artifact, guest experience | Wedding planning, milestone birthday |
| Music obsessive | Deep personal history, stats, identity | Spotify Wrapped season |
| Concert fan | Capture the experience, compare with others | Upcoming show, just got home from a concert |

One message doesn't work for all five. The approach: **right message at the right moment in someone's life.**

**Seasonal calendar:**
- **Jan–April (wedding planning season)** → wedding-specific content, B2B outreach to planners
- **Summer (concert season)** → "log your setlist," artist/festival partnerships, real-time capture messaging
- **October–November (Wrapped buildup)** → attack Spotify Wrapped directly: *"Spotify Wrapped tells you what you listened to. Tracks tells you why."*
- **February (Valentine's Day)** → couples use case, "our songs" framing
- **September (back to school/college)** → dorm/friend group collections, "your year in music starts now"

---

### Content Strategy

The product is inherently emotional and visual — TikTok and Instagram are native surfaces.

**The viral prompt:** *"What song were you listening to when..."* — the whole internet already participates in this format. UGC where people share their most meaningful logged moment (the song + a vague emotional caption, without the private reflection text) is authentic and shareable.

**The Spotify Wrapped angle:** Wrapped created massive cultural envy. Millions of people wish they had more meaning around their year in music. Tracks is that, permanently, year-round. This is a content moment every December that requires no paid spend.

---

### Evangelist Archetype: The Music Obsessive

The music obsessive talks about music constantly. They already have strong opinions about Spotify Wrapped. They'll recommend Tracks to their entire friend group within a week of using it.

Find these people first:
- Music subreddits (r/ifyoulikeblank, r/indieheads, r/hiphopheads, r/popheads)
- Discord music servers
- Music journalism and criticism spaces
- Apple Music "heavy user" communities

500 deeply passionate music people is worth more than 5,000 casual users. They generate word-of-mouth, create content, and pull in their social circles.

---

## Event-to-Personal-to-Paid Conversion

The wedding download is worthless if it's a one-time use. This is the funnel that turns a guest who downloaded for someone else into a paying subscriber.

### Stage 1 — Acquisition (at the event)
They download, join the collection, log a moment. They're doing it for the couple, not for themselves. Low motivation state.

**The critical move:** when they log into the collection, it saves to their personal timeline too. This is already how the app works — moments are referenced, not moved. But most users won't realize this. Tell them explicitly, right then:

> *"Your moment lives on your timeline forever — not just in this collection."*

That reframe shifts it from "I did a thing for the couple" to "I just started something for me." Then show them their personal timeline with the moment already sitting there — not the collection view. Make it feel personal and alive immediately.

### Stage 2 — Plant the Hook
At the end of first-time onboarding for collection-origin users:

> *"On This Day next year, we'll remind you of this moment."*

Sets a concrete future expectation. Makes the app feel like it's working for them even when they're not using it. Then go quiet — don't spam them.

### Stage 3 — The Week After (the warmest window)
2–3 days after joining, they're home, still in the emotional afterglow. One push notification:

> *"What song has been in your head since the wedding?"*

Not "add more moments." A specific human prompt that meets them exactly where they are. This is when personal logging starts.

### Stage 4 — One Year Later (the conversion moment)
A year passes. They may have forgotten the app exists. Then On This Day fires:

> *"One year ago today, you were at Sarah & Mike's wedding."*
> *[song] · [their reflection snippet]*

They open in a fully nostalgic, emotionally open state. Then:

> *"A lot changes in a year. Has this song changed meaning for you?"*

That prompt invites them to log again. If they do, the app just demonstrated its entire value proposition in one session — log, resurface, reflect. This is the moment personal habit forms.

### Stage 5 — Premium Conversion
By now they've logged the wedding moment plus personal moments they added after getting hooked. At 25–30 moments, the locked Era card appears:

> *"Summer 2026 — unlock the chapter you just lived."*

For a wedding user this lands especially hard — "Summer 2026" holds the wedding AND everything that came after it. The Era is already meaningful. That's the $39.99 moment.

---

**The core insight:** the wedding isn't a one-off acquisition event. It's the first chapter of their personal story on the app. The wedding got them emotional about music and memory at exactly the right moment. Don't waste it.

The onboarding for a collection-origin user shouldn't look like the generic new user flow. It should say: *"This moment is yours now. Not just theirs. Let's build on it."*

---

## Features That Drive Growth

### Anonymous Matched Moments + Global Trends
When multiple users log the same song, surface it anonymously inside the moment detail:

> *"83 people logged this song during a breakup."*
> *"12 people logged this song the night someone died."*

Makes a private journal feel connected to something larger without a social graph. No friends needed. Deep retention mechanic.

This extends into a **Discover / Trends surface** — a read-only feed showing:
- **Global top songs this week** — most logged across all users
- **Top songs by mood** — "most logged as 'heartbroken' this month," "most logged as 'euphoric' this summer"
- **Trending right now** — songs spiking in logs (correlates with cultural moments — album drops, viral TikTok sounds, world events)
- **"On repeat"** — songs logged by the same user multiple times across different eras

None of this exposes individual users or their reflections. It's aggregate and anonymous. But it makes Tracks feel alive — a living pulse of what music means to people right now. A reason to open the app even when you don't have a moment to log.

---

### "Gift a Memory"
Log a moment and send it directly to one person. Not a collection — a private, one-to-one share:

> *"I want you to know what this song means to me when I think of you."*

Recipient gets a notification. Opens it (web link, no account required) and sees the song + your reflection. To reply with their own memory of that song, they download the app. Acquisition through deep emotional resonance — the highest quality install you can get. No new data model beyond a share token on the moment.

---

### Lock Screen Widget + ShazamKit Quick Log
One-tap "save this moment" from the lock screen while a song is playing. The Now Playing detection already exists — this surfaces it one layer higher, removing the biggest real-world logging friction: *"I was driving and forgot by the time I parked."*

**Two capture modes in the widget:**
- **Now Playing** — detects what's playing through the device (current behavior)
- **Identify** — taps ShazamKit to listen for 3 seconds and identify ambient audio

**ShazamKit is the key expansion.** Apple owns Shazam and exposes ShazamKit as a native iOS framework. The difference from Now Playing:

| | Now Playing | ShazamKit |
|---|---|---|
| What it detects | Music playing *through the device* | Music playing *anywhere near the device* |
| Use case | You're playing a song on your phone | Concert, party, bar, someone's speakers, TV, vinyl |
| How it works | `MPMusicPlayerController.systemMusicPlayer` | Microphone → 3-second audio fingerprint |

This doubles the surface area for capture. The moments you most want to log — the song playing at the party, the song the DJ dropped at the wedding, the song on the radio when something happened — are exactly the moments Now Playing misses. ShazamKit catches them.

**Implementation:** custom native module (same pattern as existing NowPlaying module) + microphone permission. ShazamKit returns a `SHMediaItem` which cross-references against MusicKit for full Apple Music metadata.

**Dynamic Island:** Live Activity showing current song with a heart tap to log. Also gets tech press coverage (MacStories, 9to5Mac) as a well-executed iOS-native feature.

---

### "Songs My Parents Played"
A prompt — and eventually a campaign — for logging childhood/family music memories. Songs from the car, from holidays, from a parent's record collection. Universal experience that crosses every demographic.

**In-app:** an optional onboarding prompt or "memory starter" in an empty state:
> *"What's a song you heard before you could choose your own music?"*

**Campaign angle:** *"The songs you heard before you could choose your own."*
- Runs at Mother's Day, Father's Day, the holidays
- High shareability — everyone has an answer
- UGC format: "my mom played [song] every Sunday morning" → the whole internet participates in this

One shareable moment card from this campaign and it spreads on its own.

---

### Mood-to-Playlist Export
Users who log moods with their moments can generate playlists from their own history:
- "Songs I logged as 'peaceful'" → exports directly to Apple Music
- "Songs I logged during my move to New York" → a playlist only Tracks can build

This is something no other app can replicate — it's not what you listened to most, it's what you *deliberately associated with a feeling*. Every export is shareable. Every share is an acquisition touchpoint. Creates a bridge back to Apple Music that deepens both platforms.

---

### Spotify Wrapped Counter-Programming
Every December, millions of people share Wrapped and feel vaguely hollow — it's stats, not meaning. Tracks runs a counter-campaign without paid spend:

> *"Wrapped tells you what you listened to 32,000 times. Tracks tells you why the 4th listen of one song changed everything."*

This is a press story that writes itself every year. Pitch it to The Ringer, Pitchfork, The Atlantic, The Cut in November. One article = more credibility than any ad. Do this every December without fail.

---

### Apple Editorial Placement
Apple features apps in App Store editorial ("Apps We Love," themed collections). Tracks is exactly what Apple wants to showcase — it deepens Apple Music engagement, it's beautifully designed, emotionally meaningful. Apple has financial incentive to feature apps that make their platform stickier.

Submit when you hit a meaningful milestone (1,000 users, the wedding book launch, a major feature). Write to appstorepromotion@apple.com with a press kit. One editorial placement drives tens of thousands of installs with zero spend.

---

### Apple Shortcuts Integration
"When I add a song to my Library, prompt me to log a memory." Power users who care enough to build Shortcuts automations are your best evangelists. Gets coverage in automation communities (r/shortcuts, MacStories, Toolbox for Word). Low engineering lift — Shortcuts app intents are well-documented in native iOS.

---

### Micro-Influencer Strategy
Don't pitch big music influencers. Find the 10k–100k accounts whose whole identity is *music and feelings* — people who post about albums that got them through hard times, "songs that make me cry" compilations, parasocial music diary content. They already have your exact user as their audience.

DM 50 of them with a personal note and a free Plus subscription. One authentic post from someone like that converts better than any paid placement. The psychographic overlap is exact.

---

### Referral Program
"Give a friend 3 months of Plus free, get a month free yourself." Only viable once you have paying subscribers, but it compounds. Frame it as a gift, not a discount — *"I want you to have this"* beats *"save 25%"* for an emotional product.

---



Tracks sits at an intersection nobody else owns:

| App | What it does |
|-----|-------------|
| Spotify | Music discovery and playback — but no memory |
| Day One | Life journaling — but no music |
| Apple Photos | Visual memories — but no soundtrack |
| **Tracks** | **The intersection: music + the memory + the meaning** |

*"The songs you'll always remember, and why."*
