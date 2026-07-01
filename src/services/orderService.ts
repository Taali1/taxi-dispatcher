import { dataSourceService } from './dataSourceService';

export interface CreateOrderPayload {
  customerPhone: string;
  customerName: string;
  pickupAddress: string;
  destinationAddress: string;
  taxiCount: number;
  paymentMethod: string;
  vehicleCategory: string;
  orderType?: string;
  date: string;
  time: string;
  notes: string;
  clientInfo?: string;
  internalInfo?: string;
  skipAutoAssign?: boolean;
  pickupRegionId?: number | null;
  preferenceIds?: number[];
  excludeDriverIds?: string[];
  operator?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  clientCode?: string | null;
  pickupRegionId?: number | null;
  assignedDriver?: { id: string; name: string; code: string } | null;
  error?: string;
}

export interface DispatchOrderResult {
  success: boolean;
  driverId?: string;
  driverName?: string;
  isNextOrder?: boolean;
  error?: string;
}

const OFFLINE_THRESHOLD_MS = 240 * 1000; // 240 sekund

export async function dispatchOrderToDriver(
  orderId: string,
  driverCode: string
): Promise<DispatchOrderResult> {
  await dataSourceService.waitForConfigLoad();

  if (!dataSourceService.isUsingExternalDatabase()) {
    return { success: false, error: 'Brak połączenia z bazą danych.' };
  }

  try {
    // 1. Znajdź kierowcę po kodzie wraz ze statusem i last_seen
    const driverResult = await dataSourceService.query<{
      id: string;
      name: string;
      driverState: string | null;  // camelCase — dataSourceService konwertuje snake→camel
      lastSeen: string | null;     // camelCase — dataSourceService konwertuje snake→camel
    }>(
      `SELECT id, name, driver_state, last_seen FROM drivers WHERE driver_code = ? LIMIT 1`,
      [driverCode]
    );

    if (!driverResult.success || !driverResult.data || driverResult.data.length === 0) {
      return { success: false, error: `Nie znaleziono kierowcy o kodzie "${driverCode}".` };
    }

    const driver = driverResult.data[0];

    // 2. Blokuj DOM (driver_state IS NULL = status Dom)
    if (driver.driverState === null || driver.driverState === undefined) {
      return { success: false, error: 'Kierowca jest w statusie Dom — nie można wydać zlecenia.' };
    }

    // 3. Sprawdź czy kierowca jest online (last_seen w ciągu 240s)
    if (!driver.lastSeen) {
      return { success: false, error: 'Kierowca nigdy nie był online — nie można wydać zlecenia.' };
    }
    const lastSeenMs = new Date(driver.lastSeen).getTime();
    if (isNaN(lastSeenMs) || Date.now() - lastSeenMs > OFFLINE_THRESHOLD_MS) {
      return { success: false, error: 'Kierowca jest offline (brak połączenia powyżej 240s).' };
    }

    // 4. Sprawdź czy kierowca ma już aktywne zlecenie → "Następny Kurs"
    //    UWAGA: next_driver celowo wyłączony — nie blokuje nowego pending_driver
    const activeCheck = await dataSourceService.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE driver_id = ? AND status IN ('pending_driver','accepted','at_pickup','in_progress')
       LIMIT 1`,
      [driver.id]
    );

    const hasActiveOrder = !!(activeCheck.success && activeCheck.data && activeCheck.data.length > 0);
    const orderStatus = hasActiveOrder ? 'next_driver' : 'pending_driver';

    // 5. Sprawdź blokadę kierowca-klient
    // UWAGA: dataSourceService konwertuje snake_case → camelCase, więc customer_id → customerId
    const orderCustomerResult = await dataSourceService.query<{ customerId: string | null }>(
      `SELECT customer_id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    const customerId = orderCustomerResult.data?.[0]?.customerId ?? null;
    if (customerId) {
      const blockCheck = await dataSourceService.query<{ id: number }>(
        `SELECT 1 AS id FROM driver_client_blocks WHERE driver_id = ? AND client_id = ? LIMIT 1`,
        [driver.id, customerId]
      );
      if (blockCheck.success && blockCheck.data && blockCheck.data.length > 0) {
        return { success: false, error: 'Kierowca jest zablokowany przez tego klienta — nie można wydać zlecenia.' };
      }
    }

    // 6. Przypisz kierowcę i zmień status zlecenia
    const updateResult = await dataSourceService.query(
      `UPDATE orders SET status = ?, driver_id = ?, updated_at = NOW()
       WHERE id = ? AND status IN ('pending', 'market', 'new')`,
      [orderStatus, driver.id, orderId]
    );

    if (!updateResult.success) {
      return { success: false, error: `Błąd aktualizacji zlecenia: ${updateResult.error}` };
    }

    // 6. Weryfikuj że UPDATE faktycznie zmienił status
    const verifyResult = await dataSourceService.query<{ id: string }>(
      `SELECT id FROM orders WHERE id = ? AND status = ?`,
      [orderId, orderStatus]
    );

    if (!verifyResult.success || !verifyResult.data || verifyResult.data.length === 0) {
      return {
        success: false,
        error: 'Zlecenie nie mogło zostać przypisane. Sprawdź czy zlecenie ma status "oczekujące" lub "giełda".',
      };
    }

    return { success: true, driverId: driver.id, driverName: driver.name, isNextOrder: hasActiveOrder };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Nieznany błąd.' };
  }
}

