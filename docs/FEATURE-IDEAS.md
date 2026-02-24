# Tracks — Feature Ideas

Non-AI feature ideas organized by conviction level. See `AI-FEATURES.md` for AI/ML-specific features.

Features are marked **[Free]** or **[Premium]** based on the monetization philosophy in VISION.md: paywall meaning, not logging.

---

## High Conviction

The features most likely to drive growth, retention, or monetization at scale. Build these.

### Shared Collections **[Free to join & contribute, Premium to create]**

The primary social growth engine. Every shared collection is a mini acquisition campaign.

**What it is**: A collaborative space where multiple people contribute moments around a shared experience. Each contributor adds their own moments with their own reflections. Same song logged by multiple people shows both perspectives side by side.

**Use cases**
- **Weddings & events** — Host creates a collection, shares a QR code at the venue. Guests log what songs meant something during the day. The couple ends up with a collaborative soundtrack of their wedding from every guest's perspective. One event → potentially 30–100 new app installs.
- **Couples** — "Our Songs." Both contribute moments, see each other's reflections on the same songs. The full arc of a relationship in music.
- **Friend groups** — that road trip, that summer, that era. Each person remembers differently. The collection holds all of it.
- **Families** — holiday traditions, kids' milestones, moments with grandparents. A family archive nobody deletes.
- **Concerts & festivals** — log moments in real time. Everyone's experience of the same night, in one place.

**How it works**
- Create: name, optional cover photo, optional date range, invite link + QR code
- Join: no account required to view (read-only web preview); app required to contribute
- Contribute: add existing moments or log new ones directly into the collection (also saves to personal timeline)
- View: chronological timeline across all contributors; songs logged by multiple people highlighted with side-by-side perspectives
- After the event: generate a shareable "Wedding Soundtrack" artifact — top songs, contributor count, artwork collage

**Data model sketch**
- `collections`: id, name, owner_id, cover_photo_url, date_from, date_to, invite_code, is_public
- `collection_members`: collection_id, user_id, role (owner / contributor / viewer)
- `collection_moments`: collection_id, moment_id, user_id, added_at
- Moments stay in contributor's personal timeline — referenced, not moved

**Free vs Premium**
- Free: join any collection; contribute moments; view timeline
- Premium: create shared collections; event QR code; side-by-side perspectives view; collection summary card; anniversary recap

---

### Era Clustering **[Premium] — THE differentiator**

- AI groups moments into life chapters based on date, mood, artist, and reflection patterns
- Each era gets a generated name: "Winter of Letting Go", "The Comeback Summer", "2024: Finding My Footing"
- Era detail view: artwork collage, top songs, dominant moods, reflection excerpts, date range
- This is the moat. Day One stores entries — Tracks structures emotional memory into chapters.
- **Conversion trigger**: at 25–30 moments, show a locked Era card ("Unlock the chapter you just lived")
- See `AI-FEATURES.md` for clustering approach

---

### Shareable Era & Moment Cards **[Moment cards Free, Era cards Premium]**

- Every share is a word-of-mouth impression — this is how the app grows organically
- **Moment card**: album art, song title, quote from reflection, date
- **Era card**: artwork collage, era name, date range, "X moments in this chapter"
- Vertical/story-format version designed for Instagram & TikTok ("This song was my whole era")
- Multiple visual templates — clean, filmic, retro
- Share via iOS share sheet → Instagram, Messages, Camera Roll
- User shares something beautiful → friends ask "what app is that?" → organic installs

---

### Musical Autobiography **[Premium]**

- AI generates a piece of prose about who you were during an era — not charts, not stats, actual writing
- "In the winter of 2023, you kept returning to songs about distance. The reflection you wrote most often mentioned feeling stuck between who you were and who you were trying to become. By March, the music shifted."
- People read this and feel seen in a way no feature list accomplishes; they share it, they cry
- Irreplaceable — no other service can produce it because it requires years of their own data
- The premium feature that makes people pay without hesitation and never churn
- Delivered as an era artifact: readable, shareable, printable

---

### "You're Not Alone" **[Free]**

- When two users independently log the same song with similar emotional context (mood, reflection tone, time of day), surface it anonymously: "Someone else has a moment with this song that sounds a lot like yours."
- No names, no profiles, no social feed — just a single moment of human recognition
- The most shareable thing the app could produce: people screenshot it because it's not about the app, it's about the human experience
- The network effect mechanic the app currently lacks — it's better when more people use it
- Opt-in; users choose whether their moments participate in this matching

---

### Forgotten Songs **[Free]**

- Surface songs logged exactly once and never again: "You logged this once in March 2023 and never came back to it."
- Different emotional register from random resurfacing — something haunting about a song you apparently let go of
- Reinforces logging habit: seeing a forgotten song makes users want to write a new moment about it
- Simple to implement: query moments grouped by song, find songs with count = 1, surface randomly
- Could appear as a card in Reflections tab or as an occasional push notification

---

### Mood Gap Analysis **[Premium]**

- Surface what's *absent* from the data, not just what's present
- "You almost never log feeling joyful. The last time was 8 months ago."
- "You log anxiety often, but rarely log relief after it passes."
- The "seen" feeling from the emotional arc — the app noticed something true the user didn't consciously realize
- Fits the brand voice exactly: soft in tone, sharp in insight
- Works best after 30+ moments; shown as an occasional insight card, never a push notification

---

## Medium Conviction

Worth building after the high-conviction features are proven.

### Music as Emotional Regulation **[Free basic, Premium full]**

