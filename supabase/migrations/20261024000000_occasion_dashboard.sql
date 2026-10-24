-- Occasions P1.4: the couple's dashboard (docs/OCCASIONS.md, flow 5).
--
--   * close_occasion: collecting → curating now, instead of waiting for the
--     two-week close. Hosts can't write status themselves (column grants),
--     so this is the one way.
--   * Moving the wedding date (or its time zone) while collecting moves the
--     close with it, so guests always get two weeks after the actual day.

CREATE OR REPLACE FUNCTION public.close_occasion(p_occasion_id uuid)
RETURNS public.occasions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.occasions;
BEGIN
  UPDATE public.occasions
     SET status = 'curating',
         collect_closes_at = least(coalesce(collect_closes_at, now()), now())
   WHERE id = p_occasion_id
     AND status = 'collecting'
     AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id)
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not open, or not yours' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.close_occasion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_occasion(uuid) TO authenticated;

-- Same rules as before (a real time zone; a date at most three years after
-- creation), plus: while collecting, the close follows the date. Only while
-- it's still open: nothing moves an expired book out of 'collecting' yet
-- (P1.6), and a date edit must never reopen one that has closed.
CREATE OR REPLACE FUNCTION public.occasions_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'unknown time zone' USING ERRCODE = '22023';
  END IF;
  IF NEW.event_date > (coalesce(NEW.created_at, now()) + interval '3 years')::date THEN
    RAISE EXCEPTION 'date out of range' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'collecting'
     AND (OLD.collect_closes_at IS NULL OR OLD.collect_closes_at > now())
     AND (NEW.event_date IS DISTINCT FROM OLD.event_date OR NEW.time_zone IS DISTINCT FROM OLD.time_zone) THEN
    NEW.collect_closes_at := ((NEW.event_date + 15)::timestamp AT TIME ZONE NEW.time_zone);
  END IF;
  RETURN NEW;
END;
$$;
