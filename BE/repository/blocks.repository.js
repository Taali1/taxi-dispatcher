import { safeQuery } from '../db.js';

export async function getBlocksForDriver(driverId) {
  return safeQuery(
    `SELECT b.id, b.client_id, b.blocked_by, b.reason, b.created_at,
            c.client_name, c.client_code, c.phone_number
     FROM driver_client_blocks b
     LEFT JOIN clients c ON c.id = b.client_id
     WHERE b.driver_id = ?
     ORDER BY b.created_at DESC`,
    [driverId]
  );
}

export async function getBlocksForClient(clientId) {
  return safeQuery(
    `SELECT b.id, b.driver_id, b.blocked_by, b.reason, b.created_at,
            d.name AS driver_name, d.driver_code
     FROM driver_client_blocks b
     LEFT JOIN drivers d ON d.id = b.driver_id
     WHERE b.client_id = ?
     ORDER BY b.created_at DESC`,
    [clientId]
  );
}

export async function insertBlock(driverId, clientId, blockedBy, reason) {
  return safeQuery(
    'INSERT INTO driver_client_blocks (driver_id, client_id, blocked_by, reason) VALUES (?, ?, ?, ?)',
    [driverId, clientId, blockedBy, reason || null]
  );
}

export async function getBlocksByPhone(phone) {
  return safeQuery(
    `SELECT b.driver_id
     FROM driver_client_blocks b
     JOIN clients c ON c.id = b.client_id
     WHERE c.phone_number = ?`,
    [phone]
  );
}

export async function getBlockPair(id) {
  return safeQuery('SELECT driver_id, client_id FROM driver_client_blocks WHERE id=?', [id]);
}

export async function deleteBlockPair(driverId, clientId) {
  return safeQuery('DELETE FROM driver_client_blocks WHERE driver_id=? AND client_id=?', [driverId, clientId]);
}

export async function searchDrivers(q) {
  return safeQuery(
    'SELECT id, name, driver_code FROM drivers WHERE name LIKE ? OR driver_code LIKE ? LIMIT 10',
    [q, q]
  );
}

export async function searchClients(q) {
  return safeQuery(
    'SELECT id, client_name, client_code, phone_number FROM clients WHERE client_name LIKE ? OR client_code LIKE ? OR phone_number LIKE ? LIMIT 10',
    [q, q, q]
  );
}
