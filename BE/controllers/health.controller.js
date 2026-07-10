import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { reconnectPool } from '../db.js';
import { pingDatabase, testConnection } from '../repository/health.repository.js';

// Plik logu restartu — widoczny przez /api/restart-console
const RESTART_LOG_FILE = path.join(process.cwd(), 'restart_console.log');

export async function getHealth(req, res) {
  try {
    await pingDatabase();
    res.json({
      status: 'OK',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Health Check] Database connection failed:', error.message);
    res.status(503).json({
      status: 'DEGRADED',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

export function getRestartConsole(req, res) {
  try {
    const content = fs.existsSync(RESTART_LOG_FILE)
      ? fs.readFileSync(RESTART_LOG_FILE, 'utf8')
      : '';
    res.json({ success: true, content });
  } catch (e) {
    res.json({ success: true, content: '' });
  }
}

export function restartServer(req, res) {
  console.log('[Restart] Server restart requested');
  res.json({ success: true, message: 'Restarting server...' });

  setTimeout(() => {
    const startLine = `[${new Date().toLocaleTimeString('pl-PL')}] === RESTART SERWERA BACKENDU ===\n`;
    const infoLine  = `[${new Date().toLocaleTimeString('pl-PL')}] Zatrzymywanie bieżącej instancji...\n`;
    fs.writeFileSync(RESTART_LOG_FILE, startLine + infoLine, 'utf8');

    const logStream = fs.openSync(RESTART_LOG_FILE, 'a');
    const child = spawn('node', ['server.js'], {
      detached: true,
      stdio: ['ignore', logStream, logStream],
      cwd: process.cwd(),
    });
    child.unref();

    fs.appendFileSync(RESTART_LOG_FILE, `[${new Date().toLocaleTimeString('pl-PL')}] Uruchamianie nowej instancji serwera...\n`);
    console.log('[Restart] New server instance spawned, exiting current process...');
    process.exit(0);
  }, 300);
}

export async function reconnectDatabase(req, res) {
  console.log('[Reconnect] Manual reconnect requested');
  const success = await reconnectPool();
  if (success) {
    console.log('[Reconnect] Manual reconnect successful');
    res.json({ success: true, message: 'Połączenie z bazą danych przywrócone' });
  } else {
    console.error('[Reconnect] Manual reconnect failed');
    res.status(503).json({ success: false, error: 'Nie udało się przywrócić połączenia z bazą danych' });
  }
}

export async function testDbConnection(req, res) {
  const { host, port, user, password, database } = req.body;
  try {
    const version = await testConnection({ host, port, user, password, database });
    res.json({
      success: true,
      data: { version, tables: [] }
    });
  } catch (error) {
    console.error('[Test Connection] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
}
