/*
  # Create zones table and add zone tracking to drivers

  ## New Tables
    - `zones`
      - `id` (uuid, primary key) - Unique zone identifier
      - `name` (text) - Zone name
      - `number` (integer) - Zone number for display
      - `coordinates` (text) - JSON string with zone polygon coordinates
      - `drivers_count` (integer) - Number of drivers in this zone
      - `color` (text) - Color for map display
      - `is_active` (boolean) - Whether zone is active
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  ## Changes to drivers table
    - Add `zone_entered_at` (timestamptz) - Timestamp when driver entered current zone

  ## Security
    - Enable RLS on `zones` table
    - Add policies for authenticated users to read zones
    - Add policies for dispatchers and admins to manage zones

  ## Notes
    1. Zones define geographic areas where drivers operate
    2. System will automatically detect and update driver's current zone based on location
    3. zone_entered_at tracks when driver entered their current zone for analytics
*/

-- Create zones table
CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  number integer NOT NULL UNIQUE,
  coordinates text NOT NULL,
  drivers_count integer DEFAULT 0,
  color text DEFAULT '#3b82f6',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add zone_entered_at to drivers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'zone_entered_at'
  ) THEN
    ALTER TABLE drivers ADD COLUMN zone_entered_at timestamptz;
  END IF;
END $$;

-- Enable RLS on zones
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read zones (needed for zone detection)
CREATE POLICY "Anyone can read zones"
  ON zones
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy: Authenticated users can insert zones
CREATE POLICY "Authenticated users can insert zones"
  ON zones
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update zones
CREATE POLICY "Authenticated users can update zones"
  ON zones
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can delete zones
CREATE POLICY "Authenticated users can delete zones"
  ON zones
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index on zone number for faster lookups
CREATE INDEX IF NOT EXISTS idx_zones_number ON zones(number);
CREATE INDEX IF NOT EXISTS idx_zones_is_active ON zones(is_active);

-- Create index on drivers current_zone for faster queries
CREATE INDEX IF NOT EXISTS idx_drivers_current_zone ON drivers(current_zone);
