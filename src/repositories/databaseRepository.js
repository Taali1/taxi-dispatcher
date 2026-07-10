import mysql from 'mysql2/promise';

export function createDatabaseRepository({ getConnectionWithTimeout, reconnectPool }) {
  async function testConnection({ host, port, user, password, database }) {
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port || '3306'),
      user,
      password,
      database,
    });
    const result = await connection.query('SELECT VERSION() as version');
    await connection.end();
    return result[0][0].version;
  }

  async function listTables() {
    const connection = await getConnectionWithTimeout();
    const [rows] = await connection.query('SHOW TABLES');
    connection.release();
    return rows.map(row => Object.values(row)[0]);
  }

  async function getTableData(tableName, page, pageSize) {
    const connection = await getConnectionWithTimeout();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const [rows] = await connection.query(
      `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`,
      [parseInt(pageSize), offset]
    );
    connection.release();
    return { rows, totalRows: countResult[0].count };
  }

  async function insertRow(tableName, data) {
    const connection = await getConnectionWithTimeout();
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const [result] = await connection.query(sql, values);
    connection.release();
    return result;
  }

  async function updateRow(tableName, id, data) {
    const connection = await getConnectionWithTimeout();
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
    const [result] = await connection.query(sql, [...values, id]);
    connection.release();
    return result;
  }

  async function deleteRow(tableName, id) {
    const connection = await getConnectionWithTimeout();
    const [result] = await connection.query(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    connection.release();
    return result;
  }

  return {
    testConnection,
    listTables,
    getTableData,
    insertRow,
    updateRow,
    deleteRow,
    getConnectionWithTimeout,
    reconnectPool,
  };
}
