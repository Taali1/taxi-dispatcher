import { safeQuery } from '../db.js';

export async function listCityBoundaries() {
  return safeQuery('SELECT * FROM city_boundaries ORDER BY created_at ASC');
}

export async function insertCityBoundary(id, name, color, coordsStr) {
  return safeQuery(
    'INSERT INTO city_boundaries (id, name, color, coordinates) VALUES (?, ?, ?, ?)',
    [id, name, color, coordsStr]
  );
}

export async function updateCityBoundaryWithTimestamp(name, color, coordsStr, id) {
  return safeQuery(
    'UPDATE city_boundaries SET name=?, color=?, coordinates=?, updated_at=NOW() WHERE id=?',
    [name, color, coordsStr, id]
  );
}

export async function updateCityBoundaryNoTimestamp(name, color, coordsStr, id) {
  return safeQuery(
    'UPDATE city_boundaries SET name=?, color=?, coordinates=? WHERE id=?',
    [name, color, coordsStr, id]
  );
}

export async function deleteCityBoundary(id) {
  return safeQuery('DELETE FROM city_boundaries WHERE id=?', [id]);
}
