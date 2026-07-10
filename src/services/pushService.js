export function createPushService({ safeQuery, webpush, vapidPublic, vapidPrivate }) {
  async function sendPushToDriver(driverId, payload) {
    if (!webpush || !vapidPublic || !vapidPrivate) return;
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

  return { sendPushToDriver, vapidPublic, vapidPrivate, webpush };
}
