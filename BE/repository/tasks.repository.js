import { safeQuery } from '../db.js';

export async function listTasks() {
  return safeQuery(
    `SELECT t.id, t.title, t.description, t.taxi_code, t.operator, t.order_id, t.order_number,
            t.status, t.source, t.created_at, t.updated_at,
            o.customer_name, o.customer_phone, o.pickup_address,
            o.destination_address, o.notes, o.cost, o.created_at AS order_created_at
     FROM dispatcher_tasks t
     LEFT JOIN orders o ON t.order_id = o.id
     WHERE t.deleted_at IS NULL
     ORDER BY t.created_at DESC
     LIMIT 200`
  );
}

export async function insertTask(fields) {
  return safeQuery(
    `INSERT INTO dispatcher_tasks (id, title, description, taxi_code, operator, order_id, order_number, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', NOW(), NOW())`,
    fields
  );
}

export async function updateTaskStatus(status, id) {
  return safeQuery(
    `UPDATE dispatcher_tasks SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id]
  );
}

export async function softDeleteTask(id) {
  return safeQuery(
    `UPDATE dispatcher_tasks SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [id]
  );
}

export async function findTaskByOrderId(orderId) {
  return safeQuery(`SELECT id FROM dispatcher_tasks WHERE order_id = ? LIMIT 1`, [orderId]);
}

export async function insertSystemTaskForOverdueOrder(id, title, desc, orderId, orderNumber) {
  return safeQuery(
    `INSERT INTO dispatcher_tasks (id, title, description, taxi_code, operator, order_id, order_number, source, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'System', ?, ?, 'system', 'new', NOW(), NOW())`,
    [id, title, desc, orderId, orderNumber]
  );
}

export async function getGieldaTimeoutMinutes() {
  return safeQuery('SELECT gielda_timeout_minutes FROM settings LIMIT 1');
}

export async function getOverdueMarketOrders(timeoutMin) {
  return safeQuery(
    `SELECT o.id, o.order_number, o.pickup_address, o.customer_phone,
            o.created_at, TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
     FROM orders o
     WHERE o.status IN ('market', 'pending', 'new')
       AND o.driver_id IS NULL
       AND TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) >= ?
     ORDER BY o.created_at ASC`,
    [timeoutMin]
  );
}
