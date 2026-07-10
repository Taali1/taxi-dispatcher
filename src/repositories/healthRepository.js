import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const RESTART_LOG_FILE = path.join(process.cwd(), 'restart_console.log');

export function createHealthRepository({ getConnectionWithTimeout }) {
  async function ping() {
    const connection = await getConnectionWithTimeout();
    await connection.query('SELECT 1');
    connection.release();
  }

  function readRestartLog() {
    return fs.existsSync(RESTART_LOG_FILE)
      ? fs.readFileSync(RESTART_LOG_FILE, 'utf8')
      : '';
  }

  return { ping, readRestartLog, RESTART_LOG_FILE };
}
