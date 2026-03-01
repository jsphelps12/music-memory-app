# Music Memory Engine

> "What does 'Lady in Red' remind you of?"

The highest-leverage retention feature in Tracks. A weekly notification with a specific song — one the system has reason to believe is loaded with meaning for this exact person — that opens the create screen with that song pre-filled. No other journaling app can send this. Spotify knows you played it 47 times. Tracks knows why 4 of those times changed something.

---

## The Core Loop

```
birth year + country + favorite artists + genre prefs
  → formative era calculation
  → candidate song pool (curated dataset + Apple Music expansion)
  → score + rank (Phase 1–4 depending on data available)
  → filter already-logged and recently-prompted
  → pick 1 song/week
  → push: "What does '[Song]' remind you of?"
  → tap → create screen opens with that song pre-filled
  → user writes reflection → moment saved
  → song marked as prompted+logged; loop continues with richer signal
```

---

## Data Collection — Signup Questionnaire

Twitter-style onboarding: shown before the user sees the app, 3–4 short screens.

| Field | Type | Required | Notes |
|---|---|---|---|
| `birth_year` | int | Yes | Drives formative era calculation |
| `country` | text | Yes | Drives regional chart data |
| `favorite_artists` | jsonb[] | No | 1–2, Apple Music search; highest single signal |
| `favorite_songs` | jsonb[] | No | 1–2, Apple Music search; optional but powerful |
| `genre_preferences` | text[] | No | Multi-select chips; Rock / Pop / R&B / Hip-Hop / Country / Electronic / Latin / Jazz / Folk |

Keep it short. Birth year + country are required. Everything else is nudged but optional. All of this lives on the `profiles` table.

**Formative era:** The "reminiscence bump" is well-documented in music psychology — memory encoding for music peaks between ages 13–25. A user born in 1985 has their highest-yield zone at 1998–2010. This is the center of the Gaussian curve used in Phase 1 scoring.

---

## Data Model

```sql
-- Already on profiles (add these columns):
birth_year          int
country             text
favorite_artists    jsonb[]   -- [{ title, artist, apple_music_id }]
favorite_songs      jsonb[]   -- [{ title, artist, apple_music_id }]
genre_preferences   text[]

-- New table: the curated song dataset
CREATE TABLE suggested_songs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  artist              text NOT NULL,
  apple_music_id      text,             -- resolved via MusicKit; nullable until matched
  release_year        int NOT NULL,
  peak_chart_position int,              -- best chart position achieved (lower = more prominent)
  weeks_on_chart      int,              -- longevity signal
  chart_country       text,             -- US, UK, AU, GB, etc.
  genres              text[],           -- matches genre_preferences values
  cultural_weight     float,            -- derived: (1/peak_position) × log(weeks_on_chart + 1)
  is_universal        bool DEFAULT false -- true = served to everyone regardless of profile (Bohemian Rhapsody tier)
);

-- New table: tracks what was prompted to each user
CREATE TABLE prompted_songs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  song_id       uuid REFERENCES suggested_songs(id),
  prompted_at   timestamptz DEFAULT now(),
  tapped        bool DEFAULT false,   -- did the user tap the notification?
  logged        bool DEFAULT false,   -- did the tap result in a saved moment?
  UNIQUE (user_id, song_id)           -- never re-prompt the same song
);
```

---

## The Song Dataset

### Why 500 isn't enough

500 songs across 60 years of music (1960–2020), 4+ generations, multiple countries = ~8 songs per year globally. Users who log weekly would exhaust unique prompts within a year. Realistic targets:

- **2,000–3,000** — solid US/UK/AU coverage, all generations
- **5,000–10,000** — meaningful international coverage (Latin America, Europe, Asia)
- **Universal tier (~100 songs)** — cross-generational, cross-genre songs served to nearly everyone regardless of profile; "Bohemian Rhapsody," "Purple Rain," "Billie Jean," "Dancing Queen," "Smells Like Teen Spirit," etc.

### Where the data comes from

**Don't manually curate all of it.** Historical chart data is public and does most of the work:

| Source | Coverage | Notes |
|---|---|---|
| Billboard Hot 100 | US, 1958–present | Multiple GitHub repos with full dataset |
| UK Singles Chart | UK, 1952–present | Publicly scraped/available |
| ARIA Charts | Australia, 1983–present | Available |
| Last.fm API | Country-level charts + genre tags | Free tier; useful for enrichment |
| MusicBrainz | Open music DB, extensive metadata | Good for genre tagging |

**Import pipeline:**
1. Pull chart data for target years + countries (filter to top 40 charting songs minimum)
2. Calculate `cultural_weight = (1 / peak_position) × log(weeks_on_chart + 1)`
3. Resolve Apple Music IDs via MusicKit search (artist + title string matching) — gets ~85–90% automatically; remainder needs manual cleanup
4. Tag genres using MusicBrainz or Last.fm API
5. Flag universal tier songs manually (~100 songs, worth the hand-curation)

