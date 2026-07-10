import { safeQuery } from '../db.js';

export async function upsertSubscription(driverId, endpoint, p256dh, auth) {
  return safeQuery(
    `INSERT INTO push_subscriptions (driver_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), created_at = NOW()`,
    [driverId, endpoint, p256dh, auth]
  );
}

export async function deleteSubscriptionByEndpoint(driverId, endpoint) {
  return safeQuery('DELETE FROM push_subscriptions WHERE driver_id = ? AND endpoint = ?', [driverId, endpoint]);
}

export async function deleteAllSubscriptionsForDriver(driverId) {
  return safeQuery('DELETE FROM push_subscriptions WHERE driver_id = ?', [driverId]);
}
