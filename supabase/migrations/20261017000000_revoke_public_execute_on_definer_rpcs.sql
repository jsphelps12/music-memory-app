-- SECURITY DEFINER functions were executable by signed-out (anon) callers.
--
-- 20260729180000 meant to scope these grants, but Postgres grants EXECUTE on
-- new functions to PUBLIC, and every role inherits PUBLIC. The ACLs read
-- `=X/postgres` (PUBLIC) alongside the role grants, so revoking from `anon` by
-- name could never take effect. The two functions done right
-- (handle_new_user, owns_moment) have no PUBLIC entry; this brings the rest
-- in line.
--
-- Who still needs what:
--   - get_random_moment, get_shared_collection_moments: called by the current
--     app, signed in only.
--   - check_moment_owner, claim_gifted_moment, get_tagged_moment_data,
--     get_random_forgotten_moment: no caller in the current code, but App
--     Store build 7 may still call them signed in. Keep `authenticated` until
--     the build-23 caboose drops them.
--   - evict_push_token_from_other_profiles: a trigger function. Postgres does
--     not check EXECUTE when a trigger fires, so nobody needs it via the API.
--   - The web pages use the service role and call no RPCs.

REVOKE EXECUTE ON FUNCTION public.check_moment_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_gifted_moment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tagged_moment_data(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_random_forgotten_moment(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_random_moment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evict_push_token_from_other_profiles() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_moment_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gifted_moment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tagged_moment_data(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_forgotten_moment(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_moment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) TO authenticated;

-- moment_shares.sender_id is a foreign key with no covering index (advisor
-- unindexed_foreign_keys). Deleting a profile scans moment_shares without it.
CREATE INDEX IF NOT EXISTS moment_shares_sender_id_idx ON public.moment_shares (sender_id);
