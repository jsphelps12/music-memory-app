-- Wedding date reservations from soundtracks.app/weddings.
--
-- A demand test: couples reserve a date at real prices before occasions are
-- built. Nothing is charged. The web page writes with the anon key through a
-- server action; there is no read policy, so rows are visible only to the
-- service role (dashboard / SQL).

CREATE TABLE IF NOT EXISTS public.wedding_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_names text NOT NULL CHECK (char_length(couple_names) BETWEEN 1 AND 120),
  wedding_date date NOT NULL,
  guest_count integer NOT NULL CHECK (guest_count BETWEEN 1 AND 1000),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320 AND email LIKE '%_@_%'),
  interests text[] NOT NULL DEFAULT '{}'
    CHECK (interests <@ ARRAY['print', 'cards', 'book']::text[]),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wedding_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can reserve a wedding date" ON public.wedding_reservations;
CREATE POLICY "Anyone can reserve a wedding date"
  ON public.wedding_reservations FOR INSERT TO anon, authenticated
  WITH CHECK (
    wedding_date >= current_date
    AND wedding_date <= current_date + interval '3 years'
  );

-- Insert only. No SELECT/UPDATE/DELETE for client roles.
REVOKE ALL ON public.wedding_reservations FROM anon, authenticated;
GRANT INSERT ON public.wedding_reservations TO anon, authenticated;
