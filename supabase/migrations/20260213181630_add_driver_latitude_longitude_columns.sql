/*
  # Add latitude and longitude columns to drivers table

  1. Changes
    - Add `latitude` column (double precision) to store driver's latitude coordinate
    - Add `longitude` column (double precision) to store driver's longitude coordinate
    - Create index on latitude and longitude for faster geospatial queries
  
  2. Notes
    - These columns complement the existing `current_location` jsonb column
    - Using double precision for accurate coordinate storage
    - Indexes will improve performance for location-based queries
*/

-- Add latitude and longitude columns to drivers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE drivers ADD COLUMN latitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE drivers ADD COLUMN longitude double precision;
  END IF;
END $$;

-- Create index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Update existing records with coordinates from current_location jsonb
UPDATE drivers
SET 
  latitude = (current_location->>'lat')::double precision,
  longitude = (current_location->>'lng')::double precision
WHERE current_location IS NOT NULL
  AND current_location->>'lat' IS NOT NULL
  AND current_location->>'lng' IS NOT NULL;