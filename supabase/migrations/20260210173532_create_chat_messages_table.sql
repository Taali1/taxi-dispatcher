/*
  # Create chat messages table

  1. New Tables
    - `chat_messages`
      - `id` (text, primary key) - Unique message identifier
      - `sender_id` (text) - ID of the message sender
      - `sender_name` (text) - Name of the sender
      - `sender_type` (text) - Type of sender (driver/dispatcher/base)
      - `recipient_id` (text) - ID of the recipient
      - `recipient_name` (text) - Name of the recipient
      - `recipient_type` (text) - Type of recipient (driver/dispatcher/base)
      - `content` (text) - Message content
      - `timestamp` (timestamptz) - When message was sent
      - `is_read` (boolean) - Whether message has been read
      - `is_broadcast` (boolean) - Whether this is a broadcast message
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `chat_messages` table
    - Add policies for authenticated users to manage their messages
*/

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  sender_id text NOT NULL,
  sender_name text NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('driver', 'dispatcher', 'base')),
  recipient_id text NOT NULL,
  recipient_name text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('driver', 'dispatcher', 'base')),
  content text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  is_broadcast boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read ON chat_messages(is_read) WHERE is_read = false;

-- Policies for authenticated users
CREATE POLICY "Users can view their own messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid()::text OR
    recipient_id = auth.uid()::text OR
    recipient_type = 'base'
  );

CREATE POLICY "Users can insert messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid()::text);

CREATE POLICY "Users can update their received messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid()::text)
  WITH CHECK (recipient_id = auth.uid()::text);

-- Allow anonymous access for the dispatch system
CREATE POLICY "Allow anonymous read access"
  ON chat_messages FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert access"
  ON chat_messages FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update access"
  ON chat_messages FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);