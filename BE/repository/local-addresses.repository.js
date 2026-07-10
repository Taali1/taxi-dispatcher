import { safeQuery } from '../db.js';

export async function listAllAddresses() {
  return safeQuery(
    'SELECT id, street, house_number, city, postcode, lat, lng, notes FROM local_addresses ORDER BY city ASC, street ASC'
  );
}

export async function countAddresses(where, params) {
  const rows = await safeQuery(`SELECT COUNT(*) AS cnt FROM local_addresses ${where}`, params);
  return rows[0];
}

export async function pageAddresses(where, params, limit, offset) {
  return safeQuery(
    `SELECT * FROM local_addresses ${where} ORDER BY city ASC, street ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function insertAddress(street, houseNumber, city, postcode, lat, lng, notes) {
  return safeQuery(
    'INSERT INTO local_addresses (street, house_number, city, postcode, lat, lng, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [street, houseNumber, city, postcode, lat, lng, notes]
  );
}

export async function updateAddress(street, houseNumber, city, postcode, lat, lng, notes, id) {
  return safeQuery(
    'UPDATE local_addresses SET street=?, house_number=?, city=?, postcode=?, lat=?, lng=?, notes=? WHERE id=?',
    [street, houseNumber, city, postcode, lat, lng, notes, id]
  );
}

export async function deleteAddress(id) {
  return safeQuery('DELETE FROM local_addresses WHERE id=?', [id]);
}
