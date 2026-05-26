-- Spotify provider support
-- 1. Make song_apple_music_id nullable (Spotify songs won't have one)
ALTER TABLE moments ALTER COLUMN song_apple_music_id DROP NOT NULL;

-- 2. Add Spotify song ID column
ALTER TABLE moments ADD COLUMN IF NOT EXISTS song_spotify_id text;

-- 3. Add provider column (default 'apple_music' so existing rows stay correct)
ALTER TABLE moments ADD COLUMN IF NOT EXISTS song_provider text NOT NULL DEFAULT 'apple_music';

-- 4. Store provider preference on profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_music_provider text NOT NULL DEFAULT 'apple_music';