The Apple Music ID matching is the most tedious part of Phase 1 — Billboard gives you strings, MusicKit search has fuzzy matching variance. Expect to spend meaningful time here.

### The universal tier

Some songs transcend generation and genre. They should have `is_universal = true` and get served to everyone with high probability regardless of profile matching. These are songs where human emotional memory is virtually guaranteed regardless of taste:

- Defined by: cultural ubiquity + high emotional weight + cross-generational recognition
- Examples vary by region but the principle is universal
- Roughly 50–100 songs globally
- Seed these first before importing chart data — they're the baseline quality guarantee

---

## The Algorithm — Four Phases

### Phase 1: Rule-Based Scoring (cold start, day 1)

No ML. Pure deterministic scoring. Works immediately with just questionnaire answers.

```
score(song, user) =
  era_weight(song.release_year, user.birth_year)
  × country_weight(song.chart_country, user.country)
  × genre_weight(song.genres, user.genre_preferences)
  × artist_affinity(song.artist, user.favorite_artists)
  × cultural_weight_boost(song.cultural_weight)
  × (0 if already logged or prompted in last 90 days)
```

**Era weight — Gaussian curve:**
```
era_weight = exp(-((song.release_year - (birth_year + 18))^2) / (2 × σ^2))
σ = 7  ← standard deviation of ~7 years on each side
```
Peaks at birth_year + 18 (age 18 = center of reminiscence bump). A user born in 1985 gets maximum score for songs from ~2003, tapering symmetrically toward 1996 and 2010. Songs outside ±20 years still score above zero — you want the tail to exist.

**Country weight:**
```
1.0  — exact country match
0.8  — English-speaking market (US/UK/AU/CA cross-coverage)
0.5  — same region (Latin America, Europe)
0.3  — global (no regional chart data)
```

**Genre weight:**
Cosine similarity between `song.genres` vector and `user.genre_preferences` vector. Songs with no genre overlap still score above zero — genre is a weight, not a filter.

**Artist affinity:**
```
1.5× — song.artist matches a favorite_artist exactly
1.3× — song.artist is "related" to a favorite_artist (Apple Music related artists)
1.0× — no match (no penalty)
```

**Why charts matter here:**
Without chart data, you're guessing at cultural prominence. With chart data, `cultural_weight` is an objective measure derived from actual listening behavior of an era. Songs that dominated the charts for months have earned their weight — they were unavoidable, which means everyone has a relationship with them whether they sought them out or not.

**Explore arm:**
1 in every 4–5 prompted songs is drawn from outside the user's calculated profile on purpose. Emotional memory doesn't respect genre boundaries. Someone born in 1985 who loves hip-hop might have their deepest memory tied to a country song because their grandmother played it. The explore arm finds those. When a user logs an out-of-profile song, it becomes the highest-value signal in the system.

---

### Phase 2: Content-Based Filtering / VSM (build at ~50–100 users)

VSM = Vector Space Model. Each song is a document; features are the terms; user preference is the query vector.

**Song vector:**
```
song_vector = [
  year_normalized,           -- (release_year - 1950) / 80
  genre_one_hot[],           -- 9-dim binary vector
  country_one_hot[],         -- top-N countries one-hot
  cultural_weight_normalized -- 0 to 1
]
```

**User preference vector:**
Built from their logged moments. Each logged song contributes its song_vector to the user vector, weighted by TF-IDF logic: rare genre preferences get higher weight than common ones (same math as document retrieval — a user who frequently logs jazz is more meaningfully defined by that than a user who logs one pop song among many pops).

```python
user_vector = Σ (song_vector_i × idf_weight_i) for each logged moment i
user_vector = user_vector / ||user_vector||  # normalize
```

**Ranking:**
```
cosine_similarity(user_vector, song_vector) =
  (user_vector · song_vector) / (||user_vector|| × ||song_vector||)
```

Higher cosine similarity = better candidate. Re-ranks the Phase 1 candidate pool with learned preference signal.

**Infrastructure:** pgvector in Supabase handles this natively. No Pinecone, no external ML service. Store `song_vector` and `user_preference_vector` as `vector(N)` columns; cosine similarity is a single SQL operator.

---

### Phase 3: Collaborative Filtering (build at ~500–1,000 users)

Where the system starts to feel genuinely intelligent.

**The idea:** Find users with similar profiles (birth year, country, genre, logging patterns). Songs they've logged that the current user hasn't = candidate recommendations. This is item-based CF at its simplest — and it's how you find the cross-genre emotional connections that no rule-based system can discover.

**User × song affinity matrix:**
```
M[user_id][song_id] = 1 if logged, 0 if not (or confidence-weighted)
```

