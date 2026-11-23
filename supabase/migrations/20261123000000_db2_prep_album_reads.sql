-- DB-2 prep: the last two reads of other people's moments straight from the
-- table get their own functions, so DB-2 (moments owner-only,
-- 20261122000000 on db/db-2) can apply without breaking them.
--
--   get_album_artworks        the app's album covers (lib/albums.ts
--                             fetchAlbumArtworks): up to four song artworks
--                             per album, for albums you own, have joined, or
--                             were invited to and haven't answered.
--   get_public_album_moments  the web album pages (/c/[invite_code], its
--                             contribute hub and the hub's polling route),
--                             signed out, by invite code.
--
-- Each returns only what its screen shows: no GPS, people, share token,
-- capture source or reflection-owner details beyond what the page already
-- printed. Additive and idempotent; nothing existing changes, and old app
-- builds and the current web keep reading the way they do until they move.

-- 1. Album covers in the app.
CREATE OR REPLACE FUNCTION public.get_album_artworks(p_collection_ids uuid[])
RETURNS TABLE (collection_id uuid, artwork_urls text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH allowed AS (
    SELECT c.id
      FROM public.collections c
     WHERE c.id = ANY (p_collection_ids[1:200])
       AND (
         c.user_id = (SELECT auth.uid())
         OR EXISTS (
           SELECT 1 FROM public.collection_members mb
            WHERE mb.collection_id = c.id AND mb.user_id = (SELECT auth.uid())
         )
         -- The invite card's cover: only while the invite is open and the
         -- album is still shared.
         OR (
           c.is_public = true
           AND EXISTS (
             SELECT 1 FROM public.collection_friend_invites i
              WHERE i.collection_id = c.id
                AND i.to_user = (SELECT auth.uid())
                AND i.status = 'pending'
           )
         )
       )
  ),
  per_url AS (
    SELECT cm.collection_id, m.song_artwork_url AS url, max(cm.added_at) AS last_added
      FROM allowed a
      JOIN public.collection_moments cm ON cm.collection_id = a.id
      JOIN public.moments m ON m.id = cm.moment_id
     WHERE m.song_artwork_url IS NOT NULL AND m.song_artwork_url <> ''
     GROUP BY cm.collection_id, m.song_artwork_url
  ),
  ranked AS (
    SELECT p.collection_id, p.url,
           row_number() OVER (PARTITION BY p.collection_id ORDER BY p.last_added DESC, p.url) AS rn
      FROM per_url p
  )
  -- Newest-added first, each artwork once, four per album.
  SELECT r.collection_id, array_agg(r.url ORDER BY r.rn)
    FROM ranked r
   WHERE r.rn <= 4
   GROUP BY r.collection_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_album_artworks(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_album_artworks(uuid[]) TO authenticated;

-- 2. The web album pages. The invite code is the album's public address;
--    only a shared album answers. The contributor's name is worked out here
--    (a guest's own name, else the adder's display name, else null for the
--    page's fallback), so the page needs no profile read and never sees a
--    guest's id.
CREATE OR REPLACE FUNCTION public.get_public_album_moments(
  p_invite_code text,
  p_after timestamptz DEFAULT NULL,
  p_oldest_first boolean DEFAULT true
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'added_at', cm.added_at,
           'contributor_name',
             CASE WHEN m.guest_uuid IS NOT NULL AND m.guest_name IS NOT NULL THEN m.guest_name
                  ELSE p.display_name END,
           'moment', jsonb_build_object(
             'id', m.id,
             'song_title', m.song_title,
             'song_artist', m.song_artist,
             'song_artwork_url', m.song_artwork_url,
             'song_preview_url', m.song_preview_url,
             'photo_urls', m.photo_urls,
             'reflection_text', m.reflection_text,
             'moment_date', m.moment_date,
             'mood', m.mood
           )
         )
    FROM public.collections c
    JOIN public.collection_moments cm ON cm.collection_id = c.id
    JOIN public.moments m ON m.id = cm.moment_id
    LEFT JOIN public.profiles p
      ON p.id = cm.added_by_user_id AND m.guest_uuid IS NULL
   WHERE c.invite_code = p_invite_code
     AND c.is_public = true
     AND (p_after IS NULL OR cm.added_at > p_after)
   ORDER BY
     CASE WHEN p_oldest_first THEN cm.added_at END ASC,
     CASE WHEN NOT p_oldest_first THEN cm.added_at END DESC,
     m.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_album_moments(text, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_album_moments(text, timestamptz, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
