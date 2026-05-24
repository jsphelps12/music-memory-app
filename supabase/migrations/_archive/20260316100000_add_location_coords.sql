-- Add coordinate columns to moments for structured location storage
ALTER TABLE moments ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS location_lng double precision;