**SVD factorization:**
```
M ≈ U × Σ × V^T
```
Decomposes into latent feature space. Users with similar latent vectors (U rows) are surfaced as neighbors. Their high-affinity songs (V columns) that the current user hasn't seen become recommendations.

**Handling sparsity:**
Most users haven't logged songs from the curated dataset directly — they've logged their own songs. Use implicit feedback: if a user logged "Wonderwall," treat all Oasis songs in the dataset as soft-positive signals even if they never explicitly logged a dataset entry. Bridge their moment history to the dataset via artist/genre similarity.

**Cold songs:** Songs in the dataset with no CF signal yet fall back to Phase 1 scoring. As more users log moments, CF signal accumulates on more songs.

**Starting simpler:** Before SVD, start with item-based CF (no matrix factorization):
- "Users who logged Song A also logged Song B" — direct co-occurrence counting
- Cheaper to compute, interpretable, good enough at ~500 users
- Upgrade to SVD when item-based CF becomes noisy at scale

---

### Phase 4: Hybrid + Contextual Bandits (build at ~5,000 users)

**The hybrid blend:**
```
final_score = α × CF_score + (1 - α) × CBF_score

α = min(moments_logged / 50, 1.0)
```
New users (0 moments): α = 0, rely entirely on content-based. At 50 moments, CF contributes equally. At 100+, CF dominates. The blend shifts automatically as data accumulates — no manual tuning needed.

Same pattern inside the content-based layer:
```
CBF_score = β × VSM_score + (1 - β) × rule_score
β = min(moments_logged / 20, 1.0)
```

**Contextual bandits:**
Sits above all scoring. Given the top-N candidates from the hybrid scorer, the bandit learns *which* song to actually send based on engagement history for this user.

- State: user features + candidate song features
- Action: pick one song from top-N
- Reward: 1.0 if tap → moment created, 0.5 if tap → no moment, 0.0 if not tapped

Uses epsilon-greedy or Thompson Sampling (Thompson is better). Over time it learns: "this user responds to songs from 1998–2002 with high reward; songs from 1985–1990 get low reward even though the scorer ranks them well." It corrects for systematic errors in the underlying model.

**The full pipeline:**
```
Phase 1 (rule-based)   → broad candidate pool, any user
Phase 2 (VSM)          → re-rank by logged preference vector
Phase 3 (CF)           → inject cross-genre discoveries
Phase 4 (bandit)       → select final song based on engagement history
```

---

## Difficulty Estimate

| Phase | Core work | Hardest part | Effort | When |
|---|---|---|---|---|
| 1 | Chart import, scoring fn, Edge Function, push notification | Apple Music ID resolution (~15% manual cleanup) | 2–3 weeks | Now |
| 2 | pgvector setup, song/user vectors, cosine similarity ranking | Engineering TF-IDF weighting correctly | 1–2 weeks | 50–100 users |
| 3 | Affinity matrix, item-based CF → SVD | Sparsity handling, implicit feedback bridge | 3–4 weeks | 500–1,000 users |
| 4 | Score blending, bandit policy, reward tracking | Bandit implementation + A/B infra | 4–6 weeks | 5,000+ users |

**Phase 1 is a weekend of algorithm work + a week of data wrangling.** That's already a differentiated product. Every subsequent phase is independently shippable — users notice the improvement publicly, which is itself a product narrative.

**The moat:** Spotify can recommend songs based on play counts and audio features. They cannot recommend based on whether "Lady in Red" was playing at your parents' wedding. That annotation — the emotional tag, the reflection, the moment — is what makes this system fundamentally different and impossible to replicate without the data. The more moments users log, the better the engine gets for everyone. Data compounds.

---

## Notification Design

**Format:**
```
"What does '[Song Title]' remind you of?"
```
Tapping opens the create screen with that song pre-filled — search result loaded, ready to write.

**Cadence:** Once per week. Never daily. Max 1 notification per day (coalescing rule: On This Day > streak at risk > prompted song > text prompt).

**Tracking:** Every notification records `prompted_at` in `prompted_songs`. `tapped` and `logged` updated via deep link handling and moment save event. This data feeds Phase 4.

---

## Infrastructure Notes

- All computation runs in **Supabase Edge Functions** (Deno) — no external ML service needed through Phase 3
- **pgvector** extension (built into Supabase) handles Phase 2 vector storage and cosine similarity
- **pg_cron** schedules the weekly notification job — runs Sunday evening, queries per-user scores, batches push tokens, calls Expo Push Notifications API
- Phase 3 SVD can be computed in a scheduled Edge Function for small user bases; at scale, consider a lightweight Python job (Modal, Fly.io) that writes results back to Supabase
- Push tokens stored on `profiles.expo_push_token`; notification preferences on `profiles.notification_preferences jsonb`
