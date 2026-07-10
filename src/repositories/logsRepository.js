export function createLogsRepository({ safeQuery }) {
  async function insertOrderLog(orderId, type, message, data) {
    await safeQuery(
      `INSERT INTO order_logs (order_id, type, message, data) VALUES (?, ?, ?, ?)`,
      [orderId, type, message, data ? JSON.stringify(data) : null]
    );
  }

  async function insertDriverLog(driverId, type, title, description, metadata) {
    await safeQuery(
      `INSERT INTO driver_logs (driver_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)`,
      [driverId, type, title, description, metadata ? JSON.stringify(metadata) : null]
    );
  }

  async function insertSystemLog({ type, category, userId, userName, userRole, description, metadata, ipAddress }) {
    await safeQuery(
      `INSERT INTO system_logs (type, category, user_id, user_name, user_role, description, metadata, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, category, userId, userName, userRole, description, metadata ? JSON.stringify(metadata) : null, ipAddress]
    );
  }

  async function getDriverLogs(driverId, limit) {
    return safeQuery(
      `SELECT id, type, title, description, metadata, created_at
       FROM driver_logs WHERE driver_id = ? ORDER BY created_at DESC LIMIT ?`,
      [driverId, limit]
    );
  }

  async function getOrderLogs(orderId) {
    return safeQuery(
      `SELECT id, type, message, data, created_at FROM order_logs WHERE order_id = ? ORDER BY created_at ASC`,
      [orderId]
    );
  }

  return {
    insertOrderLog,
    insertDriverLog,
    insertSystemLog,
    getDriverLogs,
    getOrderLogs,
  };
}
