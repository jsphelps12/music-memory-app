# Tracks — Feature Ideas

Non-AI feature ideas organized by conviction level. See `AI-FEATURES.md` for AI/ML-specific features.

Features are marked **[Free]** or **[Premium]** based on the monetization philosophy in VISION.md: paywall meaning, not logging.

---

## High Conviction

Features that would meaningfully increase retention, engagement, or organic growth.

### Shared Collections — the social growth engine **[Free to join & contribute, Premium to create]**

The most powerful social feature in the product. Every shared collection is a mini acquisition campaign — inviting someone to contribute means they download the app, and the personal logging habit follows.

**What it is**
A collaborative space where multiple people contribute moments around a shared experience — a relationship, a trip, an event, a season of life. Each contributor adds their own moments with their own reflections. Same song logged by multiple people shows both perspectives side by side.

**Use cases**
- **Weddings & events** — the highest-leverage acquisition surface. Host creates a collection, shares a QR code at the venue. Guests log what songs meant something during the day: the processional, the first dance, the song playing when the cake was cut, the last song of the night. The couple ends up with a collaborative soundtrack of their wedding from every guest's perspective. One event → potentially 50–100 new app installs.
- **Couples** — "Our Songs." Both contribute moments, see each other's reflections on the same songs. The full arc of a relationship in music, both perspectives preserved.
- **Friend groups** — that road trip, that summer living together, that era. Each person remembers differently. The collection holds all of it.
- **Families** — holiday traditions, kids' milestones, moments with grandparents. A family archive that nobody would delete.
- **Concert & festival crews** — log moments in real time at a live show. Everyone's experience of the same night, in one place.

**How it works**

*Creating a collection*
- Name, optional cover photo, optional date range (e.g. "June 14, 2026 — our wedding day")
- Optional description / context
- Owner sets permissions: who can view, who can contribute
- Generates a shareable invite link and QR code

*Inviting contributors*
- Share link or QR code — no account required to view (read-only web preview lowers friction)
- Contributors tap link → prompted to download the app to add moments
- Owner approves contributors or sets open join for events

*Contributing*
- Add existing moments from your personal timeline to the collection
- Or log a new moment directly into the collection (also saves to personal timeline)
- Moments stay in the contributor's personal feed — they're referenced, not moved

*Viewing*
- Chronological timeline of all contributed moments across all contributors
- Each moment shows the contributor's name and their reflection
- Songs logged by multiple people are highlighted: "3 people have a moment with this song" → tap to see all perspectives side by side
- Filter by contributor, by mood, by date

**The wedding card**
After the event, generate a shareable "Wedding Soundtrack" artifact: the top songs from the collection, the number of contributors, a collage of album artwork. Beautiful, printable, giftable. The couple shares it → their guests see it → more people discover the app.

**Data model sketch**
- `collections` table: id, name, owner_id, cover_photo_url, date_from, date_to, invite_code, is_public
- `collection_members`: collection_id, user_id, role (owner / contributor / viewer)
- `collection_moments`: collection_id, moment_id, user_id, added_at
- Moments remain in the contributor's personal timeline — no duplication, just a reference

**Free vs Premium**
- Free: join and contribute to any collection you're invited to; view the collection timeline
- Premium: create shared collections (up to 3 free, unlimited premium); wedding/event QR code; "multiple perspectives" side-by-side view; collection summary card export; anniversary recap ("One year ago today, this collection started")

**Why this is the growth engine**
- Weddings alone: average 150 guests. If 20% join the collection, that's 30 new users from one wedding. At scale, weddings could be the single largest acquisition channel.
- Every invite link is a personalized ad — "your friend added you to their wedding soundtrack on Tracks"
- Emotional lock-in: once a family has 3 years of holiday collections, they never leave

---

### "You're Not Alone" — anonymous shared experience **[Free]**

