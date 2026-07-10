import { addSystemLog } from '../shared/helpers.js';
import * as slRepo from '../repository/system-logs.repository.js';

// GET /api/system-events — pełna historia zdarzeń z order_logs + driver_logs
export async function getSystemEvents(req, res) {
  const limit  = Math.min(parseInt(req.query.limit)  || 500, 2000);
  const source = req.query.source || 'all';
  const type   = req.query.type   || null;

  try {
    let rows = [];

    if (source !== 'driver') {
      const orderRows = await slRepo.getOrderLogsJoined(type, limit);
      rows = rows.concat(orderRows ?? []);
    }

    if (source !== 'order') {
      const driverRows = await slRepo.getDriverLogsJoined(type, limit);
      rows = rows.concat(driverRows ?? []);
    }

    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (rows.length > limit) rows = rows.slice(0, limit);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[SystemEvents] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/events — strumień ostatnich zdarzeń systemowych
export async function getEvents(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  try {
    const rows = await slRepo.getEventsUnion(limit);
    const data = (rows ?? []).map(r => ({ ...r, type: r.ev_type }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Events] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/system-logs
export async function getAdminSystemLogs(req, res) {
  try {
    const {
      page = 1,
      limit = 50,
      dateFrom,
      dateTo,
      userRole,
      type,
      userId,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (dateFrom) { conditions.push('created_at >= ?'); params.push(dateFrom + ' 00:00:00'); }
    if (dateTo) { conditions.push('created_at <= ?'); params.push(dateTo + ' 23:59:59'); }
    if (userRole) { conditions.push('user_role = ?'); params.push(userRole); }
    if (type) { conditions.push('type = ?'); params.push(type); }
    if (userId) { conditions.push('user_id = ?'); params.push(userId); }
    if (search) { conditions.push('(description LIKE ? OR user_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = await slRepo.countSystemLogs(whereClause, params);
    const rows = await slRepo.pageSystemLogs(whereClause, params, limitNum, offset);

    const logs = (rows || []).map(row => ({
      id: row.id,
      type: row.type,
      category: row.category,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      description: row.description,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[SystemLogs] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAdminSystemLogTypes(req, res) {
  try {
    const rows = await slRepo.getDistinctLogTypes();
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function postAdminSystemLog(req, res) {
  try {
    const { type, category, userId, userName, userRole, description, metadata } = req.body;
    if (!type || !description) {
      return res.status(400).json({ success: false, error: 'Wymagane pola: type, description' });
    }
    await addSystemLog({ type, category: category || 'auth', userId, userName, userRole, description, metadata, ipAddress: req.ip });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
