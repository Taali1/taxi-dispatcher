import {
  runRawQuery,
  listTables,
  getTablePage,
  insertRow,
  updateRow,
  deleteRow,
} from '../repository/database.repository.js';
import { reconnectPool } from '../db.js';
import { getConnectionWithTimeout } from '../db.js';

// Wykonaj query z retry logic
export async function runQuery(req, res) {
  const { sql, params } = req.body;

  if (!sql) {
    return res.status(400).json({
      success: false,
      error: 'SQL query is required'
    });
  }

  const isWrite = /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/i.test(sql);

  let retries = 2;
  while (retries >= 0) {
    try {
      if (isWrite) {
        console.log('[Query] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
      }

      const rows = await runRawQuery(sql, params);

      if (isWrite) {
        console.log('[Query] Success. Rows:', Array.isArray(rows) ? rows.length : rows?.affectedRows);
      }

      return res.json({
        success: true,
        data: rows,
        rowCount: rows.length
      });
    } catch (error) {
      console.error('[Query] Error:', error.message, 'Retries left:', retries);

      if ((error.code === 'PROTOCOL_CONNECTION_LOST' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ER_ACCESS_DENIED_ERROR') && retries > 0) {
        console.log('[Query] Attempting to reconnect...');
        await reconnectPool();
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      return res.json({
        success: false,
        error: error.message,
        errorCode: error.code,
        errno: error.errno
      });
    }
  }
}

export async function getTables(req, res) {
  try {
    console.log('[Tables] Getting tables...');
    const rows = await listTables();
    const tables = rows.map(row => {
      const values = Object.values(row);
      return values[0];
    });
    console.log('[Tables] Found:', tables);
    res.json({ success: true, data: tables });
  } catch (error) {
    console.error('[Tables] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}

export async function getTableData(req, res) {
  const { tableName } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  try {
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const { totalRows, rows } = await getTablePage(tableName, parseInt(pageSize), offset);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const data = rows.map(row => columns.map(col => row[col]));

    res.json({
      success: true,
      data: {
        columns,
        rows: data,
        totalRows,
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Table] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}

export async function insertTableRow(req, res) {
  const { tableName } = req.params;
  const data = req.body;

  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    console.log('[Insert] Table:', tableName);

    const result = await insertRow(tableName, columns, values, placeholders);

    res.json({
      success: true,
      data: {
        insertId: result.insertId,
        affectedRows: result.affectedRows
      }
    });
  } catch (error) {
    console.error('[Insert] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}

export async function updateTableRow(req, res) {
  const { tableName, id } = req.params;
  const data = req.body;

  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    console.log('[Update] Table:', tableName, 'ID:', id);

    const result = await updateRow(tableName, setClause, values, id);

    res.json({
      success: true,
      data: { affectedRows: result.affectedRows }
    });
  } catch (error) {
    console.error('[Update] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}

export async function deleteTableRow(req, res) {
  const { tableName, id } = req.params;

  try {
    console.log('[Delete] Table:', tableName, 'ID:', id);
    const result = await deleteRow(tableName, id);
    res.json({
      success: true,
      data: { affectedRows: result.affectedRows }
    });
  } catch (error) {
    console.error('[Delete] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}
