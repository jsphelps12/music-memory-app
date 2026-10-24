-- Occasions P1.5: the reveal (docs/OCCASIONS.md, flow 5).
--
-- The host (or co-host) publishes the keepsake once the guest book has
-- closed, by hand (close_occasion) or by time. Revealing can't be undone;
-- "Just us" (share_book_with_guests) still decides whether guests can open
-- it. The keepsake itself is read by the occasion-book edge function, which
-- checks book_token with the service role; nothing here opens it to anon.

CREATE OR REPLACE FUNCTION public.reveal_occasion(p_occasion_id uuid)
RETURNS public.occasions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.occasions;
BEGIN
  UPDATE public.occasions
     SET status = 'revealed',
         revealed_at = now(),
         -- A book revealed straight from "closed by time" keeps that close.
         collect_closes_at = least(coalesce(collect_closes_at, now()), now())
   WHERE id = p_occasion_id
     AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id)
     AND (status = 'curating'
          OR (status = 'collecting' AND collect_closes_at IS NOT NULL AND collect_closes_at <= now()))
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not closed, or not yours' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_occasion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_occasion(uuid) TO authenticated;
