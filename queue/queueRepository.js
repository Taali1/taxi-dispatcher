// ============================================================================
// QueueRepository — surowe operacje SQL na tabelach drivers / driver_queue
// Wszystkie metody wymagające transakcji przyjmują `connection` jako parametr.
// Metody readonly używają safeQuery przekazanego przy inicjalizacji.
// ============================================================================

export function createQueueRepository({ safeQuery, getConnectionWithTimeout }) {

  // --------------------------------------------------------------------------
  // Odczyt
  // --------------------------------------------------------------------------

  /** Pobierz dane kierowcy do walidacji GPS i stanu */
  async function getDriverById(driverId) {
    const rows = await safeQuery(
      `SELECT id, latitude, longitude, current_zone, driver_state, zone_entered_at, queue_position
       FROM drivers WHERE id = ?`,
      [driverId]
    );
    return rows?.[0] ?? null;
  }

  /** Pobierz strefę po numerze (potrzebne do walidacji GPS) */
  async function getZoneByNumber(zoneNumber) {
    const rows = await safeQuery(
      `SELECT id, number, coordinates FROM zones WHERE number = ? AND is_active = 1 LIMIT 1`,
      [zoneNumber]
    );
    return rows?.[0] ?? null;
  }

  /** Pobierz wszystkie aktywne strefy (używane przy auto-detekcji GPS) */
  async function getAllActiveZones() {
    return await safeQuery(
      `SELECT id, number, coordinates FROM zones WHERE is_active = 1`
    );
  }

  /** Pobierz posortowanych kierowców w strefie (używane przez recalculateQueue) */
  async function getDriversInZoneForRecalc(connection, zoneNumber) {
    const [rows] = await connection.query(
      `SELECT id
       FROM drivers
       WHERE current_zone = ? AND driver_state IS NOT NULL
       ORDER BY FIELD(driver_state, 'wolna', 'dojazd', 'zajeta', 'kursem'),
                COALESCE(free_since, status_changed_at) ASC`,
      [zoneNumber]
    );
    return rows;
  }

  /** Pobierz kierowców w strefie z pełnymi danymi (dla endpointu GET /api/queue/zone/:nr) */
  async function getDriversInZone(zoneNumber) {
    return await safeQuery(
      `SELECT id, driver_code, name, driver_state, zone_entered_at, free_since, queue_position, latitude, longitude, preference_ids
       FROM drivers
       WHERE current_zone = ? AND driver_state IS NOT NULL AND driver_state != 'zajeta'
       ORDER BY FIELD(driver_state, 'wolna', 'dojazd', 'kursem'),
                COALESCE(free_since, status_changed_at) ASC`,
      [zoneNumber]
    );
  }

  /** Pobierz wszystkich kierowców ze wszystkich stref kolejki — bez kierowców "zajęta" */
  async function getAllQueues() {
    return await safeQuery(
      `SELECT id, driver_code, name, current_zone, driver_state, zone_entered_at, free_since, queue_position
       FROM drivers
       WHERE driver_state IS NOT NULL AND current_zone IS NOT NULL AND driver_state != 'zajeta'
       ORDER BY current_zone ASC,
                FIELD(driver_state, 'wolna', 'dojazd', 'kursem'),
                COALESCE(free_since, status_changed_at) ASC`
    );
  }

  // --------------------------------------------------------------------------
  // Zapis (w transakcji — przyjmują `connection`)
  // --------------------------------------------------------------------------

  /**
   * Przelicz i zapisz queue_position dla wszystkich kierowców w strefie.
   * Musi być wywołane wewnątrz aktywnej transakcji.
   */
  async function recalculateQueue(connection, zoneNumber) {
    const drivers = await getDriversInZoneForRecalc(connection, zoneNumber);
    for (let i = 0; i < drivers.length; i++) {
      await connection.query(
        `UPDATE drivers SET queue_position = ? WHERE id = ?`,
        [i + 1, drivers[i].id]
      );
    }
    console.log(`[QueueRepository] recalculateQueue zone=${zoneNumber}: ${drivers.length} kierowców`);
  }

  /**
   * Ustaw driver_state, current_zone, zone_entered_at kierowcy.
   * Musi być wywołane wewnątrz aktywnej transakcji.
   */
  async function setDriverState(connection, driverId, driverState, zoneNumber, enteredAt, freeSince) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await connection.query(
      `UPDATE drivers
       SET driver_state = ?,
           current_zone = ?,
           zone_entered_at = ?,
           free_since = ?,
           status_changed_at = ?
       WHERE id = ?`,
      [driverState, zoneNumber, enteredAt, freeSince, now, driverId]
    );
  }

  /**
   * Wyczyść driver_state i current_zone (wyjście z kolejki / Dom).
   * Musi być wywołane wewnątrz aktywnej transakcji.
   */
  async function clearDriverState(connection, driverId) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await connection.query(
      `UPDATE drivers
       SET driver_state = NULL,
           current_zone = NULL,
           zone_entered_at = NULL,
           queue_position = NULL,
           free_since = NULL,
           status_changed_at = ?
       WHERE id = ?`,
      [now, driverId]
    );
  }

  return {
    getDriverById,
    getZoneByNumber,
    getAllActiveZones,
    getDriversInZone,
    getAllQueues,
    recalculateQueue,
    setDriverState,
    clearDriverState,
  };
}
