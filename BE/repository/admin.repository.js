import { getConnectionWithTimeout, safeQuery } from '../db.js';

export async function getActiveZonesForSeed() {
  return safeQuery('SELECT number, coordinates FROM zones WHERE is_active=1');
}

export async function findDriverByCode(code) {
  return safeQuery('SELECT id FROM drivers WHERE driver_code = ? LIMIT 1', [code]);
}

export async function updateSeedDriver(fields, code) {
  return safeQuery(
    `UPDATE drivers SET name=?,status=?,driver_state=?,is_online=?,latitude=?,longitude=?,current_zone=?,last_location_update=NOW(),last_seen=NOW(),updated_at=NOW() WHERE driver_code=?`,
    [...fields, code]
  );
}

export async function insertSeedDriver(values) {
  return safeQuery(
    `INSERT INTO drivers (id,email,name,password,driver_code,pin,status,driver_state,is_online,latitude,longitude,current_zone,last_location_update,last_seen,vehicle_brand,vehicle_model,vehicle_color,registration_number,phone_number,side_number,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,?,?,NOW(),NOW())`,
    values
  );
}

export async function insertSimTestOrder(values) {
  return safeQuery(
    `INSERT INTO orders (id, order_number, driver_id, status, pickup_address, destination_address,
      customer_name, customer_phone, vehicle_category, payment_method, order_type, created_at, updated_at)
     VALUES (?, ?, ?, 'pending_driver', ?, ?, 'Klient Testowy', '+48 500 000 000', 'standard', 'cash', 'standard', NOW(), NOW())`,
    values
  );
}

export async function simSetStateClearZone(driverState, freeSince, now, driverId) {
  return safeQuery(
    `UPDATE drivers SET driver_state=?, free_since=?, status_changed_at=?, current_zone=NULL, updated_at=NOW() WHERE id=?`,
    [driverState, freeSince, now, driverId]
  );
}

export async function simSetState(driverState, freeSince, now, driverId) {
  return safeQuery(
    `UPDATE drivers SET driver_state=?, free_since=?, status_changed_at=?, updated_at=NOW() WHERE id=?`,
    [driverState, freeSince, now, driverId]
  );
}

export async function simSetStatus(status, driverId) {
  return safeQuery(`UPDATE drivers SET status=? WHERE id=?`, [status, driverId]);
}

export async function simSetZone(zone, driverId) {
  return safeQuery(`UPDATE drivers SET current_zone=? WHERE id=?`, [zone, driverId]);
}

export async function simUpdateLocation(lat, lng, driverId) {
  return safeQuery(
    `UPDATE drivers SET latitude=?, longitude=?, last_location_update=NOW(), last_seen=NOW(), is_online=1 WHERE id=?`,
    [lat, lng, driverId]
  );
}
