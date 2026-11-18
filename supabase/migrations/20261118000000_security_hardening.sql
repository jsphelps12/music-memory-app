-- Security hardening (2026-11-18). Safe for every app build in the wild:
-- 1.3.1 and 1.4 read profiles only when signed in and only call the shared
-- album RPC as the album's owner or a member.

-- 1. Profiles: signed-out callers read nothing. The public link pages go
--    through their own RPCs.
DROP POLICY IF EXISTS "Anon can read profiles for public link pages" ON public.profiles;
REVOKE ALL ON public.profiles FROM anon;

-- 2. A shared album's moments: owner and members only (being shared no
--    longer makes it readable by any signed-in account that knows its id).
--    Other people's moments come back without their share link token, and
--    linked media keep kind/duration/full but not the owner's Photos id.
CREATE OR REPLACE FUNCTION public.get_shared_collection_moments(p_collection_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR (
    NOT EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = p_collection_id AND user_id = v_uid
    ) AND NOT EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = p_collection_id AND user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN m.user_id = v_uid THEN to_jsonb(m.*)
      ELSE (to_jsonb(m.*) - 'share_token') || jsonb_build_object(
        'media_refs',
        COALESCE(
          (SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(r.ref) = 'object'
                         THEN r.ref || '{"cloudId": ""}'::jsonb
                         ELSE r.ref END
                    ORDER BY r.ord)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(m.media_refs) = 'array' THEN m.media_refs ELSE '[]'::jsonb END
                  ) WITH ORDINALITY AS r(ref, ord)),
          '[]'::jsonb))
    END
    || jsonb_build_object(
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
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) TO authenticated;

-- 3. Retired definer functions nothing calls any more (no app build, no web
--    page): nobody but the service role may run them.
DO $$
BEGIN
  IF to_regprocedure('public.claim_gifted_moment(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.claim_gifted_moment(text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.get_tagged_moment_data(uuid[])') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_tagged_moment_data(uuid[]) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- 4. The public photo bucket takes images only, at a sane size (the largest
--    file today is under 5 MB; full-size photos are compressed before upload).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
    file_size_limit = 26214400
WHERE id = 'moment-photos';

-- 5. Pin search_path on the occasion helpers (advisor: mutable search_path).
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.occasion_slug_reserved(text)',
    'public.occasion_slug_shape(text)',
    'public.occasion_slug_valid(text)',
    'public.occasion_songs_valid(jsonb)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', f);
    END IF;
  END LOOP;
END;
$$;

-- 6. Cron: give the daily push run time to answer (pg_net's default is 5s),
--    and stop cron's own history from growing forever.
DO $$
DECLARE
  v_job bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'daily-notifications';
  IF v_job IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job,
      command := $cmd$
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);
$cmd$
    );
  END IF;

  PERFORM cron.schedule(
    'prune-cron-history',
    '17 3 * * *',
    $cmd$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days'$cmd$
  );
END;
$$;
