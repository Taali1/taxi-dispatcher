import { safeQuery } from '../db.js';

export async function getTariffsPublic() {
  return safeQuery('SELECT id, name, per_km_rate, sort_order FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC');
}
export async function getSurcharges() {
  return safeQuery('SELECT * FROM taximeter_surcharges ORDER BY sort_order ASC, id ASC');
}
export async function getSettingsRow() {
  return safeQuery('SELECT * FROM taximeter_settings WHERE id=1');
}
export async function updateSettingsRow(initial_fee, waiting_rate, pulse_amount, min_speed_kmh) {
  return safeQuery(
    'UPDATE taximeter_settings SET initial_fee=?, waiting_rate=?, pulse_amount=?, min_speed_kmh=? WHERE id=1',
    [initial_fee, waiting_rate, pulse_amount, min_speed_kmh]
  );
}
export async function getTariffsAdmin() {
  return safeQuery('SELECT id, name, per_km_rate, sort_order FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC');
}
export async function insertTariff(name, perKmRate, sortOrder) {
  return safeQuery('INSERT INTO taximeter_tariffs (name, per_km_rate, sort_order) VALUES (?, ?, ?)', [name, perKmRate, sortOrder]);
}
export async function updateTariff(name, perKmRate, sortOrder, id) {
  return safeQuery('UPDATE taximeter_tariffs SET name=?, per_km_rate=?, sort_order=? WHERE id=?', [name, perKmRate, sortOrder, id]);
}
export async function deleteTariff(id) {
  return safeQuery('DELETE FROM taximeter_tariffs WHERE id=?', [id]);
}
export async function insertSurcharge(name, amount, sortOrder) {
  return safeQuery('INSERT INTO taximeter_surcharges (name, amount, sort_order) VALUES (?, ?, ?)', [name, amount, sortOrder]);
}
export async function updateSurcharge(name, amount, sortOrder, id) {
  return safeQuery('UPDATE taximeter_surcharges SET name=?, amount=?, sort_order=? WHERE id=?', [name, amount, sortOrder, id]);
}
export async function deleteSurcharge(id) {
  return safeQuery('DELETE FROM taximeter_surcharges WHERE id=?', [id]);
}
export async function getFirstTariffPerKm() {
  return safeQuery('SELECT per_km_rate FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC LIMIT 1');
}
