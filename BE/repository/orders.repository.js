import { getConnectionWithTimeout, safeQuery } from '../db.js';

export async function getOrderLogs(orderId) {
  return safeQuery(
    `SELECT id, type, message, data, created_at
     FROM order_logs
     WHERE order_id = ?
     ORDER BY created_at ASC`,
    [orderId]
  );
}

export async function getOrderInfoBasic(orderId) {
  return safeQuery(`SELECT order_number, pickup_address, destination_address FROM orders WHERE id = ?`, [orderId]);
}

export async function acceptOrderUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending_driver'`,
    [orderId]
  );
}

export async function setDriverBusyAccept(driverId) {
  return safeQuery(
    `UPDATE drivers SET driver_state = 'zajeta', zone_entered_at = NOW(), status_changed_at = NOW() WHERE id = ?`,
    [driverId]
  );
}

export async function acceptNextOrderUpdate(orderId, driverId) {
  return safeQuery(
    `UPDATE orders SET status = 'next_accepted', updated_at = NOW()
     WHERE id = ? AND status = 'next_driver' AND driver_id = ?`,
    [orderId, driverId]
  );
}

export async function rejectNextOrderUpdate(orderId, driverId) {
  return safeQuery(
    `UPDATE orders SET status = 'market', driver_id = NULL, updated_at = NOW()
     WHERE id = ? AND status IN ('next_driver','next_accepted') AND driver_id = ?`,
    [orderId, driverId]
  );
}

export async function getOrderInfoForPickup(orderId) {
  return safeQuery(`SELECT order_number, pickup_address FROM orders WHERE id = ?`, [orderId]);
}

export async function atPickupUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'at_pickup', updated_at = NOW() WHERE id = ? AND status = 'accepted'`,
    [orderId]
  );
}

export async function setDriverBusyAtPickup(driverId) {
  return safeQuery(
    `UPDATE drivers SET driver_state = 'zajeta', status_changed_at = NOW() WHERE id = ?`,
    [driverId]
  );
}

// ── Redispatch helpers ──
export async function getOrderCustomerId(orderId) {
  return safeQuery('SELECT customer_id FROM orders WHERE id = ?', [orderId]);
}

export async function getZoneAssignmentRules(regionId) {
  return safeQuery(
    `SELECT search_zone, driver_state, priority, step_type, radius_km FROM zone_assignment_rules
     WHERE source_zone = ? ORDER BY priority ASC`,
    [regionId]
  );
}

export async function getOrderPickupGeo(orderId) {
  return safeQuery('SELECT pickup_lat, pickup_lng FROM orders WHERE id = ?', [orderId]);
}

export async function findDriversByStateRadius(driverState, excludeDriverId, customerId) {
  return safeQuery(
    `SELECT d.id, d.driver_code, d.name, d.latitude, d.longitude FROM drivers d
     WHERE d.driver_state = ? AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND d.id != ?
     ${customerId ? 'AND d.id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
     ORDER BY d.free_since ASC`,
    customerId ? [driverState, excludeDriverId, customerId] : [driverState, excludeDriverId]
  );
}

export async function findDriversByStateZone(driverState, searchZone, excludeDriverId, customerId) {
  return safeQuery(
    `SELECT d.id, d.driver_code, d.name FROM drivers d
     WHERE d.driver_state = ? AND d.current_zone = ? AND d.id != ?
     ${customerId ? 'AND d.id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
     ORDER BY d.free_since ASC LIMIT 1`,
    customerId ? [driverState, searchZone, excludeDriverId, customerId] : [driverState, searchZone, excludeDriverId]
  );
}

export async function assignOrderToDriver(orderId, driverId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
     WHERE id = ?`,
    [driverId, orderId]
  );
}

export async function getZoneFallbackStatus(regionId) {
  return safeQuery(
    'SELECT fallback_status FROM zone_settings WHERE source_zone = ?',
    [regionId]
  );
}

export async function marketFallbackUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'market', driver_id = NULL, market_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [orderId]
  );
}

export async function deleteGieldaRegistrationsForOrder(orderId) {
  return safeQuery('DELETE FROM gielda_registrations WHERE order_id = ?', [orderId]);
}

