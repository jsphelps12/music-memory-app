-- Build 23: server-controlled app configuration, starting with the min-build
-- gate. The client checks min_supported_build on launch and shows a
-- "please update" screen when its native build number is below the floor —
-- so future teardowns (the build-23 caboose and everything after) get a
-- clean cutoff by raising one value, instead of waiting months for the last
-- stranded binary to fade out of the adoption charts.
--
-- Seeded at 1: the gate ships inert and blocks nobody until deliberately
-- raised. No write policies — the value changes via dashboard/service role
-- only. Readable by anon too: the check runs before sign-in.

CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app config"
ON public.app_config
FOR SELECT
USING (true);

INSERT INTO public.app_config (key, value) VALUES ('min_supported_build', '1'::jsonb);
