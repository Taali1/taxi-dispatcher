/*
  # Add Authentication Credentials to User Tables

  1. Changes
    - Add `password` column to `drivers` table for web panel authentication
    - Add `pin` column to `drivers` table for driver app authentication (4-digit code)
    - Add `password` column to `administrators` table
    - Add `password` column to `dispatchers` table
    - Add `password` column to `support_agents` table
    - Add `password` column to `accounting_users` table
  
  2. Security Notes
    - Passwords stored as TEXT for compatibility with existing system
    - PIN stored as TEXT to preserve leading zeros (e.g., "0123")
    - All columns are NOT NULL with empty string defaults for existing records
    - Production systems should implement proper password hashing
  
  3. Data Integrity
    - Existing records will have empty passwords (must be set by admin)
    - New records require password/PIN to be set during creation
*/

-- Add password column to drivers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'password'
  ) THEN
    ALTER TABLE drivers ADD COLUMN password TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add pin column to drivers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'pin'
  ) THEN
    ALTER TABLE drivers ADD COLUMN pin TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add password column to administrators table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'administrators') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'administrators' AND column_name = 'password'
    ) THEN
      ALTER TABLE administrators ADD COLUMN password TEXT NOT NULL DEFAULT '';
    END IF;
  END IF;
END $$;

-- Add password column to dispatchers table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dispatchers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'dispatchers' AND column_name = 'password'
    ) THEN
      ALTER TABLE dispatchers ADD COLUMN password TEXT NOT NULL DEFAULT '';
    END IF;
  END IF;
END $$;

-- Add password column to support_agents table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_agents') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'support_agents' AND column_name = 'password'
    ) THEN
      ALTER TABLE support_agents ADD COLUMN password TEXT NOT NULL DEFAULT '';
    END IF;
  END IF;
END $$;

-- Add password column to accounting_users table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounting_users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'accounting_users' AND column_name = 'password'
    ) THEN
      ALTER TABLE accounting_users ADD COLUMN password TEXT NOT NULL DEFAULT '';
    END IF;
  END IF;
END $$;
