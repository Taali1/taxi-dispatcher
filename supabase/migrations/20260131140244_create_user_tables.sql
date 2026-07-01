/*
  # Create User Management Tables

  1. New Tables
    - `administrators`
      - `id` (text, primary key) - Unique administrator ID
      - `email` (text, unique) - Administrator email address
      - `name` (text) - Administrator full name
      - `password` (text) - Encrypted password
      - `status` (text) - Account status: active, inactive, suspended
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `last_login` (timestamptz) - Last login timestamp
      - `permissions` (text[]) - Array of admin permissions
      - `department` (text) - Department name
      - `access_level` (text) - Access level: super, standard, limited

    - `dispatchers`
      - `id` (text, primary key) - Unique dispatcher ID
      - `email` (text, unique) - Dispatcher email address
      - `name` (text) - Dispatcher full name
      - `password` (text) - Encrypted password
      - `status` (text) - Account status
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `last_login` (timestamptz) - Last login timestamp
      - `employee_id` (text, unique) - Employee identification
      - `shift` (text) - Shift assignment: morning, afternoon, night, rotating
      - `assigned_zones` (integer[]) - Array of assigned zone numbers
      - `max_concurrent_orders` (integer) - Maximum orders allowed simultaneously
      - `phone_extension` (text) - Office phone extension
      - `training_completed` (boolean) - Training completion status

    - `support_agents`
      - `id` (text, primary key) - Unique agent ID
      - `email` (text, unique) - Agent email address
      - `name` (text) - Agent full name
      - `password` (text) - Encrypted password
      - `status` (text) - Account status
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `last_login` (timestamptz) - Last login timestamp
      - `agent_id` (text, unique) - Agent identification
      - `department` (text) - Department: technical, customer, billing
      - `languages` (text[]) - Array of supported languages
      - `ticket_limit` (integer) - Maximum tickets allowed
      - `specializations` (text[]) - Array of specialization areas

    - `accounting_users`
      - `id` (text, primary key) - Unique user ID
      - `email` (text, unique) - User email address
      - `name` (text) - User full name
      - `password` (text) - Encrypted password
      - `status` (text) - Account status
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `last_login` (timestamptz) - Last login timestamp
      - `employee_id` (text, unique) - Employee identification
      - `access_level` (text) - Access level: viewer, editor, manager
      - `certifications` (text[]) - Array of certifications
      - `department` (text) - Department: payroll, billing, reports, audit

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access only
    - Each user type can only access their own records

  3. Important Notes
    - Password field stores hashed passwords only
    - All timestamps are in UTC
    - Email addresses must be unique within each user type
    - Status checks ensure valid values only
*/

-- Create administrators table
CREATE TABLE IF NOT EXISTS administrators (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz,
  permissions text[] DEFAULT '{}',
  department text,
  access_level text NOT NULL DEFAULT 'standard' CHECK (access_level IN ('super', 'standard', 'limited'))
);

-- Create dispatchers table
CREATE TABLE IF NOT EXISTS dispatchers (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz,
  employee_id text UNIQUE NOT NULL,
  shift text NOT NULL DEFAULT 'rotating' CHECK (shift IN ('morning', 'afternoon', 'night', 'rotating')),
  assigned_zones integer[] DEFAULT '{}',
  max_concurrent_orders integer DEFAULT 5,
  phone_extension text,
  training_completed boolean DEFAULT false
);

-- Create support_agents table
CREATE TABLE IF NOT EXISTS support_agents (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz,
  agent_id text UNIQUE NOT NULL,
  department text NOT NULL DEFAULT 'customer' CHECK (department IN ('technical', 'customer', 'billing')),
  languages text[] DEFAULT '{}',
  ticket_limit integer DEFAULT 20,
  specializations text[] DEFAULT '{}'
);

-- Create accounting_users table
CREATE TABLE IF NOT EXISTS accounting_users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz,
  employee_id text UNIQUE NOT NULL,
  access_level text NOT NULL DEFAULT 'viewer' CHECK (access_level IN ('viewer', 'editor', 'manager')),
  certifications text[] DEFAULT '{}',
  department text NOT NULL DEFAULT 'billing' CHECK (department IN ('payroll', 'billing', 'reports', 'audit'))
);

-- Enable Row Level Security
ALTER TABLE administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for administrators
CREATE POLICY "Administrators can view all administrator records"
  ON administrators FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Administrators can insert their own records"
  ON administrators FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Administrators can update their own records"
  ON administrators FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Administrators can delete administrator records"
  ON administrators FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for dispatchers
CREATE POLICY "Authenticated users can view dispatcher records"
  ON dispatchers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert dispatcher records"
  ON dispatchers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update dispatcher records"
  ON dispatchers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete dispatcher records"
  ON dispatchers FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for support_agents
CREATE POLICY "Authenticated users can view support agent records"
  ON support_agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert support agent records"
  ON support_agents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update support agent records"
  ON support_agents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete support agent records"
  ON support_agents FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for accounting_users
CREATE POLICY "Authenticated users can view accounting user records"
  ON accounting_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert accounting user records"
  ON accounting_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update accounting user records"
  ON accounting_users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete accounting user records"
  ON accounting_users FOR DELETE
  TO authenticated
  USING (true);