export async function pendingFallbackUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending', driver_id = NULL, updated_at = NOW()
     WHERE id = ?`,
    [orderId]
  );
}

export async function getOrderPickupAddress(orderId) {
  return safeQuery('SELECT pickup_address FROM orders WHERE id = ?', [orderId]);
}

// ── reject ──
export async function getOrderForReject(orderId) {
  return safeQuery(
    `SELECT o.driver_id, o.pickup_region_id, d.driver_code, d.name AS driver_name
     FROM orders o
     LEFT JOIN drivers d ON d.id = o.driver_id
     WHERE o.id = ? AND o.status = 'pending_driver'`,
    [orderId]
  );
}

export async function setDriverBusy(driverId) {
  return safeQuery(`UPDATE drivers SET driver_state = 'zajeta' WHERE id = ?`, [driverId]);
}

export async function getOrderStatus(id) {
  return safeQuery(`SELECT status FROM orders WHERE id = ?`, [id]);
}

// ── pickup / complete ──
export async function getOrderInfoForPickupFull(orderId) {
  return safeQuery(`SELECT order_number, pickup_address, destination_address, customer_name, customer_phone FROM orders WHERE id = ?`, [orderId]);
}

export async function pickupOrderUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'in_progress', updated_at = NOW() WHERE id = ? AND status IN ('accepted', 'at_pickup')`,
    [orderId]
  );
}

export async function clearDriverZoneOnPickup(driverId) {
  return safeQuery(
    `UPDATE drivers SET current_zone = 0, status_changed_at = NOW() WHERE id = ?`,
    [driverId]
  );
}

export async function getOrderInfoForComplete(orderId) {
  return safeQuery(`SELECT driver_id, order_number, pickup_address, destination_address, cost FROM orders WHERE id = ?`, [orderId]);
}

export async function completeOrderUpdate(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = ?`,
    [orderId]
  );
}

export async function promoteNextAccepted(driverId) {
  return safeQuery(
    `UPDATE orders SET status = 'accepted', updated_at = NOW()
     WHERE driver_id = ? AND status = 'next_accepted'
     ORDER BY created_at ASC LIMIT 1`,
    [driverId]
  );
}

export async function promoteNextDriver(driverId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending_driver', updated_at = NOW()
     WHERE driver_id = ? AND status = 'next_driver'
     ORDER BY created_at ASC LIMIT 1`,
    [driverId]
  );
}

// ── finish ──
export async function getOrderForFinish(id) {
  return safeQuery(`SELECT id, order_number, driver_id, status FROM orders WHERE id = ?`, [id]);
}

export async function insertDriverNotification(driverId, reason, notifTitle, notifMsg, orderId) {
  return safeQuery(
    `INSERT INTO driver_notifications (driver_id, type, title, message, order_id) VALUES (?, ?, ?, ?, ?)`,
    [driverId, reason, notifTitle, notifMsg, orderId]
  );
}

export async function finishOrderUpdate(newStatus, id) {
  return safeQuery(
    `UPDATE orders SET status = ?, driver_id = NULL, updated_at = NOW() WHERE id = ?`,
    [newStatus, id]
  );
}

// ── update ──
export async function updateOrderFields(fields, id) {
  return safeQuery(
    `UPDATE orders SET
      customer_name      = ?,
      customer_phone     = ?,
      pickup_address     = ?,
      destination_address= ?,
      taxi_count         = ?,
      payment_method     = ?,
      vehicle_category   = ?,
      scheduled_date      = ?,
      scheduled_time      = ?,
      notes              = ?,
      updated_at         = NOW()
     WHERE id = ?`,
    [...fields, id]
  );
}

