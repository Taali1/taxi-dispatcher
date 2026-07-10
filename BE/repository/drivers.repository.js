import { getConnectionWithTimeout, safeQuery } from '../db.js';

export async function getDriverZoneState(connection, driverId) {
  const [[driverRow]] = await connection.query(
    'SELECT current_zone, driver_state FROM drivers WHERE id = ?',
    [driverId]
  );
  return driverRow;
}

export async function getActiveZones(connection) {
  const [zones] = await connection.query(
    'SELECT number, coordinates FROM zones WHERE is_active = 1'
  );
  return zones;
}

export async function updateDriverLocationQuery(connection, sql, params) {
  const [result] = await connection.query(sql, params);
  return result;
}

export async function listDrivers() {
  return safeQuery(
    'SELECT id, name, driver_code, driver_state, is_online FROM drivers ORDER BY driver_code ASC'
  );
}

export async function listDriversAllInfo() {
  return safeQuery(
    `SELECT d.id, d.driver_code, d.name, d.vehicle_brand, d.vehicle_model,
            d.registration_number, d.driver_state, d.current_zone, d.queue_position,
            d.is_online, d.status,
            o.pickup_address AS active_order_address, o.order_number AS active_order_number
     FROM drivers d
     LEFT JOIN orders o ON o.driver_id = d.id
       AND o.status IN ('pending_driver','accepted','at_pickup','in_progress')
     WHERE d.status NOT IN ('inactive')
     ORDER BY d.driver_code ASC`
  );
}

export async function getDriverDetail(id) {
  return safeQuery(
    `SELECT d.id, d.driver_code, d.name, d.email, d.phone_number,
            d.driver_state, d.is_online, d.status, d.current_zone,
            d.queue_position, d.zone_entered_at, d.last_seen, d.free_since,
            d.vehicle_brand, d.vehicle_model, d.vehicle_color,
            d.registration_number, d.side_number, d.vehicle_categories,
            d.emergency_contact, d.rating, d.total_rides,
            d.license_number, d.license_expiry, d.created_at,
            d.latitude, d.longitude, d.preference_ids,
            o.id AS active_order_id,
            o.order_number AS active_order_number,
            o.pickup_address AS active_pickup_address,
            o.destination_address AS active_destination_address,
            o.customer_name AS active_customer_name,
            o.customer_phone AS active_customer_phone,
            o.status AS active_order_status
     FROM drivers d
     LEFT JOIN orders o ON o.driver_id = d.id
       AND o.status IN ('pending_driver','accepted','at_pickup','in_progress')
     WHERE d.id = ?
     LIMIT 1`,
    [id]
  );
}

export async function listDriversForMap() {
  return safeQuery(
    `SELECT id, name, driver_code, latitude, longitude,
            driver_state, current_zone, is_online, status
     FROM drivers
     WHERE status NOT IN ('inactive')
     ORDER BY driver_code ASC`
  );
}

export async function listDriversWithLocations() {
  const sql = `SELECT id, name, driver_code, latitude, longitude,
                      last_location_update, driver_state, current_zone, is_online
               FROM drivers
               WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                 AND is_online = 1`;
  const connection = await getConnectionWithTimeout();
  const [rows] = await connection.query(sql);
  connection.release();
  return rows;
}

export async function listDriversWithLocationForRecalc(connection) {
  const [drivers] = await connection.query(
    'SELECT id, driver_code, latitude, longitude, current_zone, driver_state FROM drivers WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
  );
  return drivers;
}

export async function getDriverStatus(driverId) {
  return safeQuery(
    `SELECT d.id, d.driver_state, d.current_zone, d.zone_entered_at,
            d.free_since, d.status_changed_at, d.is_online, d.last_seen,
            z.name AS zone_name,
            CASE
              WHEN d.driver_state = 'wolna'
               AND d.current_zone IS NOT NULL
               AND d.free_since IS NOT NULL
              THEN (
                SELECT COUNT(*) + 1
                FROM drivers d2
                WHERE d2.current_zone = d.current_zone
                  AND d2.driver_state = 'wolna'
                  AND d2.free_since < d.free_since
              )
              ELSE NULL
            END AS live_queue_position
     FROM drivers d
     LEFT JOIN zones z ON z.number = d.current_zone
     WHERE d.id = ?`,
    [driverId]
  );
}

export async function getPendingOrderForDriver(driverId) {
  return safeQuery(
    `SELECT id, order_number, customer_name, customer_phone,
            pickup_address, destination_address, cost, notes,
            operator, pickup_region_id, order_type,
            scheduled_date, scheduled_time,
            preference_ids, vehicle_category, payment_method
     FROM orders
     WHERE driver_id = ? AND status = 'pending_driver'
     LIMIT 1`,
    [driverId]
  );
}

