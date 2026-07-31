-- Completes audit finding #24 (docs/AUDIT-2026-07.md). The earlier revoke in
-- 20260729180000 removed anon/authenticated grants, but the function still
-- carries a PUBLIC execute grant (the "=X" ACL entry from function creation),
-- which those roles inherit — so the revoke was a no-op in practice.
-- Low real-world risk (trigger functions aren't exposed via PostgREST RPC),
-- but the function should only be executable by its trigger owner and
-- service_role.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
