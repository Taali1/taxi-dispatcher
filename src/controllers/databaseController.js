export function createDatabaseController({ repo }) {
  async function testConnection(req, res) {
    const { host, port, user, password, database } = req.body;
    try {
      const version = await repo.testConnection({ host, port, user, password, database });
      res.json({ success: true, data: { version, tables: [] } });
    } catch (error) {
      console.error('[Test Connection] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  async function query(req, res) {
    const { sql, params } = req.body;
    if (!sql) {
      return res.status(400).json({ success: false, error: 'SQL query is required' });
    }

    const isWrite = /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/i.test(sql);
    let retries = 2;

    while (retries >= 0) {
      try {
        if (isWrite) {
          console.log('[Query] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
        }

        const connection = await repo.getConnectionWithTimeout();
        const [rows] = await connection.query(sql, params || []);
        connection.release();

        if (isWrite) {
          console.log('[Query] Success. Rows:', Array.isArray(rows) ? rows.length : rows?.affectedRows);
        }

        return res.json({ success: true, data: rows, rowCount: rows.length });
      } catch (error) {
        console.error('[Query] Error:', error.message, 'Retries left:', retries);

        if ((error.code === 'PROTOCOL_CONNECTION_LOST' ||
             error.code === 'ECONNREFUSED' ||
             error.code === 'ER_ACCESS_DENIED_ERROR') && retries > 0) {
          console.log('[Query] Attempting to reconnect...');
          await repo.reconnectPool();
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        return res.json({
          success: false,
          error: error.message,
          errorCode: error.code,
          errno: error.errno,
        });
      }
    }
  }

  async function listTables(req, res) {
    try {
      console.log('[Tables] Getting tables...');
      const tables = await repo.listTables();
      console.log('[Tables] Found:', tables);
      res.json({ success: true, data: tables });
    } catch (error) {
      console.error('[Tables] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  async function getTable(req, res) {
    const { tableName } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    try {
      const { rows, totalRows } = await repo.getTableData(tableName, page, pageSize);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const data = rows.map(row => columns.map(col => row[col]));
      res.json({
        success: true,
        data: {
          columns,
          rows: data,
          totalRows,
          currentPage: parseInt(page),
          pageSize: parseInt(pageSize),
        },
      });
    } catch (error) {
      console.error('[Table] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  async function insert(req, res) {
    const { tableName } = req.params;
    try {
      const result = await repo.insertRow(tableName, req.body);
      res.json({ success: true, data: { insertId: result.insertId, affectedRows: result.affectedRows } });
    } catch (error) {
      console.error('[Insert] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  async function update(req, res) {
    const { tableName, id } = req.params;
    try {
      const result = await repo.updateRow(tableName, id, req.body);
      res.json({ success: true, data: { affectedRows: result.affectedRows } });
    } catch (error) {
      console.error('[Update] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  async function remove(req, res) {
    const { tableName, id } = req.params;
    try {
      const result = await repo.deleteRow(tableName, id);
      res.json({ success: true, data: { affectedRows: result.affectedRows } });
    } catch (error) {
      console.error('[Delete] Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }

  return { testConnection, query, listTables, getTable, insert, update, remove };
}