// ——— funkcje pomocnicze (czyste JS, bez zależności od DB) ———

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function generateClientCode(phone: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const r1 = chars[Math.floor(Math.random() * chars.length)];
  const r2 = chars[Math.floor(Math.random() * chars.length)];
  const digits = phone.replace(/\D/g, '');
  const last3 = digits.slice(-3).padStart(3, '0');
  return `CBR${r1}${r2}-${last3}`;
}

// Keyword fallback — używany tylko gdy dopasowanie po nazwie strefy nie da wyniku.
// validNumbers: numery stref istniejące w DB (żeby nie zwracać fantomowych numerów).
function detectZoneFromAddressKeywords(addr: string, validNumbers: Set<number>): number | null {
  const zoneKeywords: Record<number, string[]> = {
    1:  ['stare miasto', 'rynek główny', 'floriańska'],
    2:  ['kazimierz', 'szeroka', 'józefa'],
    3:  ['podgórze', 'wielicka', 'kalwaryjska'],
    4:  ['krowodrza', 'słowackiego', 'manifestu'],
    5:  ['grzegórzki', 'dietla', 'dąbrowskiego'],
    6:  ['prądnik', 'opolska', 'rakowicka'],
    7:  ['nowa huta', 'powstańców', 'bieńczycka'],
    8:  ['salwator', 'kościuszki', 'zwierzyniecka'],
    9:  ['dębniki', 'zakrzówek', 'tyniecka'],
    10: ['mistrzejowice', 'os. tysiąclecia'],
    11: ['bieńczyce', 'igołomska'],
    12: ['jagiellońska', 'mogilska', 'botaniczna'],
  };
  for (const [zoneNum, keywords] of Object.entries(zoneKeywords)) {
    const id = parseInt(zoneNum);
    if (validNumbers.has(id) && keywords.some(kw => addr.includes(kw))) return id;
  }
  return null;
}

// ——— główna funkcja tworzenia zlecenia ———

