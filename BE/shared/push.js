import { safeQuery } from '../db.js';

// ── Web Push / VAPID (opcjonalny — serwer startuje nawet bez pakietu web-push) ─
let webpush = null;
try {
  webpush = (await import('web-push')).default;
} catch (e) {
  console.warn('[Push] Pakiet web-push nie zainstalowany — push notifications wyłączone. Uruchom: npm install web-push');
}

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
if (webpush && VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:admin@taxi.local', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[Push] VAPID keys loaded');
} else if (!webpush) {
  // web-push not installed — push disabled, rest of app works normally
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled. Set VAPID_PUBLIC and VAPID_PRIVATE env vars.');
}

export { webpush, VAPID_PUBLIC, VAPID_PRIVATE };

// ── Push notifications helper ─────────────────────────────────────────────────
export async function sendPushToDriver(driverId, payload) {
  if (!webpush || !VAPID_PUBLIC || !VAPID_PRIVATE) return; // Push wyłączony — brak web-push lub VAPID
  try {
    const subs = await safeQuery(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE driver_id = ?',
      [driverId]
    );
    if (!subs || subs.length === 0) return;
    const notification = JSON.stringify(payload);
    for (const sub of subs) {
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification
      ).catch(e => {
        if (e.statusCode === 410 || e.statusCode === 404) {
          safeQuery('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]).catch(() => {});
        }
      });
    }
  } catch (e) {
    console.error('[Push] sendPushToDriver error:', e.message);
  }
}
