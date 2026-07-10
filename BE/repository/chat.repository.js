import { safeQuery } from '../db.js';

export async function listChatMessages() {
  return safeQuery(`
    SELECT cm.*, d.driver_code AS sender_driver_code, d.name AS sender_driver_name
    FROM chat_messages cm
    LEFT JOIN drivers d ON cm.sender_id = d.id
    ORDER BY cm.created_at ASC
  `);
}

export async function insertChatMessage(fields) {
  return safeQuery(
    `INSERT INTO chat_messages
     (id, sender_id, sender_name, sender_type, receiver_id, receiver_name, receiver_type, message, is_read, created_at)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    fields
  );
}

export async function markMessagesRead(ids) {
  const placeholders = ids.map(() => '?').join(',');
  return safeQuery(`UPDATE chat_messages SET is_read = 1 WHERE id IN (${placeholders})`, ids);
}
