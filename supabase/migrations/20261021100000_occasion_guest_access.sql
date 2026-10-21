-- Occasions P1.2: what a guest's page can see, and rate-limit support.
--
-- Guests have no session and occasions have no anon read policy. The guest
-- page (/for/{slug}) reads through this one function, which returns only
-- what a guest needs: never ids of people, the host, Stripe fields, or the
-- keepsake token unless the keepsake is revealed and shared with guests.

-- A hash of the guest's address, for rate limits only (venue wifi puts a
-- whole wedding behind one address, so limits on it are loose). It is not
-- secret-salted, so it must never be readable by clients: see the column
-- grants below.
ALTER TABLE public.occasion_entries
  ADD COLUMN IF NOT EXISTS ip_hash text CHECK (ip_hash IS NULL OR char_length(ip_hash) = 64);

-- The edit token is made on the guest's phone and doubles as the idempotency
-- key: a retry after a lost response carries the same token, so it finds the
-- entry it already made instead of creating a second one.
CREATE UNIQUE INDEX IF NOT EXISTS occasion_entries_edit_token_idx
  ON public.occasion_entries (edit_token_hash);

-- Hosts read entries column by column. What only the server needs (rate-limit
-- hashes, the edit token's hash) and what guests gave only to us (email)
-- stays out of reach of every client.
REVOKE SELECT ON public.occasion_entries FROM authenticated;
GRANT SELECT (id, occasion_id, guest_name, words, song_apple_id, song_title, song_artist,
              song_album, song_artwork_url, song_preview_url, photo_source, photo_path,
              gallery_photo_id, hidden, created_at, updated_at)
  ON public.occasion_entries TO authenticated;

CREATE INDEX IF NOT EXISTS occasion_entries_device_recent_idx
  ON public.occasion_entries (occasion_id, device_id, created_at)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS occasion_entries_ip_recent_idx
  ON public.occasion_entries (occasion_id, ip_hash, created_at)
  WHERE ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_occasion_for_guests(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'slug', o.slug,
    'names', o.names,
    'eventDate', o.event_date,
    'city', o.city,
    'status', o.status,
    'accepting', o.status = 'collecting'
                 AND (o.collect_closes_at IS NULL OR now() < o.collect_closes_at),
    'suggestedSongs', o.suggested_songs,
    'bookToken', CASE WHEN o.status = 'revealed' AND o.share_book_with_guests
                      THEN o.book_token END
  )
  FROM public.occasions o
  WHERE o.slug = lower(p_slug)
    AND o.status <> 'draft';
$$;

REVOKE ALL ON FUNCTION public.get_occasion_for_guests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occasion_for_guests(text) TO anon, authenticated;
