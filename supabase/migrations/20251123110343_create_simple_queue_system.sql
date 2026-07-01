/*
  # Prosty System Kolejkowania Kierowców
  
  ## Opis
  Tworzy prosty system kolejkowania oparty na timestampie `free_since`.
  Kiedy kierowca zmienia status na 'free', zapisywany jest czas rozpoczęcia oczekiwania.
  
  ## Zmiany
  
  1. Kolumna `free_since` w tabeli `drivers`
     - Przechowuje timestamp kiedy kierowca ustawił status 'free'
     - Używana do sortowania kolejki (FIFO - First In First Out)
  
  2. Kolumna `status_changed_at` w tabeli `drivers`
     - Przechowuje timestamp ostatniej zmiany statusu
  
  3. Trigger `update_driver_free_since`
     - Automatycznie ustawia `free_since` gdy status zmienia się na 'free'
     - Czyści `free_since` gdy status zmienia się z 'free' na inny
     - Aktualizuje `status_changed_at` przy każdej zmianie statusu
  
  4. Indeksy
     - `idx_drivers_free_since` - dla szybkiego sortowania po free_since
     - `idx_drivers_status_zone` - dla filtrowania po statusie i strefie
  
  5. Bezpieczeństwo
     - RLS policies zapewniające dostęp tylko dla uwierzytelnionych użytkowników
*/

-- Dodaj kolumny jeśli nie istnieją
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
    WHERE table_name = 'drivers' AND column_name = 'status_changed_at'
  ) THEN
    ALTER TABLE drivers ADD COLUMN status_changed_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Utwórz indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_drivers_free_since 
  ON drivers(free_since) 
  WHERE status = 'free' AND free_since IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_status_zone 
  ON drivers(status, current_zone) 
  WHERE status = 'free';

-- Funkcja automatycznie zarządzająca free_since
CREATE OR REPLACE FUNCTION update_driver_free_since()
RETURNS TRIGGER AS $$
BEGIN
  -- Aktualizuj status_changed_at zawsze gdy zmienia się status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
  END IF;
  
  -- Jeśli status zmienia się NA 'free', ustaw timestamp
  IF NEW.status = 'free' AND (OLD.status IS NULL OR OLD.status != 'free') THEN
    NEW.free_since := now();
  END IF;
  
  -- Jeśli status zmienia się Z 'free' na coś innego, wyczyść timestamp
  IF OLD.status = 'free' AND NEW.status != 'free' THEN
    NEW.free_since := NULL;
  END IF;
  
  -- Aktualizuj updated_at
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Utwórz trigger
DROP TRIGGER IF EXISTS trigger_update_driver_free_since ON drivers;
CREATE TRIGGER trigger_update_driver_free_since
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_free_since();

-- Inicjalizacja: ustaw free_since dla istniejących kierowców ze statusem 'free'
UPDATE drivers 
SET free_since = COALESCE(status_changed_at, created_at, now())
WHERE status = 'free' AND free_since IS NULL;

-- Funkcja pomocnicza do pobierania kierowców w kolejce dla danej strefy
CREATE OR REPLACE FUNCTION get_drivers_in_queue_by_zone(zone_number integer)
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  driver_code text,
  free_since_time timestamptz,
  wait_duration interval,
  vehicle_categories text[],
  current_location jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id as driver_id,
    d.name as driver_name,
    d.driver_code,
    d.free_since as free_since_time,
    CASE 
      WHEN d.free_since IS NOT NULL THEN now() - d.free_since
      ELSE NULL
    END as wait_duration,
    d.vehicle_categories,
    d.current_location
  FROM drivers d
  WHERE d.status = 'free' 
    AND d.current_zone = zone_number
    AND d.free_since IS NOT NULL
  ORDER BY d.free_since ASC;
END;
$$ LANGUAGE plpgsql;

-- Funkcja pomocnicza do pobierania wszystkich kierowców w kolejce
CREATE OR REPLACE FUNCTION get_all_drivers_in_queue()
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  driver_code text,
  current_zone integer,
  free_since_time timestamptz,
  wait_duration interval,
  vehicle_categories text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id as driver_id,
    d.name as driver_name,
    d.driver_code,
    d.current_zone,
    d.free_since as free_since_time,
    CASE 
      WHEN d.free_since IS NOT NULL THEN now() - d.free_since
      ELSE NULL
    END as wait_duration,
    d.vehicle_categories
  FROM drivers d
  WHERE d.status = 'free' 
    AND d.current_zone IS NOT NULL
    AND d.free_since IS NOT NULL
  ORDER BY d.current_zone ASC, d.free_since ASC;
END;
$$ LANGUAGE plpgsql;

-- Upewnij się, że RLS jest włączony
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Usuń stare polityki jeśli istnieją
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to view drivers" ON drivers;
  DROP POLICY IF EXISTS "Allow authenticated users to update drivers" ON drivers;
  DROP POLICY IF EXISTS "Allow drivers to view own data" ON drivers;
  DROP POLICY IF EXISTS "Allow drivers to update own data" ON drivers;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Polityki RLS - wszyscy uwierzytelnieni użytkownicy mogą widzieć i aktualizować kierowców
CREATE POLICY "Allow authenticated users to view drivers"
  ON drivers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update drivers"
  ON drivers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