- When two users independently log the same song with similar emotional context (mood, reflection tone, time of day), surface it anonymously: "Someone else has a moment with this song that sounds a lot like yours."
- No names, no profiles, no social feed — just a single moment of human recognition
- The most shareable thing the app could produce: people would screenshot it immediately because it's not about the app, it's about the human experience
- This is the network effect mechanic the app currently lacks — it's better when more people use it
- Opt-in; users can choose whether their moments participate in this matching
- Implementation: semantic similarity on reflection text + matching mood tags + same song → threshold match triggers notification

### Couples Soundtrack **[Free to start, Premium features]**

- Both people in a relationship log moments; when they log the same song independently, show both reflections side by side
- "Your song" but expanded — every shared memory, both perspectives, over the full arc of the relationship
- Relationship timeline: see your shared musical history from first moment to now
- This requires a second person, which is the acquisition mechanic — one partner pulls the other in
- Premium: relationship stats, "your era together" clustering, shareable anniversary cards
- Also works for close friendships, not just romantic relationships

### Musical Autobiography **[Premium]**

- AI generates a piece of prose about who you were during an era — not charts, not stats, actual writing
- "In the winter of 2023, you kept returning to songs about distance. The reflection you wrote most often mentioned feeling stuck between who you were and who you were trying to become. By March, the music shifted."
- People would read this and feel seen in a way no feature list accomplishes; they'd share it, they'd cry
- Irreplaceable — no other service can produce it because it requires years of their own data
- The premium feature that makes people pay without hesitation and never churn
- Delivered as an era artifact: readable, shareable, printable

### Legacy / Memorial **[Premium]**

- Explicitly support building a musical autobiography for the people who come after you
- Parents: "Here's what was playing when you were born. Here's the song playing on your first road trip."
- People facing illness: document your soundtrack for the people you'll leave behind
- Memorial: when someone passes, their family can access their Tracks archive as a tribute
- Framing: "You're not just logging for yourself. You're building something that will outlast you."
- Creates passionate, permanent users who never churn — they're building a legacy, not a habit
- Generates press and word-of-mouth that no ad budget can buy

### Music as Emotional Regulation — predictive comfort **[Free basic, Premium full]**

- Flip from retrospective to forward-facing: "I'm feeling anxious right now" → app surfaces songs from *your own history* that helped you through that feeling before
- Not Spotify recommendations (generic) — your songs, your proof that they worked
- Free: basic "songs that helped" filtered by current mood selection
- Premium: pattern-learned suggestions ("when you feel this way, these songs historically shifted things")
- Genuinely useful in the moment, not just nostalgic — this is the daily-use hook the app currently lacks

### Forgotten Songs **[Free]**

- Surface songs logged exactly once and never again: "You logged this once in March 2023 and never came back to it."
- Different emotional register from random resurfacing — there's something haunting about a song you apparently let go of
- Reinforces logging habit: seeing a forgotten song makes users want to write a new moment about it
- Could appear as a card in Reflections tab or as an occasional push notification
- Simple to implement: query moments grouped by song, find songs with exactly one moment, surface randomly

### Mood Gap Analysis **[Premium]**

- Surface what's *absent* from the data, not just what's present
- "You almost never log feeling joyful. The last time was 8 months ago."
- "You log anxiety often, but rarely log relief after it passes."
- The "seen" feeling from the emotional arc — the app noticed something true that the user didn't consciously realize
- Fits the brand voice exactly: soft in tone, sharp in insight
- Works best after 30+ moments; show as an occasional insight card, never a push notification

### Lyric Anchoring **[Free]**

- When logging a moment, highlight a specific lyric as the emotional anchor — not just the song, but *this line*
- Years later, seeing the exact words that hit you is a different experience than just the song title
- Could integrate with the lyrics API already noted in the Lyrics Integration feature
- Stored as a `lyric_anchor` field on the moment; displayed prominently on moment detail
- Low friction: optional, surfaced after the song is selected

### Song Anniversaries **[Free]**

- "One year ago today, you first logged this song." Then show what you wrote.
- No AI required — pure date math, but feels deeply personal
- Same category as On This Day; slot into the Reflections tab or as a notification
- Most powerful for songs logged in emotionally significant moments ("one year ago today: [the day everything changed]")

