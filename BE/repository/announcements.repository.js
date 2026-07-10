import { safeQuery } from '../db.js';

export async function addAnnouncementColumn(table, col, def) {
  try {
    await safeQuery(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`[Migration] Added ${col} to ${table}`);
  } catch (e) {
    console.log(`[Migration] Column ${col}: ${e.message.includes('Duplicate') ? 'already exists' : e.message}`);
  }
}

export async function createAnnouncementConfirmationsTable() {
  return safeQuery(`CREATE TABLE IF NOT EXISTS announcement_confirmations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    driver_id VARCHAR(36) NOT NULL,
    confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ann_driver (announcement_id, driver_id)
  )`);
}

export async function listAnnouncementsFull() {
  return safeQuery(`SELECT id, sender_id, sender_name, message, created_at, scheduled_at, send_mode, repeat_config, confirmed_count FROM announcements ORDER BY created_at DESC LIMIT 50`);
}

export async function listAnnouncementsBasic() {
  return safeQuery(`SELECT id, sender_id, sender_name, message, created_at FROM announcements ORDER BY created_at DESC LIMIT 50`);
}

export async function insertAnnouncementFull(fields) {
  return safeQuery(
    `INSERT INTO announcements (sender_id, sender_name, message, scheduled_at, send_mode, repeat_config) VALUES (?, ?, ?, ?, ?, ?)`,
    fields
  );
}

export async function insertAnnouncementBasic(senderId, senderName, message) {
  return safeQuery(`INSERT INTO announcements (sender_id, sender_name, message) VALUES (?, ?, ?)`, [senderId, senderName, message]);
}

export async function getLatestAnnouncementsForDriver(driverId, now) {
  return safeQuery(
    `SELECT a.id, a.sender_id, a.sender_name, a.message, a.created_at
     FROM announcements a
     LEFT JOIN announcement_confirmations ac ON ac.announcement_id = a.id AND ac.driver_id = ?
     WHERE (a.scheduled_at IS NULL OR a.scheduled_at <= ?) AND ac.id IS NULL
     ORDER BY a.created_at DESC LIMIT 10`,
    [driverId, now]
  );
}

export async function getLatestAnnouncementsMigrated(now, sinceVal) {
  return safeQuery(
    `SELECT id, sender_id, sender_name, message, created_at FROM announcements
     WHERE (scheduled_at IS NULL OR scheduled_at <= ?) AND created_at > ?
     ORDER BY created_at DESC LIMIT 5`,
    [now, sinceVal]
  );
}

export async function getLatestAnnouncementsBasic(sinceVal) {
  return safeQuery(
    `SELECT id, sender_id, sender_name, message, created_at FROM announcements
     WHERE created_at > ? ORDER BY created_at DESC LIMIT 5`,
    [sinceVal]
  );
}

export async function confirmAnnouncement(id, driverId) {
  return safeQuery(
    `INSERT IGNORE INTO announcement_confirmations (announcement_id, driver_id) VALUES (?, ?)`,
    [id, driverId]
  );
}

export async function updateConfirmedCount(id) {
  return safeQuery(
    `UPDATE announcements SET confirmed_count = (SELECT COUNT(*) FROM announcement_confirmations WHERE announcement_id = ?) WHERE id = ?`,
    [id, id]
  );
}

export async function getRepeatableAnnouncements() {
  return safeQuery(
    `SELECT id, sender_id, sender_name, message, repeat_config, scheduled_at FROM announcements WHERE send_mode = 'later' AND repeat_config IS NOT NULL AND scheduled_at <= NOW()`
  );
}

export async function findExistingRepeatForToday(senderId, message, todayStr, id) {
  return safeQuery(
    `SELECT id FROM announcements WHERE sender_id = ? AND message = ? AND DATE(scheduled_at) = ? AND id != ?`,
    [senderId, message, todayStr, id]
  );
}

export async function insertRepeatCopy(senderId, senderName, message, newSched) {
  return safeQuery(
    `INSERT INTO announcements (sender_id, sender_name, message, scheduled_at, send_mode) VALUES (?, ?, ?, ?, 'now')`,
    [senderId, senderName, message, newSched]
  );
}