export async function getDriverIdByCode(driverCode) {
  return safeQuery(`SELECT id FROM drivers WHERE driver_code = ? LIMIT 1`, [driverCode]);
}

export async function countActiveOrdersForDriver(driverId) {
  return safeQuery(
    `SELECT COUNT(*) AS cnt FROM orders
     WHERE driver_id = ? AND status IN ('pending_driver','next_driver','accepted','at_pickup','in_progress')`,
    [driverId]
  );
}

export async function getNextOrderForDriverExtended(driverId) {
  return safeQuery(
    `SELECT id, order_number, customer_name, customer_phone,
            pickup_address, destination_address, pickup_lat, pickup_lng,
            cost, notes, operator, pickup_region_id, order_type,
            scheduled_date, scheduled_time, preference_ids,
            payment_method, vehicle_category, status
     FROM orders
     WHERE driver_id = ? AND status IN ('next_driver','next_accepted')
     ORDER BY created_at ASC LIMIT 1`,
    [driverId]
  );
}

export async function getNextOrderForDriverBasic(driverId) {
  return safeQuery(
    `SELECT id, order_number, customer_name, customer_phone,
            pickup_address, destination_address, cost, notes,
            operator, pickup_region_id, order_type,
            scheduled_date, scheduled_time,
            preference_ids, vehicle_category, payment_method
     FROM orders
     WHERE driver_id = ? AND status = 'next_driver'
     LIMIT 1`,
    [driverId]
  );
}

export async function getActiveOrderForDriver(driverId) {
  return safeQuery(
    `SELECT id, order_number, customer_name, customer_phone,
            pickup_address, destination_address, cost, notes, status,
            operator, pickup_region_id, order_type,
            scheduled_date, scheduled_time,
            preference_ids, vehicle_category, payment_method
     FROM orders
     WHERE driver_id = ? AND status IN ('accepted', 'at_pickup', 'in_progress')
     LIMIT 1`,
    [driverId]
  );
}

export async function findDriverByCodeAndPin(driverCode, pin) {
  const connection = await getConnectionWithTimeout();
  const [drivers] = await connection.query(
    'SELECT * FROM drivers WHERE driver_code = ? AND pin = ?',
    [driverCode, pin]
  );
  connection.release();
  return drivers;
}

export async function findDriverByCodeAndPinTx(connection, driverCode, pin) {
  const [drivers] = await connection.query(
    'SELECT * FROM drivers WHERE driver_code = ? AND pin = ?',
    [driverCode, pin]
  );
  return drivers;
}

export async function setDriverSession(connection, sessionToken, nowLocal, driverId) {
  await connection.query(
    'UPDATE drivers SET session_token = ?, is_online = 1, last_seen = ? WHERE id = ?',
    [sessionToken, nowLocal, driverId]
  );
}

export async function clearDriverSessionOnLogout(nowLocal, driverId) {
  return safeQuery(
    `UPDATE drivers
     SET session_token = NULL,
         is_online     = 0,
         driver_state  = NULL,
         latitude      = NULL,
         longitude     = NULL,
         current_zone  = NULL,
         zone_entered_at = NULL,
         last_seen     = ?
     WHERE id = ?`,
    [nowLocal, driverId]
  );
}

export async function getDriverLogs(id, limit) {
  return safeQuery(
    `SELECT id, type, title, description, metadata, created_at
     FROM driver_logs
     WHERE driver_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [id, limit]
  );
}

export async function suspendDriverQuery(id, suspendedUntil) {
  return safeQuery(
    `UPDATE drivers SET status = 'suspended', suspended_until = ?, updated_at = NOW() WHERE id = ?`,
    [suspendedUntil, id]
  );
}

export async function setTaximeterEnabled(id, enabled) {
  return safeQuery('UPDATE drivers SET taximeter_enabled=? WHERE id=?', [enabled ? 1 : 0, id]);
}

export async function getTaximeterEnabled(id) {
  return safeQuery('SELECT taximeter_enabled FROM drivers WHERE id=?', [id]);
}

export async function getOfflineDriverCandidates() {
  return safeQuery(
    `SELECT id, driver_code FROM drivers
     WHERE driver_state IS NOT NULL
       AND last_seen IS NOT NULL
       AND last_seen < NOW() - INTERVAL 240 SECOND`
  );
}

export async function resetDriverToOffline(id) {
  return safeQuery(
    `UPDATE drivers SET driver_state = NULL, current_zone = NULL, is_online = 0,
                        queue_position = NULL, free_since = NULL
     WHERE id = ?`,
    [id]
  );
}
