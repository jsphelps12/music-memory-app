-- Occasions P1.2: what a guest's page can see, and rate-limit support.
--
-- Guests have no session and occasions have no anon read policy. The guest
-- page (/for/{slug}) reads through this one function, which returns only
-- what a guest needs: never ids of people, the host, Stripe fields, or the
-- keepsake token unless the keepsake is revealed and shared with guests.

-- A salted hash of the guest's IP per occasion, for rate limits only (venue
-- wifi puts a whole wedding behind one address, so limits on it are loose).
ALTER TABLE public.occasion_entries
  ADD COLUMN IF NOT EXISTS ip_hash text CHECK (ip_hash IS NULL OR char_length(ip_hash) = 64);

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
