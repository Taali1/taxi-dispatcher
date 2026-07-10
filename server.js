import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createQueueRepository } from './BE/queue/queueRepository.js';
import { createQueueService } from './BE/queue/queueService.js';
import { createQueueController } from './BE/queue/queueController.js';

import {
  initializePool,
  getConnectionWithTimeout,
  safeQuery,
  startHealthCheck,
  isHealthCheckRunning,
  getPool,
} from './BE/db.js';
import { runMigrations } from './BE/migrations.js';
import { startMaintenance } from './BE/jobs/maintenance.js';

// Background-job starters z poszczególnych kontrolerów domenowych
import { startGieldaCheck } from './BE/controllers/tasks.controller.js';
import { startGieldaRegistrations, startAutoDispatch } from './BE/controllers/gielda.controller.js';
import { startScheduledCheck } from './BE/controllers/orders.controller.js';
import { startAnnouncementsRepeater } from './BE/controllers/announcements.controller.js';

// Routery domenowe
import healthRoutes from './BE/routes/health.routes.js';
import databaseRoutes from './BE/routes/database.routes.js';
import driversRoutes from './BE/routes/drivers.routes.js';
import ordersRoutes from './BE/routes/orders.routes.js';
import zonesRoutes from './BE/routes/zones.routes.js';
import chatRoutes from './BE/routes/chat.routes.js';
import announcementsRoutes from './BE/routes/announcements.routes.js';
import notificationsRoutes from './BE/routes/notifications.routes.js';
import tasksRoutes from './BE/routes/tasks.routes.js';
import pushRoutes from './BE/routes/push.routes.js';
import settingsRoutes from './BE/routes/settings.routes.js';
import taximeterRoutes from './BE/routes/taximeter.routes.js';
import blocksRoutes from './BE/routes/blocks.routes.js';
import localAddressesRoutes from './BE/routes/local-addresses.routes.js';
import systemLogsRoutes from './BE/routes/system-logs.routes.js';
import cityBoundariesRoutes from './BE/routes/city-boundaries.routes.js';
import adminRoutes from './BE/routes/admin.routes.js';
import asteriskRoutes from './BE/routes/asterisk.routes.js';
import gieldaRoutes from './BE/routes/gielda.routes.js';
import driverQueriesRoutes from './BE/routes/driver-queries.routes.js';
import ttsRoutes from './BE/routes/tts.routes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT || 3001;

// Middleware do obsługi błędów MySQL — chroni wszystkie trasy poniżej
app.use((req, res, next) => {
  if (!getPool()) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not initialized'
    });
  }
  next();
});

// ── Rejestracja routerów domenowych ─────────────────────────────────────────
app.use(healthRoutes);
app.use(databaseRoutes);
app.use(driversRoutes);
app.use(ordersRoutes);
app.use(zonesRoutes);
app.use(chatRoutes);
app.use(announcementsRoutes);
app.use(notificationsRoutes);
app.use(tasksRoutes);
app.use(pushRoutes);
app.use(settingsRoutes);
app.use(taximeterRoutes);
app.use(blocksRoutes);
app.use(localAddressesRoutes);
app.use(systemLogsRoutes);
app.use(cityBoundariesRoutes);
app.use(adminRoutes);
app.use(asteriskRoutes);
app.use(gieldaRoutes);
app.use(driverQueriesRoutes);
app.use(ttsRoutes);

// ============================================================================
// GRACEFUL SHUTDOWN — zamknij pool przed wyjściem, by MySQL zwolnił sloty
// ============================================================================
async function gracefulShutdown(signal) {
  console.log(`[Server] ${signal} received — closing gracefully...`);
  const { getPool } = await import('./BE/db.js');
  const pool = getPool();
  if (pool) {
    try {
      await pool.end();
      console.log('[Server] DB pool closed cleanly — MySQL slots freed');
    } catch (e) {
      console.error('[Server] Error closing pool:', e.message);
    }
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Uruchom serwer
async function start() {
  try {
    // Połącz z bazą i uruchom migracje — jeśli DB niedostępna, serwer startuje
    // i ponawia próbę co 15s (TIME_WAIT po restarcie mija w ciągu ~2-5 min)
    await initializePool();

    const initDbAndJobs = async () => {
      await runMigrations();
      if (!isHealthCheckRunning()) startHealthCheck();
      startGieldaCheck();
      startGieldaRegistrations();
      startScheduledCheck();
      startAutoDispatch();
      startMaintenance();
      startAnnouncementsRepeater();
    };

    let dbRetryCount = 0;
    const MAX_DB_RETRIES = 20; // max ~5 minut
    const tryConnectDb = async () => {
      try {
        const conn = await getConnectionWithTimeout(8000);
        await conn.query('SELECT 1');
        conn.release();
        console.log(`✅ MySQL Database connected${dbRetryCount > 0 ? ` (po ${dbRetryCount} próbach)` : ''}`);
        await initDbAndJobs();
      } catch (dbErr) {
        dbRetryCount++;
        if (dbRetryCount <= MAX_DB_RETRIES) {
          console.warn(`⚠️  DB niedostępna (próba ${dbRetryCount}/${MAX_DB_RETRIES}): ${dbErr.message} — ponawiam za 15s...`);
          setTimeout(tryConnectDb, 15000);
        } else {
          console.error('❌ [DB] Nie udało się połączyć po', MAX_DB_RETRIES, 'próbach. Sprawdź MySQL i zrestartuj serwer.');
        }
      }
    };
    tryConnectDb();

    // Inicjalizacja warstwy kolejkowania
    const queueRepo = createQueueRepository({ safeQuery, getConnectionWithTimeout });
    const queueSvc  = createQueueService({ repo: queueRepo, getConnectionWithTimeout, safeQuery });
    const queueCtrl = createQueueController({ queueService: queueSvc });

    // Routes kolejkowania
    app.post('/api/drivers/:driverId/enter-zone', queueCtrl.enterZone);
    app.post('/api/drivers/:driverId/state',      queueCtrl.changeState);
    app.post('/api/drivers/:driverId/leave-zone', queueCtrl.leaveZone);
    app.get('/api/queue/zone/:zoneNumber',         queueCtrl.getZoneQueue);
    app.get('/api/queue/all',                      queueCtrl.getAllQueues);

    console.log('[Queue] Routes zarejestrowane');
    console.log('[DriverQueries] Routes registered inside start()');
    console.log('[Asterisk] Routes zarejestrowane');

    app.listen(PORT, () => {
      console.log(`\n📡 API Server running on http://localhost:${PORT}`);
      console.log(`📊 Database: ${process.env.MYSQL_DATABASE || process.env.VITE_MYSQL_DATABASE || 'sql7817074'}`);
      console.log(`🚀 Ready to handle requests (DB connecting in background...)\n`);
    });
  } catch (error) {
    console.error('[Server] Failed to start HTTP server:', error);
    process.exit(1);
  }
}

start();
