-- Add guest attribution columns to moments
ALTER TABLE moments ADD COLUMN guest_name text;
ALTER TABLE moments ADD COLUMN guest_uuid text;

-- Add guest user ID and events tier flag to collections
ALTER TABLE collections ADD COLUMN guest_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE collections ADD COLUMN events_tier_unlocked boolean NOT NULL DEFAULT true;