- "I'm feeling anxious right now" → app surfaces songs from *your own history* that helped through that feeling before
- Not Spotify recommendations (generic) — your songs, your proof they worked
- Free: basic "songs that helped" filtered by current mood selection
- Premium: pattern-learned suggestions based on what historically shifted your mood
- The daily-use hook the app currently lacks; forward-facing not just retrospective

### Seasonal Pattern Anticipation **[Premium]**

- With enough data, proactively surface patterns before the user falls into them again
- "Last October you logged a lot of heavy music and your mood dipped. It's October."
- Turns the app from a rearview mirror into a windshield
- Delivered as a gentle Reflections card or notification, never intrusive

### "You're In A Transition" Detection **[Premium]**

- When logging patterns shift — new artists, mood changes, more late-night moments — the app notices
- "Something seems to be shifting for you lately." Soft in tone, sharp in insight
- No diagnosis, no advice — just observation, like a friend who's been paying attention
- Links to relevant past moments from similar transitions
- Requires ~3 months of data; shows up as an occasional insight card

### Song Anniversaries **[Free]**

- "One year ago today, you first logged this song." Then show what you wrote.
- No AI required — pure date math, but feels deeply personal
- Same category as On This Day; slot into Reflections tab or as a notification

### Lyric Anchoring **[Free]**

- When logging, highlight a specific lyric as the emotional anchor — not just the song, but *this line*
- Years later, seeing the exact words that hit you is different from just the song title
- Stored as `lyric_anchor` field on the moment; displayed prominently on detail
- Optional, low friction; surfaced after the song is selected

### Through-Line Songs **[Premium]**

- Songs that appear across multiple distinct eras — the through-lines in a user's story
- Not their most-logged song; specifically songs that *span chapters*
- Emotionally powerful: some songs are who you always were, not just who you were then
- Requires era clustering to be meaningful; surfaces in Era detail view

### Personal Charts **[Premium]**

- Most-logged songs and artists ranked by year — like Billboard but for your actual life
- "Your #1 song of 2024: X — logged 7 times. Your #1 artist: Y with 23 moments."
- Always-on (not just an annual event like Wrapped); per-year and all-time views
- Highly shareable; tells a different story than mood data

### Grief & Memorial Support **[Free]**

- A dedicated moment type for songs tied to people who have passed
- Surfaces these moments gently on significant dates (their birthday, anniversary of passing)
- Nothing else in the market serves this need; deeply human, generates real word-of-mouth

### Weather Auto-Tagging **[Free]**

- Silently pull weather conditions at moment creation via weather API
- No extra permission required — uses location already granted
- Enables a filter nobody else has: "your rainy day songs," "that cold stretch in November"

### Replay the Era **[Free]**

- From any Era detail view, generate an Apple Music playlist of the songs from that era
- One tap → playlist appears in Apple Music via `music://` deep link
- Hearing those songs in sequence triggers emotional time travel — the whole point of the app

### Listening History Import **[Free]**

- Connect Apple Music, surface songs played heavily in past months
- "You played this song 47 times in March 2024 — want to write about why?"
- Great for onboarding — gives new users something to work with immediately

### Lyrics Integration **[Free]**

- Show lyrics alongside the reflection on moment detail view
- Apple Music lyrics API via MusicKit — fetch synced or static lyrics by song ID
- Let users highlight specific lines; pairs with Lyric Anchoring feature above

### Audio Reflections **[Free]**

- Voice memo option instead of (or alongside) typed reflections
- Record via `expo-av`, upload to Supabase Storage alongside photos
- Transcribe with on-device speech-to-text for searchability
- Playback in moment detail — hear your own voice from that moment in time

### Concert Mode **[Free]**

- At a live show, quick-log multiple songs with minimal friction
- Set context once (date, venue, people) then tap songs to add
- Auto-suggest setlist from setlist.fm API
- Creates a "concert memory" grouping all songs as a single event

### Legacy / Memorial **[Premium]**

- Explicitly support building a musical autobiography for the people who come after you
- Parents log moments with kids; people facing illness document their soundtrack
- Framing: "You're not just logging for yourself. You're building something that will outlast you."
- Creates permanent users who never churn; generates press that no ad budget can buy

### Apple Watch App **[Free]**

- One tap on the wrist → current Apple Music song logged instantly, no phone needed
- Minimal UI: song detected, "Save Moment" button, optional mood tap
- Full reflection added later from the phone (saved as draft)
- Lowest possible friction in the entire product

### Mood Streaks / Gentle Gamification **[Free]**

- "You've reflected 4 days this week" — warm, not competitive
- Seasonal badges, monthly recaps ("You saved 12 moments in February")
- This is a journal, not a fitness app; keep it gentle

---

## Lower Priority

Differentiating features that aren't urgent but could add unique value later.

### Song Journeys

- A view showing every moment saved with a specific song over time
- How your relationship with a song evolves — first heard → meant something different → came back around
- Largely covered by the existing Song view; this would add a narrative/timeline visualization layer

### Moment Templates

- Pre-built templates: "concert", "road trip", "late night", "heartbreak", "discovery"
- Pre-fill mood suggestions, adjust form layout, offer tailored prompts

### QR Codes on Moments

- Generate a QR code linking to the song or moment
- Physical-digital bridge — stick in a journal, put on a photo wall, include in a gift

### Playlist Journals

- Create a playlist in the app where each song has a reflection attached
- Export to Apple Music; keep the journal in Tracks

### Handoff to Apple Music

- From any moment, one tap to play the full song in Apple Music via `music://` deep link
- Simple to implement; removes friction for users who want the whole song

### Import from Notes / Day One

- Parse existing entries from Apple Notes or Day One, match song references, create moments
- Good onboarding hook for journaling-app converts
