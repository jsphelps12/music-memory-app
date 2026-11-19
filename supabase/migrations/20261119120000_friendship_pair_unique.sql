-- One friendship per pair of people, whichever way round.
--
-- UNIQUE (requester_id, addressee_id) doesn't cover the reverse pair, and
-- accept-friend-invite checks then inserts, so two people opening each
-- other's links at the same moment can leave both A→B and B→A. The old
-- request flow could also leave a reverse pending row beside an accepted one.
-- The app already shows a duplicate once (lib/people.ts dedupeByOtherUser);
-- this stops new ones. accept-friend-invite treats the resulting unique
-- violation as "already friends".
--
-- Additive and idempotent. Nothing references friendships.id, so removing a
-- duplicate row loses nothing: the pair stays friends through the kept row.

-- 1. Remove existing reverse-pair duplicates: keep the accepted row, then the
--    oldest, then the lowest id.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
      ORDER BY (status = 'accepted') DESC, created_at ASC, id ASC
    ) AS rn
  FROM public.friendships
)
DELETE FROM public.friendships f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- 2. One row per unordered pair from now on.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique_idx
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
