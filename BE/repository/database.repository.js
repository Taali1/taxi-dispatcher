import { getConnectionWithTimeout } from '../db.js';

export async function runRawQuery(sql, params) {
  const connection = await getConnectionWithTimeout();
  const [rows] = await connection.query(sql, params || []);
  connection.release();
  return rows;
}

export async function listTables() {
  const connection = await getConnectionWithTimeout();
  const [rows] = await connection.query('SHOW TABLES');
  connection.release();
  return rows;
}

export async function getTablePage(tableName, pageSize, offset) {
  const connection = await getConnectionWithTimeout();
  const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  const totalRows = countResult[0].count;
  const [rows] = await connection.query(
    `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  connection.release();
  return { totalRows, rows };
}

export async function insertRow(tableName, columns, values, placeholders) {
  const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  const connection = await getConnectionWithTimeout();
  const [result] = await connection.query(sql, values);
  connection.release();
  return result;
}

export async function updateRow(tableName, setClause, values, id) {
  const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
  const connection = await getConnectionWithTimeout();
  const [result] = await connection.query(sql, [...values, id]);
  connection.release();
  return result;
}

export async function deleteRow(tableName, id) {
  const sql = `DELETE FROM ${tableName} WHERE id = ?`;
  const connection = await getConnectionWithTimeout();
  const [result] = await connection.query(sql, [id]);
  connection.release();
  return result;
}
