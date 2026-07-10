import { safeQuery } from '../db.js';

export async function getGieldaRegistrationsForDriver(driverId) {
  return safeQuery(
    `SELECT gr.order_id FROM gielda_registrations gr
     JOIN orders o ON o.id = gr.order_id
     WHERE gr.driver_id = ? AND o.status = 'market'`,
    [driverId]
  );
}

export async function getGieldaSettingsForRegister() {
  return safeQuery('SELECT gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to FROM settings LIMIT 1');
}

export async function getExistingActiveRegistration(driverId) {
  return safeQuery(
    `SELECT gr.order_id FROM gielda_registrations gr
     JOIN orders o ON o.id = gr.order_id
     WHERE gr.driver_id = ? AND o.status = 'market' LIMIT 1`,
    [driverId]
  );
}

export async function getDriverForRegister(driverId) {
  return safeQuery('SELECT latitude, longitude, preference_ids, driver_code FROM drivers WHERE id = ?', [driverId]);
}

export async function getMarketOrderById(orderId) {
  return safeQuery(
    "SELECT pickup_lat, pickup_lng, pickup_region_id, preference_ids, customer_id FROM orders WHERE id = ? AND status = 'market'",
    [orderId]
  );
}

export async function getZoneMaxDistance(regionId) {
  return safeQuery('SELECT gielda_max_distance_km FROM zone_settings WHERE source_zone = ?', [regionId]);
}

export async function getBlockForDriverClient(driverId, clientId) {
  return safeQuery('SELECT 1 FROM driver_client_blocks WHERE driver_id=? AND client_id=? LIMIT 1', [driverId, clientId]);
}

export async function directAssignOrder(driverId, orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
     WHERE id = ? AND status = 'market'`,
    [driverId, orderId]
  );
}

export async function deleteGieldaRegistrationsForOrder(orderId) {
  return safeQuery('DELETE FROM gielda_registrations WHERE order_id = ?', [orderId]);
}

export async function getOrderPickupAddress(orderId) {
  return safeQuery('SELECT pickup_address FROM orders WHERE id = ?', [orderId]);
}

export async function upsertGieldaRegistration(orderId, driverId, lat, lng) {
  return safeQuery(
    `INSERT INTO gielda_registrations (order_id, driver_id, driver_lat, driver_lng)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE driver_lat = VALUES(driver_lat), driver_lng = VALUES(driver_lng), registered_at = NOW()`,
    [orderId, driverId, lat, lng]
  );
}

// ── auto-dispatch job ──
export async function getAutoDispatchSettings() {
  return safeQuery('SELECT gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd FROM settings LIMIT 1');
}

export async function getMarketOrdersWithoutDriver() {
  return safeQuery(
    `SELECT id, order_number, pickup_address, pickup_region_id, preference_ids, pickup_lat, pickup_lng, customer_id
     FROM orders
     WHERE status = 'market' AND driver_id IS NULL
     ORDER BY created_at ASC`
  );
}

export async function getAllDriverClientBlocks() {
  return safeQuery('SELECT driver_id, client_id FROM driver_client_blocks');
}

export async function getZoneAssignmentRulesForRegion(regionId) {
  return safeQuery(
    `SELECT search_zone, driver_state, step_type, radius_km FROM zone_assignment_rules
     WHERE source_zone = ? ORDER BY priority ASC`,
    [regionId]
  );
}

export async function getDriversByStateWithGps(driverState) {
  return safeQuery(
    `SELECT id, driver_code, name, preference_ids, latitude, longitude FROM drivers
     WHERE driver_state = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY free_since ASC`,
    [driverState]
  );
}

export async function getDriversByStateZone(driverState, searchZone) {
  return safeQuery(
    `SELECT id, driver_code, name, preference_ids, latitude, longitude FROM drivers
     WHERE driver_state = ? AND current_zone = ?
     ORDER BY free_since ASC`,
    [driverState, searchZone]
  );
}

export async function countActiveOrdersForDriver(driverId) {
  return safeQuery(
    `SELECT COUNT(*) AS cnt FROM orders
     WHERE driver_id = ? AND status IN ('pending_driver','next_driver','accepted','at_pickup','in_progress')`,
    [driverId]
  );
}

export async function assignFromMarket(newStatus, driverId, orderId) {
  return safeQuery(
    `UPDATE orders SET status = ?, driver_id = ?, updated_at = NOW()
     WHERE id = ? AND status = 'market'`,
    [newStatus, driverId, orderId]
  );
}

// ── registrations resolution job ──
export async function getGieldaSettingsForResolution() {
  return safeQuery('SELECT gielda_registration_seconds, gielda_priority_order FROM settings LIMIT 1');
}

export async function getReadyMarketOrders(registrationSeconds) {
  return safeQuery(
    `SELECT id, pickup_lat, pickup_lng, preference_ids, customer_id FROM orders
     WHERE status = 'market' AND market_at IS NOT NULL
       AND TIMESTAMPDIFF(SECOND, market_at, NOW()) >= ?`,
    [registrationSeconds]
  );
}

export async function getRegistrationsForOrder(orderId) {
  return safeQuery(
    `SELECT gr.driver_id, gr.driver_lat, gr.driver_lng, d.driver_state, d.driver_code, d.name AS driver_name, d.preference_ids
     FROM gielda_registrations gr
     LEFT JOIN drivers d ON d.id = gr.driver_id
     WHERE gr.order_id = ?`,
    [orderId]
  );
}

export async function getBlocksForClient(clientId) {
  return safeQuery('SELECT driver_id FROM driver_client_blocks WHERE client_id=?', [clientId]);
}

export async function assignFromRegistrations(driverId, orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
     WHERE id = ? AND status = 'market'`,
    [driverId, orderId]
  );
}
