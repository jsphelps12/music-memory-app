-- Occasions P1.6: the guest book closes and reveals on its own
-- (docs/OCCASIONS.md, lifecycle).
--
--   * Collecting → curating once collect_closes_at passes (two weeks after
--     the wedding, or the moment the couple closed it early). Guests are
--     already turned away by time; this makes the status say so.
--   * Curating → revealed seven days after the close if the couple hasn't
--     revealed it themselves (the dashboard tells them the date). What they
--     hid stays hidden; "Just us" still decides who can open it. A book with
--     nothing visible is never revealed for them (the button needs a moment
--     too).
--
-- occasions_tick() does both and is safe to run any time, any number of
-- times. pg_cron runs it every ten minutes.

CREATE OR REPLACE FUNCTION public.occasions_tick()
RETURNS TABLE (closed integer, revealed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed integer;
  v_revealed integer;
BEGIN
  UPDATE public.occasions
     SET status = 'curating'
   WHERE status = 'collecting'
     AND collect_closes_at IS NOT NULL
     AND collect_closes_at <= now();
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.occasions
     SET status = 'revealed',
         revealed_at = now()
   WHERE status = 'curating'
     AND collect_closes_at IS NOT NULL
     AND collect_closes_at <= now() - interval '7 days'
     AND EXISTS (SELECT 1 FROM public.occasion_entries e
                  WHERE e.occasion_id = occasions.id AND NOT e.hidden);
  GET DIAGNOSTICS v_revealed = ROW_COUNT;

  RETURN QUERY SELECT v_closed, v_revealed;
END;
$$;

-- Only the scheduler (and the service role, for a manual run) calls it.
REVOKE ALL ON FUNCTION public.occasions_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.occasions_tick() TO service_role;

-- Schedule it. Production already has pg_cron (the notifications job);
-- staging gets it here. Where the extension can't be created at all (a
-- local test database), the function still exists and nothing is scheduled.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'pg_cron unavailable (%); occasions_tick is NOT scheduled, so books will not close or reveal on their own', SQLERRM;
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Scheduling by name replaces an existing job of that name.
    PERFORM cron.schedule('occasions-tick', '*/10 * * * *', 'SELECT public.occasions_tick()');
  END IF;
END;
$$;
