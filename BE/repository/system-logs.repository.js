import { safeQuery } from '../db.js';

export async function getOrderLogsJoined(type, limit) {
  return safeQuery(
    `SELECT
       ol.id                              AS id,
       'order'                            AS source,
       ol.type,
       ol.message                         AS title,
       ol.data,
       o.order_number                     AS ref,
       ol.order_id                        AS entity_id,
       COALESCE(d.driver_code, '')        AS driver_code,
       COALESCE(d.name, '')               AS driver_name,
       ol.created_at
     FROM order_logs ol
     LEFT JOIN orders  o ON o.id = ol.order_id
     LEFT JOIN drivers d ON d.id = o.driver_id
     ${type ? 'WHERE ol.type = ?' : ''}
     ORDER BY ol.created_at DESC
     LIMIT ?`,
    type ? [type, limit] : [limit]
  );
}

export async function getDriverLogsJoined(type, limit) {
  return safeQuery(
    `SELECT
       dl.id + 10000000                   AS id,
       'driver'                           AS source,
       dl.type,
       dl.title,
       dl.metadata                        AS data,
       NULL                               AS ref,
       dl.driver_id                       AS entity_id,
       COALESCE(d.driver_code, '')        AS driver_code,
       COALESCE(d.name, '')               AS driver_name,
       dl.created_at
     FROM driver_logs dl
     LEFT JOIN drivers d ON d.id = dl.driver_id
     ${type ? 'WHERE dl.type = ?' : ''}
     ORDER BY dl.created_at DESC
     LIMIT ?`,
    type ? [type, limit] : [limit]
  );
}

export async function getEventsUnion(limit) {
  return safeQuery(
    `SELECT 'order_new'       AS ev_type, o.order_number AS ref,
            COALESCE(o.customer_name,'—') AS label,
            o.pickup_address  AS detail, NULL AS driver_code,
            o.created_at      AS ts
     FROM orders o
     UNION ALL
     SELECT 'order_accepted', o.order_number,
            COALESCE(d.driver_code,'—'),
            COALESCE(o.pickup_address,'—'), d.driver_code,
            o.updated_at
     FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
     WHERE o.status = 'accepted'
     UNION ALL
     SELECT 'order_pickup', o.order_number,
            COALESCE(d.driver_code,'—'),
            COALESCE(o.pickup_address,'—'), d.driver_code,
            o.updated_at
     FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
     WHERE o.status = 'at_pickup'
     UNION ALL
     SELECT 'order_done', o.order_number,
            COALESCE(d.driver_code,'—'),
            CONCAT('Klient: ', COALESCE(o.customer_name,'—')), d.driver_code,
            o.updated_at
     FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
     WHERE o.status = 'completed'
     UNION ALL
     SELECT 'order_cancelled', o.order_number,
            COALESCE(o.customer_name,'—'),
            COALESCE(o.pickup_address,'—'), NULL,
            o.updated_at
     FROM orders o WHERE o.status IN ('cancelled','rejected')
     UNION ALL
     SELECT 'driver_online', d.driver_code,
            d.name, NULL, d.driver_code,
            d.last_seen
     FROM drivers d WHERE d.is_online = 1 AND d.last_seen IS NOT NULL
     ORDER BY ts DESC
     LIMIT ?`,
    [limit]
  );
}

export async function countSystemLogs(whereClause, params) {
  const rows = await safeQuery(`SELECT COUNT(*) as total FROM system_logs ${whereClause}`, params);
  return rows?.[0]?.total ?? 0;
}

export async function pageSystemLogs(whereClause, params, limitNum, offset) {
  return safeQuery(
    `SELECT id, type, category, user_id, user_name, user_role, description, metadata, ip_address, created_at
     FROM system_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );
}

export async function getDistinctLogTypes() {
  return safeQuery(`SELECT DISTINCT type, category FROM system_logs ORDER BY category, type`);
}
