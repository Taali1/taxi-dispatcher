/*
  # Add suspended_until field to driver accounts

  1. Changes
    - Add `suspended_until` column to track suspension expiry date
    - Add check constraint to ensure suspended_until is only set for suspended accounts

  2. Notes
    - This field stores the date until which the driver account is suspended
    - Nullable field (only populated when status is 'suspended')
*/

-- Add suspended_until column to store suspension expiry date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'suspended_until'
  ) THEN
    ALTER TABLE drivers ADD COLUMN suspended_until timestamptz;
  END IF;
END $$;

-- Add comment to explain the column
COMMENT ON COLUMN drivers.suspended_until IS 'Date until which the driver account is suspended. NULL if not suspended.';
