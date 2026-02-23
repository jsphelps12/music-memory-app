# Tracks — Feature Ideas

Non-AI feature ideas organized by conviction level. See `AI-FEATURES.md` for AI/ML-specific features.

---

## High Conviction

Features that would meaningfully increase retention, engagement, or organic growth.

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
