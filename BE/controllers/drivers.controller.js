import { getConnectionWithTimeout, safeQuery } from '../db.js';
import { isPointInPolygon, addDriverLog, addSystemLog } from '../shared/helpers.js';
import { detectZoneFromCoordinates } from '../shared/helpers.js';
import { getCached, setCache } from '../shared/helpers.js';
import * as driversRepo from '../repository/drivers.repository.js';

// Aktualizuj lokalizację kierowcy (z auto-reconnect przez safeQuery)
export async function updateDriverLocation(req, res) {
  const { driverId } = req.params;
  const latitude  = req.body.latitude  ?? req.body.lat;
  const longitude = req.body.longitude ?? req.body.lng;

  if (!latitude || !longitude) {
    return res.status(400).json({
      success: false,
      error: 'Latitude and longitude are required'
    });
  }

  let connection;
  try {
    connection = await getConnectionWithTimeout();
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const driverRow = await driversRepo.getDriverZoneState(connection, driverId);
    if (!driverRow) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    const currentZone = driverRow.current_zone ?? null;
    const driverState = driverRow.driver_state ?? null;
    let sql, params;
    let detectedZone = null;

    if (driverState !== null && driverState !== 'free') {
      sql = `UPDATE drivers SET latitude = ?, longitude = ?, last_seen = ?, last_location_update = ? WHERE id = ?`;
      params = [latitude, longitude, nowLocal, nowLocal, driverId];
      detectedZone = currentZone;
    } else {
      const zones = await driversRepo.getActiveZones(connection);
      const point = { lat: latitude, lng: longitude };
      for (const zone of zones) {
        let coords;
        try {
          coords = typeof zone.coordinates === 'string'
            ? JSON.parse(zone.coordinates)
            : zone.coordinates;
        } catch { continue; }
        if (isPointInPolygon(point, coords)) {
          detectedZone = zone.number;
          break;
        }
      }

      const zoneChanged = detectedZone !== currentZone;
      if (zoneChanged && detectedZone !== null) {
        if (driverState === 'wolna') {
          sql = `UPDATE drivers
                 SET latitude = ?, longitude = ?, current_zone = ?,
                     zone_entered_at = ?, free_since = ?, last_seen = ?, last_location_update = ?
                 WHERE id = ?`;
          params = [latitude, longitude, detectedZone, nowLocal, nowLocal, nowLocal, nowLocal, driverId];
        } else {
          sql = `UPDATE drivers
                 SET latitude = ?, longitude = ?, current_zone = ?,
                     zone_entered_at = ?, last_seen = ?, last_location_update = ?
                 WHERE id = ?`;
          params = [latitude, longitude, detectedZone, nowLocal, nowLocal, nowLocal, driverId];
        }
        addDriverLog(driverId, 'zone_enter', `Wjechał do rejonu ${detectedZone}`,
          currentZone != null ? `Poprzedni rejon: ${currentZone}` : null,
          { nowy_rejon: detectedZone, poprzedni_rejon: currentZone, lat: latitude, lng: longitude }
        );
        console.log(`[Location] ${driverId} zone: ${currentZone} -> ${detectedZone}`);
      } else if (detectedZone === null && currentZone !== null) {
        sql = `UPDATE drivers
               SET latitude = ?, longitude = ?, current_zone = NULL,
                   zone_entered_at = NULL, last_seen = ?, last_location_update = ?
               WHERE id = ?`;
        params = [latitude, longitude, nowLocal, nowLocal, driverId];
        addDriverLog(driverId, 'zone_leave', `Opuścił rejon ${currentZone}`,
          null,
          { poprzedni_rejon: currentZone, lat: latitude, lng: longitude }
        );
        console.log(`[Location] ${driverId} left all zones`);
      } else {
        sql = `UPDATE drivers SET latitude = ?, longitude = ?, last_seen = ?, last_location_update = ? WHERE id = ?`;
        params = [latitude, longitude, nowLocal, nowLocal, driverId];
      }
    }

    const result = await driversRepo.updateDriverLocationQuery(connection, sql, params);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    return res.json({
      success: true,
      data: {
        driverId, latitude, longitude,
        currentZone: detectedZone,
        zoneChanged: detectedZone !== currentZone,
        timestamp: nowLocal
      }
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('[Location Update] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function listDrivers(req, res) {
  try {
    const rows = await driversRepo.listDrivers();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[Drivers] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function listDriversAllInfo(req, res) {
  try {
    const rows = await driversRepo.listDriversAllInfo();
    res.json({ success: true, data: rows ?? [] });
  } catch (error) {
    console.error('[DriversAllInfo] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getDriverDetail(req, res) {
  const { id } = req.params;
  try {
    const rows = await driversRepo.getDriverDetail(id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kierowca nie znaleziony' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[DriverDetail] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function listDriversForMap(req, res) {
  try {
    const rows = await driversRepo.listDriversForMap();
    const data = (rows ?? []).map(r => ({
      id: r.id,
      name: r.name,
      driverCode: r.driver_code,
      driverState: r.driver_state ?? null,
      currentZone: r.current_zone ?? null,
      isOnline: r.is_online === 1,
      status: r.status ?? 'active',
      lat: parseFloat(r.latitude) || 0,
      lng: parseFloat(r.longitude) || 0,
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getDriverLocations(req, res) {
  try {
    const cached = getCached('drivers:locations');
    if (cached) {
      console.log('[Get Locations] Returning cached data');
      return res.json(cached);
    }

    console.log('[Get Locations] Fetching all driver locations');
    const rows = await driversRepo.listDriversWithLocations();

    const response = { success: true, data: rows };
    setCache('drivers:locations', response);

    res.json(response);
  } catch (error) {
    console.error('[Get Locations] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function recalculateZones(req, res) {
  try {
    console.log('[Recalculate Zones] Starting zone recalculation for all drivers');

    const connection = await getConnectionWithTimeout();
    const drivers = await driversRepo.listDriversWithLocationForRecalc(connection);

    if (drivers.length === 0) {
      connection.release();
      return res.json({
        success: true,
        message: 'No drivers with location found',
        checked: 0,
        updated: 0
      });
    }

    let updatedCount = 0;

    for (const driver of drivers) {
      const detectedZone = await detectZoneFromCoordinates(driver.latitude, driver.longitude);

      if (detectedZone !== driver.current_zone) {
        if (detectedZone !== null) {
          if (driver.driver_state === 'wolna') {
            await connection.query(
              'UPDATE drivers SET current_zone = ?, zone_entered_at = NOW(), free_since = NOW() WHERE id = ?',
              [detectedZone, driver.id]
            );
          } else {
            await connection.query(
              'UPDATE drivers SET current_zone = ?, zone_entered_at = NOW() WHERE id = ?',
              [detectedZone, driver.id]
            );
          }
        } else {
          await connection.query(
            'UPDATE drivers SET current_zone = NULL, zone_entered_at = NULL WHERE id = ?',
            [driver.id]
          );
        }

        console.log(`[Recalculate Zones] Driver ${driver.driver_code}: ${driver.current_zone} -> ${detectedZone}${driver.driver_state === 'wolna' ? ' (free_since reset)' : ''}`);
        updatedCount++;
      }
    }

    connection.release();

    res.json({
      success: true,
      message: `Zone recalculation completed`,
      checked: drivers.length,
      updated: updatedCount
    });
  } catch (error) {
    console.error('[Recalculate Zones] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getDriverStatus(req, res) {
  const { driverId } = req.params;

  if (!driverId) {
    return res.status(400).json({ success: false, error: 'Brak driverId' });
  }

  try {
    const rows = await driversRepo.getDriverStatus(driverId);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kierowca nie znaleziony' });
    }

    const d = rows[0];

    const stateToStatus = { wolna: 'free', dojazd: 'pickup', zajeta: 'busy', kursem: 'driving' };
    const status = d.driver_state ? (stateToStatus[d.driver_state] ?? 'home') : 'home';

    let statusDuration = '0m';
    const changedAt = d.status_changed_at || d.free_since;
    if (changedAt) {
      const diffMs = Date.now() - new Date(changedAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) {
        statusDuration = `${diffMins}m`;
      } else {
        const h = Math.floor(diffMins / 60);
        const m = diffMins % 60;
        statusDuration = `${h}h ${m}m`;
      }
    }

    return res.json({
      success: true,
      driverId: d.id,
      driverState: d.driver_state,
      status,
      currentZone: d.current_zone,
      zoneName: d.zone_name ?? null,
      zoneEnteredAt: d.zone_entered_at ?? null,
      queuePosition: d.live_queue_position ?? null,
      freeSince: d.free_since,
      statusChangedAt: d.status_changed_at,
      statusDuration,
      isOnline: Boolean(d.is_online),
    });
  } catch (err) {
    console.error('[DriverStatus] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
  }
}

export async function getPendingOrder(req, res) {
  const { driverId } = req.params;
  try {
    const rows = await driversRepo.getPendingOrderForDriver(driverId);
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[PendingOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getActiveOrdersCount(req, res) {
  const { driverCode } = req.params;
  try {
    const driver = await driversRepo.getDriverIdByCode(driverCode);
    if (!driver || driver.length === 0) return res.json({ success: true, count: 0 });
    const rows = await driversRepo.countActiveOrdersForDriver(driver[0].id);
    return res.json({ success: true, count: rows?.[0]?.cnt ?? 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/drivers/:driverId/next-order — następny kurs kierowcy (next_driver lub next_accepted)
export async function getNextOrderExtended(req, res) {
  const { driverId } = req.params;
  try {
    const rows = await driversRepo.getNextOrderForDriverExtended(driverId);
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/drivers/:driverId/next-order — następne zlecenie (status next_driver) [duplicate route, preserved]
export async function getNextOrderBasic(req, res) {
  const { driverId } = req.params;
  try {
    const rows = await driversRepo.getNextOrderForDriverBasic(driverId);
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[NextOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getActiveOrder(req, res) {
  const { driverId } = req.params;
  try {
    const rows = await driversRepo.getActiveOrderForDriver(driverId);
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[ActiveOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Kod niech jak narazie zostanie. Stworzone zostały dwie funkcja, jedna z kontrolą jednej sesji, druga bez. 
// W przyszłości można będzie usunąć jedną z nich.

// // Login endpoint for mobile app (driver code + PIN)
// export async function driverLogin(req, res) {
//   const { driverCode, pin } = req.body;

//   console.log('[Auth] Login attempt - driver code:', driverCode);

//   try {
//     const drivers = await driversRepo.findDriverByCodeAndPin(driverCode, pin);

//     if (!drivers || drivers.length === 0) {
//       console.log('[Auth] ❌ Invalid credentials');
//       return res.status(401).json({
//         success: false,
//         error: 'Nieprawidłowy kod kierowcy lub PIN'
//       });
//     }

//     const driver = drivers[0];

//     delete driver.password;
//     delete driver.pin;

//     const token = `driver_${driver.id}_${Date.now()}`;

//     console.log('[Auth] ✅ Login successful - driver:', driver.name);

//     res.json({
//       success: true,
//       token: token,
//       user: driver
//     });

//   } catch (error) {
//     console.error('[Auth] Error:', error.message);
//     res.status(500).json({
//       success: false,
//       error: 'Authentication failed: ' + error.message
//     });
//   }
// }

// POST /api/auth/driver/login — logowanie z kontrolą jednej sesji
export async function driverLoginSingleSession(req, res) {
  const { driverCode, pin, force } = req.body;

  if (!driverCode || !pin) {
    return res.status(400).json({ success: false, error: 'Wymagany kod kierowcy i PIN' });
  }

  console.log('[Auth] Driver login attempt - code:', driverCode, 'force:', !!force);

  let connection;
  try {
    connection = await getConnectionWithTimeout();

    const drivers = await driversRepo.findDriverByCodeAndPinTx(connection, driverCode, pin);

    if (!drivers || drivers.length === 0) {
      connection.release();
      console.log('[Auth] ❌ Invalid credentials for code:', driverCode);
      return res.status(401).json({ success: false, error: 'Nieprawidłowy kod kierowcy lub PIN' });
    }

    const driver = drivers[0];

    if (driver.status === 'inactive') {
      connection.release();
      return res.status(403).json({ success: false, error: 'Konto kierowcy jest nieaktywne. Skontaktuj się z administratorem.' });
    }
    if (driver.status === 'suspended') {
      connection.release();
      return res.status(403).json({
        success: false,
        error: 'suspended',
        suspendedUntil: driver.suspended_until
      });
    }

    if (!force && driver.session_token && driver.last_seen) {
      const lastSeenMs = new Date(driver.last_seen).getTime();
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      if (lastSeenMs > thirtyMinutesAgo) {
        connection.release();
        console.log('[Auth] ⚠️  Already logged in on another device - driver:', driver.name);
        return res.json({
          success: false,
          error: 'already_logged_in',
          driverName: driver.name
        });
      }
    }

    const sessionToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await driversRepo.setDriverSession(connection, sessionToken, nowLocal, driver.id);
    connection.release();

    addDriverLog(driver.id, 'login', 'Kierowca zalogował się do aplikacji', null, { force: !!force });
    addSystemLog({ type: 'login', category: 'auth', userId: String(driver.id), userName: driver.name, userRole: 'driver', description: `Kierowca ${driver.name} (${driverCode}) zalogował się do aplikacji`, metadata: { driverCode, force: !!force }, ipAddress: req.ip });

    const sanitized = { ...driver };
    delete sanitized.password;
    delete sanitized.pin;
    delete sanitized.session_token;

    const token = `driver_${driver.id}_${Date.now()}`;
    console.log('[Auth] ✅ Driver login OK - name:', driver.name, force ? '(force)' : '');

    return res.json({
      success: true,
      token,
      sessionToken,
      user: sanitized
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('[Auth Driver] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Błąd serwera: ' + error.message });
  }
}

// POST /api/auth/driver/logout — wylogowanie (kasuje session_token)
export async function driverLogout(req, res) {
  const { driverId, sessionToken } = req.body;

  if (!driverId) {
    return res.status(400).json({ success: false, error: 'Brak driverId' });
  }

  console.log('[Auth] Driver logout - id:', driverId);

  try {
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await driversRepo.clearDriverSessionOnLogout(nowLocal, driverId);
    console.log('[Auth] ✅ Driver logged out (status reset, lat/lng cleared) - id:', driverId);
    addDriverLog(driverId, 'logout', 'Kierowca wylogował się z aplikacji');
    addSystemLog({ type: 'logout', category: 'auth', userId: String(driverId), userRole: 'driver', description: `Kierowca (ID: ${driverId}) wylogował się z aplikacji`, ipAddress: req.ip });
    return res.json({ success: true });
  } catch (error) {
    console.error('[Auth] Logout error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/drivers/:id/logs — historia zdarzeń kierowcy
export async function getDriverLogs(req, res) {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '200'), 500);
  try {
    const logs = await driversRepo.getDriverLogs(id, limit);
    const parsed = (logs || []).map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description || null,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      created_at: row.created_at,
    }));
    return res.json({ success: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/drivers/:id/suspend — dyspozytor blokuje kierowcę
export async function suspendDriver(req, res) {
  const { id } = req.params;
  const { hours } = req.body;
  try {
    const suspendedUntil = hours ? new Date(Date.now() + hours * 3600000) : null;
    await driversRepo.suspendDriverQuery(id, suspendedUntil);
    const desc = hours ? `Konto zablokowane na ${hours} godz. (do ${suspendedUntil?.toLocaleString('pl-PL')})` : 'Konto zablokowane bezterminowo przez dyspozytora';
    addDriverLog(id, 'suspend', 'Konto kierowcy zostało zablokowane', desc, { godziny: hours ?? null, zablokowane_do: suspendedUntil });
    addSystemLog({ type: 'driver_suspend', category: 'admin', description: `Zablokowano konto kierowcy (ID: ${id}) — ${desc}`, metadata: { driverId: id, hours, suspendedUntil } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// PATCH /api/drivers/:id/taximeter-enabled
export async function setTaximeterEnabled(req, res) {
  const { enabled } = req.body;
  try {
    await driversRepo.setTaximeterEnabled(req.params.id, enabled);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

// GET /api/drivers/:id/taximeter-enabled
export async function getTaximeterEnabled(req, res) {
  try {
    const rows = await driversRepo.getTaximeterEnabled(req.params.id);
    res.json({ success: true, enabled: !!(rows?.[0]?.taximeter_enabled) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

// ============================================================================
// MAINTENANCE — offline kierowcy (background job)
// ============================================================================
export async function checkOfflineDrivers() {
  try {
    const rows = await driversRepo.getOfflineDriverCandidates();
    for (const d of rows) {
      await driversRepo.resetDriverToOffline(d.id);
      addDriverLog(d.id, 'offline_auto', `Rozłączony automatycznie (brak aktywności przez 240s)`,
        'Stan zresetowany do: DOM', { powod: 'timeout_polaczenia' }
      );
      console.log(`[OfflineCheck] ${d.driver_code} → DOM (brak połączenia 240s)`);
    }
  } catch (err) {
    console.error('[OfflineCheck] Error:', err.message);
  }
}
