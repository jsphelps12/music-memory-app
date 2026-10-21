-- Occasions, P1 foundation (spec: docs/OCCASIONS.md).
--
-- A guest book that plays: guests leave moments (song, photo, words, name)
-- for a couple; the couple keeps them. Separate from personal albums.
--
-- Who writes what:
--   * Hosts (the couple, signed in) create and edit their occasion's details,
--     hide entries, and manage their gallery. Columns that money or the
--     lifecycle depend on (status, paid_at, Stripe ids, book_token, slug) are
--     not writable by clients at all: column grants below, not just RLS.
--   * Guests never get a session. Their entries arrive through an edge
--     function using the service role, which validates and rate-limits.
--   * Nothing is readable by anon. The keepsake page is server-rendered and
--     checks book_token with the service role.
--
-- Physical orders (occasion_orders) come with P2, in their own migration.

-- 1. Occasions -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.occasions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'wedding' CHECK (kind IN ('wedding')),
  host_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  co_host_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  names text NOT NULL CHECK (char_length(btrim(names)) BETWEEN 1 AND 120),
  event_date date NOT NULL,
  city text CHECK (city IS NULL OR char_length(city) <= 120),
  time_zone text NOT NULL DEFAULT 'America/New_York' CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  guest_estimate integer CHECK (guest_estimate IS NULL OR guest_estimate BETWEEN 1 AND 2000),
  -- /for/{slug}: readable, lowercase words joined by hyphens.
  slug text NOT NULL UNIQUE
    CHECK (char_length(slug) BETWEEN 3 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- The unlisted keepsake link. 122 random bits, server-generated.
  book_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'collecting', 'curating', 'revealed')),
  -- "Just us" switch: false hides the keepsake from guests (decided: shared by default).
  share_book_with_guests boolean NOT NULL DEFAULT true,
  collect_closes_at timestamptz,
  revealed_at timestamptz,
  -- [{appleMusicId, title, artist, artworkUrl, previewUrl}], 0 to 6 of them.
  suggested_songs jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(suggested_songs) = 'array' AND jsonb_array_length(suggested_songs) <= 6),
  paid_at timestamptz,
  stripe_checkout_id text UNIQUE,
  reservation_id uuid REFERENCES public.wedding_reservations (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (co_host_user_id IS NULL OR co_host_user_id <> host_user_id),
  -- Only a paid occasion leaves draft.
  CHECK (status = 'draft' OR paid_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS occasions_host_idx ON public.occasions (host_user_id);
CREATE INDEX IF NOT EXISTS occasions_co_host_idx ON public.occasions (co_host_user_id)
  WHERE co_host_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS occasions_event_date_idx ON public.occasions (event_date);

DROP TRIGGER IF EXISTS occasions_updated_at ON public.occasions;
CREATE TRIGGER occasions_updated_at BEFORE UPDATE ON public.occasions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Hosts are the host and the co-host. Used by every policy below, so the
-- check lives in one place. SECURITY DEFINER so policies on the child tables
-- don't depend on occasions' own policies.
CREATE OR REPLACE FUNCTION public.is_occasion_host(p_occasion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.occasions
    WHERE id = p_occasion_id
      AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_occasion_host(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_occasion_host(uuid) TO authenticated;

-- The same check for a storage folder name. Takes text and compares text, so
-- a policy on storage.objects never casts an arbitrary object name (that
-- would throw for every other bucket's objects).
CREATE OR REPLACE FUNCTION public.is_occasion_host_folder(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.occasions
    WHERE id::text = p_folder
      AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_occasion_host_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_occasion_host_folder(text) TO authenticated;

-- 2. Gallery (the couple's photographer photos; fills song-only entries) ---

CREATE TABLE IF NOT EXISTS public.occasion_gallery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occasion_id uuid NOT NULL REFERENCES public.occasions (id) ON DELETE CASCADE,
  -- occasion-photos/{occasion_id}/gallery/{id}.jpg
  path text NOT NULL UNIQUE,
  taken_at timestamptz,          -- EXIF capture time, for matching to entries
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, occasion_id),
  CHECK (split_part(path, '/', 1) = occasion_id::text AND split_part(path, '/', 2) = 'gallery')
);

CREATE INDEX IF NOT EXISTS occasion_gallery_photos_time_idx
  ON public.occasion_gallery_photos (occasion_id, taken_at);

-- 3. Entries (a guest's moment) -------------------------------------------

CREATE TABLE IF NOT EXISTS public.occasion_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occasion_id uuid NOT NULL REFERENCES public.occasions (id) ON DELETE CASCADE,
  -- Printed exactly as typed (decided); the form suggests "First and last".
  guest_name text NOT NULL CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 80),
  words text CHECK (words IS NULL OR char_length(words) <= 2000),
  song_apple_id text NOT NULL CHECK (char_length(song_apple_id) BETWEEN 1 AND 32),
  song_title text NOT NULL CHECK (char_length(song_title) BETWEEN 1 AND 300),
  song_artist text NOT NULL CHECK (char_length(song_artist) BETWEEN 1 AND 300),
  song_album text CHECK (song_album IS NULL OR char_length(song_album) <= 300),
  song_artwork_url text CHECK (song_artwork_url IS NULL OR song_artwork_url LIKE 'https://%'),
  song_preview_url text CHECK (song_preview_url IS NULL OR song_preview_url LIKE 'https://%'),
  -- A guest's own photo, or one from the couple's gallery (never both).
  photo_source text CHECK (photo_source IN ('guest', 'gallery')),
  photo_path text,               -- occasion-photos/{occasion_id}/entries/{id}.jpg
  gallery_photo_id uuid,
  -- Lets the guest add a photo later from the same phone or the reminder
  -- link. Only the hash is stored.
  edit_token_hash text NOT NULL CHECK (char_length(edit_token_hash) = 64),
  device_id text CHECK (device_id IS NULL OR char_length(device_id) <= 64),
  guest_email text CHECK (guest_email IS NULL OR (char_length(guest_email) BETWEEN 3 AND 320 AND guest_email LIKE '%_@_%')),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),   -- when the guest added it; gallery matching uses it
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (photo_source IS NULL AND photo_path IS NULL AND gallery_photo_id IS NULL)
    OR (photo_source = 'guest' AND photo_path IS NOT NULL AND gallery_photo_id IS NULL
        AND split_part(photo_path, '/', 1) = occasion_id::text
        AND split_part(photo_path, '/', 2) = 'entries')
    OR (photo_source = 'gallery' AND gallery_photo_id IS NOT NULL AND photo_path IS NULL)
  ),
  -- A gallery photo can only fill an entry of the same occasion.
  FOREIGN KEY (gallery_photo_id, occasion_id)
    REFERENCES public.occasion_gallery_photos (id, occasion_id)
);

CREATE INDEX IF NOT EXISTS occasion_entries_occasion_idx
  ON public.occasion_entries (occasion_id, created_at);
CREATE INDEX IF NOT EXISTS occasion_entries_gallery_idx
  ON public.occasion_entries (gallery_photo_id) WHERE gallery_photo_id IS NOT NULL;

-- Removing a gallery photo puts the entries it filled back to song-only,
-- instead of failing on the foreign key.
CREATE OR REPLACE FUNCTION public.release_gallery_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.occasion_entries
     SET photo_source = NULL, gallery_photo_id = NULL
   WHERE gallery_photo_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.release_gallery_photo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS occasion_gallery_photos_release ON public.occasion_gallery_photos;
CREATE TRIGGER occasion_gallery_photos_release BEFORE DELETE ON public.occasion_gallery_photos
  FOR EACH ROW EXECUTE FUNCTION public.release_gallery_photo();

DROP TRIGGER IF EXISTS occasion_entries_updated_at ON public.occasion_entries;
CREATE TRIGGER occasion_entries_updated_at BEFORE UPDATE ON public.occasion_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Row level security ----------------------------------------------------

ALTER TABLE public.occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_gallery_photos ENABLE ROW LEVEL SECURITY;

-- Start from nothing for client roles, then grant exactly what hosts need.
REVOKE ALL ON public.occasions, public.occasion_entries, public.occasion_gallery_photos
  FROM anon, authenticated;

-- occasions: hosts read, create drafts, edit details, delete.
GRANT SELECT, DELETE ON public.occasions TO authenticated;
GRANT INSERT (kind, host_user_id, names, event_date, city, time_zone, guest_estimate,
              slug, suggested_songs, share_book_with_guests)
  ON public.occasions TO authenticated;
GRANT UPDATE (names, event_date, city, time_zone, guest_estimate, suggested_songs,
              share_book_with_guests)
  ON public.occasions TO authenticated;

DROP POLICY IF EXISTS "Hosts read their occasions" ON public.occasions;
CREATE POLICY "Hosts read their occasions" ON public.occasions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (host_user_id, co_host_user_id));

DROP POLICY IF EXISTS "Hosts create draft occasions" ON public.occasions;
CREATE POLICY "Hosts create draft occasions" ON public.occasions
  FOR INSERT TO authenticated
  WITH CHECK (host_user_id = (SELECT auth.uid()) AND status = 'draft' AND paid_at IS NULL);

DROP POLICY IF EXISTS "Hosts edit their occasions" ON public.occasions;
CREATE POLICY "Hosts edit their occasions" ON public.occasions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IN (host_user_id, co_host_user_id))
  WITH CHECK ((SELECT auth.uid()) IN (host_user_id, co_host_user_id));