### Era Clustering — THE differentiator

- AI groups moments into life chapters based on date, mood, artist, and reflection patterns
- Each era gets a generated name: "Winter of Letting Go", "The Comeback Summer", "2024: Finding My Footing"
- Era detail view: artwork collage, top songs, dominant moods, reflection excerpts, date range
- This is the moat. Day One stores entries — Tracks structures emotional memory into chapters.
- **Conversion trigger**: at 25–30 moments, show a locked Era card ("Unlock the chapter you just lived")
- See `AI-FEATURES.md` for clustering approach

### Shareable Era & Moment Cards — the growth engine

- Every share is a word-of-mouth impression. This is how the app grows organically.
- **Moment card**: beautiful graphic with album art, song title, a quote from the reflection, and the date
- **Era card**: artwork collage, era name, date range, "X moments in this chapter"
- Multiple visual templates — clean, filmic, retro
- Exported via iOS share sheet → Instagram stories, Messages, Twitter/X, saved to Camera Roll
- User shares something beautiful → their friends ask "what app is that?" → organic installs
- Keep moment cards free; era cards are premium

### Lyrics Integration

- Show lyrics alongside the reflection on moment detail view
- Apple Music has a lyrics API via MusicKit — fetch synced or static lyrics by song ID
- Let users highlight specific lines that resonate and attach them to the moment
- Seeing your words next to the songwriter's words adds emotional depth
- Could pair with AI sentiment analysis — compare the mood of the lyrics to the mood of the reflection

### Audio Reflections

- Voice memo option instead of (or alongside) typed reflections
- Sometimes you want to capture a feeling in the moment and typing kills it
- Record via `expo-av`, upload to Supabase Storage alongside photos
- Transcribe with on-device speech-to-text (`SFSpeechRecognizer`) for searchability
- Playback in moment detail — hear your own voice from that moment in time
- Falls back to typed reflection if user prefers

### Collaborative Moments

- Shared moments — two (or more) users tag the same song, each writes their own reflection
- Invite via link or in-app username
- Moment detail shows both reflections side by side
- Use cases: couples, road trip partners, concert friends, "our song" moments
- **This is how the app spreads organically** — every shared moment is an invitation
- Privacy: both users must accept before either reflection is visible to the other
- Could evolve into shared timelines between two people

### Concert Mode

- At a live show, quick-log multiple songs with minimal friction
- Set context once: date, venue/location, people — then just tap songs to add
- Auto-suggest setlist from the artist's recent concerts (setlist.fm API or similar)
- Each song gets a mini-moment with optional quick reflection
- After the show, expand any song into a full moment with photos and deeper reflection
- Creates a "concert memory" that groups all songs together as a single event

---

## Medium Conviction

Worth exploring after the high-conviction features are in.

### Personal Charts **[Premium]**

- Most-logged songs and artists ranked by year — like Billboard but for your actual life
- "Your #1 song of 2024: X — logged 7 times. Your #1 artist: Y with 23 moments."
- Always-on view (not just a yearly event like Wrapped); shows per-year and all-time
- Highly shareable — distinct from Yearly Recap because it's a live ranking, not a one-time summary
- Tells a different story than mood data: pure taste, pure frequency, no interpretation needed

### Through-Line Songs **[Premium]**

- Songs that appear across multiple distinct eras of a user's life — the through-lines in their story
- Not their most-logged song; specifically songs that *span chapters* ("this song shows up in 4 different periods of your life")
- Emotionally powerful: some songs are who you always were, not just who you were then
- Requires enough data + era clustering to be meaningful; surfaces in Era detail view or its own section
- The opposite of Forgotten Songs — these are the ones that stayed

### Weather Auto-Tagging **[Free]**

- Silently pull weather conditions at moment creation (temperature, conditions) via a weather API
- No permission required — uses device location already granted
- Unlocks a filter nobody else has: "your rainy day songs," "what you listened to during that cold stretch"
- Weirdly evocative; weather is deeply tied to emotional memory