export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  // Poczekaj na załadowanie konfiguracji źródła danych
  await dataSourceService.waitForConfigLoad();

  if (!dataSourceService.isUsingExternalDatabase()) {
    return {
      success: false,
      error: 'Wymagane połączenie z bazą danych MySQL. Skonfiguruj połączenie w panelu Support → Baza danych.',
    };
  }

  try {
    // 1. Wykryj rejon odbioru — użyj przekazanego z formularza (GPS) lub dopasuj po nazwie
    let zoneNumber: number | null = payload.pickupRegionId ?? null;
    if (zoneNumber === null) {
      const zonesResult = await dataSourceService.query<{ number: number; name: string }>(
        'SELECT `number`, `name` FROM zones'
      );
      if (zonesResult.success && zonesResult.data && zonesResult.data.length > 0) {
        const addr = payload.pickupAddress.toLowerCase();
        // Najpierw: dopasowanie po nazwie strefy (najdokładniejsze)
        for (const zone of zonesResult.data) {
          if (zone.name && addr.includes(zone.name.toLowerCase())) {
            zoneNumber = zone.number;
            break;
          }
        }
        // Fallback: keyword matching — tylko dla numerów istniejących w DB
        if (zoneNumber === null) {
          const validNumbers = new Set(zonesResult.data.map(z => z.number));
          zoneNumber = detectZoneFromAddressKeywords(addr, validNumbers);
        }
      }
    }

    // 2. Pobierz kierowcę wg reguł przydziału (zone_assignment_rules)
    //    Jeżeli brak reguł dla rejonu → fallback: wolna w tym samym rejonie
    //    skipAutoAssign — wymusza status 'pending' (bez szukania kierowcy)
    let assignedDriver: { id: string; name: string; code: string } | null = null;
    if (zoneNumber !== null && !payload.skipAutoAssign && payload.orderType !== 'scheduled') {
      // Pobierz skonfigurowane reguły dla rejonu źródłowego (priorytetowo)
      // UWAGA: dataSourceService konwertuje snake_case → camelCase
      const rulesResult = await dataSourceService.query<Record<string, unknown>>(
        `SELECT search_zone, driver_state, step_type, radius_km FROM zone_assignment_rules
         WHERE source_zone = ? ORDER BY priority ASC`,
        [zoneNumber]
      );

      console.log('[createOrder] zoneNumber:', zoneNumber);
      console.log('[createOrder] rulesResult:', JSON.stringify(rulesResult));

      // Normalizuj klucze — obsłuż zarówno snake_case jak i camelCase
      const rawSteps = (rulesResult.success && rulesResult.data && rulesResult.data.length > 0)
        ? rulesResult.data.map((r: Record<string, unknown>) => ({
            stepType:   ((r.stepType ?? r.step_type) as string) ?? 'zone',
            searchZone: (r.searchZone ?? r.search_zone) as number | null,
            driverState: (r.driverState ?? r.driver_state) as string,
            radiusKm:   (r.radiusKm ?? r.radius_km) as number | null,
          }))
        : [{ stepType: 'zone', searchZone: zoneNumber, driverState: 'wolna', radiusKm: null }]; // fallback domyślny

      console.log('[createOrder] steps:', JSON.stringify(rawSteps));

      // Iteruj przez kroki — przydziel pierwszego pasującego kierowcę (z filtrem preferencji)
      const requiredPrefs = payload.preferenceIds ?? [];
      const excludeIds = payload.excludeDriverIds ?? [];
      for (const step of rawSteps) {
        console.log('[createOrder] Trying step type:', step.stepType, 'state:', step.driverState, step.stepType === 'radius' ? `radius: ${step.radiusKm}km` : `zone: ${step.searchZone}`);
        let candidates: Record<string, unknown>[] = [];

        if (step.stepType === 'radius') {
          // Szukaj po odległości GPS (formuła Haversine)
          const lat = payload.pickupLat;
          const lng = payload.pickupLng;
          if (!lat || !lng) {
            console.log('[createOrder] Krok radius pominięty — brak GPS adresu odbioru');
            continue; // brak koordynatów adresu → pomiń krok
          }
          const km = step.radiusKm ?? 1;
          const excludeClause = excludeIds.length > 0
            ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})`
            : '';
          const radiusResult = await dataSourceService.query<Record<string, unknown>>(
            `SELECT id, name, driver_code, preference_ids,
               (6371 * ACOS(GREATEST(-1, LEAST(1,
                 COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?))
                 + SIN(RADIANS(?)) * SIN(RADIANS(latitude))
               )))) AS distance
             FROM drivers
             WHERE driver_state = ?
               AND latitude IS NOT NULL AND longitude IS NOT NULL
               ${excludeClause}
               AND id NOT IN (
                 SELECT dcb.driver_id FROM driver_client_blocks dcb
                 JOIN clients c ON c.id = dcb.client_id
                 WHERE c.phone_number = ?
               )
             HAVING distance <= ?
             ORDER BY distance ASC
             LIMIT 20`,
            [lat, lng, lat, step.driverState, ...excludeIds, payload.customerPhone || '', km]
          );
          console.log('[createOrder] radius driverResult:', JSON.stringify(radiusResult));
          candidates = (radiusResult.success && radiusResult.data) ? radiusResult.data : [];
        } else {
          // Istniejąca logika — szukaj wg strefy
          const excludeClause = excludeIds.length > 0
            ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})`
            : '';
          const driverResult = await dataSourceService.query<Record<string, unknown>>(
            `SELECT id, name, driver_code, preference_ids FROM drivers
             WHERE driver_state = ? AND current_zone = ?
               ${excludeClause}
               AND id NOT IN (
                 SELECT dcb.driver_id FROM driver_client_blocks dcb
                 JOIN clients c ON c.id = dcb.client_id
                 WHERE c.phone_number = ?
               )
             ORDER BY free_since ASC LIMIT 20`,
            [step.driverState, step.searchZone, ...excludeIds, payload.customerPhone || '']
          );
          console.log('[createOrder] zone driverResult:', JSON.stringify(driverResult));
          candidates = (driverResult.success && driverResult.data) ? driverResult.data : [];
        }

        for (const d of candidates) {
          // Sprawdź czy kierowca ma wymagane preferencje
          let driverPrefs: number[] = [];
          try {
            const raw = d.preferenceIds ?? d.preference_ids;
            driverPrefs = Array.isArray(raw) ? raw : JSON.parse((raw as string) || '[]');
          } catch { driverPrefs = []; }

          const hasAllPrefs = requiredPrefs.length === 0 ||
            requiredPrefs.every(id => driverPrefs.includes(id));

          if (hasAllPrefs) {
            assignedDriver = {
              id: (d.id as string),
              name: (d.name as string),
              code: (d.driverCode ?? d.driver_code) as string,
            };
            console.log('[createOrder] Assigned driver (prefs OK):', assignedDriver);
            break;
          } else {
            console.log('[createOrder] Skip driver (missing prefs):', d.driver_code, 'has:', driverPrefs, 'required:', requiredPrefs);
          }
        }
        if (assignedDriver) break;
      }

    }
    // Brak kierowcy wg reguł — fallback_status rejonu (pending/market) obsługiwany niżej

    // 3. Obsługa klienta — sprawdź czy istnieje, jeśli nie — utwórz
    let clientId: string | null = null;
    let clientCode: string | null = null;

    if (payload.customerPhone) {
      const clientResult = await dataSourceService.query<{
        id: string;
        clientCode: string; // snake_case → camelCase
      }>(
        'SELECT id, client_code FROM clients WHERE phone_number = ?',
        [payload.customerPhone]
      );

      if (clientResult.success && clientResult.data && clientResult.data.length > 0) {
        clientId = clientResult.data[0].id;
        clientCode = clientResult.data[0].clientCode;
      } else {
        // Nowy klient
        clientId = generateUUID();
        clientCode = generateClientCode(payload.customerPhone);
        const insertClient = await dataSourceService.query(
          `INSERT INTO clients (id, phone_number, client_name, client_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [clientId, payload.customerPhone, payload.customerName || '', clientCode]
        );
        if (!insertClient.success) {
          return { success: false, error: `Błąd tworzenia klienta: ${insertClient.error}` };
        }
      }
    }

    // 4. Wygeneruj numer zlecenia w formacie XXX/MMYY
    const numResult = await dataSourceService.query<{ nextNum: number }>(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING_INDEX(order_number, '/', 1) AS UNSIGNED)), 99
       ) + 1 AS next_num
       FROM orders
       WHERE order_number IS NOT NULL AND order_number LIKE '%/%'`
    );
    const nextNum =
      numResult.success && numResult.data && numResult.data.length > 0
        ? Number(numResult.data[0].nextNum)
        : 100;

    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YY = String(now.getFullYear()).slice(-2);
    const orderNumber = `${nextNum}/${MM}${YY}`;

    // 5. Zapisz zlecenie
    // scheduled      — zlecenie terminowe, czeka na automatyczne wydanie wg ustawień rejonu
    // pending_driver — wysłane do kierowcy, czeka na akceptację
    // pending/market — brak kierowcy, wg konfiguracji rejonu (zone_settings.fallback_status)
    let fallbackOrderStatus = 'pending';
    if (zoneNumber !== null && !assignedDriver) {
      const fsResult = await dataSourceService.query<{ fallbackStatus: string }[]>(
        'SELECT fallback_status FROM zone_settings WHERE source_zone = ?',
        [zoneNumber]
      );
      const fsRow = (fsResult.data ?? [])[0] as any;
      const rawFallback = fsRow?.fallbackStatus ?? fsRow?.fallback_status ?? null;
      console.log(`[createOrder] zone_settings dla rejonu ${zoneNumber}: fsRow=`, JSON.stringify(fsRow), '→ rawFallback=', rawFallback);
      fallbackOrderStatus = rawFallback ?? 'pending';
    }
    console.log(`[createOrder] assignedDriver=${assignedDriver?.code ?? 'null'} zoneNumber=${zoneNumber} fallbackOrderStatus=${fallbackOrderStatus}`);
    const isScheduled = payload.orderType === 'scheduled';
    const orderStatus = isScheduled ? 'scheduled' : (assignedDriver ? 'pending_driver' : fallbackOrderStatus);
    const orderId = generateUUID();
    const insertOrder = await dataSourceService.query(
      `INSERT INTO orders (
         id, order_number, driver_id, customer_id, customer_name, customer_phone,
         pickup_address, destination_address, pickup_region_id,
         vehicle_category, payment_method, taxi_count,
         scheduled_date, scheduled_time, notes, status,
         order_type, client_info, internal_info, preference_ids,
         operator, pickup_lat, pickup_lng, destination_lat, destination_lng,
         market_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${orderStatus === 'market' ? 'NOW()' : 'NULL'}, NOW(), NOW())`,
      [
        orderId, orderNumber,
        assignedDriver?.id ?? null,
        clientId,
        payload.customerName || '',
        payload.customerPhone || '',
        payload.pickupAddress,
        payload.destinationAddress || '',
        zoneNumber,
        payload.vehicleCategory || 'standard',
        payload.paymentMethod || 'cash',
        payload.taxiCount || 1,
        payload.date || null,
        payload.time || null,
        payload.notes || '',
        orderStatus,
        payload.orderType || 'standard',
        payload.clientInfo || '',
        payload.internalInfo || '',
        payload.preferenceIds?.length ? JSON.stringify(payload.preferenceIds) : null,
        payload.operator || null,
        payload.pickupLat ?? null,
        payload.pickupLng ?? null,
        payload.destinationLat ?? null,
        payload.destinationLng ?? null,
      ]
    );

    if (!insertOrder.success) {
      return { success: false, error: `Błąd zapisu zlecenia: ${insertOrder.error}` };
    }

    return {
      success: true,
      orderId,
      orderNumber,
      clientCode,
      pickupRegionId: zoneNumber,
      assignedDriver,
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Nieznany błąd podczas tworzenia zlecenia' };
  }
}