-- Only the host who created it can delete it (and only an unpaid draft;
-- a paid occasion is deleted through support so photos and refunds are
-- handled together).
DROP POLICY IF EXISTS "Hosts delete their drafts" ON public.occasions;
CREATE POLICY "Hosts delete their drafts" ON public.occasions
  FOR DELETE TO authenticated
  USING (host_user_id = (SELECT auth.uid()) AND paid_at IS NULL);

-- occasion_entries: hosts read and hide/unhide, and assign gallery photos.
-- Guests' inserts and photo updates come only through the service role.
GRANT SELECT ON public.occasion_entries TO authenticated;
GRANT UPDATE (hidden, photo_source, gallery_photo_id) ON public.occasion_entries TO authenticated;

DROP POLICY IF EXISTS "Hosts read entries" ON public.occasion_entries;
CREATE POLICY "Hosts read entries" ON public.occasion_entries
  FOR SELECT TO authenticated
  USING (public.is_occasion_host(occasion_id));

DROP POLICY IF EXISTS "Hosts curate entries" ON public.occasion_entries;
CREATE POLICY "Hosts curate entries" ON public.occasion_entries
  FOR UPDATE TO authenticated
  USING (public.is_occasion_host(occasion_id))
  WITH CHECK (public.is_occasion_host(occasion_id));

