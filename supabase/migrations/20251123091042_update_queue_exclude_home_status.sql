/*
  # Aktualizacja systemu kolejkowania - wykluczenie statusu 'home'

  ## Zmiany
  
  1. Modyfikacja funkcji calculate_queue_positions()
    - Kierowcy ze statusem 'home' nie są brani pod uwagę w kolejce
    - Nie otrzymują queue_position
  
  2. Modyfikacja funkcji get_drivers_in_queue()
    - Zwraca tylko kierowców ze statusami 'free', 'driving', 'pickup'
    - Wykluczenie statusu 'home'
  
  3. Dodanie funkcji pomocniczych
    - get_active_drivers_count() - zlicza tylko aktywnych kierowców (bez 'home')
    - get_drivers_by_status() - pobiera kierowców według statusu
*/

-- Zaktualizowana funkcja przeliczająca pozycje w kolejce (wykluczenie 'home')
CREATE OR REPLACE FUNCTION calculate_queue_positions()
RETURNS void AS $$
BEGIN
  -- Przelicz pozycje dla każdego rejonu osobno, TYLKO dla aktywnych kierowców
  WITH ranked_drivers AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY current_zone 
        ORDER BY free_since ASC NULLS LAST
      ) as new_position
    FROM drivers
    WHERE status = 'free' 
      AND current_zone IS NOT NULL
      AND status != 'home'
  )
  UPDATE drivers d
  SET queue_position = rd.new_position
  FROM ranked_drivers rd
  WHERE d.id = rd.id;
  
  -- Wyzeruj pozycję dla kierowców nie będących w statusie 'free' LUB mających status 'home'
  UPDATE drivers
  SET queue_position = NULL
  WHERE status != 'free' OR current_zone IS NULL OR status = 'home';
END;
$$ LANGUAGE plpgsql;

-- Zaktualizowana funkcja zwracająca kierowców w kolejce (wykluczenie 'home')
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
    AND d.status != 'home'
  ORDER BY d.free_since ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Nowa funkcja: zliczanie aktywnych kierowców (bez 'home')
CREATE OR REPLACE FUNCTION get_active_drivers_count(zone_number integer DEFAULT NULL)
RETURNS integer AS $$
DECLARE
  driver_count integer;
BEGIN
  IF zone_number IS NULL THEN
    -- Zlicz wszystkich aktywnych kierowców
    SELECT COUNT(*)
    INTO driver_count
    FROM drivers
    WHERE status != 'home' AND status IN ('free', 'driving', 'pickup');
  ELSE
    -- Zlicz aktywnych kierowców w danym rejonie
    SELECT COUNT(*)
    INTO driver_count
    FROM drivers
    WHERE status != 'home' 
      AND status IN ('free', 'driving', 'pickup')
      AND current_zone = zone_number;
  END IF;
  
  RETURN driver_count;
END;
$$ LANGUAGE plpgsql;

-- Nowa funkcja: pobieranie kierowców według statusu
CREATE OR REPLACE FUNCTION get_drivers_by_status(
  driver_status text,
  zone_number integer DEFAULT NULL
)
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  driver_code text,
  driver_status_out text,
  current_zone_out integer,
  queue_pos integer,
  rating_out numeric,
  total_rides_out integer
) AS $$
BEGIN
  IF zone_number IS NULL THEN
    RETURN QUERY
    SELECT 
      d.id as driver_id,
      d.name as driver_name,
      d.driver_code,
      d.status as driver_status_out,
      d.current_zone as current_zone_out,
      d.queue_position as queue_pos,
      d.rating as rating_out,
      d.total_rides as total_rides_out
    FROM drivers d
    WHERE d.status = driver_status
    ORDER BY d.name;
  ELSE
    RETURN QUERY
    SELECT 
      d.id as driver_id,
      d.name as driver_name,
      d.driver_code,
      d.status as driver_status_out,
      d.current_zone as current_zone_out,
      d.queue_position as queue_pos,
      d.rating as rating_out,
      d.total_rides as total_rides_out
    FROM drivers d
    WHERE d.status = driver_status
      AND d.current_zone = zone_number
    ORDER BY d.name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Nowa funkcja: statystyki kierowców według statusów w rejonie
CREATE OR REPLACE FUNCTION get_zone_status_statistics(zone_number integer)
RETURNS TABLE(
  status_type text,
  driver_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.status as status_type,
    COUNT(*) as driver_count
  FROM drivers d
  WHERE d.current_zone = zone_number
    AND d.status IN ('free', 'driving', 'pickup')
  GROUP BY d.status
  ORDER BY 
    CASE d.status
      WHEN 'free' THEN 1
      WHEN 'driving' THEN 2
      WHEN 'pickup' THEN 3
      ELSE 4
    END;
END;
$$ LANGUAGE plpgsql;

-- Przelicz kolejkę z nowymi zasadami
SELECT calculate_queue_positions();