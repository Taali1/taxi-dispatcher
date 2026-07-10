import mysql from 'mysql2/promise';
import { getConnectionWithTimeout } from '../db.js';

export async function pingDatabase() {
  const connection = await getConnectionWithTimeout();
  await connection.query('SELECT 1');
  connection.release();
}

export async function testConnection({ host, port, user, password, database }) {
  const connection = await mysql.createConnection({
    host,
    port: parseInt(port || '3306'),
    user,
    password,
    database
  });
  const result = await connection.query('SELECT VERSION() as version');
  await connection.end();
  return result[0][0].version;
}
