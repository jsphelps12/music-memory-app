-- Fix: moments query timeout for users with shared collections.
-- The RLS policies "Members can read moments in shared collections" and
-- "Collection owners can read member moments" both do correlated EXISTS
-- subqueries on collection_moments WHERE moment_id = moments.id.
-- The PK index is (collection_id, moment_id) and cannot serve moment_id-only
-- lookups, causing a sequential scan for every candidate row -> timeout.

CREATE INDEX IF NOT EXISTS collection_moments_moment_id_idx
  ON public.collection_moments (moment_id);
