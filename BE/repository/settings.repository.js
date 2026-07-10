import { safeQuery } from '../db.js';

export async function getSettingsRow() {
  return safeQuery('SELECT * FROM settings LIMIT 1');
}

export async function insertDefaultSettings() {
  return safeQuery("INSERT INTO settings (base_city) VALUES ('Bydgoszcz')");
}

export async function getSettingsIdRow() {
  return safeQuery('SELECT id FROM settings LIMIT 1');
}

export async function insertSettings(baseCity, pinStyle) {
  return safeQuery('INSERT INTO settings (base_city, pin_style) VALUES (?, ?)', [baseCity, pinStyle]);
}

export async function updateSettings(baseCity, pinStyle, id) {
  return safeQuery('UPDATE settings SET base_city = ?, pin_style = ? WHERE id = ?', [baseCity, pinStyle, id]);
}

export async function showSettingsColumns() {
  return safeQuery('SHOW COLUMNS FROM settings');
}

export async function addSettingsColumn(sql) {
  return safeQuery(sql);
}

export async function getGieldaSettingsRow() {
  return safeQuery('SELECT gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order, gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd FROM settings LIMIT 1');
}

export async function insertGieldaSettings(values) {
  return safeQuery(
    `INSERT INTO settings (base_city, gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds,
       gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values
  );
}

export async function updateGieldaSettings(setClause, values) {
  return safeQuery(`UPDATE settings SET ${setClause} WHERE id = ?`, values);
}
