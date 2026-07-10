import { VAPID_PUBLIC } from '../shared/push.js';
import * as pushRepo from '../repository/push.repository.js';

export function getVapidKey(req, res) {
  if (!VAPID_PUBLIC) {
    return res.status(503).json({ success: false, error: 'Push notifications not configured' });
  }
  res.json({ success: true, publicKey: VAPID_PUBLIC });
}

export async function subscribe(req, res) {
  try {
    const { driverId, subscription } = req.body;
    if (!driverId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ success: false, error: 'Invalid subscription data' });
    }
    await pushRepo.upsertSubscription(driverId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
    res.json({ success: true });
  } catch (e) {
    console.error('[Push] subscribe error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
}

export async function unsubscribe(req, res) {
  try {
    const { driverId, endpoint } = req.body;
    if (driverId && endpoint) {
      await pushRepo.deleteSubscriptionByEndpoint(driverId, endpoint);
    } else if (driverId) {
      await pushRepo.deleteAllSubscriptionsForDriver(driverId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
