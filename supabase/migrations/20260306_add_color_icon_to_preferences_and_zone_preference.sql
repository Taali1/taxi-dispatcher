-- Dodaj kolumny color i icon do tabeli preferences
ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS icon VARCHAR(100) DEFAULT 'Star';

-- Dodaj kolumne preference_id do tabeli zones (FK do preferences)
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS preference_id INT NULL,
  ADD CONSTRAINT fk_zones_preference FOREIGN KEY (preference_id) REFERENCES preferences(id) ON DELETE SET NULL;