// ── list / detail ──
export async function listOrders(statusFilter, limit, offset) {
  return safeQuery(
    `SELECT
       o.id,
       o.order_number,
       o.status,
       o.customer_name,
       o.customer_phone,
       o.pickup_address,
       o.destination_address,
       o.pickup_region_id,
       o.vehicle_category,
       o.payment_method,
       o.taxi_count,
       o.scheduled_date,
       o.scheduled_time,
       o.notes,
       o.cost,
       o.operator,
       o.order_type,
       o.client_info,
       o.preference_ids,
       o.created_at,
       o.updated_at,
       o.driver_id,
       d.driver_code,
       d.name AS driver_name,
       d.driver_state,
       d.vehicle_brand,
       d.vehicle_model,
       d.vehicle_color,
       d.registration_number,
       d.side_number,
       COALESCE(gr.cnt, 0) AS registrations_count
     FROM orders o
     LEFT JOIN drivers d ON o.driver_id = d.id
     LEFT JOIN (
       SELECT order_id, COUNT(*) AS cnt FROM gielda_registrations GROUP BY order_id
     ) gr ON gr.order_id = o.id
     WHERE 1=1 ${statusFilter}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

export async function getOrderById(id) {
  return safeQuery(
    `SELECT o.id, o.order_number, o.status, o.customer_name, o.customer_phone,
            o.pickup_address, o.destination_address, o.pickup_region_id,
            o.vehicle_category, o.payment_method, o.notes, o.cost,
            o.created_at, o.updated_at,
            d.driver_code, d.name AS driver_name
     FROM orders o
     LEFT JOIN drivers d ON o.driver_id = d.id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
}

// ── create ──
export async function getZoneRulesTx(connection, zoneNumber) {
  const [ruleRows] = await connection.query(
    `SELECT search_zone, driver_state, priority, step_type, radius_km FROM zone_assignment_rules
     WHERE source_zone = ? ORDER BY priority ASC`,
    [zoneNumber]
  );
  return ruleRows;
}

export async function getZoneSettingsTx(connection, zoneNumber) {
  const [rows] = await connection.query(
    `SELECT fallback_status FROM zone_settings WHERE source_zone = ?`,
    [zoneNumber]
  );
  return rows;
}

export async function findZoneDriversTx(connection, driverState, searchZone, customerPhone) {
  const [zoneDrivers] = await connection.query(
    `SELECT id, name, driver_code FROM drivers
     WHERE driver_state = ? AND current_zone = ?
     AND id NOT IN (
       SELECT dcb.driver_id FROM driver_client_blocks dcb
       JOIN clients c ON c.id = dcb.client_id
       WHERE c.phone_number = ?
     )
     ORDER BY free_since ASC LIMIT 1`,
    [driverState, searchZone, customerPhone || '']
  );
  return zoneDrivers;
}

export async function findClientByPhoneTx(connection, phone) {
  const [existingClients] = await connection.query(
    'SELECT id, client_code FROM clients WHERE phone_number = ?',
    [String(phone)]
  );
  return existingClients;
}

export async function insertClientTx(connection, clientId, phone, name, clientCode) {
  await connection.query(
    `INSERT INTO clients (id, phone_number, client_name, client_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [clientId, String(phone), name || '', clientCode]
  );
}

export async function getNextOrderNumberTx(connection) {
  const [countResult] = await connection.query(
    `SELECT COALESCE(
       MAX(CAST(SUBSTRING_INDEX(order_number, '/', 1) AS UNSIGNED)), 99
     ) + 1 AS next_num
     FROM orders
     WHERE order_number IS NOT NULL AND order_number LIKE '%/%'`
  );
  return countResult[0].next_num;
}

export async function insertOrderTx(connection, values) {
  await connection.query(
    `INSERT INTO orders (
       id, order_number, driver_id, customer_id, customer_name, customer_phone,
       pickup_address, destination_address, pickup_region_id,
       vehicle_category, payment_method, taxi_count,
       scheduled_date, scheduled_time, notes, status,
       operator, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    values
  );
}

// ── scheduled orders ──
export async function getDueScheduledOrders(nowLocalStr) {
  return safeQuery(
    `SELECT o.id, o.order_number, o.pickup_region_id, o.customer_id,
            o.scheduled_date, o.scheduled_time, o.preference_ids,
            COALESCE(z.scheduled_dispatch_minutes, 10) AS dispatch_minutes
     FROM orders o
     LEFT JOIN zones z ON z.number = o.pickup_region_id
     WHERE o.status = 'scheduled'
       AND o.scheduled_date IS NOT NULL
       AND o.scheduled_time IS NOT NULL
       AND TIMESTAMP(o.scheduled_date, o.scheduled_time) - INTERVAL COALESCE(z.scheduled_dispatch_minutes, 10) MINUTE <= ?`,
    [nowLocalStr]
  );
}

export async function findScheduledCandidateDrivers(driverState, searchZone, customerId) {
  return safeQuery(
    `SELECT id, name, driver_code, preference_ids FROM drivers
     WHERE driver_state = ? AND current_zone = ?
     ${customerId ? 'AND id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
     ORDER BY free_since ASC LIMIT 20`,
    customerId ? [driverState, searchZone, customerId] : [driverState, searchZone]
  );
}

export async function assignScheduledOrder(driverId, orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
     WHERE id = ? AND status = 'scheduled'`,
    [driverId, orderId]
  );
}

export async function marketScheduledOrder(orderId) {
  return safeQuery(
    `UPDATE orders SET status = 'market', market_at = NOW(), updated_at = NOW()
     WHERE id = ? AND status = 'scheduled'`,
    [orderId]
  );
}

// ── pending driver timeout ──
export async function getPendingDriverTimeouts() {
  return safeQuery(
    `SELECT o.id, o.driver_id, o.pickup_region_id, d.driver_code, d.name AS driver_name
     FROM orders o
     LEFT JOIN drivers d ON d.id = o.driver_id
     WHERE o.status = 'pending_driver'
       AND o.updated_at < NOW() - INTERVAL 15 SECOND`
  );
}
