import { safeQuery } from '../db.js';

export async function detectZone(lat, lng) {
  // uses helper detectZoneFromCoordinates elsewhere; kept here for admin listing
}

export async function listZones() {
  return safeQuery(`SELECT id, name, number, color, is_active FROM zones ORDER BY number ASC`);
}

export async function getZonesSimData() {
  return safeQuery('SELECT number, name, coordinates FROM zones WHERE is_active=1 ORDER BY number ASC');
}

export async function getZoneRulesGrouped() {
  return safeQuery(
    `SELECT zar.id, zar.source_zone, zar.priority, zar.search_zone, zar.driver_state, zar.step_type, zar.radius_km
     FROM zone_assignment_rules zar
     INNER JOIN zones z ON z.number = zar.source_zone AND z.is_active = 1
     ORDER BY zar.source_zone ASC, zar.priority ASC`
  );
}

export async function cleanupZoneRules() {
  return safeQuery(
    `DELETE zar FROM zone_assignment_rules zar
     LEFT JOIN zones z ON z.number = zar.source_zone AND z.is_active = 1
     WHERE z.id IS NULL`
  );
}

export async function deleteZoneRulesForSource(sourceZone) {
  return safeQuery(`DELETE FROM zone_assignment_rules WHERE source_zone = ?`, [sourceZone]);
}

export async function getZoneRulesForSource(sourceZone) {
  return safeQuery(
    `SELECT id, source_zone, priority, search_zone, driver_state, step_type, radius_km
     FROM zone_assignment_rules
     WHERE source_zone = ?
     ORDER BY priority ASC`,
    [sourceZone]
  );
}

export async function getZoneSettingsForSource(sourceZone) {
  return safeQuery(
    'SELECT fallback_status, gielda_max_distance_km FROM zone_settings WHERE source_zone = ?',
    [sourceZone]
  );
}

export async function insertZoneRules(values) {
  return safeQuery(
    `INSERT INTO zone_assignment_rules (source_zone, priority, search_zone, driver_state, step_type, radius_km) VALUES ?`,
    [values]
  );
}

export async function upsertZoneSettings(sourceZone, fallbackStatus, gieldaMaxDistanceKm) {
  return safeQuery(
    `INSERT INTO zone_settings (source_zone, fallback_status, gielda_max_distance_km) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE fallback_status = VALUES(fallback_status),
                             gielda_max_distance_km = VALUES(gielda_max_distance_km)`,
    [sourceZone, fallbackStatus, gieldaMaxDistanceKm]
  );
}
