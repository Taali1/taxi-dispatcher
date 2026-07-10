import * as notifRepo from '../repository/notifications.repository.js';

export async function getDriverNotifications(req, res) {
  const { driverId } = req.query;
  if (!driverId) return res.status(400).json({ success: false, error: 'Brak driverId' });
  try {
    const rows = await notifRepo.getUnreadNotifications(driverId);
    return res.json({ success: true, notifications: rows ?? [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function markNotificationRead(req, res) {
  const { id } = req.params;
  try {
    await notifRepo.markNotificationRead(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
