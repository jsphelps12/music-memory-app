-- The admin view (docs/OCCASIONS.md, automation): one page that shows every
-- occasion, anything stuck, and whether the scheduled jobs ran. For
-- exceptions only; nothing routine should need it.
--
--   * app_admins: who may see it. Server-only (no client grants). Empty
--     here on purpose: an admin is added by hand in each project's SQL
--     editor, so no email lands in this (public) repo.
--   * admin_overview(): everything the page shows, in one call. Service role
--     only: the occasion-admin edge function checks the caller is in
--     app_admins first.

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occasions jsonb;
  v_reservations jsonb;
  v_deletions jsonb;
  v_cron jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x."eventDate" DESC, x.names), '[]'::jsonb)
    INTO v_occasions
    FROM (
      SELECT o.id,
             o.names,
             o.slug,
             o.status,
             o.event_date AS "eventDate",
             o.time_zone AS "timeZone",
             o.created_at AS "createdAt",
             o.paid_at AS "paidAt",
             -- Whether the payment was real or staging's stand-in, not the id itself.
             CASE WHEN o.stripe_checkout_id IS NULL THEN NULL
                  WHEN o.stripe_checkout_id LIKE 'dev\_%' THEN 'dev'
                  ELSE 'stripe' END AS "payment",
             o.collect_closes_at AS "closesAt",
             o.revealed_at AS "revealedAt",
             o.share_book_with_guests AS "shared",
             h.email AS "hostEmail",
             c.email AS "cohostEmail",
             (SELECT count(*) FROM public.occasion_entries e WHERE e.occasion_id = o.id AND NOT e.hidden) AS "moments",
             (SELECT count(*) FROM public.occasion_entries e WHERE e.occasion_id = o.id AND e.hidden) AS "hidden",
             (SELECT count(*) FROM public.occasion_entries e WHERE e.occasion_id = o.id AND e.photo_source IS NOT NULL) AS "withPhoto",
             (SELECT count(*) FROM public.occasion_gallery_photos g WHERE g.occasion_id = o.id) AS "gallery",
             (SELECT max(e.created_at) FROM public.occasion_entries e WHERE e.occasion_id = o.id) AS "lastMomentAt",
             -- What looks stuck. The tick runs every ten minutes, so half an
             -- hour late means it didn't.
             array_remove(ARRAY[
               CASE WHEN o.status = 'collecting' AND o.collect_closes_at < now() - interval '30 minutes'
                    THEN 'should have closed' END,
               CASE WHEN o.status = 'curating' AND o.collect_closes_at < now() - interval '7 days 30 minutes'
                     AND EXISTS (SELECT 1 FROM public.occasion_entries e WHERE e.occasion_id = o.id AND NOT e.hidden)
                    THEN 'should have revealed' END,
               CASE WHEN o.status = 'draft' AND o.created_at < now() - interval '14 days'
                    THEN 'draft for over two weeks' END,
               -- Three days in, a wedding with no moments probably never got
               -- its link out.
               CASE WHEN o.status = 'collecting' AND o.event_date < (now() AT TIME ZONE o.time_zone)::date - 2
                     AND NOT EXISTS (SELECT 1 FROM public.occasion_entries e WHERE e.occasion_id = o.id)
                    THEN 'no moments three days after the wedding' END
             ], NULL) AS "attention"
        FROM public.occasions o
        JOIN auth.users h ON h.id = o.host_user_id
        LEFT JOIN auth.users c ON c.id = o.co_host_user_id
    ) x;

  -- Reservations nobody has turned into a wedding yet: the leads.
  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r."createdAt" DESC), '[]'::jsonb)
    INTO v_reservations
    FROM (
      SELECT w.id, w.couple_names AS "names", w.wedding_date AS "weddingDate", w.guest_count AS "guests",
             w.email, w.interests, w.created_at AS "createdAt"
        FROM public.wedding_reservations w
       WHERE NOT EXISTS (SELECT 1 FROM public.occasions o WHERE o.reservation_id = w.id)
    ) r;

  SELECT coalesce(jsonb_agg(row_to_json(d) ORDER BY d."deletedAt" DESC), '[]'::jsonb)
    INTO v_deletions
    FROM (
      SELECT slug, paid_at IS NOT NULL AS "paid", deleted_at AS "deletedAt"
        FROM public.occasion_deletions
       ORDER BY deleted_at DESC
       LIMIT 20
    ) d;

  -- The scheduled jobs' latest runs (pg_cron isn't everywhere, e.g. a local
  -- test database).
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$
      SELECT coalesce(jsonb_agg(row_to_json(j)), '[]'::jsonb) FROM (
        SELECT DISTINCT ON (job.jobname)
               job.jobname AS "job", job.schedule, job.active,
               run.status, run.return_message AS "message", run.start_time AS "startedAt"
          FROM cron.job job
          LEFT JOIN cron.job_run_details run ON run.jobid = job.jobid
         ORDER BY job.jobname, run.start_time DESC NULLS LAST
      ) j
    $q$ INTO v_cron;
  END IF;

  RETURN jsonb_build_object(
    'occasions', v_occasions,
    'reservations', v_reservations,
    'deletions', v_deletions,
    'jobs', v_cron,
    'generatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO service_role;
