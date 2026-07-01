/*
  # Update RLS Policies for system_config Table

  ## Problem
  The current RLS policies only allow authenticated users to INSERT and UPDATE 
  the system_config table. However, the application uses the anonymous (anon) key,
  which prevents saving external database configuration from the support panel.

  ## Changes
  1. Security
    - Add INSERT policy for anonymous users on system_config table
    - Add UPDATE policy for anonymous users on system_config table
    
  ## Important Notes
  - This allows both anon and authenticated users to manage system configuration
  - The system_config table stores non-sensitive configuration like data source settings
*/

-- Add INSERT policy for anonymous users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'system_config' 
    AND policyname = 'Anonymous users can insert system config'
  ) THEN
    CREATE POLICY "Anonymous users can insert system config"
      ON system_config
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- Add UPDATE policy for anonymous users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'system_config' 
    AND policyname = 'Anonymous users can update system config'
  ) THEN
    CREATE POLICY "Anonymous users can update system config"
      ON system_config
      FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;