### Apple Watch App **[Free]**

- One tap on the wrist → current Apple Music song logged instantly, no phone needed
- The 30-second window before you forget a feeling is real; Watch removes all friction
- Minimal UI: song detected, one "Save Moment" button, optional mood tap
- Full reflection added later from the phone (moment saved as draft)
- Lowest possible friction in the entire product

### Seasonal Pattern Anticipation **[Premium]**

- With enough data, proactively surface patterns before the user falls into them again
- "Last October you logged a lot of heavy music and your mood dipped. It's October."
- Turns the app from a rearview mirror into a windshield — using the past to serve the future
- Delivered as a gentle Reflections card or notification, never intrusive
- The shift from descriptive to predictive is what separates a journaling app from a personal intelligence layer

### "You're In A Transition" Detection **[Premium]**

- When logging patterns shift — new artists appearing, mood changes, more late-night moments, shorter reflections — the app notices
- "Something seems to be shifting for you lately." Soft in tone, sharp in insight
- No diagnosis, no advice — just observation, like a friend who's been paying attention
- Links to relevant past moments from similar transitions: "You've been through shifts like this before"
- Requires ~3 months of data to be meaningful; shows up as an occasional insight card

### Grief & Memorial Support **[Free]**

- Surface the use case explicitly: songs tied to people who have passed
- "Log a moment for someone you've lost — the song that makes you think of them."
- A dedicated moment type: memorial moment, with a person tag that can be marked as "in memory of"
- Surfaces these moments gently on significant dates (their birthday, anniversary of their passing)
- Nothing else in the app market serves this need directly; deeply human, generates real word-of-mouth

### Replay the Era

- From any Era detail view, generate an Apple Music playlist of the songs from that era
- One tap → playlist appears in Apple Music
- Hearing those songs again in sequence triggers the emotional time travel that is the whole point of the app
- Deep link via `music://` (no in-app playback needed)
- Pairs naturally with era clustering — makes eras feel alive, not just a data view

### Listening History Import

- Connect Apple Music and surface songs you played heavily in past months
- "You played this song 47 times in March 2024 — want to write about why?"
- Turns passive listening data into active reflection
- Great for onboarding — gives new users something to work with immediately

### Song Journeys

- A view showing every moment saved with a specific song or artist over time
- How your relationship with a song evolves
- First time you heard it → when it meant something different → when it came back around
- Visualize as a vertical timeline scoped to one song/artist

### Mood Streaks / Gentle Gamification

- Not aggressive streaks (those feel punishing)
- "You've reflected 4 days this week" or seasonal badges
- Monthly recaps: "You saved 12 moments in February"
- Keep it warm, not competitive — this is a journal, not a fitness app

### Calendar Heatmap

- GitHub-style contribution grid but for moments
- Color-coded by mood or intensity
- Tap any day to see what you saved
- Satisfying to see it fill up over months

### Moment Templates

- Pre-built templates: "concert", "road trip", "late night", "heartbreak", "discovery"
- Pre-fill mood suggestions, adjust form layout, offer tailored prompts
- Reduces friction for common moment types
- Users could create custom templates for their own patterns

---

## Lower Priority

Differentiating features that aren't urgent but could add unique value later.

### QR Codes on Moments

- Generate a QR code that links to the song (or to the moment itself if sharing is built)
- Print and put on a photo wall, stick in a physical journal, include in a gift
- Physical-digital bridge — appeals to the scrapbooking crowd

### Playlist Journals

- Create a playlist in the app where each song has a reflection attached
- Export the playlist to Apple Music, keep the journal in Tracks
- Great for "songs that got me through 2026" or "our road trip" type lists

### Handoff to Apple Music

- From any moment, one tap to start playing the full song in Apple Music
- Deep link via `music://` URL scheme — no need for in-app full playback
- Simple to implement, removes friction for users who want to hear the whole song

### Import from Notes / Day One

- A lot of people already write about music in Apple Notes or Day One
- Provide an import path — parse entries, match song references, create moments
- Good onboarding hook for journaling-app converts
