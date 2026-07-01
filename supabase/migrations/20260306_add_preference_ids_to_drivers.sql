-- Dodaj kolumnę preference_ids do tabeli drivers
-- Przechowuje JSON array z ID preferencji, np. "[1,2,3]"
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS preference_ids TEXT DEFAULT '[]';
