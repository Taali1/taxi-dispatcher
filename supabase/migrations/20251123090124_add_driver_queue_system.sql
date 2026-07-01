/*
  # System kolejkowania kierowców

  ## Zmiany
  
  1. Nowa kolumna w tabeli drivers
    - `free_since` (timestamp) - przechowuje dokładny czas kiedy kierowca ustawił status "free"
    - `previous_status` (text) - przechowuje poprzedni status dla logowania zmian
  
  2. Nowe funkcje
    - `update_driver_free_since()` - automatycznie aktualizuje timestamp przy zmianie statusu na "free"
    - `calculate_queue_positions()` - przelicza pozycje w kolejce dla każdego rejonu osobno
    - `get_drivers_in_queue()` - zwraca kierowców w kolejce dla danego rejonu
  
  3. Triggery
    - Automatyczna aktualizacja `free_since` gdy status zmienia się na 'free'
    - Automatyczne przeliczanie pozycji w kolejce po każdej zmianie statusu
  
  4. Indeksy
    - Indeks na (current_zone, status, free_since) dla szybkiego sortowania kolejki
    - Indeks na (status, free_since) dla zapytań globalnych
  
  5. RLS (Row Level Security)
    - Polityki dostępu dla kierowców i użytkowników uwierzytelnionych
*/

-- Dodanie nowych kolumn do tabeli drivers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'free_since'
  ) THEN
    ALTER TABLE drivers ADD COLUMN free_since timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'previous_status'
  ) THEN
    ALTER TABLE drivers ADD COLUMN previous_status text;
  END IF;
END $$;

-- Tworzenie indeksów dla wydajności
CREATE INDEX IF NOT EXISTS idx_drivers_queue_zone 
  ON drivers(current_zone, status, free_since) 
  WHERE status = 'free';

CREATE INDEX IF NOT EXISTS idx_drivers_queue_global 
  ON drivers(status, free_since) 
  WHERE status = 'free';

CREATE INDEX IF NOT EXISTS idx_drivers_status 
  ON drivers(status);

-- Funkcja automatycznie aktualizująca free_since gdy status zmienia się na 'free'
CREATE OR REPLACE FUNCTION update_driver_free_since()
RETURNS TRIGGER AS $$
BEGIN
  -- Zapisz poprzedni status
  NEW.previous_status := OLD.status;
  
  -- Jeśli status zmienia się na 'free', ustaw aktualny czas
  IF NEW.status = 'free' AND (OLD.status IS NULL OR OLD.status != 'free') THEN
    NEW.free_since := now();
  END IF;
  
  -- Jeśli status zmienia się z 'free' na coś innego, wyczyść free_since
  IF OLD.status = 'free' AND NEW.status != 'free' THEN
    NEW.free_since := NULL;
  END IF;
  
  -- Aktualizuj updated_at
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger uruchamiający funkcję update_driver_free_since
DROP TRIGGER IF EXISTS trigger_update_driver_free_since ON drivers;
CREATE TRIGGER trigger_update_driver_free_since
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_free_since();

-- Funkcja przeliczająca pozycje w kolejce dla wszystkich rejonów
CREATE OR REPLACE FUNCTION calculate_queue_positions()
RETURNS void AS $$
BEGIN
  -- Przelicz pozycje dla każdego rejonu osobno
  WITH ranked_drivers AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY current_zone 
        ORDER BY free_since ASC NULLS LAST
      ) as new_position
    FROM drivers
    WHERE status = 'free' AND current_zone IS NOT NULL
  )
  UPDATE drivers d
  SET queue_position = rd.new_position
  FROM ranked_drivers rd
  WHERE d.id = rd.id;
  
  -- Wyzeruj pozycję dla kierowców nie będących w statusie 'free'
  UPDATE drivers
  SET queue_position = NULL
  WHERE status != 'free' OR current_zone IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Funkcja zwracająca kierowców w kolejce dla danego rejonu
CREATE OR REPLACE FUNCTION get_drivers_in_queue(zone_number integer)
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  driver_code text,
  queue_pos integer,
  free_duration interval,
  vehicle_categories text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id as driver_id,
    d.name as driver_name,
    d.driver_code,
    d.queue_position as queue_pos,
    CASE 
      WHEN d.free_since IS NOT NULL THEN now() - d.free_since
      ELSE NULL
    END as free_duration,
    d.vehicle_categories
  FROM drivers d
  WHERE d.status = 'free' 
    AND d.current_zone = zone_number
  ORDER BY d.free_since ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Trigger automatycznie przeliczający kolejkę po każdej zmianie
CREATE OR REPLACE FUNCTION trigger_recalculate_queue()
RETURNS TRIGGER AS $$
BEGIN
  -- Przelicz kolejkę asynchronicznie
  PERFORM calculate_queue_positions();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_queue_on_status_change ON drivers;
CREATE TRIGGER trigger_recalculate_queue_on_status_change
  AFTER INSERT OR UPDATE OF status, current_zone, free_since ON drivers
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_recalculate_queue();

-- Inicjalizacja: ustaw free_since dla istniejących kierowców ze statusem 'free'
UPDATE drivers 
SET free_since = created_at 
WHERE status = 'free' AND free_since IS NULL;

-- Przelicz początkowe pozycje w kolejce
SELECT calculate_queue_positions();

-- Polityki RLS
-- Najpierw usuń istniejące polityki jeśli istnieją
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Drivers can view own data and queue" ON drivers;
  DROP POLICY IF EXISTS "Drivers can update own status" ON drivers;
  DROP POLICY IF EXISTS "Authenticated users can view drivers" ON drivers;
  DROP POLICY IF EXISTS "Authenticated users can update drivers" ON drivers;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Kierowcy mogą widzieć własne dane i innych kierowców w kolejce
CREATE POLICY "Drivers can view own data and queue" 
  ON drivers FOR SELECT 
  TO authenticated 
  USING (
    auth.uid() = id 
    OR 
    (status = 'free' AND current_zone IS NOT NULL)
  );

-- Kierowcy mogą aktualizować własny status
CREATE POLICY "Drivers can update own status" 
  ON drivers FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Wszyscy uwierzytelnieni użytkownicy mogą widzieć kierowców (dla dyspozytorów i adminów)
CREATE POLICY "Authenticated users can view drivers" 
  ON drivers FOR SELECT 
  TO authenticated 
  USING (true);

-- Wszyscy uwierzytelnieni użytkownicy mogą aktualizować kierowców (dla dyspozytorów i adminów)
CREATE POLICY "Authenticated users can update drivers" 
  ON drivers FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);