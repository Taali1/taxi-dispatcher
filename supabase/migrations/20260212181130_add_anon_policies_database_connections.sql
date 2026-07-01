/*
  # Add Anonymous Access Policies for Database Connections
  
  1. Changes
    - Add policies for anonymous users (anon role) to access database_connections table
    - Allow full CRUD operations for anon users on database_connections
    - This enables the application to manage database connections without authentication
  
  2. Security Notes
    - These policies allow public access to database connection management
    - In production, consider restricting this to authenticated users only
    - The is_default flag prevents deletion of default connections
*/

-- Drop existing policies for anon if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anonymous users can view database connections" ON database_connections;
  DROP POLICY IF EXISTS "Anonymous users can insert database connections" ON database_connections;
  DROP POLICY IF EXISTS "Anonymous users can update database connections" ON database_connections;
  DROP POLICY IF EXISTS "Anonymous users can delete non-default database connections" ON database_connections;
END $$;

-- Allow anonymous users to read database connections
CREATE POLICY "Anonymous users can view database connections"
  ON database_connections
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to insert database connections
CREATE POLICY "Anonymous users can insert database connections"
  ON database_connections
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to update database connections
CREATE POLICY "Anonymous users can update database connections"
  ON database_connections
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anonymous users to delete database connections (except default ones)
CREATE POLICY "Anonymous users can delete non-default database connections"
  ON database_connections
  FOR DELETE
  TO anon
  USING (NOT is_default);