-- occasion_gallery_photos: hosts manage their gallery.
GRANT SELECT, DELETE ON public.occasion_gallery_photos TO authenticated;
GRANT INSERT (occasion_id, path, taken_at, width, height) ON public.occasion_gallery_photos TO authenticated;

DROP POLICY IF EXISTS "Hosts read gallery" ON public.occasion_gallery_photos;
CREATE POLICY "Hosts read gallery" ON public.occasion_gallery_photos
  FOR SELECT TO authenticated
  USING (public.is_occasion_host(occasion_id));

DROP POLICY IF EXISTS "Hosts add to gallery" ON public.occasion_gallery_photos;
CREATE POLICY "Hosts add to gallery" ON public.occasion_gallery_photos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_occasion_host(occasion_id));

DROP POLICY IF EXISTS "Hosts remove from gallery" ON public.occasion_gallery_photos;
CREATE POLICY "Hosts remove from gallery" ON public.occasion_gallery_photos
  FOR DELETE TO authenticated
  USING (public.is_occasion_host(occasion_id));

-- 5. Storage: a private bucket --------------------------------------------
-- occasion-photos/{occasion_id}/entries/{entry_id}.jpg  (guests, via service role)
-- occasion-photos/{occasion_id}/gallery/{photo_id}.jpg  (hosts)
-- Served only by short-lived signed URLs; there is no public read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('occasion-photos', 'occasion-photos', false, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Hosts read their occasion photos" ON storage.objects;
CREATE POLICY "Hosts read their occasion photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'occasion-photos'
    AND public.is_occasion_host_folder((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Hosts upload gallery photos" ON storage.objects;
CREATE POLICY "Hosts upload gallery photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'occasion-photos'
    AND (storage.foldername(name))[2] = 'gallery'
    AND public.is_occasion_host_folder((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Hosts delete gallery photos" ON storage.objects;
CREATE POLICY "Hosts delete gallery photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'occasion-photos'
    AND (storage.foldername(name))[2] = 'gallery'
    AND public.is_occasion_host_folder((storage.foldername(name))[1])
  );
