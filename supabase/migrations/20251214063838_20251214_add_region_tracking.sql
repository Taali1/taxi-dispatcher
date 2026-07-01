/*
  # Add region tracking to drivers

  1. New Columns
    - `current_region_number` (integer) - Tracks the current region number
    - `status_started_at` (timestamp) - Explicit tracking of when current status started with seconds precision

  2. Modified Columns
    - Updated default for status_started_at to match status_changed_at semantics

  3. Notes
    - status_changed_at already exists and will continue to be updated
    - current_region_number stores just the region number for easy reference
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'current_region_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN current_region_number integer;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'status_started_at'
  ) THEN
    ALTER TABLE drivers ADD COLUMN status_started_at timestamp with time zone DEFAULT now();
  END IF;
END $$;
