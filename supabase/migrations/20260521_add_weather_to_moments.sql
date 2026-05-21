ALTER TABLE moments
  ADD COLUMN IF NOT EXISTS weather_temp_f integer,
  ADD COLUMN IF NOT EXISTS weather_condition text;
