# Tracks — AI/ML Feature Ideas

Potential AI/ML features organized by value and complexity. The unique dataset — music + mood + free-text reflection + people + time — is what makes these features genuinely interesting rather than gimmicky. Most music apps have listening data. Tracks has *meaning* data.

---

## Build First

High value, strong resume signal, and realistic scope. These are the priority.

### 1. Sentiment Analysis on Reflections

Run NLP on reflection text to extract sentiment, emotions, and themes beyond the single mood tag the user selects.

- Compare detected sentiment vs. selected mood — "your reflections suggest melancholy even when you tag 'joyful'"
- Surface emotional themes: processing loss, celebrating growth, feeling stuck
- Could use Apple's on-device `NaturalLanguage` framework for privacy-first approach, or Claude/OpenAI API for richer analysis
- **Resume angle**: on-device ML, NLP pipeline, privacy-conscious architecture
- **Premium value**: powers the insights dashboard, makes the app feel like it "understands" you

### 2. AI-Generated Recaps

Monthly/weekly narrative summaries synthesized from reflections, moods, and music patterns.

- "This week you were in a reflective mood, gravitating toward Bon Iver and Phoebe Bridgers. Your reflections centered on change and letting go."
- Yearly recap in the style of Spotify Wrapped but emotionally rich — "Your 2026 in Moments"
- Use Claude API to synthesize reflections + mood + music into a narrative
- **Resume angle**: LLM integration, prompt engineering, structured data → narrative generation
- **Premium value**: highest "wow" factor, most shareable, clearest reason to pay

### 3. Mood Prediction from Song Features

Given a song's audio features (tempo, key, energy, valence), predict what mood the user will tag.

- Pre-fill the mood selector — "Based on this song, you usually feel nostalgic"
- Train a simple classifier on the user's own data (personalized model)
- Cold start: use general associations until enough data accumulates (~20-30 moments)
- Pull audio features from Apple Music catalog metadata or iTunes API
- **Resume angle**: per-user ML model, cold start problem, incremental learning
- **Premium value**: makes logging faster, app feels personalized

---

## Analytically Interesting

Features that turn the dataset into insights. Best suited for a premium insights dashboard.

### Musical Taste Evolution

- Track how genre, tempo, energy, and valence shift over months
- Visualize as a timeline — "You shifted from high-energy pop to ambient in Q3"
- Correlate with mood patterns — does the music shift before or after the mood shifts?
- Pull audio features from Apple Music catalog metadata

### Era Detection / Life Chapter Clustering

- Cluster moments by time period, mood patterns, musical features, and reflection themes
- Auto-detect "eras" and generate names — "Your indie folk healing era (March-June 2026)"
- K-means or DBSCAN on feature vectors (mood, genre, tempo, sentiment, time gaps)
- **Resume angle**: unsupervised learning, feature engineering, real-world clustering

### Relationship Soundtracks

- For each tagged person, analyze what music you associate with them
- "Songs with Sarah are 80% nostalgic, mostly acoustic"
- Generate an exportable playlist from moments tagged with a specific person
- TF-IDF on reflections per person to find distinctive themes

### Pattern Recognition & Nudges

- "You log 3x more on weekends"
- "When you tag 'melancholy', you follow up with 'hopeful' within a week 70% of the time"
- "You haven't logged in 5 days — last time this happened you were in a low period"
- Time series analysis, simple association rules

---

## Fun & Differentiating

Features that make the app feel alive and distinct from anything else out there.

### Smart Resurfacing

- Instead of random "On This Day", use context: current mood, time of day, recent listening patterns
- "You're in a similar headspace to last October — here's what you were listening to"
- Cosine similarity between current context vector and historical moments
- **Resume angle**: recommendation system, contextual retrieval

### Reflection Prompts

- After selecting a song, generate a tailored prompt using their history
- "You've saved 3 moments with this artist before — what's different this time?"
- "This song has a similar vibe to one you saved during a tough week in March. What's the connection?"
- Context-aware prompting that deepens the journaling experience

---

## Song Recommendations

The key differentiator: Tracks doesn't recommend based on what you *listen to* (Spotify already does that). It recommends based on what music *means to you* — your moods, reflections, people, and life context.

### Mood-Based Discovery

- "You're feeling nostalgic — here are songs other users saved with that mood" (requires anonymous aggregate data) or "here are songs with similar audio features to your nostalgic moments"
- Pull Apple Music catalog songs with matching valence/energy/tempo profiles to songs the user has tagged with a given mood
- More personal than Spotify's mood playlists because it's calibrated to *their* definition of nostalgic, not a generic one
- **Resume angle**: content-based filtering, audio feature similarity

### "More Like This Moment"

- From any saved moment, recommend songs that are sonically or emotionally similar
- Build a feature vector per moment: audio features + mood + sentiment from reflection + time of day
- Find nearest neighbors in Apple Music's catalog using those features
- "Songs that feel like that road trip with Alex" — no other app can do this
- **Resume angle**: hybrid recommendation system, feature vector design, nearest neighbor search

### Era Playlists

- Once eras are detected (see Era Detection above), auto-generate a playlist that captures each era
- Include songs the user saved + recommended songs that fit the era's profile
- "Your summer 2026 playlist" — mix of their moments + discoveries
- Export to Apple Music as a playlist

### People-Based Recommendations

- "Songs for time with Sarah" — based on the musical profile of moments tagged with that person
- Find patterns: acoustic + peaceful when with one person, energetic + joyful with another
- Recommend new songs that match each person's musical fingerprint
- Could power a "date night playlist" or "road trip with [person]" generator

### Rediscovery

- Surface artists/songs the user used to save frequently but stopped
- "You saved 5 moments with Bon Iver between March-August, then nothing — want to revisit?"
- Simple: track artist frequency over time windows, flag significant drop-offs
- Pairs well with smart resurfacing — bring back a forgotten moment alongside the recommendation

### Implementation Notes

- Apple Music's catalog API provides genre, tempo, and basic attributes — may need to supplement with iTunes Search API or audio feature estimation
- Start simple: content-based filtering using audio features + mood tags. Collaborative filtering (cross-user) requires meaningful user base
- Cold start: need ~15-20 moments before recommendations are useful. Before that, fall back to genre/mood-based suggestions from catalog
- Playlist export via MusicKit's `MusicLibrary.shared.add()` — can create Apple Music playlists directly from the app

---

## Technical Considerations

| Approach | Pros | Cons |
|----------|------|------|
| On-device (Core ML / NaturalLanguage) | Privacy-first, no API costs, works offline | Limited model capability, harder to iterate |
| Cloud API (Claude / OpenAI) | Richer analysis, easier to build, better narratives | API costs scale with users, requires network, privacy concerns |
| Hybrid | Best of both — on-device for real-time, cloud for deep analysis | More complexity to maintain |

**Recommendation**: Start with cloud (Claude API) for recaps and prompts where quality matters. Use on-device for sentiment analysis where latency and privacy matter. Move more on-device over time as Core ML models improve.

**Data privacy**: All ML features should be opt-in for premium users. Reflections are deeply personal — be transparent about what gets sent to an API vs. processed on-device.
