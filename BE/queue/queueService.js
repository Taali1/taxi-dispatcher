// ============================================================================
// QueueService — logika biznesowa kolejkowania kierowców
// Wszystkie operacje zapisu wykonywane w transakcjach MySQL.
// ============================================================================

// Ray Casting Algorithm — identyczna implementacja jak w server.js
function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.lng;
  const y = point.lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Parsuj coordinates ze strefy (JSON string lub array) */
function parseCoordinates(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** Zwróć aktualny czas UTC jako string dla MySQL (YYYY-MM-DD HH:MM:SS) */
function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Pobierz połączenie z pulą — jeśli timeout, czekaj chwilę i ponów próbę */
async function getConn(getConnectionWithTimeout) {
  try {
    return await getConnectionWithTimeout(5000);
  } catch (e) {
    if (e.message?.includes('timeout') || e.code === 'ETIMEDOUT') {
      await new Promise(r => setTimeout(r, 400));
      return await getConnectionWithTimeout(5000);
    }
    throw e;
  }
}

const STATE_LABELS = { wolna: 'Wolna', dojazd: 'Dojazd', zajeta: 'Zajęta', kursem: 'Kursem' };

async function logDriver(safeQuery, driverId, type, title, description = null, metadata = null) {
  if (!safeQuery || !driverId) return;
  try {
    await safeQuery(
      `INSERT INTO driver_logs (driver_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)`,
      [driverId, type, title, description, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (e) {
    console.error('[DriverLog] Błąd zapisu logu:', e.message);
  }
}

export function createQueueService({ repo, getConnectionWithTimeout, safeQuery }) {

  // --------------------------------------------------------------------------
  // enterZone — wejście do rejonu (zmiana stanu + rejonu jednocześnie)
  // --------------------------------------------------------------------------
  /**
   * driverState: 'wolna' | 'dojazd' | 'kursem'
   * zoneNumber:
   *   - 'wolna' / 'dojazd': ignorowany — backend auto-wykrywa z GPS
   *   - 'kursem': wymagany (kierowca podaje ręcznie)
   */
  async function enterZone(driverId, driverState, zoneNumber) {
    const connection = await getConn(getConnectionWithTimeout);
    await connection.beginTransaction();

    try {
      // 1. Pobierz dane kierowcy
      const [driverRows] = await connection.query(
        `SELECT id, latitude, longitude, current_zone, driver_state FROM drivers WHERE id = ? FOR UPDATE`,
        [driverId]
      );
      const driver = driverRows?.[0];
      if (!driver) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'Kierowca nie znaleziony' };
      }

      let targetZoneNumber = zoneNumber;

      if (driverState === 'zajeta') {
        // Zajęta — nie wchodzi do żadnego rejonu, current_zone = NULL
        targetZoneNumber = null;

      } else if (driverState === 'wolna' || driverState === 'dojazd') {
        // Walidacja GPS — kierowca musi fizycznie być w strefie
        if (!driver.latitude || !driver.longitude) {
          if (!zoneNumber) {
            await connection.rollback();
            connection.release();
            return { success: false, error: 'Brak danych GPS. Poczekaj na sygnał GPS lub podaj numer rejonu.' };
          }
          // Brak GPS — użyj ręcznie podanego rejonu jako fallback
          targetZoneNumber = zoneNumber;
        } else {
          // Pobierz wszystkie aktywne strefy i znajdź w której jest GPS
          const [zones] = await connection.query(
            `SELECT id, number, coordinates FROM zones WHERE is_active = 1`
          );

          let detectedZoneNumber = null;
          for (const zone of zones) {
            const coords = parseCoordinates(zone.coordinates);
            if (!coords) continue;
            if (isPointInPolygon({ lat: driver.latitude, lng: driver.longitude }, coords)) {
              detectedZoneNumber = zone.number;
              break;
            }
          }

          if (!detectedZoneNumber) {
            if (!zoneNumber) {
              await connection.rollback();
              connection.release();
              return { success: false, error: 'GPS poza rejonem. Wjedź fizycznie do rejonu lub podaj numer rejonu.' };
            }
            // GPS poza strefami — użyj ręcznie podanego rejonu jako fallback
            targetZoneNumber = zoneNumber;
          } else {
            targetZoneNumber = detectedZoneNumber;
          }
        }

      } else if (driverState === 'kursem') {
        // Kursem — walidacja tylko że zoneNumber jest podany
        if (!zoneNumber) {
          await connection.rollback();
          connection.release();
          return { success: false, error: 'Podaj numer rejonu dla stanu Kursem.' };
        }
        // Sprawdź czy strefa istnieje
        const [zoneRows] = await connection.query(
          `SELECT id, number FROM zones WHERE number = ? AND is_active = 1 LIMIT 1`,
          [zoneNumber]
        );
        if (!zoneRows?.length) {
          await connection.rollback();
          connection.release();
          return { success: false, error: `Rejon ${zoneNumber} nie istnieje lub jest nieaktywny.` };
        }
        targetZoneNumber = zoneNumber;
      }

      const previousZone = driver.current_zone;
      const now = nowUtc();
      const freeSince = driverState === 'wolna' ? now : null;

      // 2. Ustaw nowy stan kierowcy
      await connection.query(
        `UPDATE drivers
         SET driver_state = ?,
             current_zone = ?,
             zone_entered_at = ?,
             free_since = ?,
             status_changed_at = ?
         WHERE id = ?`,
        [driverState, targetZoneNumber, now, freeSince, now, driverId]
      );

      // 3. Przelicz kolejkę nowej strefy (zajeta nie ma strefy — skip)
      if (targetZoneNumber !== null) {
        await repo.recalculateQueue(connection, targetZoneNumber);
      }

      // 4. Przelicz kolejkę poprzedniej strefy (jeśli inna lub zajeta wychodząca ze strefy)
      if (previousZone && previousZone !== targetZoneNumber) {
        await repo.recalculateQueue(connection, previousZone);
      }

      // 5. Odczytaj nową pozycję kierowcy (w tej samej transakcji — bez drugiego połączenia)
      const [posRows] = await connection.query(
        `SELECT queue_position FROM drivers WHERE id = ?`,
        [driverId]
      );
      const queuePosition = posRows?.[0]?.queue_position ?? null;

      await connection.commit();

      console.log(`[QueueService] enterZone driverId=${driverId} state=${driverState} zone=${targetZoneNumber} pos=${queuePosition}`);

      const prevState = driver.driver_state;
      const label = STATE_LABELS[driverState] ?? driverState;
      const zoneDesc = targetZoneNumber ? `Rejon: ${targetZoneNumber}` : null;
      if (driverState === 'kursem') {
        logDriver(safeQuery, driverId, 'state_change', `Zmiana stanu na: Kursem (rejon ${targetZoneNumber})`, zoneDesc, { nowy_stan: driverState, rejon: targetZoneNumber, poprzedni_stan: prevState, pozycja_w_kolejce: queuePosition });
      } else if (driverState === 'zajeta') {
        logDriver(safeQuery, driverId, 'state_change', `Zmiana stanu na: Zajęta`, null, { nowy_stan: driverState, poprzedni_stan: prevState });
      } else {
        logDriver(safeQuery, driverId, 'state_change', `Dołączył do rejonu ${targetZoneNumber} — stan: ${label}`,
          `Pozycja w kolejce: ${queuePosition ?? '—'}`,
          { nowy_stan: driverState, rejon: targetZoneNumber, poprzedni_rejon: driver.current_zone, poprzedni_stan: prevState, pozycja_w_kolejce: queuePosition }
        );
      }

      return {
        success: true,
        driverState,
        zoneNumber: targetZoneNumber,
        queuePosition,
      };

    } catch (err) {
      await connection.rollback();
      console.error('[QueueService] enterZone error:', err.message);
      throw err;
    } finally {
      connection.release();
    }
  }

  // --------------------------------------------------------------------------
  // changeDriverState — zmiana stanu bez zmiany rejonu
  // --------------------------------------------------------------------------
  /**
   * Używane gdy kierowca zmienia stan pozostając w tej samej strefie.
   * Walidacja GPS tylko dla 'wolna' (kierowca musi być fizycznie w rejonie).
   * 'dojazd' i 'kursem' nie wymagają GPS przy zmianie stanu.
   */
  async function changeDriverState(driverId, newState) {
    const connection = await getConn(getConnectionWithTimeout);
    await connection.beginTransaction();

    try {
      const [driverRows] = await connection.query(
        `SELECT id, latitude, longitude, current_zone, driver_state FROM drivers WHERE id = ? FOR UPDATE`,
        [driverId]
      );
      const driver = driverRows?.[0];
      if (!driver) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'Kierowca nie znaleziony' };
      }

      // Walidacja GPS tylko dla 'wolna' — kierowca musi być fizycznie w rejonie aby ogłosić gotowość
      // Dla 'dojazd' i 'kursem' walidacja GPS nie jest wymagana przy zmianie stanu w rejonie
      if (newState === 'wolna' && driver.current_zone) {
        if (!driver.latitude || !driver.longitude) {
          await connection.rollback();
          connection.release();
          return { success: false, error: 'Brak danych GPS. Poczekaj na sygnał GPS i spróbuj ponownie.' };
        }

        const [zones] = await connection.query(
          `SELECT id, number, name, coordinates FROM zones WHERE number = ? AND is_active = 1 LIMIT 1`,
          [driver.current_zone]
        );
        const zone = zones?.[0];
        if (zone) {
          const coords = parseCoordinates(zone.coordinates);
          if (coords && !isPointInPolygon({ lat: driver.latitude, lng: driver.longitude }, coords)) {
            await connection.rollback();
            connection.release();
            return {
              success: false,
              error: `GPS poza rejonem ${driver.current_zone}. Jeśli jesteś w innym rejonie, kliknij najpierw „Dom" i dołącz do właściwego rejonu.`
            };
          }
        }
      }

      const now = nowUtc();
      const freeSince = newState === 'wolna' ? now : null;
      // Zajęta wychodzi z kolejki — current_zone = NULL
      const clearZone = newState === 'zajeta';

      // zone_entered_at resetujemy przy każdej zmianie stanu — kierowca wracający
      // do 'wolna' po kursem/dojazd/zajeta dostaje świeży znacznik czasu i idzie
      // na koniec kolejki (ORDER BY COALESCE(free_since, status_changed_at) ASC).
      await connection.query(
        `UPDATE drivers
         SET driver_state = ?,
             current_zone = ${clearZone ? 'NULL' : '?'},
             free_since = ?,
             zone_entered_at = ?,
             status_changed_at = ?
         WHERE id = ?`,
        clearZone
          ? [newState, freeSince, now, now, driverId]
          : [newState, driver.current_zone, freeSince, now, now, driverId]
      );

      // Przelicz kolejkę starego rejonu (przed zajeta kierowca mógł być w rejonie)
      if (driver.current_zone) {
        await repo.recalculateQueue(connection, driver.current_zone);
      }

      // Odczytaj nową pozycję (w tej samej transakcji — bez drugiego połączenia)
      let queuePosition = null;
      const [posRows2] = await connection.query(
        `SELECT queue_position FROM drivers WHERE id = ?`,
        [driverId]
      );
      queuePosition = posRows2?.[0]?.queue_position ?? null;

      await connection.commit();

      console.log(`[QueueService] changeDriverState driverId=${driverId} state=${newState} zone=${driver.current_zone} pos=${queuePosition}`);

      const label = STATE_LABELS[newState] ?? newState;
      const prevLabel = STATE_LABELS[driver.driver_state] ?? driver.driver_state ?? '—';
      logDriver(safeQuery, driverId, 'state_change', `Zmiana stanu: ${prevLabel} → ${label}`,
        driver.current_zone ? `Rejon: ${driver.current_zone} · Pozycja w kolejce: ${queuePosition ?? '—'}` : null,
        { nowy_stan: newState, poprzedni_stan: driver.driver_state, rejon: driver.current_zone, pozycja_w_kolejce: queuePosition }
      );

      return {
        success: true,
        driverState: newState,
        zoneNumber: driver.current_zone,
        queuePosition,
      };

    } catch (err) {
      await connection.rollback();
      console.error('[QueueService] changeDriverState error:', err.message);
      throw err;
    } finally {
      connection.release();
    }
  }

  // --------------------------------------------------------------------------
  // leaveZone — wyjście z kolejki (przycisk Dom)
  // --------------------------------------------------------------------------
  async function leaveZone(driverId) {
    const connection = await getConn(getConnectionWithTimeout);
    await connection.beginTransaction();

    try {
      const [driverRows] = await connection.query(
        `SELECT id, current_zone FROM drivers WHERE id = ? FOR UPDATE`,
        [driverId]
      );
      const driver = driverRows?.[0];
      if (!driver) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'Kierowca nie znaleziony' };
      }

      const previousZone = driver.current_zone;
      await repo.clearDriverState(connection, driverId);

      if (previousZone) {
        await repo.recalculateQueue(connection, previousZone);
      }

      await connection.commit();

      console.log(`[QueueService] leaveZone driverId=${driverId} previousZone=${previousZone}`);

      logDriver(safeQuery, driverId, 'state_change', `Opuścił kolejkę — przeszedł do: DOM`,
        previousZone ? `Poprzedni rejon: ${previousZone}` : null,
        { nowy_stan: 'dom', poprzedni_rejon: previousZone }
      );

      return { success: true, driverState: null, zoneNumber: null, queuePosition: null };

    } catch (err) {
      await connection.rollback();
      console.error('[QueueService] leaveZone error:', err.message);
      throw err;
    } finally {
      connection.release();
    }
  }

  // --------------------------------------------------------------------------
  // Odczyt kolejek
  // --------------------------------------------------------------------------

  async function getQueueForZone(zoneNumber) {
    const drivers = await repo.getDriversInZone(zoneNumber);
    return {
      success: true,
      zoneNumber,
      drivers: drivers.map(d => {
        let preferenceIds = [];
        try {
          const raw = d.preference_ids;
          preferenceIds = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch { preferenceIds = []; }
        return {
          driverId: d.id,
          driverCode: d.driver_code,
          name: d.name,
          driverState: d.driver_state,
          zoneEnteredAt: d.zone_entered_at,
          queuePosition: d.queue_position,
          latitude: d.latitude,
          longitude: d.longitude,
          preferenceIds,
        };
      }),
    };
  }

  async function getAllQueues() {
    const drivers = await repo.getAllQueues();
    // Grupuj po strefie
    const grouped = {};
    for (const d of drivers) {
      const z = d.current_zone;
      if (!grouped[z]) grouped[z] = [];
      grouped[z].push({
        driverId: d.id,
        driverCode: d.driver_code,
        name: d.name,
        driverState: d.driver_state,
        zoneEnteredAt: d.zone_entered_at,
        queuePosition: d.queue_position,
      });
    }
    return { success: true, queues: grouped };
  }

  return { enterZone, changeDriverState, leaveZone, getQueueForZone, getAllQueues };
}
