import { safeQuery } from '../db.js';

export async function getUnreadNotifications(driverId) {
  return safeQuery(
    `SELECT id, type, title, message, order_id, created_at FROM driver_notifications
     WHERE driver_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 10`,
    [driverId]
  );
}

export async function markNotificationRead(id) {
  return safeQuery(`UPDATE driver_notifications SET is_read = 1 WHERE id = ?`, [id]);
}
