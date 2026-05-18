-- Replaces the 3-query client-side chain (collection_moments → moments → profiles)
-- with a single server-side join, cutting shared collection load from 2 round-trips to 1.
-- Returns all moment columns + contributor_name (guest_name takes priority; falls back to
-- added_by_user_id profile, then moment owner profile so rows with NULL added_by_user_id
-- still resolve a name).
-- NOTE: superseded by 20260517_security_fixes.sql which adds authorization check + GRANT.
CREATE OR REPLACE FUNCTION get_shared_collection_moments(p_collection_id uuid)
RETURNS SETOF json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(m.*) || jsonb_build_object(
    'contributor_name',
      CASE
        WHEN m.guest_uuid IS NOT NULL AND m.guest_name IS NOT NULL THEN m.guest_name
        ELSE COALESCE(p.display_name, owner.display_name)
      END,
    'added_by_user_id', cm.added_by_user_id
  )
  FROM collection_moments cm
  JOIN moments m ON m.id = cm.moment_id
  LEFT JOIN profiles p ON p.id = cm.added_by_user_id
  LEFT JOIN profiles owner ON owner.id = m.user_id
  WHERE cm.collection_id = p_collection_id
  ORDER BY cm.added_at DESC;
$$;
