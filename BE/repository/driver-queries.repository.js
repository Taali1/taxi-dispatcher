import { safeQuery } from '../db.js';

export async function insertDriverQuery(driverId, question) {
  return safeQuery(
    `INSERT INTO driver_queries (id, driver_id, question, status, created_at) VALUES (UUID(), ?, ?, 'pending', NOW())`,
    [driverId, question]
  );
}

export async function getRecentAnswers() {
  return safeQuery(
    `SELECT driver_id, answer, status, created_at, answered_at
     FROM driver_queries
     WHERE created_at >= NOW() - INTERVAL 60 MINUTE
     ORDER BY created_at DESC`
  );
}

export async function getPendingQuery(driverId) {
  return safeQuery(
    `SELECT * FROM driver_queries WHERE driver_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [driverId]
  );
}

export async function respondToQuery(answer, queryId) {
  return safeQuery(
    `UPDATE driver_queries SET answer = ?, status = 'answered', answered_at = NOW() WHERE id = ?`,
    [answer, queryId]
  );
}
