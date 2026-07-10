import fs from 'fs';
import { spawn } from 'child_process';

export function createHealthController({ healthRepository, reconnectPool }) {
  async function health(req, res) {
    try {
      await healthRepository.ping();
      res.json({
        status: 'OK',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Health Check] Database connection failed:', error.message);
      res.status(503).json({
        status: 'DEGRADED',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function restartConsole(req, res) {
    try {
      res.json({ success: true, content: healthRepository.readRestartLog() });
    } catch {
      res.json({ success: true, content: '' });
    }
  }

  function restart(req, res) {
    console.log('[Restart] Server restart requested');
    res.json({ success: true, message: 'Restarting server...' });

    setTimeout(() => {
      const startLine = `[${new Date().toLocaleTimeString('pl-PL')}] === RESTART SERWERA BACKENDU ===\n`;
      const infoLine = `[${new Date().toLocaleTimeString('pl-PL')}] Zatrzymywanie bieżącej instancji...\n`;
      fs.writeFileSync(healthRepository.RESTART_LOG_FILE, startLine + infoLine, 'utf8');

      const logStream = fs.openSync(healthRepository.RESTART_LOG_FILE, 'a');
      const child = spawn('node', ['server.js'], {
        detached: true,
        stdio: ['ignore', logStream, logStream],
        cwd: process.cwd(),
      });
      child.unref();

      fs.appendFileSync(healthRepository.RESTART_LOG_FILE, `[${new Date().toLocaleTimeString('pl-PL')}] Uruchamianie nowej instancji serwera...\n`);
      console.log('[Restart] New server instance spawned, exiting current process...');
      process.exit(0);
    }, 300);
  }

  async function reconnect(req, res) {
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

  return { health, restartConsole, restart, reconnect };
}
