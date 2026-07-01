/*
  # Create system configuration table

  1. New Tables
    - `system_config`
      - `id` (uuid, primary key)
      - `key` (text, unique) - configuration key
      - `value` (jsonb) - configuration value
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS
    - Allow public read access (anon + authenticated)
    - Allow authenticated users to update (will be controlled by app logic)

  3. Initial Data
    - Insert default data_source_config with type: 'local'
*/

CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system config"
  ON system_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert system config"
  ON system_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update system config"
  ON system_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default configuration
INSERT INTO system_config (key, value)
VALUES ('data_source_config', '{"type": "local"}'::jsonb)
ON CONFLICT (key) DO NOTHING;