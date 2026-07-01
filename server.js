import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn, exec } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { createQueueRepository } from './queue/queueRepository.js';
import { createQueueService } from './queue/queueService.js';
import { createQueueController } from './queue/queueController.js';

dotenv.config();

// ── Web Push / VAPID (opcjonalny — serwer startuje nawet bez pakietu web-push) ─
let webpush = null;
try {
  webpush = (await import('web-push')).default;
} catch (e) {
  console.warn('[Push] Pakiet web-push nie zainstalowany — push notifications wyłączone. Uruchom: npm install web-push');
}

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
if (webpush && VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:admin@taxi.local', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[Push] VAPID keys loaded');
} else if (!webpush) {
  // web-push not installed — push disabled, rest of app works normally
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled. Set VAPID_PUBLIC and VAPID_PRIVATE env vars.');
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT || 3001;

// MySQL Pool - główna konfiguracja bazy danych
let pool;

async function initializePool() {
  console.log('[MySQL Pool] Initializing connection pool...');
  const host = process.env.MYSQL_HOST || process.env.VITE_MYSQL_HOST || 'localhost';
  const port = parseInt(process.env.MYSQL_PORT || process.env.VITE_MYSQL_PORT || '3306');
  const user = process.env.MYSQL_USER || process.env.VITE_MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.VITE_MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || process.env.VITE_MYSQL_DATABASE || 'taxi_dispatch';

  console.log('[MySQL Pool] Host:', host);
  console.log('[MySQL Pool] Database:', database);
  console.log('[MySQL Pool] User:', user);

  pool = mysql.createPool({
    host: host,
    port: port,
    user: user,
    password: password,
    database: database,
    charset: 'utf8mb4',
    timezone: '+02:00',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
    connectTimeout: 15000,
    timezone: '+00:00',  // Wszystkie DATETIME traktowane jako UTC
  });

  console.log('[MySQL Pool] Pool initialized successfully');
  return pool;
}

// Funkcja do ponownego łączenia z bazą
// Pobierz połączenie z TWARDYM timeoutem - nigdy nie wisi w nieskończoność
// WAŻNE: poprawna implementacja bez wycieku połączeń.
// Promise.race() zostawiałoby pool.getConnection() wiszące w tle — gdy w końcu
// dałoby połączenie, nikt by go nie zwolnił i pula kurczyłaby się z każdym timeout'em.
async function getConnectionWithTimeout(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('getConnection timeout after ' + timeoutMs + 'ms'));
      }
    }, timeoutMs);

    pool.getConnection()
      .then(conn => {
        clearTimeout(timer);
        if (settled) {
          conn.release(); // timeout już odpalił — oddaj połączenie z powrotem do puli
        } else {
          settled = true;
          resolve(conn);
        }
      })
      .catch(err => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
  });
}

async function reconnectPool() {
  try {
    if (pool) {
      try { await pool.end(); } catch(e) { /* ignore */ }
      pool = null;
    }
    await initializePool();
    // Weryfikuj że nowe połączenie faktycznie działa
    const testConn = await getConnectionWithTimeout(10000);
    await testConn.query('SELECT 1');
    testConn.release();
    console.log('[MySQL Pool] Reconnected and verified successfully');
    return true;
  } catch (error) {
    console.error('[MySQL Pool] Reconnection failed:', error.message);
    return false;
  }
}

// Bezpieczne wykonanie zapytania z auto-reconnect
async function safeQuery(sql, params = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const connection = await getConnectionWithTimeout();
      try {
        const [result] = await connection.query(sql, params);
        connection.release();
        lastDbActivityTime = Date.now(); // zanotuj aktywność — ping może zostać pominięty
        return result;
      } catch (queryError) {
        connection.release();
        throw queryError;
      }
    } catch (error) {
      const isConnectionError =
        error.code === 'PROTOCOL_CONNECTION_LOST' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE' ||
        error.code === 'ER_CON_COUNT_ERROR' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED' ||
        error.message?.includes('Connection lost') ||
        error.message?.includes('connect ETIMEDOUT') ||
        error.message?.includes('closed state') ||
        error.message?.includes('read ECONNRESET') ||
        error.message?.includes('getConnection timeout'); // timeout z getConnectionWithTimeout

      if (isConnectionError && attempt < 2) {
        console.log(`[safeQuery] Connection error (attempt ${attempt + 1}/3): ${error.code || error.message} — reconnecting...`);
        await reconnectPool();
        await new Promise(r => setTimeout(r, 500)); // krócej czekaj między próbami
        continue;
      }
      throw error;
    }
  }
}

// ============================================================================
// HEALTH CHECK - Periodyczne monitorowanie połączenia z bazą
// ============================================================================

// Periodyczny ping - utrzymuje połączenie żywe
let healthCheckInterval = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
// Śledź ostatnią aktywność DB — pomijaj ping gdy baza była niedawno używana
let lastDbActivityTime = 0;

async function checkDatabaseHealth() {
  try {
    // Pomiń ping jeśli baza była aktywna w ciągu ostatnich 3,5s —
    // nie marnuj połączenia z puli gdy trwają prawdziwe zapytania.
    if (Date.now() - lastDbActivityTime < 3500) {
      return true;
    }

    // Pobierz połączenie z puli i wyślij ping
    const connection = await getConnectionWithTimeout();
    await connection.query('SELECT 1');
    lastDbActivityTime = Date.now();
    connection.release();

    if (consecutiveFailures > 0) {
      console.log('[Ping] Database connection restored');
      consecutiveFailures = 0;
    }

    return true;
  } catch (error) {
    consecutiveFailures++;
    console.error(`[Ping] Failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log('[Ping] Restarting pool...');
      await reconnectPool();
      consecutiveFailures = 0;
    }

    return false;
  }
}

function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Ping co 4 sekundy - FreeSQLDatabase zamyka idle po ~8s, więc 4s z marginesem
  healthCheckInterval = setInterval(async () => {
    await checkDatabaseHealth();
  }, 4000);

  console.log('[Ping] Started (interval: 4s - keeps FreeSQLDatabase alive)');
}

// Cache dla odpowiedzi API (zmniejsza obciążenie bazy)
const apiCache = new Map();
const CACHE_TTL = 5000; // 5 sekund

function getCached(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  apiCache.set(key, {
    data: data,
    timestamp: Date.now()
  });

  // Cleanup old cache entries (max 100 entries)
  if (apiCache.size > 100) {
    const firstKey = apiCache.keys().next().value;
    apiCache.delete(firstKey);
  }
}

// ============================================================================
// ZONE DETECTION - Point-in-Polygon Algorithm
// ============================================================================

// Funkcja do sprawdzania czy punkt jest w polygonie (Ray Casting Algorithm)
function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

// Funkcja do wykrywania strefy na podstawie współrzędnych
async function detectZoneFromCoordinates(latitude, longitude) {
  try {
    // Pobierz wszystkie aktywne strefy z bazy (przez safeQuery z auto-reconnect)
    const zones = await safeQuery(
      'SELECT id, number, coordinates FROM zones WHERE is_active = true'
    );

    if (!zones || zones.length === 0) {
      console.log('[Zone Detection] No active zones found');
      return null;
    }

    const point = { lat: latitude, lng: longitude };

    // Sprawdź każdą strefę
    for (const zone of zones) {
      // Parse coordinates (są zapisane jako JSON string)
      let coordinates;
      try {
        coordinates = typeof zone.coordinates === 'string'
          ? JSON.parse(zone.coordinates)
          : zone.coordinates;
      } catch (e) {
        console.error('[Zone Detection] Failed to parse coordinates for zone:', zone.number);
        continue;
      }

      // Sprawdź czy punkt jest w polygonie
      if (isPointInPolygon(point, coordinates)) {
        console.log(`[Zone Detection] Point (${latitude}, ${longitude}) is in zone ${zone.number}`);
        return zone.number;
      }
    }

    console.log(`[Zone Detection] Point (${latitude}, ${longitude}) is not in any zone`);
    return null;
  } catch (error) {
    console.error('[Zone Detection] Error:', error.message);
    return null;
  }
}

// ============================================================================

// Middleware do obsługi błędów MySQL
app.use((req, res, next) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not initialized'
    });
  }
  next();
});

// Health check z testem bazy danych
app.get('/health', async (req, res) => {
  try {
    // Test połączenia z bazą
    const connection = await getConnectionWithTimeout();
    await connection.query('SELECT 1');
    connection.release();

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
});

// Plik logu restartu — widoczny przez /api/restart-console
const RESTART_LOG_FILE = path.join(process.cwd(), 'restart_console.log');

// Odczyt logu restartu (endpoint polling'owany przez frontend)
app.get('/api/restart-console', (req, res) => {
  try {
    const content = fs.existsSync(RESTART_LOG_FILE)
      ? fs.readFileSync(RESTART_LOG_FILE, 'utf8')
      : '';
    res.json({ success: true, content });
  } catch (e) {
    res.json({ success: true, content: '' });
  }
});

// Restart całego serwera backendu
app.post('/api/restart', (req, res) => {
  console.log('[Restart] Server restart requested');
  res.json({ success: true, message: 'Restarting server...' });

  setTimeout(() => {
    // Wyczyść i zainicjalizuj plik logu
    const startLine = `[${new Date().toLocaleTimeString('pl-PL')}] === RESTART SERWERA BACKENDU ===\n`;
    const infoLine  = `[${new Date().toLocaleTimeString('pl-PL')}] Zatrzymywanie bieżącej instancji...\n`;
    fs.writeFileSync(RESTART_LOG_FILE, startLine + infoLine, 'utf8');

    // Strumienie stdout/stderr nowego procesu → plik logu (tryb dołączania)
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
});

// Wymuś ponowne połączenie z bazą danych (dla panelu supportu)
app.post('/api/reconnect', async (req, res) => {
  console.log('[Reconnect] Manual reconnect requested');
  const success = await reconnectPool();
  if (success) {
    console.log('[Reconnect] Manual reconnect successful');
    res.json({ success: true, message: 'Połączenie z bazą danych przywrócone' });
  } else {
    console.error('[Reconnect] Manual reconnect failed');
    res.status(503).json({ success: false, error: 'Nie udało się przywrócić połączenia z bazą danych' });
  }
});

// Test połączenia
app.post('/api/test-connection', async (req, res) => {
  const { host, port, user, password, database } = req.body;

  try {
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port || '3306'),
      user,
      password,
      database
    });

    const result = await connection.query('SELECT VERSION() as version');
    await connection.end();

    res.json({
      success: true,
      data: {
        version: result[0][0].version,
        tables: []
      }
    });
  } catch (error) {
    console.error('[Test Connection] Error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Wykonaj query z retry logic
app.post('/api/query', async (req, res) => {
  const { sql, params } = req.body;

  if (!sql) {
    return res.status(400).json({
      success: false,
      error: 'SQL query is required'
    });
  }

  // Loguj tylko zapytania modyfikujące dane (INSERT/UPDATE/DELETE), nie SELECT
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/i.test(sql);

  let retries = 2;
  while (retries >= 0) {
    try {
      if (isWrite) {
        console.log('[Query] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
      }

      const connection = await getConnectionWithTimeout();
      const [rows] = await connection.query(sql, params || []);
      connection.release();

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

      // Sprawdź czy to błąd połączenia
      if ((error.code === 'PROTOCOL_CONNECTION_LOST' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ER_ACCESS_DENIED_ERROR') && retries > 0) {
        console.log('[Query] Attempting to reconnect...');
        await reconnectPool();
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Czekaj 1 sekundę
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
});

// Pobierz listę tabel
app.get('/api/tables', async (req, res) => {
  try {
    console.log('[Tables] Getting tables...');

    const connection = await getConnectionWithTimeout();
    const [rows] = await connection.query('SHOW TABLES');
    connection.release();

    const tables = rows.map(row => {
      const values = Object.values(row);
      return values[0];
    });

    console.log('[Tables] Found:', tables);

    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    console.error('[Tables] Error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Pobierz dane tabeli
app.get('/api/table/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  try {
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const connection = await getConnectionWithTimeout();

    // Pobierz liczbę rekordów
    const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const totalRows = countResult[0].count;

    // Pobierz dane
    const [rows] = await connection.query(
      `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`,
      [parseInt(pageSize), offset]
    );

    connection.release();

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
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Wstaw dane
app.post('/api/insert/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const data = req.body;

  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

    console.log('[Insert] Table:', tableName);
    console.log('[Insert] SQL:', sql);

    const connection = await getConnectionWithTimeout();
    const [result] = await connection.query(sql, values);
    connection.release();

    res.json({
      success: true,
      data: {
        insertId: result.insertId,
        affectedRows: result.affectedRows
      }
    });
  } catch (error) {
    console.error('[Insert] Error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Aktualizuj dane
app.put('/api/update/:tableName/:id', async (req, res) => {
  const { tableName, id } = req.params;
  const data = req.body;

  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;

    console.log('[Update] Table:', tableName, 'ID:', id);

    const connection = await getConnectionWithTimeout();
    const [result] = await connection.query(sql, [...values, id]);
    connection.release();

    res.json({
      success: true,
      data: {
        affectedRows: result.affectedRows
      }
    });
  } catch (error) {
    console.error('[Update] Error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Usuń dane
app.delete('/api/delete/:tableName/:id', async (req, res) => {
  const { tableName, id } = req.params;

  try {
    const sql = `DELETE FROM ${tableName} WHERE id = ?`;

    console.log('[Delete] Table:', tableName, 'ID:', id);

    const connection = await getConnectionWithTimeout();
    const [result] = await connection.query(sql, [id]);
    connection.release();

    res.json({
      success: true,
      data: {
        affectedRows: result.affectedRows
      }
    });
  } catch (error) {
    console.error('[Delete] Error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Aktualizuj lokalizację kierowcy (z auto-reconnect przez safeQuery)
app.post('/api/drivers/:driverId/location', async (req, res) => {
  const { driverId } = req.params;
  // akceptuj zarówno latitude/longitude jak i lat/lng
  const latitude  = req.body.latitude  ?? req.body.lat;
  const longitude = req.body.longitude ?? req.body.lng;

  if (!latitude || !longitude) {
    return res.status(400).json({
      success: false,
      error: 'Latitude and longitude are required'
    });
  }

  // OPTYMALIZACJA: jedno połączenie dla SELECT + (opcjonalnie) zones + UPDATE
  // Eliminuje 2-3 osobne getConnection() wywołania na każdą aktualizację GPS.
  let connection;
  try {
    connection = await getConnectionWithTimeout();
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. Pobierz stan kierowcy (to samo połączenie)
    const [[driverRow]] = await connection.query(
      'SELECT current_zone, driver_state FROM drivers WHERE id = ?',
      [driverId]
    );
    if (!driverRow) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    const currentZone = driverRow.current_zone ?? null;
    const driverState = driverRow.driver_state ?? null;
    let sql, params;
    let detectedZone = null;

    if (driverState !== null && driverState !== 'free') {
      // Kierowca w trakcie kursu / dojazdu — aktualizuj TYLKO lat/lng, strefa zarządzana przez kolejkowanie
      sql = `UPDATE drivers SET latitude = ?, longitude = ?, last_seen = ?, last_location_update = ? WHERE id = ?`;
      params = [latitude, longitude, nowLocal, nowLocal, driverId];
      detectedZone = currentZone;
    } else {
      // Kierowca Dom lub Wolny — wykryj strefę z GPS na bieżąco
      const [zones] = await connection.query(
        'SELECT number, coordinates FROM zones WHERE is_active = 1'
      );
      const point = { lat: latitude, lng: longitude };
      for (const zone of zones) {
        let coords;
        try {
          coords = typeof zone.coordinates === 'string'
            ? JSON.parse(zone.coordinates)
            : zone.coordinates;
        } catch { continue; }
        if (isPointInPolygon(point, coords)) {
          detectedZone = zone.number;
          break;
        }
      }

      const zoneChanged = detectedZone !== currentZone;
      if (zoneChanged && detectedZone !== null) {
        if (driverState === 'wolna') {
          sql = `UPDATE drivers
                 SET latitude = ?, longitude = ?, current_zone = ?,
                     zone_entered_at = ?, free_since = ?, last_seen = ?, last_location_update = ?
                 WHERE id = ?`;
          params = [latitude, longitude, detectedZone, nowLocal, nowLocal, nowLocal, nowLocal, driverId];
        } else {
          sql = `UPDATE drivers
                 SET latitude = ?, longitude = ?, current_zone = ?,
                     zone_entered_at = ?, last_seen = ?, last_location_update = ?
                 WHERE id = ?`;
          params = [latitude, longitude, detectedZone, nowLocal, nowLocal, nowLocal, driverId];
        }
        addDriverLog(driverId, 'zone_enter', `Wjechał do rejonu ${detectedZone}`,
          currentZone != null ? `Poprzedni rejon: ${currentZone}` : null,
          { nowy_rejon: detectedZone, poprzedni_rejon: currentZone, lat: latitude, lng: longitude }
        );
        console.log(`[Location] ${driverId} zone: ${currentZone} -> ${detectedZone}`);
      } else if (detectedZone === null && currentZone !== null) {
        sql = `UPDATE drivers
               SET latitude = ?, longitude = ?, current_zone = NULL,
                   zone_entered_at = NULL, last_seen = ?, last_location_update = ?
               WHERE id = ?`;
        params = [latitude, longitude, nowLocal, nowLocal, driverId];
        addDriverLog(driverId, 'zone_leave', `Opuścił rejon ${currentZone}`,
          null,
          { poprzedni_rejon: currentZone, lat: latitude, lng: longitude }
        );
        console.log(`[Location] ${driverId} left all zones`);
      } else {
        sql = `UPDATE drivers SET latitude = ?, longitude = ?, last_seen = ?, last_location_update = ? WHERE id = ?`;
        params = [latitude, longitude, nowLocal, nowLocal, driverId];
      }
    }

    // 2. Zaktualizuj (to samo połączenie)
    const [result] = await connection.query(sql, params);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    return res.json({
      success: true,
      data: {
        driverId, latitude, longitude,
        currentZone: detectedZone,
        zoneChanged: detectedZone !== currentZone,
        timestamp: nowLocal
      }
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('[Location Update] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Pobierz listę wszystkich kierowców (id, name, driver_code)
app.get('/api/drivers', async (req, res) => {
  try {
    const connection = await getConnectionWithTimeout();
    const [rows] = await connection.query(
      'SELECT id, name, driver_code, driver_state, is_online FROM drivers ORDER BY driver_code ASC'
    );
    connection.release();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[Drivers] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pobierz wszystkich kierowców z pełnymi danymi + aktywne zlecenie
app.get('/api/drivers/all-info', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT d.id, d.driver_code, d.name, d.vehicle_brand, d.vehicle_model,
              d.registration_number, d.driver_state, d.current_zone, d.queue_position,
              d.is_online, d.status,
              o.pickup_address AS active_order_address, o.order_number AS active_order_number
       FROM drivers d
       LEFT JOIN orders o ON o.driver_id = d.id
         AND o.status IN ('pending_driver','accepted','at_pickup','in_progress')
       WHERE d.status NOT IN ('inactive')
       ORDER BY d.driver_code ASC`
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (error) {
    console.error('[DriversAllInfo] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/drivers/:id/detail — pełne dane kierowcy dla modala
app.get('/api/drivers/:id/detail', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT d.id, d.driver_code, d.name, d.email, d.phone_number,
              d.driver_state, d.is_online, d.status, d.current_zone,
              d.queue_position, d.zone_entered_at, d.last_seen, d.free_since,
              d.vehicle_brand, d.vehicle_model, d.vehicle_color,
              d.registration_number, d.side_number, d.vehicle_categories,
              d.emergency_contact, d.rating, d.total_rides,
              d.license_number, d.license_expiry, d.created_at,
              d.latitude, d.longitude, d.preference_ids,
              o.id AS active_order_id,
              o.order_number AS active_order_number,
              o.pickup_address AS active_pickup_address,
              o.destination_address AS active_destination_address,
              o.customer_name AS active_customer_name,
              o.customer_phone AS active_customer_phone,
              o.status AS active_order_status
       FROM drivers d
       LEFT JOIN orders o ON o.driver_id = d.id
         AND o.status IN ('pending_driver','accepted','at_pickup','in_progress')
       WHERE d.id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kierowca nie znaleziony' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[DriverDetail] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Pobierz lokalizacje wszystkich kierowców (z cache)
// GET /api/drivers/map — wszyscy kierowcy z GPS (do mapy dyspozytora)
app.get('/api/drivers/map', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT id, name, driver_code, latitude, longitude,
              driver_state, current_zone, is_online, status
       FROM drivers
       WHERE status NOT IN ('inactive')
       ORDER BY driver_code ASC`
    );
    const data = (rows ?? []).map(r => ({
      id: r.id,
      name: r.name,
      driverCode: r.driver_code,
      driverState: r.driver_state ?? null,
      currentZone: r.current_zone ?? null,
      isOnline: r.is_online === 1,
      status: r.status ?? 'active',
      lat: parseFloat(r.latitude) || 0,
      lng: parseFloat(r.longitude) || 0,
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drivers/locations', async (req, res) => {
  try {
    // Sprawdź cache
    const cached = getCached('drivers:locations');
    if (cached) {
      console.log('[Get Locations] Returning cached data');
      return res.json(cached);
    }

    const sql = `SELECT id, name, driver_code, latitude, longitude,
                        last_location_update, driver_state, current_zone, is_online
                 FROM drivers
                 WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                   AND is_online = 1`;

    console.log('[Get Locations] Fetching all driver locations');

    const connection = await getConnectionWithTimeout();
    const [rows] = await connection.query(sql);
    connection.release();

    const response = {
      success: true,
      data: rows
    };

    // Zapisz do cache
    setCache('drivers:locations', response);

    res.json(response);
  } catch (error) {
    console.error('[Get Locations] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Przelicz strefy dla wszystkich kierowców z lokalizacją
app.post('/api/drivers/recalculate-zones', async (req, res) => {
  try {
    console.log('[Recalculate Zones] Starting zone recalculation for all drivers');

    const connection = await getConnectionWithTimeout();

    // Pobierz wszystkich kierowców z lokalizacją
    const [drivers] = await connection.query(
      'SELECT id, driver_code, latitude, longitude, current_zone, driver_state FROM drivers WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
    );

    if (drivers.length === 0) {
      connection.release();
      return res.json({
        success: true,
        message: 'No drivers with location found',
        checked: 0,
        updated: 0
      });
    }

    let updatedCount = 0;

    // Dla każdego kierowcy wykryj strefę
    for (const driver of drivers) {
      const detectedZone = await detectZoneFromCoordinates(driver.latitude, driver.longitude);

      if (detectedZone !== driver.current_zone) {
        // Aktualizuj strefę
        if (detectedZone !== null) {
          // Jeśli kierowca jest wolny i zmienia rejon — resetuj free_since żeby kolejka
          // ustawiała go na końcu nowego rejonu, a nie przenosiła starego czasu
          if (driver.driver_state === 'wolna') {
            await connection.query(
              'UPDATE drivers SET current_zone = ?, zone_entered_at = NOW(), free_since = NOW() WHERE id = ?',
              [detectedZone, driver.id]
            );
          } else {
            await connection.query(
              'UPDATE drivers SET current_zone = ?, zone_entered_at = NOW() WHERE id = ?',
              [detectedZone, driver.id]
            );
          }
        } else {
          await connection.query(
            'UPDATE drivers SET current_zone = NULL, zone_entered_at = NULL WHERE id = ?',
            [driver.id]
          );
        }

        console.log(`[Recalculate Zones] Driver ${driver.driver_code}: ${driver.current_zone} -> ${detectedZone}${driver.driver_state === 'wolna' ? ' (free_since reset)' : ''}`);
        updatedCount++;
      }
    }

    connection.release();

    res.json({
      success: true,
      message: `Zone recalculation completed`,
      checked: drivers.length,
      updated: updatedCount
    });
  } catch (error) {
    console.error('[Recalculate Zones] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pobierz wiadomości czatu
app.get('/api/chat/messages', async (req, res) => {
  try {
    const rows = await safeQuery(`
      SELECT cm.*, d.driver_code AS sender_driver_code, d.name AS sender_driver_name
      FROM chat_messages cm
      LEFT JOIN drivers d ON cm.sender_id = d.id
      ORDER BY cm.created_at ASC
    `);
    res.json({ success: true, data: rows ?? [] });
  } catch (error) {
    console.error('[Chat Messages] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dodaj wiadomość czatu
app.post('/api/chat/messages', async (req, res) => {
  const { sender_id, sender_name, sender_type, receiver_id, receiver_name, receiver_type, message } = req.body;

  if (!sender_id || !sender_type || !message) {
    return res.status(400).json({ success: false, error: 'Sender ID, sender type, and message are required' });
  }

  try {
    await safeQuery(
      `INSERT INTO chat_messages
       (id, sender_id, sender_name, sender_type, receiver_id, receiver_name, receiver_type, message, is_read, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
      [sender_id, sender_name || null, sender_type, receiver_id || null, receiver_name || null, receiver_type || null, message]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Chat Message] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Oznacz wiadomości jako przeczytane
app.patch('/api/chat/messages/read', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'ids array required' });
  }
  try {
    const placeholders = ids.map(() => '?').join(',');
    await safeQuery(`UPDATE chat_messages SET is_read = 1 WHERE id IN (${placeholders})`, ids);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// ── Announcements — komunikaty do kierowców ──────────────────────────────────
// ── Announcements migration — called after server starts ──
let announcementsMigrated = false;
async function migrateAnnouncements() {
  if (announcementsMigrated) return;
  const addCol = async (table, col, def) => {
    try { await safeQuery(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); console.log(`[Migration] Added ${col} to ${table}`); } catch (e) { console.log(`[Migration] Column ${col}: ${e.message.includes('Duplicate') ? 'already exists' : e.message}`); }
  };
  try {
    await addCol('announcements', 'scheduled_at', 'DATETIME NULL');
    await addCol('announcements', 'send_mode', "VARCHAR(10) DEFAULT 'now'");
    await addCol('announcements', 'repeat_config', 'JSON NULL');
    await addCol('announcements', 'confirmed_count', 'INT DEFAULT 0');
    await safeQuery(`CREATE TABLE IF NOT EXISTS announcement_confirmations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      announcement_id INT NOT NULL,
      driver_id VARCHAR(36) NOT NULL,
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ann_driver (announcement_id, driver_id)
    )`);
    announcementsMigrated = true;
    console.log('[Announcements] Schema migration OK');
  } catch (e) { console.error('[Announcements] Migration FAILED:', e.message); }
}

app.get('/api/announcements', async (req, res) => {
  await migrateAnnouncements();
  try {
    const rows = announcementsMigrated
      ? await safeQuery(`SELECT id, sender_id, sender_name, message, created_at, scheduled_at, send_mode, repeat_config, confirmed_count FROM announcements ORDER BY created_at DESC LIMIT 50`)
      : await safeQuery(`SELECT id, sender_id, sender_name, message, created_at FROM announcements ORDER BY created_at DESC LIMIT 50`);
    return res.json({ success: true, announcements: rows ?? [] });
  } catch (err) {
    console.error('[Announcements] GET error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/announcements', async (req, res) => {
  await migrateAnnouncements();
  const { senderId, senderName, message, scheduledAt, repeat, repeatUntil, repeatWeeks, repeatDays } = req.body;
  if (!senderId || !message?.trim()) return res.status(400).json({ success: false, error: 'Brak danych' });
  try {
    const sendMode = scheduledAt ? 'later' : 'now';
    const repeatConfig = repeat ? JSON.stringify({ until: repeatUntil, weeks: repeatWeeks, days: repeatDays }) : null;
    // Store scheduled_at as raw string to avoid timezone conversion
    const schedAtStr = sendMode === 'later' && scheduledAt
      ? scheduledAt.replace('T', ' ').slice(0, 16) + ':00'
      : null;
    console.log('[Announcements] POST - sendMode:', sendMode, 'scheduledAt raw:', scheduledAt, 'stored:', schedAtStr);

    if (announcementsMigrated) {
      await safeQuery(
        `INSERT INTO announcements (sender_id, sender_name, message, scheduled_at, send_mode, repeat_config) VALUES (?, ?, ?, ?, ?, ?)`,
        [senderId, senderName, message.trim(), schedAtStr ?? nowPolish(), sendMode, repeatConfig]
      );
      console.log('[Announcements] INSERT OK - send_mode:', sendMode);
    } else {
      console.error('[Announcements] Migration not done! Using old INSERT');
      await safeQuery(`INSERT INTO announcements (sender_id, sender_name, message) VALUES (?, ?, ?)`, [senderId, senderName, message.trim()]);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Announcements] POST error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: current time in Polish timezone as "YYYY-MM-DD HH:MM:SS"
function nowPolish() {
  // CEST (summer) = UTC+2, CET (winter) = UTC+1
  // DST: last Sunday of March 02:00 UTC to last Sunday of October 03:00 UTC
  const now = new Date();
  const year = now.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31, 2, 0, 0));
  while (marchLast.getUTCDay() !== 0) marchLast.setUTCDate(marchLast.getUTCDate() - 1);
  const octLast = new Date(Date.UTC(year, 9, 31, 3, 0, 0));
  while (octLast.getUTCDay() !== 0) octLast.setUTCDate(octLast.getUTCDate() - 1);
  const isDST = now >= marchLast && now < octLast;
  const offsetMs = (isDST ? 2 : 1) * 3600000;
  const pl = new Date(now.getTime() + offsetMs);
  const p = (n) => String(n).padStart(2, '0');
  const result = `${pl.getUTCFullYear()}-${p(pl.getUTCMonth()+1)}-${p(pl.getUTCDate())} ${p(pl.getUTCHours())}:${p(pl.getUTCMinutes())}:${p(pl.getUTCSeconds())}`;
  console.log('[nowPolish] UTC:', now.toISOString(), '-> PL:', result, isDST ? 'CEST' : 'CET');
  return result;
}

// Driver fetches announcements — returns all that are due and not yet confirmed by this driver
app.get('/api/announcements/latest', async (req, res) => {
  await migrateAnnouncements();
  const { since, driverId } = req.query;
  try {
    let rows;
    const sinceVal = since ?? new Date(Date.now() - 60000).toISOString();
    const now = nowPolish();

    if (driverId && announcementsMigrated) {
      rows = await safeQuery(
        `SELECT a.id, a.sender_id, a.sender_name, a.message, a.created_at
         FROM announcements a
         LEFT JOIN announcement_confirmations ac ON ac.announcement_id = a.id AND ac.driver_id = ?
         WHERE (a.scheduled_at IS NULL OR a.scheduled_at <= ?) AND ac.id IS NULL
         ORDER BY a.created_at DESC LIMIT 10`,
        [driverId, now]
      );
    } else if (announcementsMigrated) {
      rows = await safeQuery(
        `SELECT id, sender_id, sender_name, message, created_at FROM announcements
         WHERE (scheduled_at IS NULL OR scheduled_at <= ?) AND created_at > ?
         ORDER BY created_at DESC LIMIT 5`,
        [now, sinceVal]
      );
    } else {
      rows = await safeQuery(
        `SELECT id, sender_id, sender_name, message, created_at FROM announcements
         WHERE created_at > ? ORDER BY created_at DESC LIMIT 5`,
        [sinceVal]
      );
    }
    console.log('[Announcements/latest] now(PL):', now, 'driverId:', driverId, 'returned:', (rows ?? []).length);
    return res.json({ success: true, announcements: rows ?? [] });
  } catch (err) {
    console.error('[Announcements/latest] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Driver confirms reading an announcement
app.post('/api/announcements/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ success: false, error: 'Brak driverId' });
  try {
    await safeQuery(
      `INSERT IGNORE INTO announcement_confirmations (announcement_id, driver_id) VALUES (?, ?)`,
      [id, driverId]
    );
    // Update confirmed_count
    await safeQuery(
      `UPDATE announcements SET confirmed_count = (SELECT COUNT(*) FROM announcement_confirmations WHERE announcement_id = ?) WHERE id = ?`,
      [id, id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Scheduled announcements repeater — runs every minute, creates copies for repeat configs
setInterval(async () => {
  try {
    const rows = await safeQuery(
      `SELECT id, sender_id, sender_name, message, repeat_config, scheduled_at FROM announcements WHERE send_mode = 'later' AND repeat_config IS NOT NULL AND scheduled_at <= NOW()`
    );
    if (!rows || rows.length === 0) return;
    const now = new Date();
    for (const ann of rows) {
      try {
        const cfg = typeof ann.repeat_config === 'string' ? JSON.parse(ann.repeat_config) : ann.repeat_config;
        if (!cfg || !cfg.days) continue;
        const until = cfg.until ? new Date(cfg.until) : null;
        if (until && now > until) continue;
        const dayOfWeek = now.getDay(); // 0=Sun, need to map to Mon=0
        const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        if (!cfg.days[dayIdx]) continue;
        // Check if already sent today
        const todayStr = now.toISOString().slice(0, 10);
        const existing = await safeQuery(
          `SELECT id FROM announcements WHERE sender_id = ? AND message = ? AND DATE(scheduled_at) = ? AND id != ?`,
          [ann.sender_id, ann.message, todayStr, ann.id]
        );
        if (existing && existing.length > 0) continue;
        // Create copy for today
        const schedTime = new Date(ann.scheduled_at);
        const newSched = new Date(`${todayStr}T${String(schedTime.getHours()).padStart(2,'0')}:${String(schedTime.getMinutes()).padStart(2,'0')}:00`);
        if (newSched > now) continue; // not yet time
        await safeQuery(
          `INSERT INTO announcements (sender_id, sender_name, message, scheduled_at, send_mode) VALUES (?, ?, ?, ?, 'now')`,
          [ann.sender_id, ann.sender_name, ann.message, newSched]
        );
        console.log(`[Announcements] Repeated announcement ${ann.id} for ${todayStr}`);
      } catch (e) { console.error('[Announcements] Repeat error:', e.message); }
    }
  } catch {}
}, 60000);

// Login endpoint for mobile app (driver code + PIN)
app.post('/api/auth/login', async (req, res) => {
  const { driverCode, pin } = req.body;

  console.log('[Auth] Login attempt - driver code:', driverCode);

  try {
    const connection = await getConnectionWithTimeout();

    // Query database for driver with matching code and PIN
    const [drivers] = await connection.query(
      'SELECT * FROM drivers WHERE driver_code = ? AND pin = ?',
      [driverCode, pin]
    );

    connection.release();

    if (!drivers || drivers.length === 0) {
      console.log('[Auth] ❌ Invalid credentials');
      return res.status(401).json({
        success: false,
        error: 'Nieprawidłowy kod kierowcy lub PIN'
      });
    }

    const driver = drivers[0];

    // Remove sensitive data
    delete driver.password;
    delete driver.pin;

    // Generate simple token (production should use JWT)
    const token = `driver_${driver.id}_${Date.now()}`;

    console.log('[Auth] ✅ Login successful - driver:', driver.name);

    res.json({
      success: true,
      token: token,
      user: driver
    });

  } catch (error) {
    console.error('[Auth] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Authentication failed: ' + error.message
    });
  }
});

// ============================================================================
// SINGLE-SESSION AUTH ENDPOINTS
// ============================================================================

// POST /api/auth/driver/login — logowanie z kontrolą jednej sesji
// Jeśli kierowca jest już zalogowany (session_token + last_seen < 30 min):
//   zwraca { success: false, error: 'already_logged_in', driverName }
// Wymuszenie: dodaj { force: true } w body — wyloguje poprzednią sesję
app.post('/api/auth/driver/login', async (req, res) => {
  const { driverCode, pin, force } = req.body;

  if (!driverCode || !pin) {
    return res.status(400).json({ success: false, error: 'Wymagany kod kierowcy i PIN' });
  }

  console.log('[Auth] Driver login attempt - code:', driverCode, 'force:', !!force);

  let connection;
  try {
    connection = await getConnectionWithTimeout();

    const [drivers] = await connection.query(
      'SELECT * FROM drivers WHERE driver_code = ? AND pin = ?',
      [driverCode, pin]
    );

    if (!drivers || drivers.length === 0) {
      connection.release();
      console.log('[Auth] ❌ Invalid credentials for code:', driverCode);
      return res.status(401).json({ success: false, error: 'Nieprawidłowy kod kierowcy lub PIN' });
    }

    const driver = drivers[0];

    // Sprawdź status konta
    if (driver.status === 'inactive') {
      connection.release();
      return res.status(403).json({ success: false, error: 'Konto kierowcy jest nieaktywne. Skontaktuj się z administratorem.' });
    }
    if (driver.status === 'suspended') {
      connection.release();
      return res.status(403).json({
        success: false,
        error: 'suspended',
        suspendedUntil: driver.suspended_until
      });
    }

    // Sprawdź aktywną sesję (session_token ustawiony + last_seen < 30 min temu)
    if (!force && driver.session_token && driver.last_seen) {
      const lastSeenMs = new Date(driver.last_seen).getTime();
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      if (lastSeenMs > thirtyMinutesAgo) {
        connection.release();
        console.log('[Auth] ⚠️  Already logged in on another device - driver:', driver.name);
        return res.json({
          success: false,
          error: 'already_logged_in',
          driverName: driver.name
        });
      }
    }

    // Wygeneruj nowy unikalny token sesji
    const sessionToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Zapisz token sesji, ustaw online
    await connection.query(
      'UPDATE drivers SET session_token = ?, is_online = 1, last_seen = ? WHERE id = ?',
      [sessionToken, nowLocal, driver.id]
    );
    connection.release();

    addDriverLog(driver.id, 'login', 'Kierowca zalogował się do aplikacji', null, { force: !!force });
    addSystemLog({ type: 'login', category: 'auth', userId: String(driver.id), userName: driver.name, userRole: 'driver', description: `Kierowca ${driver.name} (${driverCode}) zalogował się do aplikacji`, metadata: { driverCode, force: !!force }, ipAddress: req.ip });

    // Usuń wrażliwe dane przed wysłaniem
    const sanitized = { ...driver };
    delete sanitized.password;
    delete sanitized.pin;
    delete sanitized.session_token;

    const token = `driver_${driver.id}_${Date.now()}`;
    console.log('[Auth] ✅ Driver login OK - name:', driver.name, force ? '(force)' : '');

    return res.json({
      success: true,
      token,
      sessionToken,
      user: sanitized
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('[Auth Driver] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Błąd serwera: ' + error.message });
  }
});

// POST /api/auth/driver/logout — wylogowanie (kasuje session_token)
app.post('/api/auth/driver/logout', async (req, res) => {
  const { driverId, sessionToken } = req.body;

  if (!driverId) {
    return res.status(400).json({ success: false, error: 'Brak driverId' });
  }

  console.log('[Auth] Driver logout - id:', driverId);

  try {
    const nowLocal = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await safeQuery(
      `UPDATE drivers
       SET session_token = NULL,
           is_online     = 0,
           driver_state  = NULL,
           latitude      = NULL,
           longitude     = NULL,
           current_zone  = NULL,
           zone_entered_at = NULL,
           last_seen     = ?
       WHERE id = ?`,
      [nowLocal, driverId]
    );
    console.log('[Auth] ✅ Driver logged out (status reset, lat/lng cleared) - id:', driverId);
    addDriverLog(driverId, 'logout', 'Kierowca wylogował się z aplikacji');
    addSystemLog({ type: 'logout', category: 'auth', userId: String(driverId), userRole: 'driver', description: `Kierowca (ID: ${driverId}) wylogował się z aplikacji`, ipAddress: req.ip });
    return res.json({ success: true });
  } catch (error) {
    console.error('[Auth] Logout error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DRIVER STATUS ENDPOINT — odczyt aktualnego stanu kierowcy z MySQL
// ============================================================================

// GET /api/drivers/:driverId/status
// Zwraca aktualny stan kierowcy (driver_state, current_zone, queue_position, itp.)
app.get('/api/drivers/:driverId/status', async (req, res) => {
  const { driverId } = req.params;

  if (!driverId) {
    return res.status(400).json({ success: false, error: 'Brak driverId' });
  }

  try {
    const rows = await safeQuery(
      `SELECT d.id, d.driver_state, d.current_zone, d.zone_entered_at,
              d.free_since, d.status_changed_at, d.is_online, d.last_seen,
              z.name AS zone_name,
              CASE
                WHEN d.driver_state = 'wolna'
                 AND d.current_zone IS NOT NULL
                 AND d.free_since IS NOT NULL
                THEN (
                  SELECT COUNT(*) + 1
                  FROM drivers d2
                  WHERE d2.current_zone = d.current_zone
                    AND d2.driver_state = 'wolna'
                    AND d2.free_since < d.free_since
                )
                ELSE NULL
              END AS live_queue_position
       FROM drivers d
       LEFT JOIN zones z ON z.number = d.current_zone
       WHERE d.id = ?`,
      [driverId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kierowca nie znaleziony' });
    }

    const d = rows[0];

    // Mapuj driver_state → stary status (dla kompatybilności z frontendem)
    const stateToStatus = { wolna: 'free', dojazd: 'pickup', zajeta: 'busy', kursem: 'driving' };
    const status = d.driver_state ? (stateToStatus[d.driver_state] ?? 'home') : 'home';

    // Oblicz czas trwania statusu
    let statusDuration = '0m';
    const changedAt = d.status_changed_at || d.free_since;
    if (changedAt) {
      const diffMs = Date.now() - new Date(changedAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) {
        statusDuration = `${diffMins}m`;
      } else {
        const h = Math.floor(diffMins / 60);
        const m = diffMins % 60;
        statusDuration = `${h}h ${m}m`;
      }
    }

    return res.json({
      success: true,
      driverId: d.id,
      driverState: d.driver_state,   // 'wolna' | 'dojazd' | 'kursem' | null
      status,                         // 'free' | 'pickup' | 'driving' | 'home'
      currentZone: d.current_zone,
      zoneName: d.zone_name ?? null,
      zoneEnteredAt: d.zone_entered_at ?? null,
      queuePosition: d.live_queue_position ?? null,
      freeSince: d.free_since,
      statusChangedAt: d.status_changed_at,
      statusDuration,
      isOnline: Boolean(d.is_online),
    });
  } catch (err) {
    console.error('[DriverStatus] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
  }
});

// ============================================================================
// PENDING ORDER — pobieranie, akceptacja, odrzucenie
// ============================================================================

// GET /api/drivers/:driverId/pending-order
app.get('/api/drivers/:driverId/pending-order', async (req, res) => {
  const { driverId } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT id, order_number, customer_name, customer_phone,
              pickup_address, destination_address, cost, notes,
              operator, pickup_region_id, order_type,
              scheduled_date, scheduled_time,
              preference_ids, vehicle_category, payment_method
       FROM orders
       WHERE driver_id = ? AND status = 'pending_driver'
       LIMIT 1`,
      [driverId]
    );
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[PendingOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drivers/:driverCode/active-orders-count — ile aktywnych zleceń ma kierowca (po kodzie)
app.get('/api/drivers/:driverCode/active-orders-count', async (req, res) => {
  const { driverCode } = req.params;
  try {
    const driver = await safeQuery(`SELECT id FROM drivers WHERE driver_code = ? LIMIT 1`, [driverCode]);
    if (!driver || driver.length === 0) return res.json({ success: true, count: 0 });
    const rows = await safeQuery(
      `SELECT COUNT(*) AS cnt FROM orders
       WHERE driver_id = ? AND status IN ('pending_driver','next_driver','accepted','at_pickup','in_progress')`,
      [driver[0].id]
    );
    return res.json({ success: true, count: rows?.[0]?.cnt ?? 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drivers/:driverId/next-order — następny kurs kierowcy (next_driver lub next_accepted)
app.get('/api/drivers/:driverId/next-order', async (req, res) => {
  const { driverId } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT id, order_number, customer_name, customer_phone,
              pickup_address, destination_address, pickup_lat, pickup_lng,
              cost, notes, operator, pickup_region_id, order_type,
              scheduled_date, scheduled_time, preference_ids,
              payment_method, vehicle_category, status
       FROM orders
       WHERE driver_id = ? AND status IN ('next_driver','next_accepted')
       ORDER BY created_at ASC LIMIT 1`,
      [driverId]
    );
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/seed-test-drivers — tworzy/aktualizuje 150 testowych kierowców 100-249 ──
app.post('/api/admin/seed-test-drivers', async (req, res) => {
  const { randomUUID } = await import('crypto');
  const BRANDS = [['Toyota','Corolla'],['Skoda','Octavia'],['Volkswagen','Passat'],['Ford','Focus'],['Opel','Astra'],['BMW','5 Series'],['Mercedes','E-Class'],['Hyundai','i30'],['Kia','Ceed'],['Dacia','Logan']];
  const COLORS = ['Biały','Czarny','Srebrny','Szary','Granatowy','Czerwony'];
  const STATUSES = ['free','active','active','active','driving','pickup','home'];
  const STATES   = ['wolna','kursem','dojazd','zajeta'];
  const FNAMES   = ['Adam','Piotr','Krzysztof','Andrzej','Tomasz','Marek','Michał','Paweł','Jakub','Grzegorz','Rafał','Łukasz','Dariusz','Mariusz'];
  const LNAMES   = ['Kowalski','Nowak','Wiśniewski','Wójcik','Kowalczyk','Kamiński','Lewandowski','Zieliński','Szymański','Woźniak','Dąbrowski','Kozłowski'];
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const randPlate = () => { const L='ABCDEFGHJKLMNPRSTUVWXYZ'; const l=()=>L[Math.floor(Math.random()*L.length)]; const d=()=>Math.floor(Math.random()*10); return `B${l()}${l()} ${d()}${d()}${d()}${d()}`; };

  // Pobierz istniejące strefy z DB
  const zoneRows = await safeQuery('SELECT number, coordinates FROM zones WHERE is_active=1');
  const zones = (zoneRows || []).map(z => {
    try {
      const coords = JSON.parse(z.coordinates);
      return {
        number: z.number,
        latMin: Math.min(...coords.map(c => c.lat)),
        latMax: Math.max(...coords.map(c => c.lat)),
        lngMin: Math.min(...coords.map(c => c.lng)),
        lngMax: Math.max(...coords.map(c => c.lng)),
      };
    } catch { return null; }
  }).filter(Boolean);

  // Fallback jeśli brak stref — centrum Bydgoszczy
  const fallbackZone = { number: null, latMin: 53.09, latMax: 53.16, lngMin: 17.99, lngMax: 18.14 };

  const randInZone = (zone) => ({
    lat: +(zone.latMin + Math.random() * (zone.latMax - zone.latMin)).toFixed(6),
    lng: +(zone.lngMin + Math.random() * (zone.lngMax - zone.lngMin)).toFixed(6),
  });

  let added = 0, updated = 0, errors = 0;
  for (let i = 0; i < 150; i++) {
    const code = String(100 + i);  // 100, 101, ..., 249
    const pin = '1234';
    const name = `${rand(FNAMES)} ${rand(LNAMES)}`;
    const email = `test${code}@taxi.test`;
    const status = rand(STATUSES);
    const isActive = ['free','active','driving','pickup'].includes(status);
    const state = isActive ? rand(STATES) : null;
    const isOnline = isActive ? 1 : 0;
    const zone = zones.length > 0 ? zones[i % zones.length] : fallbackZone;
    const { lat, lng } = isOnline ? randInZone(zone) : { lat: null, lng: null };
    const zoneNum = isOnline ? zone.number : null;
    const [brand, model] = rand(BRANDS);
    const plate = randPlate();
    try {
      const existing = await safeQuery('SELECT id FROM drivers WHERE driver_code = ? LIMIT 1', [code]);
      if (existing && existing.length > 0) {
        await safeQuery(
          `UPDATE drivers SET name=?,status=?,driver_state=?,is_online=?,latitude=?,longitude=?,current_zone=?,last_location_update=NOW(),last_seen=NOW(),updated_at=NOW() WHERE driver_code=?`,
          [name, status, state, isOnline, lat, lng, zoneNum, code]);
        updated++;
      } else {
        await safeQuery(
          `INSERT INTO drivers (id,email,name,password,driver_code,pin,status,driver_state,is_online,latitude,longitude,current_zone,last_location_update,last_seen,vehicle_brand,vehicle_model,vehicle_color,registration_number,phone_number,side_number,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,?,?,NOW(),NOW())`,
          [randomUUID(), email, name, 'unused', code, pin, status, state, isOnline, lat, lng, zoneNum, brand, model, rand(COLORS), plate,
           `+48${500+Math.floor(Math.random()*499)}${100+Math.floor(Math.random()*899)}${100+Math.floor(Math.random()*899)}`.replace(/\s/g,''),
           String(Math.floor(Math.random()*900)+100)]);
        added++;
      }
    } catch (e) { errors++; console.error(`[Seed] ${code}:`, e.message); }
  }
  return res.json({ success: true, added, updated, errors, total: added + updated });
});

// ── POST /api/admin/sim/test-order — tworzy testowe zlecenie pending_driver dla konkretnego kierowcy ──
app.post('/api/admin/sim/test-order', async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ success: false, error: 'Wymagane driverId' });
  try {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const num = Math.floor(Math.random() * 9000) + 1000;
    const today = new Date().toISOString().slice(0, 10);
    const orderNumber = `SIM-${num}`;
    const pickups = ['ul. Gdańska 100, Bydgoszcz','ul. Dworcowa 5, Bydgoszcz','ul. Focha 12, Bydgoszcz','pl. Wolności 1, Bydgoszcz'];
    const dests   = ['ul. Andersa 8, Bydgoszcz','ul. Kujawska 20, Bydgoszcz','Lotnisko Bydgoszcz','ul. Szpitalna 19, Bydgoszcz'];
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];
    await safeQuery(
      `INSERT INTO orders (id, order_number, driver_id, status, pickup_address, destination_address,
        customer_name, customer_phone, vehicle_category, payment_method, order_type, created_at, updated_at)
       VALUES (?, ?, ?, 'pending_driver', ?, ?, 'Klient Testowy', '+48 500 000 000', 'standard', 'cash', 'standard', NOW(), NOW())`,
      [id, orderNumber, driverId, rand(pickups), rand(dests)]
    );
    return res.json({ success: true, orderId: id, orderNumber });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/zones/sim-data — strefy z centroidami i bbox (dla symulatora) ───
app.get('/api/zones/sim-data', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT number, name, coordinates FROM zones WHERE is_active=1 ORDER BY number ASC');
    const result = (rows || []).map(z => {
      try {
        const coords = JSON.parse(z.coordinates);
        const centLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
        const centLng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
        return {
          number: z.number,
          name: z.name,
          centLat, centLng,
          latMin: Math.min(...coords.map(c => c.lat)),
          latMax: Math.max(...coords.map(c => c.lat)),
          lngMin: Math.min(...coords.map(c => c.lng)),
          lngMax: Math.max(...coords.map(c => c.lng)),
          polygon: coords,
        };
      } catch { return null; }
    }).filter(Boolean);
    return res.json({ success: true, zones: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/sim/set-state — symulator: bezpośredni update stanu bez walidacji GPS ──
app.post('/api/admin/sim/set-state', async (req, res) => {
  const { driverId, driverState, status, zone } = req.body;
  if (!driverId || !driverState) return res.status(400).json({ success: false, error: 'Wymagane driverId i driverState' });
  const allowed = ['wolna', 'dojazd', 'zajeta', 'kursem'];
  if (!allowed.includes(driverState)) return res.status(400).json({ success: false, error: 'Nieprawidłowy driverState' });
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const freeSince = driverState === 'wolna' ? now : null;
    const clearZone = driverState === 'zajeta';
    if (clearZone) {
      await safeQuery(
        `UPDATE drivers SET driver_state=?, free_since=?, status_changed_at=?, current_zone=NULL, updated_at=NOW() WHERE id=?`,
        [driverState, freeSince, now, driverId]
      );
    } else {
      await safeQuery(
        `UPDATE drivers SET driver_state=?, free_since=?, status_changed_at=?, updated_at=NOW() WHERE id=?`,
        [driverState, freeSince, now, driverId]
      );
    }
    if (status) {
      await safeQuery(`UPDATE drivers SET status=? WHERE id=?`, [status, driverId]);
    }
    if (zone != null) {
      await safeQuery(`UPDATE drivers SET current_zone=? WHERE id=?`, [zone, driverId]);
    }
    const STATE_LABELS = { wolna: 'Wolna', dojazd: 'Dojazd', zajeta: 'Zajęta', kursem: 'Kursem' };
    addDriverLog(driverId, 'state_change', `Zmiana stanu na: ${STATE_LABELS[driverState] ?? driverState}`, null, { nowy_stan: driverState });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/sim/location — symulator: update GPS BEZ resetowania current_zone ──
// Normalny endpoint /drivers/:id/location wywołuje detectZoneFromCoordinates(),
// które ustawia current_zone=NULL gdy driver jest poza poligonami stref.
// Ten endpoint tylko aktualizuje lat/lng/last_seen — strefa zostaje niezmieniona.
app.post('/api/admin/sim/location', async (req, res) => {
  const { driverId, lat, lng } = req.body;
  if (!driverId || lat == null || lng == null) return res.status(400).json({ success: false, error: 'Wymagane driverId, lat, lng' });
  try {
    await safeQuery(
      `UPDATE drivers SET latitude=?, longitude=?, last_location_update=NOW(), last_seen=NOW(), is_online=1 WHERE id=?`,
      [lat, lng, driverId]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/drivers/:id/suspend — dyspozytor blokuje kierowcę
app.post('/api/drivers/:id/suspend', async (req, res) => {
  const { id } = req.params;
  const { hours } = req.body; // null = bezterminowo
  try {
    const suspendedUntil = hours ? new Date(Date.now() + hours * 3600000) : null;
    await safeQuery(
      `UPDATE drivers SET status = 'suspended', suspended_until = ?, updated_at = NOW() WHERE id = ?`,
      [suspendedUntil, id]
    );
    const desc = hours ? `Konto zablokowane na ${hours} godz. (do ${suspendedUntil?.toLocaleString('pl-PL')})` : 'Konto zablokowane bezterminowo przez dyspozytora';
    addDriverLog(id, 'suspend', 'Konto kierowcy zostało zablokowane', desc, { godziny: hours ?? null, zablokowane_do: suspendedUntil });
    addSystemLog({ type: 'driver_suspend', category: 'admin', description: `Zablokowano konto kierowcy (ID: ${id}) — ${desc}`, metadata: { driverId: id, hours, suspendedUntil } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/accept — kierowca akceptuje zlecenie → status: accepted
app.post('/api/orders/:orderId/accept', async (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await safeQuery(`SELECT order_number, pickup_address, destination_address FROM orders WHERE id = ?`, [orderId]);
    await safeQuery(
      `UPDATE orders SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending_driver'`,
      [orderId]
    );
    if (driverId) {
      await safeQuery(
        `UPDATE drivers SET driver_state = 'zajeta', zone_entered_at = NOW(), status_changed_at = NOW() WHERE id = ?`,
        [driverId]
      );
      const o = orderInfo?.[0];
      addDriverLog(driverId, 'order_accept', `Przyjął zlecenie #${o?.order_number ?? orderId}`,
        `Odbiór: ${o?.pickup_address ?? '—'}${o?.destination_address ? ` → ${o.destination_address}` : ''}`,
        { zlecenie_id: orderId, numer_zlecenia: o?.order_number, adres_odbioru: o?.pickup_address, adres_docelowy: o?.destination_address }
      );
      await addOrderLog(orderId, 'status', `Kierowca przyjął zlecenie — jedzie pod adres odbioru`, { driverId });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[AcceptOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/accept-next — kierowca przyjmuje następny kurs (next_driver → next_accepted)
app.post('/api/orders/:orderId/accept-next', async (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const result = await safeQuery(
      `UPDATE orders SET status = 'next_accepted', updated_at = NOW()
       WHERE id = ? AND status = 'next_driver' AND driver_id = ?`,
      [orderId, driverId]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(422).json({ success: false, error: 'Zlecenie nie mogło zostać przyjęte (sprawdź status)' });
    }
    addOrderLog(orderId, 'dispatch', `Kierowca przyjął następny kurs`, { driverId, status: 'next_accepted' });
    if (driverId) addDriverLog(driverId, 'order_accept_next', `Zarezerwował następne zlecenie`, null, { zlecenie_id: orderId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/reject-next — kierowca odrzuca następny kurs (next_driver/next_accepted → market)
app.post('/api/orders/:orderId/reject-next', async (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    await safeQuery(
      `UPDATE orders SET status = 'market', driver_id = NULL, updated_at = NOW()
       WHERE id = ? AND status IN ('next_driver','next_accepted') AND driver_id = ?`,
      [orderId, driverId]
    );
    addOrderLog(orderId, 'dispatch', `Kierowca odrzucił następny kurs — zlecenie wraca na giełdę`, { driverId });
    if (driverId) addDriverLog(driverId, 'order_reject', `Odrzucił następne zlecenie — wróciło na giełdę`, null, { zlecenie_id: orderId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/at-pickup — kierowca pod adresem odbioru → status: at_pickup
app.post('/api/orders/:orderId/at-pickup', async (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await safeQuery(`SELECT order_number, pickup_address FROM orders WHERE id = ?`, [orderId]);
    await safeQuery(
      `UPDATE orders SET status = 'at_pickup', updated_at = NOW() WHERE id = ? AND status = 'accepted'`,
      [orderId]
    );
    if (driverId) {
      await safeQuery(
        `UPDATE drivers SET driver_state = 'zajeta', status_changed_at = NOW() WHERE id = ?`,
        [driverId]
      );
      const o = orderInfo?.[0];
      addDriverLog(driverId, 'order_at_pickup', `Dotarł pod adres odbioru zlecenia #${o?.order_number ?? orderId}`,
        `Adres: ${o?.pickup_address ?? '—'}`,
        { zlecenie_id: orderId, numer_zlecenia: o?.order_number }
      );
      await addOrderLog(orderId, 'status', `Kierowca oczekuje pod adresem odbioru`, { driverId });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[AtPickupOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper: zapisz log przetwarzania zlecenia ─────────────────────────────────
async function addOrderLog(orderId, type, message, data = null) {
  try {
    await safeQuery(
      `INSERT INTO order_logs (order_id, type, message, data) VALUES (?, ?, ?, ?)`,
      [orderId, type, message, data ? JSON.stringify(data) : null]
    );
  } catch (e) {
    console.error('[OrderLog] Błąd zapisu logu:', e.message);
  }
}

// ── Helper: zapisz log kierowcy ───────────────────────────────────────────────
async function addDriverLog(driverId, type, title, description = null, metadata = null) {
  if (!driverId) return;
  try {
    await safeQuery(
      `INSERT INTO driver_logs (driver_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)`,
      [driverId, type, title, description, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (e) {
    console.error('[DriverLog] Błąd zapisu logu:', e.message);
  }
}

async function addSystemLog({ type, category = 'general', userId = null, userName = null, userRole = null, description, metadata = null, ipAddress = null }) {
  try {
    await safeQuery(
      `INSERT INTO system_logs (type, category, user_id, user_name, user_role, description, metadata, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, category, userId, userName, userRole, description, metadata ? JSON.stringify(metadata) : null, ipAddress]
    );
  } catch (e) {
    console.error('[SystemLog] Błąd zapisu logu:', e.message);
  }
}

// GET /api/drivers/:id/logs — historia zdarzeń kierowcy
app.get('/api/drivers/:id/logs', async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '200'), 500);
  try {
    const logs = await safeQuery(
      `SELECT id, type, title, description, metadata, created_at
       FROM driver_logs
       WHERE driver_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [id, limit]
    );
    const parsed = (logs || []).map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description || null,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      created_at: row.created_at,
    }));
    return res.json({ success: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper: znajdź kolejnego kierowcę wg reguł rejonu i przydziel zlecenie ───
// Zwraca { assigned: true, driverId } lub { assigned: false, fallback: 'pending'|'market' }
async function redispatchOrder(orderId, regionId, excludeDriverId) {
  // Pobierz reguły przydziału dla rejonu
  // Pobierz customer_id zlecenia do sprawdzania blokad
  const orderForBlock = await safeQuery('SELECT customer_id FROM orders WHERE id = ?', [orderId]);
  const customerId = orderForBlock?.[0]?.customer_id ?? null;

  const ruleRows = await safeQuery(
    `SELECT search_zone, driver_state, priority, step_type, radius_km FROM zone_assignment_rules
     WHERE source_zone = ? ORDER BY priority ASC`,
    [regionId]
  );
  const usedDefaultRule = !ruleRows || ruleRows.length === 0;
  const steps = usedDefaultRule
    ? [{ search_zone: regionId, driver_state: 'wolna', priority: 1, step_type: 'zone', radius_km: null }]
    : ruleRows;

  // Pobierz koordynaty adresu odbioru (potrzebne do reguł radiusowych)
  const orderGeoRows = await safeQuery('SELECT pickup_lat, pickup_lng FROM orders WHERE id = ?', [orderId]);
  const pickupLat = orderGeoRows?.[0]?.pickup_lat ?? null;
  const pickupLng = orderGeoRows?.[0]?.pickup_lng ?? null;

  // Logi startowe — fire-and-forget (nie blokują dispatch)
  if (usedDefaultRule) {
    addOrderLog(orderId, 'dispatch',
      `Brak reguł przydziału dla rejonu ${regionId} — używam reguły domyślnej: wolna w rejonie ${regionId}`,
      { regionId, steps: steps.map(s => ({ rejon: s.search_zone, stan: s.driver_state })) }
    );
  } else {
    addOrderLog(orderId, 'dispatch',
      `Redyspozycja — szukam kierowcy wg ${steps.length} reguł dla rejonu ${regionId}`,
      { regionId, steps: steps.map(s => ({ priorytet: s.priority, rejon: s.search_zone, stan: s.driver_state, typ: s.step_type })) }
    );
  }

  // Szukaj kolejnego kierowcy (pomijaj odrzucającego)
  let nextDriverId = null;
  let nextDriverCode = null;
  let nextDriverName = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let drivers = null;

    if (step.step_type === 'radius' && step.radius_km && pickupLat != null && pickupLng != null) {
      // Krok radiusowy — szukaj kierowców w promieniu od adresu odbioru
      const allDrivers = await safeQuery(
        `SELECT d.id, d.driver_code, d.name, d.latitude, d.longitude FROM drivers d
         WHERE d.driver_state = ? AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND d.id != ?
         ${customerId ? 'AND d.id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
         ORDER BY d.free_since ASC`,
        customerId
          ? [step.driver_state, excludeDriverId, customerId]
          : [step.driver_state, excludeDriverId]
      );
      const inRadius = (allDrivers ?? []).filter(d =>
        haversineKm(d.latitude, d.longitude, pickupLat, pickupLng) <= step.radius_km
      );
      drivers = inRadius.length > 0 ? [inRadius[0]] : [];
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: szukam w promieniu ${step.radius_km}km — stan: ${step.driver_state}, znaleziono: ${inRadius.length}`,
        { krok: i + 1, promien: step.radius_km, stan: step.driver_state, znaleziono: inRadius.length }
      );
    } else if (step.step_type === 'radius') {
      // Radius ale brak koordynat zlecenia — pomiń
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: pominięty (brak GPS zlecenia) — promień: ${step.radius_km}km, stan: ${step.driver_state}`,
        { krok: i + 1, wynik: 'pominięty', powod: 'brak GPS zlecenia' }
      );
      continue;
    } else {
      // Krok strefowy
      drivers = await safeQuery(
        `SELECT d.id, d.driver_code, d.name FROM drivers d
         WHERE d.driver_state = ? AND d.current_zone = ? AND d.id != ?
         ${customerId ? 'AND d.id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
         ORDER BY d.free_since ASC LIMIT 1`,
        customerId
          ? [step.driver_state, step.search_zone, excludeDriverId, customerId]
          : [step.driver_state, step.search_zone, excludeDriverId]
      );
    }

    if (drivers && drivers.length > 0) {
      nextDriverId   = drivers[0].id;
      nextDriverCode = drivers[0].driver_code;
      nextDriverName = drivers[0].name;
      console.log(`[Redispatch] Order ${orderId} → driver ${nextDriverCode} (strefa ${step.search_zone} stan ${step.driver_state})`);
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: znaleziono kierowcę ${nextDriverCode} (${nextDriverName}) — stan: ${step.driver_state}, rejon: ${step.search_zone ?? `~${step.radius_km}km`}`,
        { krok: i + 1, kierowca_id: nextDriverId, kierowca_kod: nextDriverCode, kierowca_nazwa: nextDriverName, rejon: step.search_zone, stan: step.driver_state }
      );
      break;
    } else {
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: brak kierowcy — stan: ${step.driver_state}, rejon: ${step.search_zone ?? `~${step.radius_km}km`}`,
        { krok: i + 1, rejon: step.search_zone, stan: step.driver_state, wynik: 'brak' }
      );
    }
  }

  if (nextDriverId) {
    // Przydziel do kolejnego kierowcy
    await safeQuery(
      `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextDriverId, orderId]
    );
    addOrderLog(orderId, 'dispatch',
      `Zlecenie przydzielono do kierowcy ${nextDriverCode} (${nextDriverName}) — status: pending_driver`,
      { kierowca_id: nextDriverId, kierowca_kod: nextDriverCode, kierowca_nazwa: nextDriverName, status: 'pending_driver' }
    );
    // Push notification — fire-and-forget (nie blokuje odpowiedzi)
    safeQuery('SELECT pickup_address FROM orders WHERE id = ?', [orderId]).then(orderForPush => {
      sendPushToDriver(nextDriverId, {
        title: '🔔 Nowe zlecenie',
        body: `Odbiór: ${orderForPush?.[0]?.pickup_address || '—'}`,
        url: '/driver'
      }).catch(e => console.error('[Push] Błąd wysyłki:', e.message));
    }).catch(() => {});
    return { assigned: true, driverId: nextDriverId };
  }

  // Brak kierowcy — sprawdź fallback_status rejonu
  const settingsRows = await safeQuery(
    'SELECT fallback_status FROM zone_settings WHERE source_zone = ?',
    [regionId]
  );
  const fallback = settingsRows?.[0]?.fallback_status ?? 'pending';

  if (fallback === 'market') {
    await safeQuery(
      `UPDATE orders SET status = 'market', driver_id = NULL, market_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [orderId]
    );
    await safeQuery('DELETE FROM gielda_registrations WHERE order_id = ?', [orderId]);
    addOrderLog(orderId, 'gielda',
      `Brak dostępnych kierowców — zlecenie trafia na giełdę (fallback rejonu ${regionId}: market)`,
      { regionId, fallback: 'market' }
    );
    console.log(`[Redispatch] Order ${orderId} → brak kierowcy, status: market`);
  } else {
    await safeQuery(
      `UPDATE orders SET status = 'pending', driver_id = NULL, updated_at = NOW()
       WHERE id = ?`,
      [orderId]
    );
    addOrderLog(orderId, 'dispatch',
      `Brak dostępnych kierowców — zlecenie oczekuje (fallback rejonu ${regionId}: pending)`,
      { regionId, fallback: 'pending' }
    );
    console.log(`[Redispatch] Order ${orderId} → brak kierowcy, status: pending`);
  }
  return { assigned: false, fallback };
}

// GET /api/orders/:orderId/logs — historia przetwarzania zlecenia
app.get('/api/orders/:orderId/logs', async (req, res) => {
  const { orderId } = req.params;
  try {
    const logs = await safeQuery(
      `SELECT id, type, message, data, created_at
       FROM order_logs
       WHERE order_id = ?
       ORDER BY created_at ASC`,
      [orderId]
    );
    const parsed = (logs || []).map(row => ({
      id: row.id,
      type: row.type,
      message: row.message,
      data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null,
      created_at: row.created_at,
    }));
    return res.json({ success: true, logs: parsed });
  } catch (err) {
    console.error('[OrderLogs] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/reject
app.post('/api/orders/:orderId/reject', async (req, res) => {
  const { orderId } = req.params;
  try {
    // Pobierz dane zlecenia i kierowcy
    const orders = await safeQuery(
      `SELECT o.driver_id, o.pickup_region_id, d.driver_code, d.name AS driver_name
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.id = ? AND o.status = 'pending_driver'`,
      [orderId]
    );
    if (!orders || orders.length === 0) {
      return res.json({ success: true }); // Zlecenie już nieaktywne
    }
    const { driver_id: rejectingDriverId, pickup_region_id: regionId, driver_code, driver_name } = orders[0];

    // Zmień status odrzucającego kierowcy na 'zajeta'
    if (rejectingDriverId) {
      await safeQuery(
        `UPDATE drivers SET driver_state = 'zajeta' WHERE id = ?`,
        [rejectingDriverId]
      );
      await addOrderLog(orderId, 'reject',
        `Kierowca ${driver_code} (${driver_name}) odrzucił zlecenie — stan zmieniony na: zajęta`,
        { kierowca_id: rejectingDriverId, kierowca_kod: driver_code, kierowca_nazwa: driver_name, nowy_stan: 'zajeta' }
      );
      addDriverLog(rejectingDriverId, 'order_reject', `Odrzucił zlecenie #${orderId}`,
        `Stan zmieniony na: Zajęta`,
        { zlecenie_id: orderId }
      );
      console.log(`[RejectOrder] Kierowca ${driver_code} → zajeta (odrzucił zlecenie ${orderId})`);
    }

    // Szukaj kolejnego kierowcy lub zastosuj fallback
    if (regionId != null) {
      await redispatchOrder(orderId, regionId, rejectingDriverId || '');
    } else {
      await safeQuery(
        `UPDATE orders SET status = 'pending', driver_id = NULL, updated_at = NOW() WHERE id = ?`,
        [orderId]
      );
      await addOrderLog(orderId, 'dispatch',
        `Brak rejonu — zlecenie przeniesione do oczekujących`,
        { powod: 'brak_rejonu' }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[RejectOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drivers/:driverId/active-order — zlecenie w trakcie (accepted/at_pickup/in_progress)
// GET /api/orders/:id/status — szybki odczyt statusu zlecenia (dla kierowcy)
app.get('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await safeQuery(`SELECT status FROM orders WHERE id = ?`, [id]);
    if (!rows || rows.length === 0) return res.json({ success: false });
    return res.json({ success: true, status: rows[0].status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drivers/:driverId/active-order', async (req, res) => {
  const { driverId } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT id, order_number, customer_name, customer_phone,
              pickup_address, destination_address, cost, notes, status,
              operator, pickup_region_id, order_type,
              scheduled_date, scheduled_time,
              preference_ids, vehicle_category, payment_method
       FROM orders
       WHERE driver_id = ? AND status IN ('accepted', 'at_pickup', 'in_progress')
       LIMIT 1`,
      [driverId]
    );
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[ActiveOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drivers/:driverId/next-order — następne zlecenie (status next_driver)
app.get('/api/drivers/:driverId/next-order', async (req, res) => {
  const { driverId } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT id, order_number, customer_name, customer_phone,
              pickup_address, destination_address, cost, notes,
              operator, pickup_region_id, order_type,
              scheduled_date, scheduled_time,
              preference_ids, vehicle_category, payment_method
       FROM orders
       WHERE driver_id = ? AND status = 'next_driver'
       LIMIT 1`,
      [driverId]
    );
    return res.json({ success: true, order: rows?.[0] ?? null });
  } catch (err) {
    console.error('[NextOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/pickup — kierowca ma klienta w pojeździe → status: in_progress
app.post('/api/orders/:orderId/pickup', async (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await safeQuery(`SELECT order_number, pickup_address, destination_address, customer_name, customer_phone FROM orders WHERE id = ?`, [orderId]);
    await safeQuery(
      `UPDATE orders SET status = 'in_progress', updated_at = NOW() WHERE id = ? AND status IN ('accepted', 'at_pickup')`,
      [orderId]
    );
    if (driverId) {
      // Nie zmieniamy driver_state — kierowca zarządza statusem ręcznie
      // Zerujemy rejon (current_zone = 0) bo kierowca jest w trasie
      await safeQuery(
        `UPDATE drivers SET current_zone = 0, status_changed_at = NOW() WHERE id = ?`,
        [driverId]
      );
      const o = orderInfo?.[0];
      addDriverLog(driverId, 'order_pickup', `Zabrał klienta — kurs w toku (#${o?.order_number ?? orderId})`,
        `${o?.pickup_address ?? '—'}${o?.destination_address ? ` → ${o.destination_address}` : ''}${o?.customer_name ? ` · Klient: ${o.customer_name}` : ''}`,
        { zlecenie_id: orderId, numer_zlecenia: o?.order_number, klient: o?.customer_name, telefon: o?.customer_phone, cel: o?.destination_address }
      );
      await addOrderLog(orderId, 'status', `Kierowca zabrał klienta — kurs w toku`, { driverId });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[PickupOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/complete — zakończenie kursu
app.post('/api/orders/:orderId/complete', async (req, res) => {
  const { orderId } = req.params;
  try {
    // Pobierz driver_id przed zamknięciem
    const orderRows = await safeQuery(`SELECT driver_id, order_number, pickup_address, destination_address, cost FROM orders WHERE id = ?`, [orderId]);
    const driverId = orderRows?.[0]?.driver_id ?? null;
    const orderNum = orderRows?.[0]?.order_number ?? orderId;
    const orderCost = orderRows?.[0]?.cost ?? null;

    await safeQuery(
      `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [orderId]
    );
    await addOrderLog(orderId, 'status', `Zlecenie zakończone`, { driverId });

    // Po zakończeniu: awansuj next_accepted → accepted (kierowca już przyjął) albo next_driver → pending_driver
    if (driverId) {
      const promotedAccepted = await safeQuery(
        `UPDATE orders SET status = 'accepted', updated_at = NOW()
         WHERE driver_id = ? AND status = 'next_accepted'
         ORDER BY created_at ASC LIMIT 1`,
        [driverId]
      );
      if (promotedAccepted && promotedAccepted.affectedRows > 0) {
        console.log(`[CompleteOrder] Awans next_accepted → accepted dla kierowcy ${driverId}`);
      } else {
        const promoted = await safeQuery(
          `UPDATE orders SET status = 'pending_driver', updated_at = NOW()
           WHERE driver_id = ? AND status = 'next_driver'
           ORDER BY created_at ASC LIMIT 1`,
          [driverId]
        );
        if (promoted && promoted.affectedRows > 0) {
          console.log(`[CompleteOrder] Awans next_driver → pending_driver dla kierowcy ${driverId}`);
        }
      }
    }

    if (driverId) {
      const o = orderRows?.[0];
      addDriverLog(driverId, 'order_complete', `Zakończył kurs #${orderNum}`,
        `${o?.pickup_address ?? '—'}${o?.destination_address ? ` → ${o.destination_address}` : ''}${orderCost != null ? ` · ${Number(orderCost).toFixed(2)} zł` : ''}`,
        { zlecenie_id: orderId, numer_zlecenia: orderNum, koszt: orderCost }
      );
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[CompleteOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// POST /api/orders/:id/finish — zakończ zlecenie (anulowanie, mina, brak taxi)
app.post('/api/orders/:id/finish', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body; // 'cancelled' | 'mina' | 'no_taxi'

  const STATUS_MAP = {
    cancelled: 'cancelled',
    mina:      'mina',
    no_taxi:   'no_taxi',
  };
  const newStatus = STATUS_MAP[reason];
  if (!newStatus) return res.status(400).json({ success: false, error: 'Nieprawidłowy powód zakończenia' });

  try {
    // Pobierz dane zlecenia (driver_id, order_number)
    const rows = await safeQuery(
      `SELECT id, order_number, driver_id, status FROM orders WHERE id = ?`, [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'Zlecenie nie istnieje' });
    const order = rows[0];

    // Brak taxi — tylko jeśli brak kierowcy
    if (reason === 'no_taxi' && order.driver_id) {
      return res.status(400).json({ success: false, error: 'Opcja "Brak taksówki" niedostępna — zlecenie ma przypisanego kierowcę' });
    }

    // Wyślij powiadomienie do kierowcy PRZED zmianą statusu (żeby driver_id był jeszcze dostępny)
    if (order.driver_id && reason !== 'no_taxi') {
      const notifTitle = reason === 'mina' ? 'Mina !' : 'Anulowanie zlecenia';
      const notifMsg = reason === 'cancelled'
        ? 'Dyspozytor anulował Twoje zlecenie'
        : 'Klient się nie pojawił — Mina';
      await safeQuery(
        `INSERT INTO driver_notifications (driver_id, type, title, message, order_id) VALUES (?, ?, ?, ?, ?)`,
        [order.driver_id, reason, notifTitle, notifMsg, id]
      );
    }

    // Zaktualizuj status zlecenia (przy anulowaniu odepnij kierowcę)
    await safeQuery(
      `UPDATE orders SET status = ?, driver_id = NULL, updated_at = NOW() WHERE id = ?`,
      [newStatus, id]
    );

    // Zapisz log
    const reasonLabel = reason === 'cancelled' ? 'Anulowane przez dyspozytora' : reason === 'mina' ? 'Klient się nie pojawił (Mina)' : 'Brak taksówki';
    await addOrderLog(id, 'cancelled', `Zlecenie zakończone przez dyspozytora: ${reasonLabel}`, { reason });
    if (order.driver_id) {
      addDriverLog(order.driver_id, 'order_cancelled', `Zlecenie #${order.order_number} zostało anulowane`,
        reasonLabel,
        { zlecenie_id: id, numer_zlecenia: order.order_number, powod: reason }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[FinishOrder] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/driver-notifications — pobierz nieprzeczytane powiadomienia dla kierowcy
app.get('/api/driver-notifications', async (req, res) => {
  const { driverId } = req.query;
  if (!driverId) return res.status(400).json({ success: false, error: 'Brak driverId' });
  try {
    const rows = await safeQuery(
      `SELECT id, type, title, message, order_id, created_at FROM driver_notifications
       WHERE driver_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 10`,
      [driverId]
    );
    return res.json({ success: true, notifications: rows ?? [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/driver-notifications/:id/read — oznacz jako przeczytane
app.post('/api/driver-notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    await safeQuery(`UPDATE driver_notifications SET is_read = 1 WHERE id = ?`, [id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// FUNKCJE POMOCNICZE — generowanie numerów, kodów, wykrywanie rejonu
// ============================================================================

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function generateClientCode(phone) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  const prefix = rand() + rand() + rand() + rand();
  const digits = String(phone || '').replace(/\D/g, '');
  const last3 = digits.slice(-3).padStart(3, '0');
  return `${prefix}-${last3}`;
}

// Wykrywanie rejonu z adresu — spójna z ZoneDetectionService w frontend
function detectZoneFromAddressKeywords(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const zoneKeywords = {
    1:  ['stare miasto', 'rynek główny', 'floriańska'],
    2:  ['kazimierz', 'szeroka', 'józefa'],
    3:  ['podgórze', 'wielicka', 'kalwaryjska'],
    4:  ['krowodrza', 'słowackiego', 'manifestu'],
    5:  ['grzegórzki', 'dietla', 'dąbrowskiego'],
    6:  ['prądnik', 'opolska', 'rakowicka'],
    7:  ['nowa huta', 'powstańców', 'bieńczycka'],
    8:  ['salwator', 'kościuszki', 'zwierzyniecka'],
    9:  ['dębniki', 'zakrzówek', 'tyniecka'],
    10: ['mistrzejowice', 'os. tysiąclecia'],
    11: ['bieńczyce', 'igołomska'],
    12: ['jagiellońska', 'mogilska', 'botaniczna'],
  };
  for (const [zoneNum, keywords] of Object.entries(zoneKeywords)) {
    if (keywords.some(kw => addr.includes(kw))) return parseInt(zoneNum);
  }
  return null; // brak dopasowania — nie przypisuj domyślnie rejonu 1
}

// ============================================================================
// POST /api/orders/:id/update — edytuj dane zlecenia
app.post('/api/orders/:id/update', async (req, res) => {
  const { id } = req.params;
  const {
    customerPhone, customerName,
    pickupAddress, destinationAddress,
    taxiCount, paymentMethod, vehicleCategory,
    scheduledDate, scheduledTime, notes,
  } = req.body;
  try {
    await safeQuery(
      `UPDATE orders SET
        customer_name      = ?,
        customer_phone     = ?,
        pickup_address     = ?,
        destination_address= ?,
        taxi_count         = ?,
        payment_method     = ?,
        vehicle_category   = ?,
        scheduled_date     = ?,
        scheduled_time     = ?,
        notes              = ?,
        updated_at         = NOW()
       WHERE id = ?`,
      [
        customerName    || '',
        customerPhone   || '',
        pickupAddress   || '',
        destinationAddress || '',
        taxiCount       ?? 1,
        paymentMethod   || '',
        vehicleCategory || '',
        scheduledDate   || null,
        scheduledTime   || null,
        notes           || null,
        id,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/orders/:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// GET /api/orders — lista wszystkich zleceń z danymi kierowcy
app.get('/api/orders', async (req, res) => {
  try {
    const { status, statuses, limit = 200, offset = 0 } = req.query;

    let statusFilter = '';
    if (statuses) {
      const list = String(statuses).split(',').map(s => `'${s.trim().replace(/'/g, '')}'`).join(',');
      statusFilter = `AND o.status IN (${list})`;
    } else if (status) {
      statusFilter = `AND o.status = ${JSON.stringify(status)}`;
    }

    const rows = await safeQuery(
      `SELECT
         o.id,
         o.order_number,
         o.status,
         o.customer_name,
         o.customer_phone,
         o.pickup_address,
         o.destination_address,
         o.pickup_region_id,
         o.vehicle_category,
         o.payment_method,
         o.taxi_count,
         o.scheduled_date,
         o.scheduled_time,
         o.notes,
         o.cost,
         o.operator,
         o.order_type,
         o.client_info,
         o.preference_ids,
         o.created_at,
         o.updated_at,
         o.driver_id,
         d.driver_code,
         d.name AS driver_name,
         d.driver_state,
         d.vehicle_brand,
         d.vehicle_model,
         d.vehicle_color,
         d.registration_number,
         d.side_number,
         COALESCE(gr.cnt, 0) AS registrations_count
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       LEFT JOIN (
         SELECT order_id, COUNT(*) AS cnt FROM gielda_registrations GROUP BY order_id
       ) gr ON gr.order_id = o.id
       WHERE 1=1 ${statusFilter}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Orders] GET /api/orders error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders/:id — szczegóły pojedynczego zlecenia
app.get('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT o.id, o.order_number, o.status, o.customer_name, o.customer_phone,
              o.pickup_address, o.destination_address, o.pickup_region_id,
              o.vehicle_category, o.payment_method, o.notes, o.cost,
              o.created_at, o.updated_at,
              d.driver_code, d.name AS driver_name
       FROM orders o
       LEFT JOIN drivers d ON o.driver_id = d.id
       WHERE o.id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Zlecenie nie znalezione' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Orders] GET /api/orders/:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/system-events — pełna historia zdarzeń z order_logs + driver_logs
app.get('/api/system-events', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 500, 2000);
  const source = req.query.source || 'all'; // 'all' | 'order' | 'driver'
  const type   = req.query.type   || null;  // filtruj po typie

  try {
    let rows = [];

    if (source !== 'driver') {
      const orderRows = await safeQuery(
        `SELECT
           ol.id                              AS id,
           'order'                            AS source,
           ol.type,
           ol.message                         AS title,
           ol.data,
           o.order_number                     AS ref,
           ol.order_id                        AS entity_id,
           COALESCE(d.driver_code, '')        AS driver_code,
           COALESCE(d.name, '')               AS driver_name,
           ol.created_at
         FROM order_logs ol
         LEFT JOIN orders  o ON o.id = ol.order_id
         LEFT JOIN drivers d ON d.id = o.driver_id
         ${type ? 'WHERE ol.type = ?' : ''}
         ORDER BY ol.created_at DESC
         LIMIT ?`,
        type ? [type, limit] : [limit]
      );
      rows = rows.concat(orderRows ?? []);
    }

    if (source !== 'order') {
      const driverRows = await safeQuery(
        `SELECT
           dl.id + 10000000                   AS id,
           'driver'                           AS source,
           dl.type,
           dl.title,
           dl.metadata                        AS data,
           NULL                               AS ref,
           dl.driver_id                       AS entity_id,
           COALESCE(d.driver_code, '')        AS driver_code,
           COALESCE(d.name, '')               AS driver_name,
           dl.created_at
         FROM driver_logs dl
         LEFT JOIN drivers d ON d.id = dl.driver_id
         ${type ? 'WHERE dl.type = ?' : ''}
         ORDER BY dl.created_at DESC
         LIMIT ?`,
        type ? [type, limit] : [limit]
      );
      rows = rows.concat(driverRows ?? []);
    }

    // Sortuj łączone wyniki malejąco po czasie, ogranicz do limitu
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (rows.length > limit) rows = rows.slice(0, limit);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[SystemEvents] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events — strumień ostatnich zdarzeń systemowych
app.get('/api/events', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  try {
    const rows = await safeQuery(
      `SELECT 'order_new'       AS ev_type, o.order_number AS ref,
              COALESCE(o.customer_name,'—') AS label,
              o.pickup_address  AS detail, NULL AS driver_code,
              o.created_at      AS ts
       FROM orders o
       UNION ALL
       SELECT 'order_accepted', o.order_number,
              COALESCE(d.driver_code,'—'),
              COALESCE(o.pickup_address,'—'), d.driver_code,
              o.updated_at
       FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
       WHERE o.status = 'accepted'
       UNION ALL
       SELECT 'order_pickup', o.order_number,
              COALESCE(d.driver_code,'—'),
              COALESCE(o.pickup_address,'—'), d.driver_code,
              o.updated_at
       FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
       WHERE o.status = 'at_pickup'
       UNION ALL
       SELECT 'order_done', o.order_number,
              COALESCE(d.driver_code,'—'),
              CONCAT('Klient: ', COALESCE(o.customer_name,'—')), d.driver_code,
              o.updated_at
       FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
       WHERE o.status = 'completed'
       UNION ALL
       SELECT 'order_cancelled', o.order_number,
              COALESCE(o.customer_name,'—'),
              COALESCE(o.pickup_address,'—'), NULL,
              o.updated_at
       FROM orders o WHERE o.status IN ('cancelled','rejected')
       UNION ALL
       SELECT 'driver_online', d.driver_code,
              d.name, NULL, d.driver_code,
              d.last_seen
       FROM drivers d WHERE d.is_online = 1 AND d.last_seen IS NOT NULL
       ORDER BY ts DESC
       LIMIT ?`,
      [limit]
    );
    // przemapuj ev_type → type (unikamy słowa zarezerwowanego w MySQL)
    const data = (rows ?? []).map(r => ({ ...r, type: r.ev_type }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Events] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// NOWE ZLECENIE — tworzenie zlecenia z automatycznym wykrywaniem rejonu,
// typowaniem kierowcy FIFO i obsługą klienta
// ============================================================================
app.post('/api/orders/create', async (req, res) => {
  const {
    customerPhone, customerName,
    pickupAddress, destinationAddress,
    taxiCount, paymentMethod, vehicleCategory,
    date, time, notes,
    pickupRegionId, operator,
  } = req.body;

  if (!pickupAddress) {
    return res.status(400).json({ success: false, error: 'Adres odbioru jest wymagany' });
  }

  let connection;
  try {
    connection = await getConnectionWithTimeout();

    // 1. Wykryj rejon odbioru — priorytet: pickupRegionId z frontendu (dyspozytor),
    //    fallback: detekcja tekstowa z adresu
    const zoneNumber = (pickupRegionId != null ? parseInt(pickupRegionId) : null)
      ?? detectZoneFromAddressKeywords(pickupAddress);
    console.log(`[OrderCreate] pickupRegionId=${pickupRegionId} → zoneNumber=${zoneNumber}`);

    // 2. Pobierz kierowcę wg reguł przydziału (zone_assignment_rules)
    //    Jeżeli brak reguł dla rejonu → fallback: wolna w tym samym rejonie
    let assignedDriverId = null;
    let assignedDriverName = null;
    let assignedDriverCode = null;
    let zoneFallbackStatus = 'pending'; // domyślnie: zostaje jako oczekujące
    const dispatchStepsLog = [];
    const detailedSteps = []; // szczegółowe dane kroków do logowania po utworzeniu zlecenia
    let dispatchRulesMeta = null; // info o regułach użytych przy dyspozycji
    if (zoneNumber !== null) {
      // Pobierz skonfigurowane reguły i fallback_status dla rejonu
      const [ruleRows] = await connection.query(
        `SELECT search_zone, driver_state, priority, step_type, radius_km FROM zone_assignment_rules
         WHERE source_zone = ? ORDER BY priority ASC`,
        [zoneNumber]
      );
      const [zoneSettingsRows] = await connection.query(
        `SELECT fallback_status FROM zone_settings WHERE source_zone = ?`,
        [zoneNumber]
      );
      zoneFallbackStatus = zoneSettingsRows?.[0]?.fallback_status ?? 'pending';

      const usedDefaultRule = ruleRows.length === 0;
      const steps = usedDefaultRule
        ? [{ search_zone: zoneNumber, driver_state: 'wolna', priority: 1, step_type: 'zone', radius_km: null }]
        : ruleRows;

      dispatchRulesMeta = { usedDefaultRule, steps, fallbackStatus: zoneFallbackStatus };

      // Iteruj przez kroki — zwróć pierwszego pasującego kierowcę
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let drivers = [];

        if (step.step_type === 'radius' && step.radius_km) {
          // Krok oparty na promieniu — pomijamy przy tworzeniu zlecenia (brak koordynat odbioru)
          dispatchStepsLog.push({ krok: i + 1, promien: step.radius_km, stan: step.driver_state, wynik: 'pominięty (brak GPS)' });
          detailedSteps.push({ type: 'skip_radius', krok: i + 1, promien: step.radius_km, stan: step.driver_state });
          continue;
        }

        // Krok oparty na rejonie
        const [zoneDrivers] = await connection.query(
          `SELECT id, name, driver_code FROM drivers
           WHERE driver_state = ? AND current_zone = ?
           AND id NOT IN (
             SELECT dcb.driver_id FROM driver_client_blocks dcb
             JOIN clients c ON c.id = dcb.client_id
             WHERE c.phone_number = ?
           )
           ORDER BY free_since ASC LIMIT 1`,
          [step.driver_state, step.search_zone, customerPhone || '']
        );
        drivers = zoneDrivers;

        if (drivers.length > 0) {
          assignedDriverId   = drivers[0].id;
          assignedDriverName = drivers[0].name;
          assignedDriverCode = drivers[0].driver_code;
          console.log(`[OrderCreate] Kierowca ${assignedDriverCode} znaleziony wg reguły: strefa ${step.search_zone} stan ${step.driver_state}`);
          dispatchStepsLog.push({ krok: i + 1, rejon: step.search_zone, stan: step.driver_state, wynik: 'znaleziono', kierowca: assignedDriverCode });
          detailedSteps.push({ type: 'found', krok: i + 1, rejon: step.search_zone, stan: step.driver_state, kierowca_id: assignedDriverId, kierowca_kod: assignedDriverCode, kierowca_nazwa: assignedDriverName });
          break;
        } else {
          dispatchStepsLog.push({ krok: i + 1, rejon: step.search_zone, stan: step.driver_state, wynik: 'brak' });
          detailedSteps.push({ type: 'not_found', krok: i + 1, rejon: step.search_zone, stan: step.driver_state });
        }
      }
    }

    // 3. Obsługa klienta — sprawdź czy istnieje, jeśli nie — utwórz
    let clientId = null;
    let clientCode = null;
    if (customerPhone) {
      const [existingClients] = await connection.query(
        'SELECT id, client_code FROM clients WHERE phone_number = ?',
        [String(customerPhone)]
      );
      if (existingClients.length > 0) {
        clientId = existingClients[0].id;
        clientCode = existingClients[0].client_code;
      } else {
        clientId = generateUUID();
        clientCode = generateClientCode(customerPhone);
        await connection.query(
          `INSERT INTO clients (id, phone_number, client_name, client_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [clientId, String(customerPhone), customerName || '', clientCode]
        );
      }
    }

    // 4. Wygeneruj numer zlecenia w formacie XXX/MMYY
    const [countResult] = await connection.query(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING_INDEX(order_number, '/', 1) AS UNSIGNED)), 99
       ) + 1 AS next_num
       FROM orders
       WHERE order_number IS NOT NULL AND order_number LIKE '%/%'`
    );
    const nextNum = countResult[0].next_num; // zaczyna od 100
    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YY = String(now.getFullYear()).slice(-2);
    const orderNumber = `${nextNum}/${MM}/${YY}`;

    // 5. Zapisz zlecenie — status zależy od auto-przydziału, harmonogramu i fallback_status rejonu
    const newOrderStatus = assignedDriverId
      ? 'pending_driver'
      : (date && time ? 'scheduled' : zoneFallbackStatus);

    const orderId = generateUUID();
    await connection.query(
      `INSERT INTO orders (
         id, order_number, driver_id, customer_id, customer_name, customer_phone,
         pickup_address, destination_address, pickup_region_id,
         vehicle_category, payment_method, taxi_count,
         scheduled_date, scheduled_time, notes, status,
         operator, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderId, orderNumber,
        assignedDriverId, clientId,
        customerName || '', customerPhone || '',
        pickupAddress, destinationAddress || '',
        zoneNumber,
        vehicleCategory || 'standard', paymentMethod || 'cash',
        parseInt(taxiCount) || 1,
        date || null, time || null,
        notes || '', newOrderStatus,
        operator || null
      ]
    );

    connection.release();

    console.log(`[Orders] Nowe zlecenie ${orderNumber} — rejon: ${zoneNumber}, kierowca: ${assignedDriverCode || 'brak'}`);

    // Odpowiedź do klienta od razu — logi i push w tle
    res.json({
      success: true,
      data: {
        orderId,
        orderNumber,
        clientCode,
        pickupRegionId: zoneNumber,
        assignedDriver: assignedDriverId
          ? { id: assignedDriverId, name: assignedDriverName, code: assignedDriverCode }
          : null
      }
    });

    // Logi i push fire-and-forget (po wysłaniu odpowiedzi)
    // 1. Log startowy dyspozycji
    if (zoneNumber !== null && dispatchRulesMeta) {
      const { usedDefaultRule, steps } = dispatchRulesMeta;
      if (usedDefaultRule) {
        addOrderLog(orderId, 'dispatch',
          `Brak reguł przydziału dla rejonu ${zoneNumber} — używam reguły domyślnej: wolna w rejonie ${zoneNumber}`,
          { regionId: zoneNumber, kroki_dostepne: 1, reguly: 'domyślna' }
        );
      } else {
        addOrderLog(orderId, 'dispatch',
          `Dyspozycja — szukam kierowcy wg ${steps.length} reguł dla rejonu ${zoneNumber}`,
          { regionId: zoneNumber, kroki_dostepne: steps.length, reguly: steps.map(s => ({ priorytet: s.priority, rejon: s.search_zone, stan: s.driver_state, typ: s.step_type })) }
        );
      }
    } else if (zoneNumber === null) {
      addOrderLog(orderId, 'dispatch',
        `Rejon nieznany — pominięto automatyczną dyspozycję`,
        { powod: 'brak rejonu odbioru' }
      );
    }

    // 2. Logi dla każdego kroku
    for (const s of detailedSteps) {
      if (s.type === 'skip_radius') {
        addOrderLog(orderId, 'dispatch',
          `Krok ${s.krok}: pominięty (brak GPS zlecenia) — promień: ${s.promien}km, stan: ${s.stan}`,
          { krok: s.krok, wynik: 'pominięty', powod: 'brak GPS zlecenia', promien_km: s.promien, stan: s.stan }
        );
      } else if (s.type === 'found') {
        addOrderLog(orderId, 'dispatch',
          `Krok ${s.krok}: znaleziono kierowcę ${s.kierowca_kod} (${s.kierowca_nazwa}) — stan: ${s.stan}, rejon: ${s.rejon}`,
          { krok: s.krok, kierowca_id: s.kierowca_id, kierowca_kod: s.kierowca_kod, kierowca_nazwa: s.kierowca_nazwa, rejon: s.rejon, stan: s.stan }
        );
      } else {
        addOrderLog(orderId, 'dispatch',
          `Krok ${s.krok}: brak kierowcy — stan: ${s.stan}, rejon: ${s.rejon}`,
          { krok: s.krok, rejon: s.rejon, stan: s.stan, wynik: 'brak' }
        );
      }
    }

    // 3. Log końcowy — wynik dyspozycji
    if (assignedDriverId) {
      addOrderLog(orderId, 'dispatch',
        `Zlecenie ${orderNumber} przydzielono kierowcy ${assignedDriverCode} (${assignedDriverName}) — status: pending_driver`,
        { kierowca_id: assignedDriverId, kierowca_kod: assignedDriverCode, kierowca_nazwa: assignedDriverName, status: 'pending_driver' }
      );
      sendPushToDriver(assignedDriverId, {
        title: '🔔 Nowe zlecenie',
        body: `Odbiór: ${pickupAddress}`,
        url: '/driver'
      }).catch(e => console.error('[Push] Błąd wysyłki:', e.message));
    } else if (date && time) {
      addOrderLog(orderId, 'dispatch',
        `Zlecenie ${orderNumber} utworzone jako terminowe — brak kierowcy w tej chwili`,
        { rejon: zoneNumber, status: 'scheduled', termin: `${date} ${time}` }
      );
    } else {
      const fb = zoneFallbackStatus;
      if (fb === 'market') {
        addOrderLog(orderId, 'gielda',
          `Brak dostępnych kierowców — zlecenie trafia na giełdę (fallback rejonu ${zoneNumber}: market)`,
          { regionId: zoneNumber, fallback: 'market' }
        );
      } else {
        addOrderLog(orderId, 'dispatch',
          `Brak dostępnych kierowców — zlecenie oczekuje (fallback rejonu ${zoneNumber}: ${fb})`,
          { regionId: zoneNumber, fallback: fb }
        );
      }
    }
  } catch (error) {
    if (connection) { try { connection.release(); } catch (_) {} }
    console.error('[Orders] Błąd tworzenia zlecenia:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MIGRACJA BAZY DANYCH — dodaje brakujące kolumny jeśli nie istnieją
// ============================================================================
// Główna funkcja migracji — zwraca raport { tablesCreated, columnsAdded, alreadyOk }
async function runMigrations() {
  const report = await runMigrationsWithReport();
  if (report.tablesCreated.length > 0) {
    console.log('[Migration] ✅ Utworzono tabele:', report.tablesCreated.join(', '));
  }
  if (report.columnsAdded.length > 0) {
    console.log('[Migration] ✅ Dodano kolumny:', report.columnsAdded.join(', '));
  }
  if (report.alreadyOk) {
    console.log('[Migration] ✅ Wszystkie tabele i kolumny już istnieją');
  }
  console.log('[Migration] ✅ Tabele gotowe');
}

async function runMigrationsWithReport() {
  const tablesCreated = [];
  const columnsAdded = [];

  // Lista tabel do sprawdzenia/utworzenia
  const existingTables = await safeQuery(`SHOW TABLES`);
  const tableNames = existingTables.map(r => Object.values(r)[0]);

  // Definicje tabel — CREATE TABLE IF NOT EXISTS
  const tableDefs = [
    {
      name: 'driver_notifications',
      sql: `CREATE TABLE IF NOT EXISTS driver_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT,
        order_id VARCHAR(36),
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_driver_id (driver_id),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    },
    {
      name: 'order_logs',
      sql: `CREATE TABLE IF NOT EXISTS order_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        data JSON NULL,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_order_id (order_id),
        INDEX idx_created_at (created_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    },
    {
      name: 'zones',
      sql: `CREATE TABLE IF NOT EXISTS zones (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        number INT UNIQUE NOT NULL,
        coordinates TEXT,
        drivers_count INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        color VARCHAR(20) DEFAULT '#3b82f6',
        preference_id INT NULL,
        scheduled_dispatch_minutes INT DEFAULT 10,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'city_boundaries',
      sql: `CREATE TABLE IF NOT EXISTS city_boundaries (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(20) DEFAULT '#f97316',
        coordinates TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'drivers',
      sql: `CREATE TABLE IF NOT EXISTS drivers (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        driver_code VARCHAR(50),
        pin VARCHAR(20),
        status ENUM('free','driving','pickup','home','active','inactive','suspended') DEFAULT 'inactive',
        current_zone INT NULL,
        zone_entered_at DATETIME NULL,
        queue_position INT NULL,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        last_location_update DATETIME NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL,
        free_since DATETIME NULL,
        status_changed_at DATETIME NULL,
        is_online TINYINT(1) NOT NULL DEFAULT 0,
        last_seen DATETIME NULL,
        license_number VARCHAR(50) NULL,
        license_expiry DATETIME NULL,
        phone_number VARCHAR(20) NULL,
        side_number VARCHAR(50) NULL,
        vehicle_brand VARCHAR(100) NULL,
        vehicle_model VARCHAR(100) NULL,
        vehicle_color VARCHAR(50) NULL,
        registration_number VARCHAR(50) NULL,
        suspended_until DATETIME NULL,
        previous_status ENUM('free','driving','pickup','home','active','inactive','suspended') NULL,
        rating DECIMAL(3,2) NULL,
        total_rides INT DEFAULT 0,
        vehicle_categories TEXT NULL,
        emergency_contact VARCHAR(255) NULL,
        documents TEXT NULL,
        session_token VARCHAR(64) NULL,
        preference_ids VARCHAR(1000) DEFAULT '[]',
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'chat_messages',
      sql: `CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        sender_id VARCHAR(36),
        sender_name VARCHAR(255),
        sender_type VARCHAR(50),
        receiver_id VARCHAR(36),
        receiver_name VARCHAR(255),
        receiver_type VARCHAR(50),
        message TEXT,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'orders',
      sql: `CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(36) PRIMARY KEY,
        order_number VARCHAR(20) UNIQUE,
        driver_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        pickup_address TEXT,
        destination_address TEXT,
        pickup_region_id INT NULL,
        vehicle_category VARCHAR(50) DEFAULT 'standard',
        payment_method VARCHAR(50) DEFAULT 'cash',
        taxi_count INT DEFAULT 1,
        scheduled_date DATE NULL,
        scheduled_time TIME NULL,
        notes TEXT,
        order_type VARCHAR(50) DEFAULT 'standard',
        client_info TEXT,
        internal_info TEXT,
        preference_ids JSON NULL,
        operator VARCHAR(255) NULL,
        pickup_lat DOUBLE NULL,
        pickup_lng DOUBLE NULL,
        destination_lat DOUBLE NULL,
        destination_lng DOUBLE NULL,
        status VARCHAR(50) DEFAULT 'new',
        cost DECIMAL(10,2) NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'clients',
      sql: `CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(36) PRIMARY KEY,
        phone_number VARCHAR(50) UNIQUE NOT NULL,
        client_name VARCHAR(255),
        client_code VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255) NULL,
        company_name VARCHAR(255) NULL,
        street VARCHAR(255) NULL,
        city VARCHAR(100) NULL,
        postal_code VARCHAR(20) NULL,
        nip VARCHAR(20) NULL,
        client_info TEXT NULL,
        internal_info TEXT NULL,
        permanent_preference_ids JSON NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'administrators',
      sql: `CREATE TABLE IF NOT EXISTS administrators (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'dispatchers',
      sql: `CREATE TABLE IF NOT EXISTS dispatchers (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'support_agents',
      sql: `CREATE TABLE IF NOT EXISTS support_agents (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'driver_queue',
      sql: `CREATE TABLE IF NOT EXISTS driver_queue (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36),
        name VARCHAR(255),
        email VARCHAR(100),
        driver_code VARCHAR(50),
        status ENUM('free','driving','pickup','home','active','inactive','suspended') DEFAULT 'inactive',
        current_zone INT NULL,
        zone_entered_at DATETIME NULL,
        queue_position INT NULL,
        free_since DATETIME NULL,
        status_changed_at DATETIME NULL,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        last_location_update DATETIME NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL,
        is_online TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'regions',
      sql: `CREATE TABLE IF NOT EXISTS regions (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        number INT NULL,
        description TEXT NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'accounting_users',
      sql: `CREATE TABLE IF NOT EXISTS accounting_users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'taxi_codes',
      sql: `CREATE TABLE IF NOT EXISTS taxi_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'pricing_rules',
      sql: `CREATE TABLE IF NOT EXISTS pricing_rules (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        base_fare DECIMAL(10,2) DEFAULT 0,
        per_km DECIMAL(10,2) DEFAULT 0,
        per_minute DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'map_tokens',
      sql: `CREATE TABLE IF NOT EXISTS map_tokens (
        id VARCHAR(36) PRIMARY KEY,
        token TEXT NOT NULL,
        provider VARCHAR(50) DEFAULT 'mapbox',
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'custom_addresses',
      sql: `CREATE TABLE IF NOT EXISTS custom_addresses (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'address_pins',
      sql: `CREATE TABLE IF NOT EXISTS address_pins (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DECIMAL(10,8) NOT NULL,
        lng DECIMAL(11,8) NOT NULL,
        preference_ids JSON NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'driver_history',
      sql: `CREATE TABLE IF NOT EXISTS driver_history (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36),
        event_type VARCHAR(100),
        zone_number INT NULL,
        driver_state VARCHAR(50),
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'database_connections',
      sql: `CREATE TABLE IF NOT EXISTS database_connections (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        host VARCHAR(255),
        port INT DEFAULT 3306,
        username VARCHAR(100),
        password VARCHAR(255),
        database_name VARCHAR(100),
        is_active TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'settings',
      sql: `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        base_city VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'dispatcher_tasks',
      sql: `CREATE TABLE IF NOT EXISTS dispatcher_tasks (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        taxi_code VARCHAR(50) NULL,
        operator VARCHAR(255) NULL,
        order_id VARCHAR(36) NULL,
        order_number VARCHAR(20) NULL,
        status ENUM('new','in_progress','done','dismissed') DEFAULT 'new',
        source ENUM('system','manual') DEFAULT 'system',
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'zone_assignment_rules',
      sql: `CREATE TABLE IF NOT EXISTS zone_assignment_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_zone INT NOT NULL,
        priority INT NOT NULL,
        search_zone INT NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NOT NULL DEFAULT 'wolna',
        step_type VARCHAR(10) NOT NULL DEFAULT 'zone',
        radius_km DECIMAL(5,2) NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
        UNIQUE KEY uq_zone_priority (source_zone, priority),
        INDEX idx_source_zone (source_zone)
      )`
    },
    {
      name: 'zone_settings',
      sql: `CREATE TABLE IF NOT EXISTS zone_settings (
        source_zone INT PRIMARY KEY,
        fallback_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
      )`
    },
    {
      name: 'preferences',
      sql: `CREATE TABLE IF NOT EXISTS preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        color VARCHAR(20) DEFAULT '#3b82f6',
        icon VARCHAR(100) DEFAULT 'Star',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'driver_preferences',
      sql: `CREATE TABLE IF NOT EXISTS driver_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        preference_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (preference_id) REFERENCES preferences(id) ON DELETE CASCADE,
        UNIQUE KEY unique_driver_pref (driver_id, preference_id)
      )`
    },
    {
      name: 'driver_queries',
      sql: `CREATE TABLE IF NOT EXISTS driver_queries (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        question TEXT NOT NULL,
        answer VARCHAR(100) NULL,
        status ENUM('pending','answered') DEFAULT 'pending',
        created_at DATETIME DEFAULT NOW(),
        answered_at DATETIME NULL
      )`
    }
  ];

  for (const def of tableDefs) {
    const existed = tableNames.includes(def.name);
    try {
      await safeQuery(def.sql);
      if (!existed) {
        tablesCreated.push(def.name);
      }
    } catch (e) {
      console.error(`[Migration] Błąd tworzenia tabeli ${def.name}: ${e.message}`);
    }
  }

  // Migracja zone_assignment_rules — dodaj nowe kolumny jeśli nie istnieją
  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules ADD COLUMN step_type VARCHAR(10) NOT NULL DEFAULT 'zone'`);
    console.log('[Migration] zone_assignment_rules: dodano kolumnę step_type');
  } catch(e) { /* already exists */ }
  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules ADD COLUMN radius_km DECIMAL(5,2) NULL`);
    console.log('[Migration] zone_assignment_rules: dodano kolumnę radius_km');
  } catch(e) { /* already exists */ }
  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules MODIFY COLUMN search_zone INT NULL`);
    console.log('[Migration] zone_assignment_rules: search_zone zmieniona na nullable');
  } catch(e) { /* already done */ }

  // Brakujące / zmienione kolumny w tabeli drivers
  let columns = await safeQuery(`SHOW COLUMNS FROM drivers`);
  let colNames = columns.map(c => c.Field);

  // 1. Zmiana nazw camelCase → snake_case (dla baz ze starym schematem)
  const renameOps = [
    { from: 'driverCode',         to: 'driver_code',         type: 'VARCHAR(50)' },
    { from: 'phoneNumber',        to: 'phone_number',        type: 'VARCHAR(20)' },
    { from: 'sideNumber',         to: 'side_number',         type: 'VARCHAR(50)' },
    { from: 'vehicleBrand',       to: 'vehicle_brand',       type: 'VARCHAR(100)' },
    { from: 'vehicleModel',       to: 'vehicle_model',       type: 'VARCHAR(100)' },
    { from: 'vehicleColor',       to: 'vehicle_color',       type: 'VARCHAR(50)' },
    { from: 'registrationNumber', to: 'registration_number', type: 'VARCHAR(50)' },
    { from: 'suspendedUntil',     to: 'suspended_until',     type: 'DATETIME' },
    { from: 'createdAt',          to: 'created_at',          type: 'DATETIME' },
    { from: 'updatedAt',          to: 'updated_at',          type: 'DATETIME' },
  ];

  for (const op of renameOps) {
    if (colNames.includes(op.from) && !colNames.includes(op.to)) {
      try {
        await safeQuery(`ALTER TABLE drivers CHANGE COLUMN \`${op.from}\` \`${op.to}\` ${op.type}`);
        columnsAdded.push(`${op.from}→${op.to}`);
      } catch (e) {
        console.warn(`[Migration] Nie można zmienić nazwy kolumny ${op.from}: ${e.message}`);
      }
    }
  }

  // Odśwież listę kolumn po ewentualnych zmianach nazw
  columns = await safeQuery(`SHOW COLUMNS FROM drivers`);
  colNames = columns.map(c => c.Field);

  // 2. Dodaj brakujące kolumny
  const colDefs = [
    { name: 'driver_state',         sql: `ADD COLUMN driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL` },
    { name: 'free_since',           sql: `ADD COLUMN free_since DATETIME NULL DEFAULT NULL` },
    { name: 'status_changed_at',    sql: `ADD COLUMN status_changed_at DATETIME NULL DEFAULT NULL` },
    { name: 'is_online',            sql: `ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0` },
    { name: 'last_seen',            sql: `ADD COLUMN last_seen DATETIME NULL DEFAULT NULL` },
    { name: 'queue_position',       sql: `ADD COLUMN queue_position INT NULL DEFAULT NULL` },
    { name: 'zone_entered_at',      sql: `ADD COLUMN zone_entered_at DATETIME NULL DEFAULT NULL` },
    { name: 'current_zone',         sql: `ADD COLUMN current_zone INT NULL DEFAULT NULL` },
    { name: 'latitude',             sql: `ADD COLUMN latitude DOUBLE NULL DEFAULT NULL` },
    { name: 'longitude',            sql: `ADD COLUMN longitude DOUBLE NULL DEFAULT NULL` },
    { name: 'last_location_update', sql: `ADD COLUMN last_location_update DATETIME NULL DEFAULT NULL` },
    { name: 'driver_code',          sql: `ADD COLUMN driver_code VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'pin',                  sql: `ADD COLUMN pin VARCHAR(20) NULL DEFAULT NULL` },
    { name: 'license_number',       sql: `ADD COLUMN license_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'license_expiry',       sql: `ADD COLUMN license_expiry DATETIME NULL DEFAULT NULL` },
    { name: 'phone_number',         sql: `ADD COLUMN phone_number VARCHAR(20) NULL DEFAULT NULL` },
    { name: 'side_number',          sql: `ADD COLUMN side_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'vehicle_brand',        sql: `ADD COLUMN vehicle_brand VARCHAR(100) NULL DEFAULT NULL` },
    { name: 'vehicle_model',        sql: `ADD COLUMN vehicle_model VARCHAR(100) NULL DEFAULT NULL` },
    { name: 'vehicle_color',        sql: `ADD COLUMN vehicle_color VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'registration_number',  sql: `ADD COLUMN registration_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'suspended_until',      sql: `ADD COLUMN suspended_until DATETIME NULL DEFAULT NULL` },
    { name: 'previous_status',      sql: `ADD COLUMN previous_status ENUM('free','driving','pickup','home','active','inactive','suspended') NULL DEFAULT NULL` },
    { name: 'rating',               sql: `ADD COLUMN rating DECIMAL(3,2) NULL DEFAULT NULL` },
    { name: 'total_rides',          sql: `ADD COLUMN total_rides INT DEFAULT 0` },
    { name: 'vehicle_categories',   sql: `ADD COLUMN vehicle_categories TEXT NULL` },
    { name: 'emergency_contact',    sql: `ADD COLUMN emergency_contact VARCHAR(255) NULL DEFAULT NULL` },
    { name: 'documents',            sql: `ADD COLUMN documents TEXT NULL` },
    { name: 'session_token',        sql: `ADD COLUMN session_token VARCHAR(64) NULL DEFAULT NULL` },
    { name: 'preference_ids',       sql: `ADD COLUMN preference_ids VARCHAR(1000) DEFAULT '[]'` },
  ];

  const toAdd = colDefs.filter(c => !colNames.includes(c.name));
  if (toAdd.length > 0) {
    await safeQuery(`ALTER TABLE drivers ${toAdd.map(c => c.sql).join(', ')}`);
    columnsAdded.push(...toAdd.map(c => c.name));
  }

  // Rozszerzenie ENUM driver_state o 'zajeta' (idempotentne — MySQL ignoruje jeśli już istnieje)
  try {
    await safeQuery(
      `ALTER TABLE drivers MODIFY COLUMN driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL`
    );
    console.log('[Migration] driver_state ENUM rozszerzony o zajeta');
  } catch (e) {
    console.warn('[Migration] driver_state ENUM — pominięto:', e.message);
  }

  // Brakujące kolumny w tabeli zones
  const zoneColumns = await safeQuery(`SHOW COLUMNS FROM zones`);
  const zoneColNames = zoneColumns.map(c => c.Field);
  const zoneColDefs = [
    { name: 'drivers_count',             sql: `ADD COLUMN drivers_count INT DEFAULT 0` },
    { name: 'is_active',                 sql: `ADD COLUMN is_active TINYINT(1) DEFAULT 1` },
    { name: 'color',                     sql: `ADD COLUMN color VARCHAR(20) DEFAULT '#3b82f6'` },
    { name: 'updated_at',                sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
    { name: 'preference_id',             sql: `ADD COLUMN preference_id INT NULL` },
    { name: 'scheduled_dispatch_minutes',sql: `ADD COLUMN scheduled_dispatch_minutes INT DEFAULT 10` },
  ];
  const zoneToAdd = zoneColDefs.filter(c => !zoneColNames.includes(c.name));
  if (zoneToAdd.length > 0) {
    for (const col of zoneToAdd) {
      try {
        await safeQuery(`ALTER TABLE zones ${col.sql}`);
        columnsAdded.push(`zones.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] zones.${col.name}: ${e.message}`);
      }
    }
  }

  // Brakujące kolumny w tabeli preferences
  try {
    const prefColumns = await safeQuery(`SHOW COLUMNS FROM preferences`);
    const prefColNames = prefColumns.map(c => c.Field);
    const prefColDefs = [
      { name: 'color', sql: `ADD COLUMN color VARCHAR(20) DEFAULT '#3b82f6'` },
      { name: 'icon',  sql: `ADD COLUMN icon VARCHAR(100) DEFAULT 'Star'` },
    ];
    const prefToAdd = prefColDefs.filter(c => !prefColNames.includes(c.name));
    for (const col of prefToAdd) {
      try {
        await safeQuery(`ALTER TABLE preferences ${col.sql}`);
        columnsAdded.push(`preferences.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] preferences.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('[Migration] Tabela preferences nie istnieje jeszcze:', e.message);
  }

  // Brakujące kolumny w tabeli regions
  const regionColumns = await safeQuery(`SHOW COLUMNS FROM regions`);
  const regionColNames = regionColumns.map(c => c.Field);
  const regionColDefs = [
    { name: 'number',      sql: `ADD COLUMN number INT NULL` },
    { name: 'description', sql: `ADD COLUMN description TEXT NULL` },
    { name: 'updated_at',  sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
  ];
  const regionToAdd = regionColDefs.filter(c => !regionColNames.includes(c.name));
  if (regionToAdd.length > 0) {
    await safeQuery(`ALTER TABLE regions ${regionToAdd.map(c => c.sql).join(', ')}`);
    columnsAdded.push(...regionToAdd.map(c => `regions.${c.name}`));
  }

  // Brakujące kolumny w tabeli orders (rozszerzenie istniejącej tabeli)
  const orderColumns = await safeQuery(`SHOW COLUMNS FROM orders`);
  const orderColNames = orderColumns.map(c => c.Field);
  const orderColDefs = [
    { name: 'order_number',    sql: `ADD COLUMN order_number VARCHAR(20) UNIQUE` },
    { name: 'customer_id',     sql: `ADD COLUMN customer_id VARCHAR(36) NULL` },
    { name: 'customer_name',   sql: `ADD COLUMN customer_name VARCHAR(255)` },
    { name: 'customer_phone',  sql: `ADD COLUMN customer_phone VARCHAR(50)` },
    { name: 'pickup_region_id',sql: `ADD COLUMN pickup_region_id INT NULL` },
    { name: 'vehicle_category',sql: `ADD COLUMN vehicle_category VARCHAR(50) DEFAULT 'standard'` },
    { name: 'payment_method',  sql: `ADD COLUMN payment_method VARCHAR(50) DEFAULT 'cash'` },
    { name: 'taxi_count',      sql: `ADD COLUMN taxi_count INT DEFAULT 1` },
    { name: 'scheduled_date',  sql: `ADD COLUMN scheduled_date DATE NULL` },
    { name: 'scheduled_time',  sql: `ADD COLUMN scheduled_time TIME NULL` },
    { name: 'notes',           sql: `ADD COLUMN notes TEXT` },
    { name: 'order_type',      sql: `ADD COLUMN order_type VARCHAR(50) DEFAULT 'standard'` },
    { name: 'client_info',     sql: `ADD COLUMN client_info TEXT` },
    { name: 'internal_info',   sql: `ADD COLUMN internal_info TEXT` },
    { name: 'preference_ids',  sql: `ADD COLUMN preference_ids JSON NULL` },
    { name: 'operator',        sql: `ADD COLUMN operator VARCHAR(255) NULL` },
    { name: 'pickup_lat',      sql: `ADD COLUMN pickup_lat DOUBLE NULL` },
    { name: 'pickup_lng',      sql: `ADD COLUMN pickup_lng DOUBLE NULL` },
    { name: 'destination_lat', sql: `ADD COLUMN destination_lat DOUBLE NULL` },
    { name: 'destination_lng', sql: `ADD COLUMN destination_lng DOUBLE NULL` },
    { name: 'cost',            sql: `ADD COLUMN cost DECIMAL(10,2) NULL` },
    { name: 'updated_at',      sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
  ];
  const orderToAdd = orderColDefs.filter(c => !orderColNames.includes(c.name));
  if (orderToAdd.length > 0) {
    // Dodaj kolumny pojedynczo (UNIQUE constraint może wymagać oddzielnych zapytań)
    for (const col of orderToAdd) {
      try {
        await safeQuery(`ALTER TABLE orders ${col.sql}`);
        columnsAdded.push(`orders.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] orders.${col.name}: ${e.message}`);
      }
    }
  }

  // Brakujące kolumny w tabeli dispatchers (employee_id, status, itp.)
  try {
    const dispCols = await safeQuery(`SHOW COLUMNS FROM dispatchers`);
    const dispColNames = (dispCols ?? []).map(c => c.Field);
    const dispColDefs = [
      { name: 'employee_id',            sql: `ADD COLUMN employee_id VARCHAR(50) NULL` },
      { name: 'status',                 sql: `ADD COLUMN status VARCHAR(50) DEFAULT 'active'` },
      { name: 'shift',                  sql: `ADD COLUMN shift VARCHAR(50) DEFAULT 'morning'` },
      { name: 'assigned_zones',         sql: `ADD COLUMN assigned_zones JSON NULL` },
      { name: 'max_concurrent_orders',  sql: `ADD COLUMN max_concurrent_orders INT DEFAULT 15` },
      { name: 'phone_extension',        sql: `ADD COLUMN phone_extension VARCHAR(50) NULL` },
      { name: 'training_completed',     sql: `ADD COLUMN training_completed TINYINT(1) DEFAULT 0` },
      { name: 'updated_at',             sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
      { name: 'created_at',             sql: `ADD COLUMN created_at DATETIME DEFAULT NOW()` },
    ];
    for (const col of dispColDefs.filter(c => !dispColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE dispatchers ${col.sql}`);
        columnsAdded.push(`dispatchers.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] dispatchers.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`[Migration] dispatchers columns: ${e.message}`);
  }

  // chat_messages — uzupełnij wszystkie brakujące kolumny
  try {
    const chatCols = await safeQuery(`SHOW COLUMNS FROM chat_messages`);
    const chatColNames = chatCols.map(c => c.Field);
    const chatColDefs = [
      { name: 'sender_name',   sql: `ADD COLUMN sender_name   VARCHAR(255) NULL` },
      { name: 'sender_type',   sql: `ADD COLUMN sender_type   VARCHAR(50)  NULL` },
      { name: 'receiver_id',   sql: `ADD COLUMN receiver_id   VARCHAR(36)  NULL` },
      { name: 'receiver_name', sql: `ADD COLUMN receiver_name VARCHAR(255) NULL` },
      { name: 'receiver_type', sql: `ADD COLUMN receiver_type VARCHAR(50)  NULL` },
      { name: 'message',       sql: `ADD COLUMN message       TEXT         NULL` },
      { name: 'is_read',       sql: `ADD COLUMN is_read       TINYINT(1)   DEFAULT 0` },
    ];
    for (const col of chatColDefs.filter(c => !chatColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE chat_messages ${col.sql}`);
        columnsAdded.push(`chat_messages.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] chat_messages.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`[Migration] chat_messages columns: ${e.message}`);
  }

  // Brakujące kolumny w tabeli clients
  try {
    const clientCols = await safeQuery(`SHOW COLUMNS FROM clients`);
    const clientColNames = clientCols.map(c => c.Field);
    const clientColDefs = [
      { name: 'client_info',              sql: `ADD COLUMN client_info TEXT NULL`                   },
      { name: 'internal_info',            sql: `ADD COLUMN internal_info TEXT NULL`                 },
      { name: 'permanent_preference_ids', sql: `ADD COLUMN permanent_preference_ids JSON NULL`      },
      { name: 'email',                    sql: `ADD COLUMN email VARCHAR(255) NULL`                 },
      { name: 'company_name',             sql: `ADD COLUMN company_name VARCHAR(255) NULL`          },
      { name: 'street',                   sql: `ADD COLUMN street VARCHAR(255) NULL`                },
      { name: 'city',                     sql: `ADD COLUMN city VARCHAR(100) NULL`                  },
      { name: 'postal_code',              sql: `ADD COLUMN postal_code VARCHAR(20) NULL`            },
      { name: 'nip',                      sql: `ADD COLUMN nip VARCHAR(20) NULL`                    },
    ];
    for (const col of clientColDefs.filter(c => !clientColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE clients ${col.sql}`);
        columnsAdded.push(`clients.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] clients.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('[Migration] Tabela clients — migracja pól:', e.message);
  }

  // Settings table — kolumny pin_style, gielda_timeout_minutes
  try {
    const settingsCols = await safeQuery(`SHOW COLUMNS FROM settings`);
    const settingsColNames = settingsCols.map(c => c.Field);
    if (!settingsColNames.includes('pin_style')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN pin_style VARCHAR(20) DEFAULT 'classic'`);
      columnsAdded.push('settings.pin_style');
    }
    if (!settingsColNames.includes('gielda_timeout_minutes')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_timeout_minutes INT DEFAULT 3`);
      columnsAdded.push('settings.gielda_timeout_minutes');
    }
    if (!settingsColNames.includes('gielda_enabled')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_enabled TINYINT(1) DEFAULT 1`);
      columnsAdded.push('settings.gielda_enabled');
    }
    if (!settingsColNames.includes('gielda_registration_seconds')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_registration_seconds INT DEFAULT 15`);
      columnsAdded.push('settings.gielda_registration_seconds');
    }
    if (!settingsColNames.includes('gielda_hours_enabled')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_enabled TINYINT(1) DEFAULT 0`);
      columnsAdded.push('settings.gielda_hours_enabled');
    }
    if (!settingsColNames.includes('gielda_hours_from')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_from VARCHAR(5) DEFAULT '00:00'`);
      columnsAdded.push('settings.gielda_hours_from');
    }
    if (!settingsColNames.includes('gielda_hours_to')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_to VARCHAR(5) DEFAULT '23:59'`);
      columnsAdded.push('settings.gielda_hours_to');
    }
    if (!settingsColNames.includes('gielda_priority_order')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_priority_order VARCHAR(100) DEFAULT 'wolna,kursem,dojazd,zajeta'`);
      columnsAdded.push('settings.gielda_priority_order');
    }
  } catch (e) {
    console.warn(`[Migration] settings columns: ${e.message}`);
  }

  // zone_settings — gielda_max_distance_km
  try {
    const zsColsResult = await safeQuery(`SHOW COLUMNS FROM zone_settings`);
    const zsColNames = (zsColsResult ?? []).map(c => c.Field);
    if (!zsColNames.includes('gielda_max_distance_km')) {
      await safeQuery(`ALTER TABLE zone_settings ADD COLUMN gielda_max_distance_km DECIMAL(5,2) NULL`);
      columnsAdded.push('zone_settings.gielda_max_distance_km');
    }
  } catch (e) {
    console.warn(`[Migration] zone_settings columns: ${e.message}`);
  }

  // orders — market_at
  try {
    const ordColsResult = await safeQuery(`SHOW COLUMNS FROM orders`);
    const ordColNames = (ordColsResult ?? []).map(c => c.Field);
    if (!ordColNames.includes('market_at')) {
      await safeQuery(`ALTER TABLE orders ADD COLUMN market_at DATETIME NULL`);
      columnsAdded.push('orders.market_at');
    }
  } catch (e) {
    console.warn(`[Migration] orders.market_at: ${e.message}`);
  }

  // driver_logs table
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS driver_logs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      driver_id   VARCHAR(36) NOT NULL,
      type        VARCHAR(60) NOT NULL,
      title       VARCHAR(250) NOT NULL,
      description TEXT NULL,
      metadata    JSON NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dl_driver (driver_id),
      INDEX idx_dl_created (created_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('driver_logs');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] driver_logs: ${e.message}`);
    }
  }

  // gielda_registrations table
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS gielda_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(36) NOT NULL,
      driver_id VARCHAR(36) NOT NULL,
      driver_lat DOUBLE NULL,
      driver_lng DOUBLE NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order_driver (order_id, driver_id),
      INDEX idx_order (order_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('gielda_registrations');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] gielda_registrations: ${e.message}`);
    }
  }

  // push_subscriptions table
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      driver_id VARCHAR(36) NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_driver_endpoint (driver_id, endpoint(191)),
      INDEX idx_driver (driver_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('push_subscriptions');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] push_subscriptions: ${e.message}`);
    }
  }

  // taximeter_tariffs table
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_tariffs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      base_fare DECIMAL(8,2) NOT NULL DEFAULT 8.00,
      per_km_rate DECIMAL(8,2) NOT NULL DEFAULT 2.50,
      pulse_amount DECIMAL(8,2) NOT NULL DEFAULT 0.50,
      waiting_rate DECIMAL(8,2) NOT NULL DEFAULT 0.50,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('taximeter_tariffs');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_tariffs: ${e.message}`);
  }

  // taximeter_surcharges table
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_surcharges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      amount DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('taximeter_surcharges');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_surcharges: ${e.message}`);
  }

  // taximeter_settings table (global settings shared across all tariffs)
  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      initial_fee DECIMAL(8,2) NOT NULL DEFAULT 8.00,
      waiting_rate DECIMAL(8,2) NOT NULL DEFAULT 40.00,
      pulse_amount DECIMAL(8,2) NOT NULL DEFAULT 0.85,
      min_speed_kmh INT NOT NULL DEFAULT 20,
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safeQuery(`INSERT IGNORE INTO taximeter_settings (id, initial_fee, waiting_rate, pulse_amount, min_speed_kmh) VALUES (1, 8.00, 40.00, 0.85, 20)`);
    tablesCreated.push('taximeter_settings');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_settings: ${e.message}`);
  }

  // taximeter_enabled column on drivers
  try {
    await safeQuery(`ALTER TABLE drivers ADD COLUMN taximeter_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (e) {
    if (!e.message.includes('Duplicate column')) console.warn(`[Migration] drivers.taximeter_enabled: ${e.message}`);
  }

  // driver_client_blocks — wzajemne blokowanie kierowca ↔ klient
  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS driver_client_blocks (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        driver_id  VARCHAR(36) NOT NULL,
        client_id  VARCHAR(36) NOT NULL,
        blocked_by ENUM('driver','client') NOT NULL,
        reason     TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_block (driver_id, client_id, blocked_by),
        INDEX idx_dcb_driver (driver_id),
        INDEX idx_dcb_client (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('driver_client_blocks');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] driver_client_blocks: ${e.message}`);
  }

  // ── system_logs — logi systemowe (logowania, akcje admina) ──────────────────
  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        type        VARCHAR(64)  NOT NULL,
        category    VARCHAR(64)  NOT NULL DEFAULT 'general',
        user_id     VARCHAR(128) NULL,
        user_name   VARCHAR(255) NULL,
        user_role   VARCHAR(64)  NULL,
        description TEXT         NOT NULL,
        metadata    JSON         NULL,
        ip_address  VARCHAR(64)  NULL,
        created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sl_created (created_at),
        INDEX idx_sl_type    (type),
        INDEX idx_sl_role    (user_role),
        INDEX idx_sl_user    (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('system_logs');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] system_logs: ${e.message}`);
  }

  // ── local_addresses — lokalna baza adresów (dla podpowiadania w formularzach) ─
  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS local_addresses (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        street       VARCHAR(255) NOT NULL,
        house_number VARCHAR(20)  DEFAULT NULL,
        city         VARCHAR(100) NOT NULL DEFAULT '',
        postcode     VARCHAR(10)  DEFAULT NULL,
        lat          DECIMAL(10,8) NOT NULL,
        lng          DECIMAL(11,8) NOT NULL,
        notes        VARCHAR(255) DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_la_street (street),
        INDEX idx_la_city   (city)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('local_addresses');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] local_addresses: ${e.message}`);
  }

  // ── announcements — komunikaty dyspozytora do kierowców ─
  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS announcements (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        sender_id   VARCHAR(128) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        message     TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ann_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('announcements');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] announcements: ${e.message}`);
  }

  // ── Ujednolicenie kolacji WSZYSTKICH tabel → utf8mb4_unicode_ci
  // Naprawia błąd "Illegal mix of collations" przy JOINach między tabelami
  // z różnymi kolacjami (MySQL 8.0 domyślna: utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci)
  const allTables = [
    'zones', 'drivers', 'chat_messages', 'orders', 'clients',
    'administrators', 'dispatchers', 'support_agents', 'driver_queue',
    'regions', 'accounting_users', 'taxi_codes', 'pricing_rules',
    'map_tokens', 'custom_addresses', 'address_pins', 'driver_history',
    'database_connections', 'settings', 'dispatcher_tasks',
    'zone_assignment_rules', 'zone_settings', 'preferences',
    'driver_preferences', 'driver_queries',
    'gielda_registrations', 'push_subscriptions', 'system_logs', 'local_addresses', 'announcements'
  ];
  for (const tbl of allTables) {
    try {
      await safeQuery(`ALTER TABLE \`${tbl}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[Migration] Collation OK: ${tbl}`);
    } catch (e) {
      // Ignoruj — tabela nie istnieje lub inny błąd nieblokujący
    }
  }

  // ── settings — auto-dispatch columns ────────────────────────────────────────
  try {
    const settingsCols = await safeQuery(`SHOW COLUMNS FROM settings`);
    const settingsColNames = (settingsCols ?? []).map(c => c.Field);
    if (!settingsColNames.includes('gielda_auto_dispatch_wolna')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_auto_dispatch_wolna TINYINT(1) DEFAULT 0`);
      console.log('[Migration] ✅ settings.gielda_auto_dispatch_wolna dodana');
    }
    if (!settingsColNames.includes('gielda_auto_dispatch_dojazd')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_auto_dispatch_dojazd TINYINT(1) DEFAULT 0`);
      console.log('[Migration] ✅ settings.gielda_auto_dispatch_dojazd dodana');
    }
  } catch (e) {
    console.warn('[Migration] settings auto_dispatch:', e.message);
  }

  // ── dispatcher_tasks — soft delete column ───────────────────────────────────
  try {
    const taskCols = await safeQuery(`SHOW COLUMNS FROM dispatcher_tasks`);
    const taskColNames = (taskCols ?? []).map(c => c.Field);
    if (!taskColNames.includes('deleted_at')) {
      await safeQuery(`ALTER TABLE dispatcher_tasks ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL`);
      console.log('[Migration] ✅ dispatcher_tasks.deleted_at dodana');
    }
  } catch (e) {
    console.warn('[Migration] dispatcher_tasks.deleted_at:', e.message);
  }

  // ── driver_client_blocks — deduplikacja zduplikowanych par (zombie blokady) ──
  // Jeśli ta sama para (driver_id, client_id) ma wiersze z różnym blocked_by,
  // pozostaw tylko jeden (najnowszy). Reszta to efekt starego błędu kasowania.
  try {
    await safeQuery(`
      DELETE b1 FROM driver_client_blocks b1
      INNER JOIN driver_client_blocks b2
        ON b1.driver_id = b2.driver_id
       AND b1.client_id = b2.client_id
       AND b1.id < b2.id
    `);
    console.log('[Migration] ✅ driver_client_blocks: zduplikowane pary wyczyszczone');
  } catch (e) {
    console.warn('[Migration] driver_client_blocks dedup:', e.message);
  }

  // ── Indeksy wydajnościowe (CREATE INDEX IF NOT EXISTS) ──────────────────────
  const perfIndexes = [
    // drivers — lookup po stanie i strefie (dispatch loop)
    { name: 'idx_drivers_state_zone', sql: `CREATE INDEX idx_drivers_state_zone ON drivers (driver_state, current_zone)` },
    { name: 'idx_drivers_free_since', sql: `CREATE INDEX idx_drivers_free_since ON drivers (free_since)` },
    // orders — filtrowanie po statusie, kierowcy, rejonie
    { name: 'idx_orders_status',      sql: `CREATE INDEX idx_orders_status ON orders (status)` },
    { name: 'idx_orders_driver_id',   sql: `CREATE INDEX idx_orders_driver_id ON orders (driver_id)` },
    { name: 'idx_orders_region',      sql: `CREATE INDEX idx_orders_region ON orders (pickup_region_id)` },
    { name: 'idx_orders_created_at',  sql: `CREATE INDEX idx_orders_created_at ON orders (created_at)` },
    // order_logs — lookup po zleceniu
    { name: 'idx_order_logs_order',   sql: `CREATE INDEX idx_order_logs_order ON order_logs (order_id)` },
    // zone_assignment_rules — lookup po strefie źródłowej
    { name: 'idx_zar_source_prio',    sql: `CREATE INDEX idx_zar_source_prio ON zone_assignment_rules (source_zone, priority)` },
  ];
  for (const idx of perfIndexes) {
    try {
      await safeQuery(idx.sql);
      console.log(`[Migration] ✅ Indeks ${idx.name} utworzony`);
    } catch (e) {
      // Ignoruj "Duplicate key name" — indeks już istnieje
      if (!e.message?.includes('Duplicate key name') && !e.message?.includes('already exists')) {
        console.warn(`[Migration] Indeks ${idx.name}: ${e.message}`);
      }
    }
  }

  return {
    tablesCreated,
    columnsAdded,
    alreadyOk: tablesCreated.length === 0 && columnsAdded.length === 0,
  };
}

// ─── Push API ────────────────────────────────────────────────────────────────

// GET /api/push/vapid-key — zwraca publiczny klucz VAPID
app.get('/api/push/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC) {
    return res.status(503).json({ success: false, error: 'Push notifications not configured' });
  }
  res.json({ success: true, publicKey: VAPID_PUBLIC });
});

// POST /api/push/subscribe — zapisz subskrypcję push kierowcy
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { driverId, subscription } = req.body;
    if (!driverId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ success: false, error: 'Invalid subscription data' });
    }
    await safeQuery(
      `INSERT INTO push_subscriptions (driver_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), created_at = NOW()`,
      [driverId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Push] subscribe error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/push/unsubscribe — usuń subskrypcję
app.delete('/api/push/unsubscribe', async (req, res) => {
  try {
    const { driverId, endpoint } = req.body;
    if (driverId && endpoint) {
      await safeQuery('DELETE FROM push_subscriptions WHERE driver_id = ? AND endpoint = ?', [driverId, endpoint]);
    } else if (driverId) {
      await safeQuery('DELETE FROM push_subscriptions WHERE driver_id = ?', [driverId]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Settings API ────────────────────────────────────────────────────────────

// GET /api/settings — zwraca ustawienia systemowe (lub domyślne)
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT * FROM settings LIMIT 1');
    if (!rows || rows.length === 0) {
      await safeQuery("INSERT INTO settings (base_city) VALUES ('Bydgoszcz')");
      return res.json({ success: true, data: { id: 1, base_city: 'Bydgoszcz' } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Settings] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings — zapisuje ustawienia (upsert)
app.post('/api/settings', async (req, res) => {
  const { base_city, pin_style } = req.body;
  if (!base_city || typeof base_city !== 'string') {
    return res.status(400).json({ success: false, error: 'Brakuje pola base_city' });
  }
  const validPinStyles = ['classic', 'pulse', 'badge', 'arrow'];
  const pinStyleValue = pin_style && validPinStyles.includes(pin_style) ? pin_style : 'classic';
  try {
    const rows = await safeQuery('SELECT id FROM settings LIMIT 1');
    if (!rows || rows.length === 0) {
      await safeQuery('INSERT INTO settings (base_city, pin_style) VALUES (?, ?)', [base_city.trim(), pinStyleValue]);
    } else {
      await safeQuery('UPDATE settings SET base_city = ?, pin_style = ? WHERE id = ?', [base_city.trim(), pinStyleValue, rows[0].id]);
    }
    addSystemLog({ type: 'settings_update', category: 'admin', description: `Zaktualizowano ustawienia systemowe (miasto: ${base_city.trim()}, styl pinów: ${pinStyleValue})`, metadata: { base_city: base_city.trim(), pin_style: pinStyleValue } });
    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zones/detect?lat=X&lng=Y — wykryj numer rejonu z koordynatów
app.get('/api/zones/detect', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ success: false, error: 'Brakuje lat/lng' });
  try {
    const zone = await detectZoneFromCoordinates(lat, lng);
    res.json({ success: true, zone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zones — lista wszystkich stref (number, name, id)
app.get('/api/zones', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT id, name, number, color, is_active FROM zones ORDER BY number ASC`
    );
    res.json({ success: true, zones: rows ?? [] });
  } catch (err) {
    console.error('[Zones] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GRANICE MIASTA — city_boundaries
// ────────────────────────────────────────────────────────────────────────────

app.get('/api/city-boundaries', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT * FROM city_boundaries ORDER BY created_at ASC');
    res.json({ success: true, data: rows ?? [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/city-boundaries', async (req, res) => {
  const { id, name, color, coordinates } = req.body;
  if (!name || !coordinates) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  const newId = id || require('crypto').randomUUID();
  const coordsStr = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
  try {
    await safeQuery(
      'INSERT INTO city_boundaries (id, name, color, coordinates) VALUES (?, ?, ?, ?)',
      [newId, name.trim(), color || '#f97316', coordsStr]
    );
    res.json({ success: true, id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/city-boundaries/:id', async (req, res) => {
  const { name, color, coordinates } = req.body;
  if (!name || !coordinates) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  const coordsStr = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
  try {
    // Spróbuj z updated_at, jeśli kolumna nie istnieje — bez niej
    try {
      await safeQuery(
        'UPDATE city_boundaries SET name=?, color=?, coordinates=?, updated_at=NOW() WHERE id=?',
        [name.trim(), color || '#f97316', coordsStr, req.params.id]
      );
    } catch {
      await safeQuery(
        'UPDATE city_boundaries SET name=?, color=?, coordinates=? WHERE id=?',
        [name.trim(), color || '#f97316', coordsStr, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/city-boundaries/:id', async (req, res) => {
  try {
    await safeQuery('DELETE FROM city_boundaries WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// TAKSOMETR — konfiguracja taryf i dopłat
// ────────────────────────────────────────────────────────────────────────────

// GET /api/taximeter/config — dla kierowcy (taryfy + dopłaty + ustawienia globalne)
app.get('/api/taximeter/config', async (req, res) => {
  try {
    const tariffs = await safeQuery('SELECT id, name, per_km_rate, sort_order FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC');
    const surcharges = await safeQuery('SELECT * FROM taximeter_surcharges ORDER BY sort_order ASC, id ASC');
    const settingsRows = await safeQuery('SELECT * FROM taximeter_settings WHERE id=1');
    const settings = settingsRows?.[0] ?? { initial_fee: 8, waiting_rate: 40, pulse_amount: 0.85, min_speed_kmh: 20 };
    res.json({ success: true, data: { tariffs: tariffs ?? [], surcharges: surcharges ?? [], settings } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/pricing/estimate?pickupLat=&pickupLng=&destLat=&destLng=
app.get('/api/pricing/estimate', async (req, res) => {
  try {
    const { pickupLat, pickupLng, destLat, destLng } = req.query;
    const pLat = parseFloat(pickupLat); const pLng = parseFloat(pickupLng);
    const dLat = parseFloat(destLat);   const dLng = parseFloat(destLng);
    if ([pLat, pLng, dLat, dLng].some(isNaN)) return res.status(400).json({ success: false, error: 'Nieprawidłowe współrzędne' });

    // Pobierz cennik
    const settingsRows = await safeQuery('SELECT * FROM taximeter_settings WHERE id=1');
    const settings = settingsRows?.[0] ?? { initial_fee: 8.00 };
    const tariffs = await safeQuery('SELECT per_km_rate FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC LIMIT 1');
    const initialFee = parseFloat(settings.initial_fee) || 0;
    const perKm = parseFloat(tariffs?.[0]?.per_km_rate) || 0;

    // Oblicz odległość przez OSRM (próba), fallback: Haversine × 1.25
    let distanceKm = 0;
    try {
      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=false`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const osrmData = await osrmRes.json();
      const meters = osrmData.routes?.[0]?.distance;
      if (meters) distanceKm = meters / 1000;
    } catch {
      // Fallback: Haversine
      const R = 6371;
      const dLat2 = (dLat - pLat) * Math.PI / 180;
      const dLon2 = (dLng - pLng) * Math.PI / 180;
      const a = Math.sin(dLat2/2)**2 + Math.cos(pLat*Math.PI/180) * Math.cos(dLat*Math.PI/180) * Math.sin(dLon2/2)**2;
      distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.25;
    }

    const total = (initialFee + distanceKm * perKm) * 1.1;
    res.json({ success: true, data: { price: parseFloat(total.toFixed(2)), distanceKm: parseFloat(distanceKm.toFixed(2)), initialFee, perKm } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/taximeter/settings
app.get('/api/admin/taximeter/settings', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT * FROM taximeter_settings WHERE id=1');
    res.json({ success: true, data: rows?.[0] ?? { initial_fee: 8, waiting_rate: 40, pulse_amount: 0.85, min_speed_kmh: 20 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/admin/taximeter/settings
app.put('/api/admin/taximeter/settings', async (req, res) => {
  const { initial_fee, waiting_rate, pulse_amount, min_speed_kmh } = req.body;
  try {
    await safeQuery(
      'UPDATE taximeter_settings SET initial_fee=?, waiting_rate=?, pulse_amount=?, min_speed_kmh=? WHERE id=1',
      [initial_fee ?? 8, waiting_rate ?? 40, pulse_amount ?? 0.85, min_speed_kmh ?? 20]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/taximeter/tariffs
app.get('/api/admin/taximeter/tariffs', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT id, name, per_km_rate, sort_order FROM taximeter_tariffs ORDER BY sort_order ASC, id ASC');
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/admin/taximeter/tariffs
app.post('/api/admin/taximeter/tariffs', async (req, res) => {
  const { name, per_km_rate, sort_order } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Brak nazwy taryfy' });
  try {
    const result = await safeQuery(
      'INSERT INTO taximeter_tariffs (name, per_km_rate, sort_order) VALUES (?, ?, ?)',
      [name, per_km_rate ?? 2.5, sort_order ?? 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/admin/taximeter/tariffs/:id
app.put('/api/admin/taximeter/tariffs/:id', async (req, res) => {
  const { name, per_km_rate, sort_order } = req.body;
  try {
    await safeQuery(
      'UPDATE taximeter_tariffs SET name=?, per_km_rate=?, sort_order=? WHERE id=?',
      [name, per_km_rate, sort_order ?? 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/admin/taximeter/tariffs/:id
app.delete('/api/admin/taximeter/tariffs/:id', async (req, res) => {
  try {
    await safeQuery('DELETE FROM taximeter_tariffs WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/taximeter/surcharges
app.get('/api/admin/taximeter/surcharges', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT * FROM taximeter_surcharges ORDER BY sort_order ASC, id ASC');
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/admin/taximeter/surcharges
app.post('/api/admin/taximeter/surcharges', async (req, res) => {
  const { name, amount, sort_order } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Brak nazwy dopłaty' });
  try {
    const result = await safeQuery(
      'INSERT INTO taximeter_surcharges (name, amount, sort_order) VALUES (?, ?, ?)',
      [name, amount ?? 0, sort_order ?? 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/admin/taximeter/surcharges/:id
app.put('/api/admin/taximeter/surcharges/:id', async (req, res) => {
  const { name, amount, sort_order } = req.body;
  try {
    await safeQuery(
      'UPDATE taximeter_surcharges SET name=?, amount=?, sort_order=? WHERE id=?',
      [name, amount, sort_order ?? 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/admin/taximeter/surcharges/:id
app.delete('/api/admin/taximeter/surcharges/:id', async (req, res) => {
  try {
    await safeQuery('DELETE FROM taximeter_surcharges WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/drivers/:id/taximeter-enabled — włącz/wyłącz taksometr dla kierowcy
app.patch('/api/drivers/:id/taximeter-enabled', async (req, res) => {
  const { enabled } = req.body;
  try {
    await safeQuery('UPDATE drivers SET taximeter_enabled=? WHERE id=?', [enabled ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/drivers/:id/taximeter-enabled
app.get('/api/drivers/:id/taximeter-enabled', async (req, res) => {
  try {
    const rows = await safeQuery('SELECT taximeter_enabled FROM drivers WHERE id=?', [req.params.id]);
    res.json({ success: true, enabled: !!(rows?.[0]?.taximeter_enabled) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ────────────────────────────────────────────────────────────────────────────
// BLOKADY KIEROWCA ↔ KLIENT
// ────────────────────────────────────────────────────────────────────────────

// GET /api/admin/blocks/driver/:driverId — blokady dotyczące kierowcy
app.get('/api/admin/blocks/driver/:driverId', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT b.id, b.client_id, b.blocked_by, b.reason, b.created_at,
              c.client_name, c.client_code, c.phone_number
       FROM driver_client_blocks b
       LEFT JOIN clients c ON c.id = b.client_id
       WHERE b.driver_id = ?
       ORDER BY b.created_at DESC`,
      [req.params.driverId]
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/blocks/client/:clientId — blokady dotyczące klienta
app.get('/api/admin/blocks/client/:clientId', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT b.id, b.driver_id, b.blocked_by, b.reason, b.created_at,
              d.name AS driver_name, d.driver_code
       FROM driver_client_blocks b
       LEFT JOIN drivers d ON d.id = b.driver_id
       WHERE b.client_id = ?
       ORDER BY b.created_at DESC`,
      [req.params.clientId]
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/admin/blocks — dodaj blokadę
app.post('/api/admin/blocks', async (req, res) => {
  const { driver_id, client_id, blocked_by, reason } = req.body;
  if (!driver_id || !client_id || !blocked_by) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  try {
    const result = await safeQuery(
      'INSERT INTO driver_client_blocks (driver_id, client_id, blocked_by, reason) VALUES (?, ?, ?, ?)',
      [driver_id, client_id, blocked_by, reason || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.message.includes('Duplicate')) return res.json({ success: false, error: 'Blokada już istnieje' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/driver-client-blocks/by-phone/:phone
// Zwraca listę driver_id zablokowanych dla danego numeru telefonu klienta (obie strony blokady)
app.get('/api/driver-client-blocks/by-phone/:phone', async (req, res) => {
  const phone = decodeURIComponent(req.params.phone || '').trim();
  if (!phone) return res.json({ success: true, data: [] });
  try {
    const rows = await safeQuery(
      `SELECT b.driver_id
       FROM driver_client_blocks b
       JOIN clients c ON c.id = b.client_id
       WHERE c.phone_number = ?`,
      [phone]
    );
    res.json({ success: true, data: (rows ?? []).map(r => r.driver_id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/blocks/:id — usuń blokadę (kasuje OBIE strony pary driver↔client)
app.delete('/api/admin/blocks/:id', async (req, res) => {
  try {
    // Pobierz parę (driver_id, client_id) dla usuwanego rekordu
    const blockRows = await safeQuery('SELECT driver_id, client_id FROM driver_client_blocks WHERE id=?', [req.params.id]);
    if (!blockRows || blockRows.length === 0) {
      return res.json({ success: true }); // już nie istnieje
    }
    const { driver_id, client_id } = blockRows[0];
    // Usuń WSZYSTKIE blokady dla tej pary (niezależnie od blocked_by) — obie strony
    await safeQuery('DELETE FROM driver_client_blocks WHERE driver_id=? AND client_id=?', [driver_id, client_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/drivers-search?q= — wyszukiwanie kierowców (dla modalu blokad)
app.get('/api/admin/drivers-search', async (req, res) => {
  const q = `%${req.query.q ?? ''}%`;
  try {
    const rows = await safeQuery(
      'SELECT id, name, driver_code FROM drivers WHERE name LIKE ? OR driver_code LIKE ? LIMIT 10',
      [q, q]
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/clients-search?q= — wyszukiwanie klientów (dla modalu blokad)
app.get('/api/admin/clients-search', async (req, res) => {
  const q = `%${req.query.q ?? ''}%`;
  try {
    const rows = await safeQuery(
      'SELECT id, client_name, client_code, phone_number FROM clients WHERE client_name LIKE ? OR client_code LIKE ? OR phone_number LIKE ? LIMIT 10',
      [q, q, q]
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ────────────────────────────────────────────────────────────────────────────
// REGUŁY PRZYDZIAŁU — zone_assignment_rules
// ────────────────────────────────────────────────────────────────────────────

// GET /api/admin/zone-rules — wszystkie reguły zgrupowane wg source_zone
// Tylko dla istniejących rejonów (JOIN z zones) — reguły dla usuniętych rejonów są ignorowane
app.get('/api/admin/zone-rules', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT zar.id, zar.source_zone, zar.priority, zar.search_zone, zar.driver_state, zar.step_type, zar.radius_km
       FROM zone_assignment_rules zar
       INNER JOIN zones z ON z.number = zar.source_zone AND z.is_active = 1
       ORDER BY zar.source_zone ASC, zar.priority ASC`
    );
    // Grupuj po source_zone → { "56": [...], "1": [...] }
    const grouped = {};
    for (const r of (rows ?? [])) {
      const key = String(r.source_zone);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id:          r.id,
        sourceZone:  r.source_zone,
        priority:    r.priority,
        searchZone:  r.search_zone,
        driverState: r.driver_state,
        stepType:    r.step_type ?? 'zone',
        radiusKm:    r.radius_km ?? null,
      });
    }
    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[ZoneRules] GET all error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/zone-rules/cleanup — usuń reguły dla nieistniejących rejonów
app.delete('/api/admin/zone-rules/cleanup', async (req, res) => {
  try {
    const result = await safeQuery(
      `DELETE zar FROM zone_assignment_rules zar
       LEFT JOIN zones z ON z.number = zar.source_zone AND z.is_active = 1
       WHERE z.id IS NULL`
    );
    const deleted = result?.affectedRows ?? 0;
    console.log(`[ZoneRules] Cleanup: usunięto ${deleted} reguł dla nieistniejących rejonów`);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[ZoneRules] Cleanup error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/zone-rules/:sourceZone — usuń wszystkie reguły dla rejonu
app.delete('/api/admin/zone-rules/:sourceZone', async (req, res) => {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });
  try {
    const result = await safeQuery(
      `DELETE FROM zone_assignment_rules WHERE source_zone = ?`,
      [sourceZone]
    );
    const deleted = result?.affectedRows ?? 0;
    console.log(`[ZoneRules] Usunięto ${deleted} reguł dla rejonu ${sourceZone}`);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[ZoneRules] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/zone-rules/:sourceZone — reguły dla jednego rejonu
app.get('/api/admin/zone-rules/:sourceZone', async (req, res) => {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });
  try {
    const rows = await safeQuery(
      `SELECT id, source_zone, priority, search_zone, driver_state, step_type, radius_km
       FROM zone_assignment_rules
       WHERE source_zone = ?
       ORDER BY priority ASC`,
      [sourceZone]
    );
    const settingsRows = await safeQuery(
      'SELECT fallback_status, gielda_max_distance_km FROM zone_settings WHERE source_zone = ?',
      [sourceZone]
    );
    const fallbackStatus = settingsRows?.[0]?.fallback_status ?? 'pending';
    const gieldaMaxDistanceKm = settingsRows?.[0]?.gielda_max_distance_km ?? null;
    res.json({
      success: true,
      fallbackStatus,
      gieldaMaxDistanceKm,
      data: (rows ?? []).map(r => ({
        id:          r.id,
        sourceZone:  r.source_zone,
        priority:    r.priority,
        searchZone:  r.search_zone,
        driverState: r.driver_state,
        stepType:    r.step_type ?? 'zone',
        radiusKm:    r.radius_km ?? null,
      })),
    });
  } catch (err) {
    console.error('[ZoneRules] GET zone error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/zone-rules/:sourceZone — bulk-replace reguł dla rejonu
// Body: [{ searchZone: 56, driverState: 'wolna' }, ...]
app.put('/api/admin/zone-rules/:sourceZone', async (req, res) => {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });

  // Body może być tablicą (stary format) lub obiektem { steps, fallbackStatus, gieldaMaxDistanceKm }
  let steps, fallbackStatus, gieldaMaxDistanceKm;
  if (Array.isArray(req.body)) {
    steps = req.body;
    fallbackStatus = 'pending';
    gieldaMaxDistanceKm = null;
  } else {
    steps = req.body.steps ?? [];
    fallbackStatus = req.body.fallbackStatus ?? 'pending';
    gieldaMaxDistanceKm = req.body.gieldaMaxDistanceKm != null ? parseFloat(req.body.gieldaMaxDistanceKm) : null;
    if (gieldaMaxDistanceKm !== null && (isNaN(gieldaMaxDistanceKm) || gieldaMaxDistanceKm < 0)) {
      gieldaMaxDistanceKm = null;
    }
  }
  if (!Array.isArray(steps)) return res.status(400).json({ success: false, error: 'Oczekiwano tablicy kroków' });
  if (!['pending', 'market'].includes(fallbackStatus)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy fallback_status' });
  }

  const VALID_STATES = ['wolna', 'dojazd', 'zajeta', 'kursem'];
  const VALID_STEP_TYPES = ['zone', 'radius'];
  for (const s of steps) {
    const stepType = s.stepType ?? 'zone';
    if (!VALID_STEP_TYPES.includes(stepType)) {
      return res.status(400).json({ success: false, error: 'Nieprawidłowy typ kroku' });
    }
    if (!s.driverState || !VALID_STATES.includes(s.driverState)) {
      return res.status(400).json({ success: false, error: 'Nieprawidłowy status kierowcy' });
    }
    if (stepType === 'zone' && !s.searchZone) {
      return res.status(400).json({ success: false, error: 'Krok typu "rejon" wymaga numeru rejonu' });
    }
    if (stepType === 'radius' && (!s.radiusKm || parseFloat(s.radiusKm) <= 0)) {
      return res.status(400).json({ success: false, error: 'Krok typu "odległość" wymaga radiusKm > 0' });
    }
  }

  try {
    // Usuń stare reguły dla tego rejonu
    await safeQuery('DELETE FROM zone_assignment_rules WHERE source_zone = ?', [sourceZone]);
    // Wstaw nowe (priorytet = index + 1)
    if (steps.length > 0) {
      const values = steps.map((s, i) => {
        const stepType = s.stepType ?? 'zone';
        const searchZone = stepType === 'zone' ? parseInt(s.searchZone) : null;
        const radiusKm = stepType === 'radius' ? parseFloat(s.radiusKm) : null;
        return [sourceZone, i + 1, searchZone, s.driverState, stepType, radiusKm];
      });
      await safeQuery(
        `INSERT INTO zone_assignment_rules (source_zone, priority, search_zone, driver_state, step_type, radius_km) VALUES ?`,
        [values]
      );
    }
    // Upsert zone_settings — zapisz fallback status + gielda_max_distance_km
    await safeQuery(
      `INSERT INTO zone_settings (source_zone, fallback_status, gielda_max_distance_km) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE fallback_status = VALUES(fallback_status),
                               gielda_max_distance_km = VALUES(gielda_max_distance_km)`,
      [sourceZone, fallbackStatus, gieldaMaxDistanceKm]
    );
    addSystemLog({ type: 'zone_rules_update', category: 'admin', description: `Zaktualizowano reguły przydziału dla rejonu ${sourceZone} (${steps.length} kroków, fallback: ${fallbackStatus})`, metadata: { sourceZone, steps, fallbackStatus, gieldaMaxDistanceKm } });
    res.json({ success: true, saved: steps.length, fallbackStatus, gieldaMaxDistanceKm });
  } catch (err) {
    console.error('[ZoneRules] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ── Lokalna baza adresów ─────────────────────────────────────────────────────

// GET /api/local-addresses/all — zwraca wszystkie adresy (dla client-side search w formularzach)
app.get('/api/local-addresses/all', async (req, res) => {
  try {
    const rows = await safeQuery(
      'SELECT id, street, house_number, city, postcode, lat, lng, notes FROM local_addresses ORDER BY city ASC, street ASC'
    );
    res.json({ results: rows || [] });
  } catch (err) {
    res.status(500).json({ results: [], error: err.message });
  }
});

// GET /api/admin/local-addresses — lista z paginacją i wyszukiwaniem (panel admina)
app.get('/api/admin/local-addresses', async (req, res) => {
  try {
    const { q = '', page = '1', limit = '100' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE street LIKE ? OR city LIKE ? OR house_number LIKE ? OR notes LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [totalRow] = await safeQuery(`SELECT COUNT(*) AS cnt FROM local_addresses ${where}`, params);
    const rows = await safeQuery(
      `SELECT * FROM local_addresses ${where} ORDER BY city ASC, street ASC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ results: rows || [], total: totalRow?.cnt || 0 });
  } catch (err) {
    res.status(500).json({ results: [], total: 0, error: err.message });
  }
});

// POST /api/admin/local-addresses — dodaj adres
app.post('/api/admin/local-addresses', async (req, res) => {
  try {
    const { street, house_number = null, city = '', postcode = null, lat, lng, notes = null } = req.body;
    if (!street || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Wymagane pola: street, lat, lng' });
    }
    const result = await safeQuery(
      'INSERT INTO local_addresses (street, house_number, city, postcode, lat, lng, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [street.trim(), house_number || null, city.trim(), postcode || null, parseFloat(lat), parseFloat(lng), notes || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/local-addresses/:id — edytuj adres
app.put('/api/admin/local-addresses/:id', async (req, res) => {
  try {
    const { street, house_number = null, city = '', postcode = null, lat, lng, notes = null } = req.body;
    await safeQuery(
      'UPDATE local_addresses SET street=?, house_number=?, city=?, postcode=?, lat=?, lng=?, notes=? WHERE id=?',
      [street.trim(), house_number || null, city.trim(), postcode || null, parseFloat(lat), parseFloat(lng), notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/local-addresses/:id — usuń adres
app.delete('/api/admin/local-addresses/:id', async (req, res) => {
  try {
    await safeQuery('DELETE FROM local_addresses WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────

// GET /api/admin/system-logs — pobiera logi systemowe z filtrami
app.get('/api/admin/system-logs', async (req, res) => {
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

    if (dateFrom) {
      conditions.push('created_at >= ?');
      params.push(dateFrom + ' 00:00:00');
    }
    if (dateTo) {
      conditions.push('created_at <= ?');
      params.push(dateTo + ' 23:59:59');
    }
    if (userRole) {
      conditions.push('user_role = ?');
      params.push(userRole);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (search) {
      conditions.push('(description LIKE ? OR user_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await safeQuery(
      `SELECT COUNT(*) as total FROM system_logs ${whereClause}`,
      params
    );
    const total = countRows?.[0]?.total ?? 0;

    const rows = await safeQuery(
      `SELECT id, type, category, user_id, user_name, user_role, description, metadata, ip_address, created_at
       FROM system_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

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
});

// GET /api/admin/system-logs/types — unikalne typy logów (do filtra)
app.get('/api/admin/system-logs/types', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT DISTINCT type, category FROM system_logs ORDER BY category, type`
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/system-logs — dodaj log z frontendu (logowania admin/dispatcher/support/accounting)
app.post('/api/admin/system-logs', async (req, res) => {
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
});

// ────────────────────────────────────────────────────────────────────────────

// POST /api/sql-upload — wykonaj skrypt SQL wgrany z panelu wsparcia
app.post('/api/sql-upload', async (req, res) => {
  const { sql } = req.body;

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.status(400).json({ success: false, error: 'Brak treści SQL' });
  }

  console.log('[SQL Upload] Received script, length:', sql.length);

  // Rozdziel skrypt na pojedyncze polecenia (pomijając komentarze i puste linie)
  const statements = sql
    .split(/;\s*(\n|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

  if (statements.length === 0) {
    return res.status(400).json({ success: false, error: 'Skrypt nie zawiera żadnych poleceń SQL' });
  }

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  let connection;
  try {
    connection = await getConnectionWithTimeout();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Brak połączenia z bazą danych: ' + err.message });
  }

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      const [rows] = await connection.query(stmt);
      successCount++;
      results.push({
        index: i + 1,
        success: true,
        statement: stmt.substring(0, 120) + (stmt.length > 120 ? '...' : ''),
        affected: rows?.affectedRows ?? (Array.isArray(rows) ? rows.length : null)
      });
    } catch (err) {
      errorCount++;
      results.push({
        index: i + 1,
        success: false,
        statement: stmt.substring(0, 120) + (stmt.length > 120 ? '...' : ''),
        error: err.message
      });
      console.error(`[SQL Upload] Statement ${i + 1} error:`, err.message);
    }
  }

  connection.release();
  console.log(`[SQL Upload] Done. Success: ${successCount}, Errors: ${errorCount}`);

  res.json({
    success: errorCount === 0,
    total: statements.length,
    successCount,
    errorCount,
    results
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ZADANIA (DISPATCHER TASKS) API
// ────────────────────────────────────────────────────────────────────────────

// GET /api/tasks — lista zadań (z dołączonymi danymi zlecenia)
app.get('/api/tasks', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT t.id, t.title, t.description, t.taxi_code, t.operator, t.order_id, t.order_number,
              t.status, t.source, t.created_at, t.updated_at,
              o.customer_name, o.customer_phone, o.pickup_address,
              o.destination_address, o.notes, o.cost, o.created_at AS order_created_at
       FROM dispatcher_tasks t
       LEFT JOIN orders o ON t.order_id = o.id
       WHERE t.deleted_at IS NULL
       ORDER BY t.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: rows ?? [] });
  } catch (err) {
    console.error('[Tasks] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks — utwórz nowe zadanie
app.post('/api/tasks', async (req, res) => {
  const { title, description, taxi_code, operator, order_id, order_number, source } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Tytuł zadania jest wymagany' });
  }
  try {
    const id = generateUUID();
    await safeQuery(
      `INSERT INTO dispatcher_tasks (id, title, description, taxi_code, operator, order_id, order_number, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', NOW(), NOW())`,
      [id, title, description || null, taxi_code || null, operator || null, order_id || null, order_number || null, source || 'manual']
    );
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[Tasks] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/status — zmień status zadania
app.patch('/api/tasks/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['new', 'in_progress', 'done', 'dismissed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy status' });
  }
  try {
    await safeQuery(
      `UPDATE dispatcher_tasks SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Tasks] PATCH status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id — soft delete (deleted_at = NOW(), rekord zostaje w bazie)
// Dzięki temu checkGieldaTimeout nie tworzy duplikatów dla tego samego zlecenia
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await safeQuery(
      `UPDATE dispatcher_tasks SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Tasks] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pomocnicza funkcja — upewnij się że kolumny gielda_* istnieją
async function ensureGieldaColumn() {
  try {
    const cols = await safeQuery('SHOW COLUMNS FROM settings');
    const colNames = cols.map(c => c.Field);
    if (!colNames.includes('gielda_timeout_minutes')) {
      await safeQuery('ALTER TABLE settings ADD COLUMN gielda_timeout_minutes INT DEFAULT 3');
      console.log('[GieldaSettings] Added gielda_timeout_minutes column');
    }
    if (!colNames.includes('gielda_enabled')) {
      await safeQuery('ALTER TABLE settings ADD COLUMN gielda_enabled TINYINT(1) DEFAULT 1');
      console.log('[GieldaSettings] Added gielda_enabled column');
    }
    if (!colNames.includes('gielda_registration_seconds')) {
      await safeQuery('ALTER TABLE settings ADD COLUMN gielda_registration_seconds INT DEFAULT 15');
      console.log('[GieldaSettings] Added gielda_registration_seconds column');
    }
    if (!colNames.includes('gielda_hours_enabled')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_enabled TINYINT(1) DEFAULT 0`);
      console.log('[GieldaSettings] Added gielda_hours_enabled column');
    }
    if (!colNames.includes('gielda_hours_from')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_from VARCHAR(5) DEFAULT '00:00'`);
      console.log('[GieldaSettings] Added gielda_hours_from column');
    }
    if (!colNames.includes('gielda_hours_to')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_to VARCHAR(5) DEFAULT '23:59'`);
      console.log('[GieldaSettings] Added gielda_hours_to column');
    }
    if (!colNames.includes('gielda_priority_order')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_priority_order VARCHAR(100) DEFAULT 'wolna,kursem,dojazd,zajeta'`);
      console.log('[GieldaSettings] Added gielda_priority_order column');
    }
  } catch (e) {
    console.warn('[GieldaSettings] ensureGieldaColumn:', e.message);
  }
}

// GET /api/settings/gielda — pobierz ustawienia giełdy
app.get('/api/settings/gielda', async (req, res) => {
  try {
    await ensureGieldaColumn();
    const rows = await safeQuery('SELECT gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order, gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd FROM settings LIMIT 1');
    const row = rows?.[0] ?? {};
    res.json({
      success: true,
      data: {
        gielda_timeout_minutes:        row.gielda_timeout_minutes ?? 3,
        gielda_enabled:                row.gielda_enabled != null ? row.gielda_enabled : 1,
        gielda_registration_seconds:   row.gielda_registration_seconds ?? 15,
        gielda_hours_enabled:          row.gielda_hours_enabled != null ? row.gielda_hours_enabled : 0,
        gielda_hours_from:             row.gielda_hours_from ?? '00:00',
        gielda_hours_to:               row.gielda_hours_to ?? '23:59',
        gielda_priority_order:         row.gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta',
        gielda_auto_dispatch_wolna:    row.gielda_auto_dispatch_wolna ?? 0,
        gielda_auto_dispatch_dojazd:   row.gielda_auto_dispatch_dojazd ?? 0,
      }
    });
  } catch (err) {
    console.error('[GieldaSettings] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/gielda — zapisz ustawienia giełdy
app.post('/api/settings/gielda', async (req, res) => {
  const { gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order, gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd } = req.body;

  // Walidacja timeout
  if (gielda_timeout_minutes !== undefined) {
    const val = parseInt(gielda_timeout_minutes);
    if (isNaN(val) || val < 1 || val > 999) {
      return res.status(400).json({ success: false, error: 'Timeout musi być liczbą od 1 do 999' });
    }
  }
  // Walidacja registration_seconds
  if (gielda_registration_seconds !== undefined) {
    const val = parseInt(gielda_registration_seconds);
    if (isNaN(val) || val < 0 || val > 3600) {
      return res.status(400).json({ success: false, error: 'Czas rejestracji musi być od 0 do 3600' });
    }
  }
  // Walidacja hours_from / hours_to
  const timeRe = /^\d{2}:\d{2}$/;
  if (gielda_hours_from !== undefined && !timeRe.test(gielda_hours_from)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy format godziny od (HH:MM)' });
  }
  if (gielda_hours_to !== undefined && !timeRe.test(gielda_hours_to)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy format godziny do (HH:MM)' });
  }
  // Walidacja priority_order
  if (gielda_priority_order !== undefined && (typeof gielda_priority_order !== 'string' || gielda_priority_order.trim() === '')) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowa kolejność priorytetów' });
  }

  try {
    await ensureGieldaColumn();
    const rows = await safeQuery('SELECT id FROM settings LIMIT 1');
    if (!rows || rows.length === 0) {
      await safeQuery(
        `INSERT INTO settings (base_city, gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds,
           gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['Bydgoszcz',
         gielda_timeout_minutes != null ? parseInt(gielda_timeout_minutes) : 3,
         gielda_enabled != null ? (gielda_enabled ? 1 : 0) : 1,
         gielda_registration_seconds != null ? parseInt(gielda_registration_seconds) : 15,
         gielda_hours_enabled != null ? (gielda_hours_enabled ? 1 : 0) : 0,
         gielda_hours_from ?? '00:00',
         gielda_hours_to ?? '23:59',
         gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta',
        ]
      );
    } else {
      const setParts = [];
      const setVals = [];
      if (gielda_timeout_minutes !== undefined) {
        setParts.push('gielda_timeout_minutes = ?');
        setVals.push(parseInt(gielda_timeout_minutes));
      }
      if (gielda_enabled !== undefined) {
        setParts.push('gielda_enabled = ?');
        setVals.push(gielda_enabled ? 1 : 0);
      }
      if (gielda_registration_seconds !== undefined) {
        setParts.push('gielda_registration_seconds = ?');
        setVals.push(parseInt(gielda_registration_seconds));
      }
      if (gielda_hours_enabled !== undefined) {
        setParts.push('gielda_hours_enabled = ?');
        setVals.push(gielda_hours_enabled ? 1 : 0);
      }
      if (gielda_hours_from !== undefined) {
        setParts.push('gielda_hours_from = ?');
        setVals.push(gielda_hours_from);
      }
      if (gielda_hours_to !== undefined) {
        setParts.push('gielda_hours_to = ?');
        setVals.push(gielda_hours_to);
      }
      if (gielda_priority_order !== undefined) {
        setParts.push('gielda_priority_order = ?');
        setVals.push(gielda_priority_order);
      }
      if (gielda_auto_dispatch_wolna !== undefined) {
        setParts.push('gielda_auto_dispatch_wolna = ?');
        setVals.push(gielda_auto_dispatch_wolna ? 1 : 0);
      }
      if (gielda_auto_dispatch_dojazd !== undefined) {
        setParts.push('gielda_auto_dispatch_dojazd = ?');
        setVals.push(gielda_auto_dispatch_dojazd ? 1 : 0);
      }
      if (setParts.length > 0) {
        setVals.push(rows[0].id);
        await safeQuery(`UPDATE settings SET ${setParts.join(', ')} WHERE id = ?`, setVals);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[GieldaSettings] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GIEŁDA AUTO-DISPATCH — automatyczne wydawanie zleceń z giełdy gdy pojawi się
// kierowca w odpowiednim rejonie i stanie (wolna / dojazd)
// ────────────────────────────────────────────────────────────────────────────
let autoDispatchInterval = null;

async function checkMarketAutoDispatch() {
  try {
    const settings = await safeQuery(
      'SELECT gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd FROM settings LIMIT 1'
    );
    const autoWolna   = settings?.[0]?.gielda_auto_dispatch_wolna  === 1;
    const autoDojazd  = settings?.[0]?.gielda_auto_dispatch_dojazd === 1;
    if (!autoWolna && !autoDojazd) return;

    const allowedStates = [
      ...(autoWolna  ? ['wolna']  : []),
      ...(autoDojazd ? ['dojazd'] : []),
    ];

    // Zlecenia na giełdzie bez kierowcy — najstarsze pierwsze
    const marketOrders = await safeQuery(
      `SELECT id, order_number, pickup_address, pickup_region_id, preference_ids, pickup_lat, pickup_lng, customer_id
       FROM orders
       WHERE status = 'market' AND driver_id IS NULL
       ORDER BY created_at ASC`
    );

    // Wczytaj wszystkie blokady raz na cykl
    const allBlocks = await safeQuery('SELECT driver_id, client_id FROM driver_client_blocks') ?? [];
    const blockSet = new Set(allBlocks.map(b => `${b.driver_id}|${b.client_id}`));
    if (allBlocks.length > 0) console.log(`[AutoDispatch] Załadowano ${allBlocks.length} blokad:`, allBlocks.map(b => `${b.driver_id}|${b.client_id}`));
    if (!marketOrders || marketOrders.length === 0) return;

    // Śledź kierowców już obsłużonych w tym cyklu — jeden kierowca = max 1 zlecenie na cykl
    const dispatchedDriverIds = new Set();

    for (const order of marketOrders) {
      if (!order.pickup_region_id) continue;

      const rules = await safeQuery(
        `SELECT search_zone, driver_state, step_type, radius_km FROM zone_assignment_rules
         WHERE source_zone = ? ORDER BY priority ASC`,
        [order.pickup_region_id]
      );
      const steps = (rules && rules.length > 0)
        ? rules
        : [{ search_zone: order.pickup_region_id, driver_state: 'wolna', step_type: 'zone', radius_km: null }];

      let dispatched = false;
      for (const step of steps) {
        if (!allowedStates.includes(step.driver_state)) continue;

        let drivers;
        if (step.step_type === 'radius' && step.radius_km && order.pickup_lat != null && order.pickup_lng != null) {
          // Krok radiusowy — szukaj kierowców w promieniu od adresu odbioru
          const allDrivers = await safeQuery(
            `SELECT id, driver_code, name, preference_ids, latitude, longitude FROM drivers
             WHERE driver_state = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
             ORDER BY free_since ASC`,
            [step.driver_state]
          );
          drivers = (allDrivers ?? []).filter(d =>
            haversineKm(d.latitude, d.longitude, order.pickup_lat, order.pickup_lng) <= step.radius_km
          );
        } else if (step.step_type === 'radius') {
          // Radius ale brak GPS — pomiń krok
          continue;
        } else {
          drivers = await safeQuery(
            `SELECT id, driver_code, name, preference_ids, latitude, longitude FROM drivers
             WHERE driver_state = ? AND current_zone = ?
             ORDER BY free_since ASC`,
            [step.driver_state, step.search_zone]
          );
        }
        if (!drivers || drivers.length === 0) continue;

        // Pobierz limit odległości dla rejonu zlecenia (raz na krok)
        const zoneDistSettings = await safeQuery(
          'SELECT gielda_max_distance_km FROM zone_settings WHERE source_zone = ?',
          [order.pickup_region_id]
        );
        const maxDistKm = zoneDistSettings?.[0]?.gielda_max_distance_km ?? null;

        // Wyodrębnij wymagane preferencje zlecenia
        let requiredPrefs = [];
        try {
          const raw = order.preference_ids;
          requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch { requiredPrefs = []; }

        // Znajdź pierwszego kierowcę który: nie był już w tym cyklu + ma < 2 aktywnych zleceń + spełnia preferencje
        for (const driver of drivers) {
          if (dispatchedDriverIds.has(driver.id)) continue;

          // Sprawdź blokadę kierowca ↔ klient
          const blockKey = `${driver.id}|${order.customer_id}`;
          const isBlocked = !!(order.customer_id && blockSet.has(blockKey));
          if (order.customer_id) console.log(`[AutoDispatch] Block check order=${order.order_number} customer_id=${order.customer_id} driver=${driver.driver_code}(${driver.id}) key=${blockKey} blocked=${isBlocked}`);
          if (isBlocked) continue;

          // Sprawdź odległość kierowcy od miejsca odbioru
          if (maxDistKm != null && order.pickup_lat != null && driver.latitude != null) {
            const dist = haversineKm(driver.latitude, driver.longitude, order.pickup_lat, order.pickup_lng);
            if (dist > maxDistKm) continue;
          }

          // Sprawdź preferencje kierowcy
          if (requiredPrefs.length > 0) {
            let driverPrefs = [];
            try {
              const raw = driver.preference_ids;
              driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
            } catch { driverPrefs = []; }
            if (!requiredPrefs.every(id => driverPrefs.includes(id))) continue;
          }

          // Sprawdź liczbę aktywnych zleceń kierowcy (max 2)
          const activeCount = await safeQuery(
            `SELECT COUNT(*) AS cnt FROM orders
             WHERE driver_id = ? AND status IN ('pending_driver','next_driver','accepted','at_pickup','in_progress')`,
            [driver.id]
          );
          const cnt = activeCount?.[0]?.cnt ?? 0;
          if (cnt >= 2) continue;

          // Drugie zlecenie → next_driver, pierwsze → pending_driver
          const newStatus = cnt >= 1 ? 'next_driver' : 'pending_driver';

          const updated = await safeQuery(
            `UPDATE orders SET status = ?, driver_id = ?, updated_at = NOW()
             WHERE id = ? AND status = 'market'`,
            [newStatus, driver.id, order.id]
          );
          if (!updated || updated.affectedRows === 0) continue; // race — inny proces już wziął

          dispatchedDriverIds.add(driver.id);
          addOrderLog(order.id, 'dispatch',
            `Auto-dispatch z giełdy: kierowca ${driver.driver_code} (${driver.name}) — stan: ${step.driver_state}, rejon: ${step.search_zone}, status: ${newStatus}`,
            { auto: true, kierowca_id: driver.id, kierowca_kod: driver.driver_code, rejon: step.search_zone, stan: step.driver_state, status: newStatus }
          );
          if (newStatus === 'pending_driver') {
            sendPushToDriver(driver.id, {
              title: '🔔 Nowe zlecenie',
              body: `Odbiór: ${order.pickup_address || '—'}`,
              url: '/driver'
            }).catch(e => console.error('[AutoDispatch] Push error:', e.message));
          }
          console.log(`[AutoDispatch] ${order.order_number} → ${driver.driver_code} (${newStatus}, stan: ${step.driver_state}, rejon: ${step.search_zone})`);
          dispatched = true;
          break; // przeszliśmy na następne zlecenie
        }
        if (dispatched) break;
      }
    }
  } catch (err) {
    console.error('[AutoDispatch] Error:', err.message);
  }
}

function startAutoDispatch() {
  if (autoDispatchInterval) clearInterval(autoDispatchInterval);
  autoDispatchInterval = setInterval(checkMarketAutoDispatch, 3000);
  console.log('[AutoDispatch] Started (interval: 3s)');
}

// ────────────────────────────────────────────────────────────────────────────
// GIEŁDA AUTO-TASK — sprawdzanie co 30s czy zlecenia na giełdzie nie czekają za długo
// ────────────────────────────────────────────────────────────────────────────
let gieldaCheckInterval = null;

async function checkGieldaTimeout() {
  try {
    // Pobierz timeout z ustawień
    const settings = await safeQuery('SELECT gielda_timeout_minutes FROM settings LIMIT 1');
    const timeoutMin = (settings && settings.length > 0 && settings[0].gielda_timeout_minutes)
      ? settings[0].gielda_timeout_minutes
      : 3;

    // Znajdź zlecenia na giełdzie (status = 'market' lub 'pending' bez kierowcy)
    // które czekają dłużej niż timeout
    const overdueOrders = await safeQuery(
      `SELECT o.id, o.order_number, o.pickup_address, o.customer_phone,
              o.created_at, TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
       FROM orders o
       WHERE o.status IN ('market', 'pending', 'new')
         AND o.driver_id IS NULL
         AND TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) >= ?
       ORDER BY o.created_at ASC`,
      [timeoutMin]
    );

    if (!overdueOrders || overdueOrders.length === 0) return;

    // Dla każdego — utwórz zadanie (jeśli jeszcze nie istnieje)
    for (const order of overdueOrders) {
      const existing = await safeQuery(
        `SELECT id FROM dispatcher_tasks WHERE order_id = ? LIMIT 1`,
        [order.id]
      );
      if (existing && existing.length > 0) continue; // zadanie już istnieje (dowolny status)

      const id = generateUUID();
      const title = `Zlecenie czeka za długo na giełdzie`;
      const desc = `Adres: ${order.pickup_address || '—'}, Tel: ${order.customer_phone || '—'}`;

      await safeQuery(
        `INSERT INTO dispatcher_tasks (id, title, description, taxi_code, operator, order_id, order_number, source, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'System', ?, ?, 'system', 'new', NOW(), NOW())`,
        [id, title, desc, order.id, order.order_number]
      );
      console.log(`[GieldaCheck] Utworzono zadanie dla zlecenia ${order.order_number} (czeka ${order.waiting_minutes} min)`);
    }
  } catch (err) {
    console.error('[GieldaCheck] Error:', err.message);
  }
}

function startGieldaCheck() {
  if (gieldaCheckInterval) clearInterval(gieldaCheckInterval);
  gieldaCheckInterval = setInterval(checkGieldaTimeout, 30000); // co 30 sekund
  console.log('[GieldaCheck] Started (interval: 30s)');
}

// ────────────────────────────────────────────────────────────────────────────
// SCHEDULED ORDERS AUTO-DISPATCH — sprawdzanie co 60s czy zlecenia terminowe
// są gotowe do wydania (scheduled_dispatch_minutes przed godziną odbioru)
// ────────────────────────────────────────────────────────────────────────────
let scheduledCheckInterval = null;

async function checkScheduledOrders() {
  try {
    // Czas lokalny (Poland) — baza używa UTC w połączeniu, ale godziny zleceń są w czasie polskim
    const _nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
    const nowLocalStr = _nowLocal.getFullYear() + '-' +
      String(_nowLocal.getMonth() + 1).padStart(2, '0') + '-' +
      String(_nowLocal.getDate()).padStart(2, '0') + ' ' +
      String(_nowLocal.getHours()).padStart(2, '0') + ':' +
      String(_nowLocal.getMinutes()).padStart(2, '0') + ':' +
      String(_nowLocal.getSeconds()).padStart(2, '0');

    // Pobierz wszystkie zlecenia terminowe, których czas wydania już nadszedł:
    // scheduled_time - scheduled_dispatch_minutes <= teraz (czas lokalny PL)
    const dueOrders = await safeQuery(
      `SELECT o.id, o.order_number, o.pickup_region_id, o.customer_id,
              o.scheduled_date, o.scheduled_time, o.preference_ids,
              COALESCE(z.scheduled_dispatch_minutes, 10) AS dispatch_minutes
       FROM orders o
       LEFT JOIN zones z ON z.number = o.pickup_region_id
       WHERE o.status = 'scheduled'
         AND o.scheduled_date IS NOT NULL
         AND o.scheduled_time IS NOT NULL
         AND TIMESTAMP(o.scheduled_date, o.scheduled_time) - INTERVAL COALESCE(z.scheduled_dispatch_minutes, 10) MINUTE <= ?`,
      [nowLocalStr]
    );

    if (!dueOrders || dueOrders.length === 0) return;

    console.log(`[ScheduledCheck] ${dueOrders.length} zlecenie(ń) do wydania`);

    for (const order of dueOrders) {
      try {
        const zoneNumber = order.pickup_region_id;
        let assignedDriver = null;

        if (zoneNumber !== null && zoneNumber !== undefined) {
          // Pobierz reguły przydziału dla rejonu
          const rulesResult = await safeQuery(
            `SELECT search_zone, driver_state, step_type, radius_km FROM zone_assignment_rules
             WHERE source_zone = ? ORDER BY priority ASC`,
            [zoneNumber]
          );

          const steps = (rulesResult && rulesResult.length > 0)
            ? rulesResult.map(r => ({ searchZone: r.search_zone, driverState: r.driver_state, stepType: r.step_type ?? 'zone', radiusKm: r.radius_km ?? null }))
            : [{ searchZone: zoneNumber, driverState: 'wolna', stepType: 'zone', radiusKm: null }]; // fallback domyślny

          // Wymagane preferencje zlecenia
          let requiredPrefs = [];
          try {
            const raw = order.preference_ids;
            requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
          } catch { requiredPrefs = []; }

          // Iteruj przez kroki — przydziel pierwszego pasującego kierowcę
          for (const step of steps) {
            let drivers;
            if (step.stepType === 'radius' && step.radiusKm) {
              // Krok radiusowy — brak GPS dla scheduled orders, pomiń
              continue;
            } else {
              drivers = await safeQuery(
                `SELECT id, name, driver_code, preference_ids FROM drivers
                 WHERE driver_state = ? AND current_zone = ?
                 ${order.customer_id ? 'AND id NOT IN (SELECT driver_id FROM driver_client_blocks WHERE client_id = ?)' : ''}
                 ORDER BY free_since ASC LIMIT 20`,
                order.customer_id
                  ? [step.driverState, step.searchZone, order.customer_id]
                  : [step.driverState, step.searchZone]
              );
            }

            if (drivers && drivers.length > 0) {
              for (const d of drivers) {
                let driverPrefs = [];
                try {
                  const raw = d.preference_ids;
                  driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
                } catch { driverPrefs = []; }

                const hasAllPrefs = requiredPrefs.length === 0 ||
                  requiredPrefs.every(id => driverPrefs.includes(id));

                if (hasAllPrefs) {
                  assignedDriver = { id: d.id, name: d.name, code: d.driver_code };
                  break;
                }
              }
            }
            if (assignedDriver) break;
          }
        }

        if (assignedDriver) {
          // Przydziel kierowcę i zmień status na pending_driver
          await safeQuery(
            `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
             WHERE id = ? AND status = 'scheduled'`,
            [assignedDriver.id, order.id]
          );
          console.log(`[ScheduledCheck] Zlecenie ${order.order_number} → kierowca ${assignedDriver.code} (pending_driver)`);
        } else {
          // Brak kierowcy wg reguł — wrzuć na giełdę
          await safeQuery(
            `UPDATE orders SET status = 'market', market_at = NOW(), updated_at = NOW()
             WHERE id = ? AND status = 'scheduled'`,
            [order.id]
          );
          console.log(`[ScheduledCheck] Zlecenie ${order.order_number} → brak kierowcy, status: market`);
        }
      } catch (orderErr) {
        console.error(`[ScheduledCheck] Błąd dla zlecenia ${order.order_number}:`, orderErr.message);
      }
    }
  } catch (err) {
    console.error('[ScheduledCheck] Error:', err.message);
  }
}

function startScheduledCheck() {
  if (scheduledCheckInterval) clearInterval(scheduledCheckInterval);
  scheduledCheckInterval = setInterval(checkScheduledOrders, 60000); // co 60 sekund
  console.log('[ScheduledCheck] Started (interval: 60s)');
  // Uruchom natychmiast przy starcie
  checkScheduledOrders();
}

// ============================================================================
// MAINTENANCE JOBS — offline kierowcy + timeout zleceń
// ============================================================================

async function checkOfflineDrivers() {
  try {
    const rows = await safeQuery(
      `SELECT id, driver_code FROM drivers
       WHERE driver_state IS NOT NULL
         AND last_seen IS NOT NULL
         AND last_seen < NOW() - INTERVAL 240 SECOND`
    );
    for (const d of rows) {
      await safeQuery(
        `UPDATE drivers SET driver_state = NULL, current_zone = NULL, is_online = 0,
                            queue_position = NULL, free_since = NULL
         WHERE id = ?`,
        [d.id]
      );
      addDriverLog(d.id, 'offline_auto', `Rozłączony automatycznie (brak aktywności przez 240s)`,
        'Stan zresetowany do: DOM', { powod: 'timeout_polaczenia' }
      );
      console.log(`[OfflineCheck] ${d.driver_code} → DOM (brak połączenia 240s)`);
    }
  } catch (err) {
    console.error('[OfflineCheck] Error:', err.message);
  }
}

async function checkPendingDriverTimeout() {
  try {
    // Pobierz przeterminowane zlecenia z danymi kierowcy i rejonu
    const timedOut = await safeQuery(
      `SELECT o.id, o.driver_id, o.pickup_region_id, d.driver_code, d.name AS driver_name
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.status = 'pending_driver'
         AND o.updated_at < NOW() - INTERVAL 15 SECOND`
    );
    if (!timedOut || timedOut.length === 0) return;

    for (const order of timedOut) {
      const { id: orderId, driver_id: driverId, pickup_region_id: regionId, driver_code, driver_name } = order;

      // Oznacz kierowcę jako zajęta (za prześpienie zlecenia)
      if (driverId) {
        await safeQuery(
          `UPDATE drivers SET driver_state = 'zajeta' WHERE id = ?`,
          [driverId]
        );
        await addOrderLog(orderId, 'timeout',
          `Kierowca ${driver_code} (${driver_name}) nie odpowiedział w ciągu 15s — stan zmieniony na: zajęta`,
          { kierowca_id: driverId, kierowca_kod: driver_code, kierowca_nazwa: driver_name, nowy_stan: 'zajeta' }
        );
        addDriverLog(driverId, 'order_timeout', `Nie odpowiedział na zlecenie w ciągu 15s`,
          `Stan zmieniony automatycznie na: Zajęta`,
          { zlecenie_id: orderId, nowy_stan: 'zajeta' }
        );
        console.log(`[PendingTimeout] Kierowca ${driver_code} → zajeta (timeout zlecenia ${orderId})`);
      }

      // Szukaj kolejnego kierowcy lub zastosuj fallback
      if (regionId != null) {
        await redispatchOrder(orderId, regionId, driverId || '');
      } else {
        await safeQuery(
          `UPDATE orders SET status = 'pending', driver_id = NULL, updated_at = NOW() WHERE id = ?`,
          [orderId]
        );
        await addOrderLog(orderId, 'dispatch',
          `Brak rejonu — zlecenie przeniesione do oczekujących po timeout`,
          { powod: 'brak_rejonu_po_timeout' }
        );
        console.log(`[PendingTimeout] Order ${orderId} → pending (brak rejonu)`);
      }
    }
  } catch (err) {
    console.error('[PendingTimeout] Error:', err.message);
  }
}

let maintenanceInterval = null;
let pendingTimeoutInterval = null;

function startMaintenance() {
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  if (pendingTimeoutInterval) clearInterval(pendingTimeoutInterval);

  maintenanceInterval = setInterval(checkOfflineDrivers, 30000);
  pendingTimeoutInterval = setInterval(checkPendingDriverTimeout, 15000);

  console.log('[Maintenance] Started (offline: 30s, pendingTimeout: 15s)');
  // Uruchom natychmiast przy starcie
  checkOfflineDrivers();
  checkPendingDriverTimeout();
}

// ============================================================================
// GIEŁDA REJESTRACJE — kierowcy zgłaszają chęć przyjęcia zlecenia z giełdy
// ============================================================================

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/gielda/register — kierowca zgłasza chęć przyjęcia zleceń z giełdy
app.get('/api/gielda/driver-registrations/:driverId', async (req, res) => {
  const { driverId } = req.params;
  try {
    const rows = await safeQuery(
      `SELECT gr.order_id FROM gielda_registrations gr
       JOIN orders o ON o.id = gr.order_id
       WHERE gr.driver_id = ? AND o.status = 'market'`,
      [driverId]
    );
    return res.json({ success: true, orderIds: (rows ?? []).map(r => r.order_id) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gielda/register', async (req, res) => {
  const { driverId, orderIds } = req.body;
  if (!driverId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Brak driverId lub orderIds' });
  }
  try {
    // Sprawdź czy giełda jest włączona
    const settings = await safeQuery('SELECT gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to FROM settings LIMIT 1');
    const gieldaEnabled = settings?.[0]?.gielda_enabled != null ? settings[0].gielda_enabled : 1;
    if (!gieldaEnabled) {
      return res.json({ success: false, error: 'disabled' });
    }
    // Sprawdź godziny pracy giełdy
    const hoursEnabled = settings?.[0]?.gielda_hours_enabled;
    if (hoursEnabled) {
      const from = settings?.[0]?.gielda_hours_from ?? '00:00';
      const to   = settings?.[0]?.gielda_hours_to   ?? '23:59';
      const now  = new Date();
      const cur  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const open = from <= to
        ? (cur >= from && cur < to)
        : (cur >= from || cur < to);
      if (!open) {
        return res.json({ success: false, error: 'outside_hours', hoursFrom: from, hoursTo: to });
      }
    }
    const registrationSeconds = settings?.[0]?.gielda_registration_seconds ?? 15;

    // Sprawdź czy kierowca nie ma już aktywnej rejestracji na inne zlecenie
    const existingReg = await safeQuery(
      `SELECT gr.order_id FROM gielda_registrations gr
       JOIN orders o ON o.id = gr.order_id
       WHERE gr.driver_id = ? AND o.status = 'market' LIMIT 1`,
      [driverId]
    );
    if (existingReg && existingReg.length > 0) {
      return res.json({ success: false, error: 'already_registered', orderId: existingReg[0].order_id });
    }

    // Pobierz lokalizację i preferencje kierowcy
    const driverRows = await safeQuery('SELECT latitude, longitude, preference_ids, driver_code FROM drivers WHERE id = ?', [driverId]);
    const driverLat = driverRows?.[0]?.latitude ?? null;
    const driverLng = driverRows?.[0]?.longitude ?? null;
    const driverCode = driverRows?.[0]?.driver_code ?? driverId;
    let driverPrefs = [];
    try {
      const raw = driverRows?.[0]?.preference_ids;
      driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { driverPrefs = []; }

    // Dla każdego zlecenia sprawdź preferencje i odległość
    for (const orderId of orderIds) {
      const orderRows = await safeQuery(
        'SELECT pickup_lat, pickup_lng, pickup_region_id, preference_ids, customer_id FROM orders WHERE id = ? AND status = \'market\'',
        [orderId]
      );
      if (!orderRows || orderRows.length === 0) continue;
      const order = orderRows[0];

      // Sprawdź czy kierowca spełnia wymagane preferencje zlecenia
      let requiredPrefs = [];
      try {
        const raw = order.preference_ids;
        requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      } catch { requiredPrefs = []; }
      if (requiredPrefs.length > 0) {
        const hasAllPrefs = requiredPrefs.every(id => driverPrefs.includes(id));
        if (!hasAllPrefs) {
          return res.json({ success: false, error: 'preferences_not_met' });
        }
      }

      // Sprawdź limit odległości dla rejonu
      if (order.pickup_region_id != null && driverLat != null && order.pickup_lat != null) {
        const zoneSettings = await safeQuery(
          'SELECT gielda_max_distance_km FROM zone_settings WHERE source_zone = ?',
          [order.pickup_region_id]
        );
        const maxDist = zoneSettings?.[0]?.gielda_max_distance_km ?? null;
        if (maxDist != null) {
          const dist = haversineKm(driverLat, driverLng, order.pickup_lat, order.pickup_lng);
          if (dist > maxDist) {
            return res.json({
              success: false,
              error: 'too_far',
              distance: Math.round(dist * 10) / 10,
              maxDistance: maxDist,
            });
          }
        }
      }

      // Sprawdź blokadę kierowca ↔ klient
      if (order.customer_id) {
        const blockRows = await safeQuery(
          'SELECT 1 FROM driver_client_blocks WHERE driver_id=? AND client_id=? LIMIT 1',
          [driverId, order.customer_id]
        );
        if (blockRows && blockRows.length > 0) {
          return res.json({ success: false, error: 'blocked' });
        }
      }

      // Jeśli czas rejestracji = 0 → bezpośrednie przypisanie
      if (registrationSeconds === 0) {
        await safeQuery(
          `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
           WHERE id = ? AND status = 'market'`,
          [driverId, orderId]
        );
        await safeQuery('DELETE FROM gielda_registrations WHERE order_id = ?', [orderId]);
        console.log(`[GieldaRegister] Direct assign order ${orderId} → driver ${driverId}`);
        await addOrderLog(orderId, 'gielda',
          `Giełda: bezpośredni przydział do kierowcy ${driverId} (czas rejestracji = 0)`,
          { kierowca_id: driverId, tryb: 'direct' }
        );
        addDriverLog(driverId, 'gielda_assigned', `Przydzielono zlecenie z giełdy (bezpośrednio)`,
          `Zlecenie #${orderId}`, { zlecenie_id: orderId, tryb: 'direct' }
        );
        // Push notification — bezpośredni przydział
        const orderForPush = await safeQuery('SELECT pickup_address FROM orders WHERE id = ?', [orderId]);
        await sendPushToDriver(driverId, {
          title: '🔔 Nowe zlecenie',
          body: `Odbiór: ${orderForPush?.[0]?.pickup_address || '—'}`,
          url: '/driver'
        });
      } else {
        // Rejestracja z timerem
        await safeQuery(
          `INSERT INTO gielda_registrations (order_id, driver_id, driver_lat, driver_lng)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE driver_lat = VALUES(driver_lat), driver_lng = VALUES(driver_lng), registered_at = NOW()`,
          [orderId, driverId, driverLat, driverLng]
        );
        console.log(`[GieldaRegister] Registered driver ${driverId} for order ${orderId}`);
        await addOrderLog(orderId, 'gielda',
          `Giełda: kierowca ${driverCode} zgłosił się do zlecenia (oczekuje na rozstrzygnięcie)`,
          { kierowca_id: driverId, tryb: 'registration' }
        );
        addDriverLog(driverId, 'gielda_register', `Zgłosił się do zlecenia na giełdzie`,
          `Zlecenie #${orderId} — oczekuje na rozstrzygnięcie`, { zlecenie_id: orderId }
        );
      }
    }

    return res.json({ success: true, message: registrationSeconds === 0 ? 'assigned' : 'registered' });
  } catch (err) {
    console.error('[GieldaRegister] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Background job — przydziel zlecenia z giełdy po upłynięciu czasu rejestracji
let gieldaRegistrationsInterval = null;
// Cache ustawień — odświeżaj co 30s
let _gieldaRegSecCache = null;
let _gieldaRegSecCacheAt = 0;
let _gieldaPriorityOrderCache = 'wolna,kursem,dojazd,zajeta';

// ── Push notifications helper ─────────────────────────────────────────────────
async function sendPushToDriver(driverId, payload) {
  if (!webpush || !VAPID_PUBLIC || !VAPID_PRIVATE) return; // Push wyłączony — brak web-push lub VAPID
  try {
    const subs = await safeQuery(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE driver_id = ?',
      [driverId]
    );
    if (!subs || subs.length === 0) return;
    const notification = JSON.stringify(payload);
    for (const sub of subs) {
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification
      ).catch(e => {
        // Wygasła subskrypcja — usuń
        if (e.statusCode === 410 || e.statusCode === 404) {
          safeQuery('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]).catch(() => {});
        }
      });
    }
  } catch (e) {
    console.error('[Push] sendPushToDriver error:', e.message);
  }
}

async function checkGieldaRegistrations() {
  try {
    const now = Date.now();
    // Odśwież cache co 30 sekund
    if (_gieldaRegSecCache === null || now - _gieldaRegSecCacheAt > 30000) {
      const settings = await safeQuery('SELECT gielda_registration_seconds, gielda_priority_order FROM settings LIMIT 1');
      _gieldaRegSecCache = settings?.[0]?.gielda_registration_seconds ?? 15;
      _gieldaPriorityOrderCache = settings?.[0]?.gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta';
      _gieldaRegSecCacheAt = now;
    }
    const registrationSeconds = _gieldaRegSecCache;
    // Czas 0 = bezpośrednie przypisanie w /api/gielda/register, tu nie ma nic do robienia
    if (registrationSeconds === 0) return;

    // Znajdź zlecenia gotowe do przydziału (timer upłynął)
    const readyOrders = await safeQuery(
      `SELECT id, pickup_lat, pickup_lng, preference_ids, customer_id FROM orders
       WHERE status = 'market' AND market_at IS NOT NULL
         AND TIMESTAMPDIFF(SECOND, market_at, NOW()) >= ?`,
      [registrationSeconds]
    );
    if (!readyOrders || readyOrders.length === 0) return;

    // Zbuduj mapę priorytetów z cache
    const priorityList = _gieldaPriorityOrderCache.split(',').map(s => s.trim());
    const priorityIndex = state => {
      const i = priorityList.indexOf(state);
      return i === -1 ? priorityList.length : i; // nieznane statusy → na koniec
    };

    for (const order of readyOrders) {
      // Pobierz zarejestrowanych kierowców + ich aktualny status i preferencje
      const regs = await safeQuery(
        `SELECT gr.driver_id, gr.driver_lat, gr.driver_lng, d.driver_state, d.driver_code, d.name AS driver_name, d.preference_ids
         FROM gielda_registrations gr
         LEFT JOIN drivers d ON d.id = gr.driver_id
         WHERE gr.order_id = ?`,
        [order.id]
      );
      if (!regs || regs.length === 0) continue;

      // Wyodrębnij wymagane preferencje zlecenia i odfiltruj kierowców którzy ich nie spełniają
      let requiredPrefs = [];
      try {
        const raw = order.preference_ids;
        requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      } catch { requiredPrefs = []; }
      // Wczytaj blokady dla tego zlecenia (klienta)
      let gieldaBlockSet = new Set();
      if (order.customer_id) {
        const gieldaBlocks = await safeQuery('SELECT driver_id FROM driver_client_blocks WHERE client_id=?', [order.customer_id]) ?? [];
        gieldaBlockSet = new Set(gieldaBlocks.map(b => b.driver_id));
      }

      const eligibleRegs = regs.filter(r => {
        // Blokada
        if (gieldaBlockSet.has(r.driver_id)) return false;
        // Preferencje
        if (requiredPrefs.length === 0) return true;
        let driverPrefs = [];
        try {
          const raw = r.preference_ids;
          driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch { driverPrefs = []; }
        return requiredPrefs.every(id => driverPrefs.includes(id));
      });
      if (!eligibleRegs || eligibleRegs.length === 0) continue;

      // Sortuj: najpierw wg priorytetu statusu, remis → odległość GPS
      const sorted = eligibleRegs
        .map(r => ({
          id: r.driver_id,
          code: r.driver_code,
          name: r.driver_name,
          state: r.driver_state,
          pri: priorityIndex(r.driver_state),
          dist: (order.pickup_lat != null && r.driver_lat != null)
            ? Math.round(haversineKm(r.driver_lat, r.driver_lng, order.pickup_lat, order.pickup_lng) * 10) / 10
            : null,
        }))
        .sort((a, b) => a.pri - b.pri || (a.dist ?? Infinity) - (b.dist ?? Infinity));

      const best = sorted[0];
      const bestDriverId = best.id;

      // Log: wszyscy kandydaci
      await addOrderLog(order.id, 'gielda',
        `Giełda: rozstrzygnięcie — ${sorted.length} kandydat${sorted.length === 1 ? '' : sorted.length < 5 ? 'ów' : 'ów'}, kolejność priorytetów: ${priorityList.join(' > ')}`,
        {
          priorytet: priorityList,
          kandydaci: sorted.map((d, i) => ({
            poz: i + 1,
            kierowca: d.code,
            nazwa: d.name,
            stan: d.state,
            odleglosc_km: d.dist,
          })),
          wybrany: { kierowca: best.code, nazwa: best.name, stan: best.state, odleglosc_km: best.dist }
        }
      );

      // Przydziel zlecenie
      const result = await safeQuery(
        `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW()
         WHERE id = ? AND status = 'market'`,
        [bestDriverId, order.id]
      );
      if (result?.affectedRows > 0) {
        await safeQuery('DELETE FROM gielda_registrations WHERE order_id = ?', [order.id]);
        await addOrderLog(order.id, 'gielda',
          `Giełda: zlecenie przydzielono kierowcy ${best.code} (${best.name}) — stan: ${best.state}, odległość: ${best.dist != null ? best.dist + ' km' : 'nieznana'}`,
          { kierowca_id: bestDriverId, kierowca_kod: best.code, kierowca_nazwa: best.name, stan: best.state, odleglosc_km: best.dist }
        );
        addDriverLog(bestDriverId, 'gielda_assigned', `Wygrał rozstrzygnięcie giełdy — zlecenie przydzielone`,
          `Zlecenie #${order.order_number ?? order.id} · Odległość: ${best.dist != null ? best.dist + ' km' : '?'} · Stan: ${best.state}`,
          { zlecenie_id: order.id, numer_zlecenia: order.order_number, odleglosc_km: best.dist, stan: best.state, liczba_kandydatow: sorted.length }
        );
        console.log(`[GieldaRegistrations] Order ${order.id} → driver ${best.code} (priorytet: ${priorityList.join('>')})`);
        // Push notification do kierowcy
        await sendPushToDriver(bestDriverId, {
          title: '🔔 Nowe zlecenie',
          body: `Odbiór: ${order.pickup_address || '—'}`,
          url: '/driver'
        });
      }
    }
  } catch (err) {
    console.error('[GieldaRegistrations] Error:', err.message);
  }
}

function startGieldaRegistrations() {
  if (gieldaRegistrationsInterval) clearInterval(gieldaRegistrationsInterval);
  gieldaRegistrationsInterval = setInterval(checkGieldaRegistrations, 5000);
  console.log('[GieldaRegistrations] Started (interval: 5s)');
  checkGieldaRegistrations();
}

// POST /api/migrate — uruchom migracje z panelu wsparcia
app.post('/api/migrate', async (req, res) => {
  console.log('[Migrate] Manual migration requested');
  try {
    const report = await runMigrationsWithReport();
    console.log('[Migrate] Done. Created:', report.tablesCreated, 'Columns:', report.columnsAdded);
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('[Migrate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── TTS — edge-tts (pip install edge-tts) ──────────────────────────────────
app.post('/api/tts', (req, res) => {
  const { text, voice = 'pl-PL-ZofiaNeural' } = req.body;
  if (!text) return res.status(400).json({ error: 'Brak tekstu' });

  // Sanityzacja: usuń cudzysłowy i znaki sterujące
  const safeText = text.replace(/["\\]/g, "'").replace(/[\r\n]/g, ' ').trim().slice(0, 500);
  const safeVoice = String(voice).replace(/[^a-zA-Z0-9-]/g, '');
  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  const proc = spawn(
    'python', ['-m', 'edge_tts', '--voice', safeVoice, '--text', safeText, '--write-media', tmpFile],
    { windowsHide: true }
  );
  proc.on('error', (err) => {
    console.error('[TTS] spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'edge-tts niedostępne' });
  });
  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('[TTS] edge-tts exit code:', code);
      if (!res.headersSent) res.status(500).json({ error: 'edge-tts error code: ' + code });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(tmpFile, () => {}));
    stream.on('error', (e) => {
      console.error('[TTS] Stream error:', e.message);
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) res.status(500).json({ error: 'Błąd odczytu audio' });
    });
  });
});

// ── Driver queries ──────────────────────────────────────────────────────────
app.post('/api/driver-queries', async (req, res) => {
  const { driver_id, question } = req.body;
  if (!driver_id || !question) return res.status(400).json({ success: false, error: 'driver_id i question są wymagane' });
  try {
    await safeQuery(
      `INSERT INTO driver_queries (id, driver_id, question, status, created_at) VALUES (UUID(), ?, ?, 'pending', NOW())`,
      [driver_id, question]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[DriverQueries] POST error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/driver-queries/recent-answers', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT driver_id, answer, status, created_at, answered_at
       FROM driver_queries
       WHERE created_at >= NOW() - INTERVAL 60 MINUTE
       ORDER BY created_at DESC`
    );
    res.json({ success: true, answers: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.error('[DriverQueries] recent-answers error:', e.message);
    res.status(500).json({ success: false, answers: [] });
  }
});

app.get('/api/driver-queries/:driverId/pending', async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT * FROM driver_queries WHERE driver_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [req.params.driverId]
    );
    const query = Array.isArray(rows) ? rows[0] : null;
    res.json({ success: true, query: query ?? null });
  } catch (e) {
    console.error('[DriverQueries] pending error:', e.message);
    res.status(500).json({ success: false, query: null, error: e.message });
  }
});

app.post('/api/driver-queries/:queryId/respond', async (req, res) => {
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ success: false, error: 'answer jest wymagany' });
  try {
    await safeQuery(
      `UPDATE driver_queries SET answer = ?, status = 'answered', answered_at = NOW() WHERE id = ?`,
      [answer, req.params.queryId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[DriverQueries] respond error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================================
// GRACEFUL SHUTDOWN — zamknij pool przed wyjściem, by MySQL zwolnił sloty
// ============================================================================
async function gracefulShutdown(signal) {
  console.log(`[Server] ${signal} received — closing gracefully...`);
  // Zatrzymaj health check żeby nie blokował zamknięcia
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  // Zamknij pool — to wysyła FIN do MySQL i natychmiast zwalnia sloty połączeń
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

    // Pomocnicza funkcja: inicjuj DB i uruchom background-jobs
    const initDbAndJobs = async () => {
      await runMigrations();
      if (!healthCheckInterval) startHealthCheck();
      if (typeof startGieldaCheck === 'function' && !gieldaCheckInterval) startGieldaCheck();
      if (typeof startGieldaRegistrations === 'function' && !gieldaRegistrationsInterval) startGieldaRegistrations();
      if (typeof startScheduledCheck === 'function') startScheduledCheck();
      if (typeof startAutoDispatch === 'function' && !autoDispatchInterval) startAutoDispatch();
      if (typeof startMaintenance === 'function') startMaintenance();
    };

    // Spróbuj od razu; jeśli nie wyjdzie — retry co 15s
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

    // ═══════════════════════════════════════════════════════════════════════
    // ASTERISK MANAGEMENT ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════

    const ASTERISK_CONF_DIR = '/etc/asterisk';
    const ASTERISK_LOG_FILE = '/var/log/asterisk/messages';
    const ALLOWED_CONF_FILES = ['sip','pjsip','extensions','queues','manager','cdr','cdr_mysql','cdr_csv','logger','asterisk','musiconhold','voicemail','features','rtp','iax','http','indications'];

    function runShell(cmd) {
      return new Promise((resolve) => {
        const proc = spawn('sh', ['-c', cmd], { timeout: 30000 });
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
        proc.on('error', err => resolve({ code: -1, stdout: '', stderr: err.message }));
      });
    }

    function amiCommand(host, port, username, secret, action, extraFields = {}) {
      return new Promise((resolve) => {
        const client = new net.Socket();
        let buffer = '';
        let done = false;
        const finish = (result) => { if (!done) { done = true; client.destroy(); resolve(result); } };
        client.setTimeout(8000);
        client.connect(port || 5038, host || '127.0.0.1', () => {
          let msg = `Action: Login\r\nUsername: ${username}\r\nSecret: ${secret}\r\n\r\nAction: ${action}\r\n`;
          for (const [k, v] of Object.entries(extraFields)) msg += `${k}: ${v}\r\n`;
          msg += '\r\n';
          client.write(msg);
        });
        client.on('data', d => { buffer += d.toString(); if (buffer.split('\r\n\r\n').length > 2) finish({ success: true, data: buffer }); });
        client.on('timeout', () => finish({ success: false, error: 'AMI timeout' }));
        client.on('error', e => finish({ success: false, error: e.message }));
      });
    }

    // GET /api/asterisk/status
    app.get('/api/asterisk/status', async (req, res) => {
      try {
        const [installed, running, version] = await Promise.all([
          runShell('which asterisk 2>/dev/null && echo "yes" || echo "no"'),
          runShell('systemctl is-active asterisk 2>/dev/null || echo "inactive"'),
          runShell('asterisk -V 2>/dev/null || echo ""'),
        ]);
        res.json({
          success: true,
          installed: installed.stdout.includes('yes') || installed.stdout.includes('/asterisk'),
          running: running.stdout.trim() === 'active',
          version: version.stdout.trim(),
          status: running.stdout.trim(),
        });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    // POST /api/asterisk/service  { action: 'start'|'stop'|'restart'|'reload' }
    app.post('/api/asterisk/service', async (req, res) => {
      const { action } = req.body;
      if (!['start','stop','restart','reload'].includes(action)) return res.json({ success: false, error: 'Invalid action' });
      const cmd = action === 'reload' ? 'asterisk -rx "core reload"' : `systemctl ${action} asterisk`;
      const result = await runShell(cmd);
      res.json({ success: result.code === 0, stdout: result.stdout, stderr: result.stderr, code: result.code });
    });

    // POST /api/asterisk/install/step  { step: 'update'|'install'|'modules'|'enable'|'start'|'status' }
    app.post('/api/asterisk/install/step', async (req, res) => {
      const { step } = req.body;
      const commands = {
        update:  'DEBIAN_FRONTEND=noninteractive apt-get update 2>&1',
        install: 'DEBIAN_FRONTEND=noninteractive apt-get install -y asterisk 2>&1',
        modules: 'DEBIAN_FRONTEND=noninteractive apt-get install -y asterisk-modules asterisk-config 2>&1',
        enable:  'systemctl enable asterisk 2>&1',
        start:   'systemctl start asterisk 2>&1',
        status:  'systemctl status asterisk --no-pager 2>&1',
      };
      if (!commands[step]) return res.json({ success: false, error: 'Unknown step' });
      const result = await runShell(commands[step]);
      res.json({ success: result.code === 0, stdout: result.stdout, stderr: result.stderr, code: result.code });
    });

    // GET /api/asterisk/config/:file
    app.get('/api/asterisk/config/:file', async (req, res) => {
      const name = req.params.file.replace(/[^a-z0-9_-]/gi, '');
      if (!ALLOWED_CONF_FILES.includes(name)) return res.json({ success: false, error: 'File not allowed' });
      const path = `${ASTERISK_CONF_DIR}/${name}.conf`;
      try {
        const content = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
        res.json({ success: true, content });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    // POST /api/asterisk/config/:file  { content: string }
    app.post('/api/asterisk/config/:file', async (req, res) => {
      const name = req.params.file.replace(/[^a-z0-9_-]/gi, '');
      if (!ALLOWED_CONF_FILES.includes(name)) return res.json({ success: false, error: 'File not allowed' });
      const { content } = req.body;
      if (typeof content !== 'string') return res.json({ success: false, error: 'No content' });
      const path = `${ASTERISK_CONF_DIR}/${name}.conf`;
      try {
        // backup
        if (fs.existsSync(path)) fs.copyFileSync(path, `${path}.bak`);
        fs.writeFileSync(path, content, 'utf8');
        res.json({ success: true });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    // GET /api/asterisk/log?lines=200
    app.get('/api/asterisk/log', async (req, res) => {
      const lines = Math.min(parseInt(req.query.lines) || 200, 1000);
      try {
        const result = await runShell(`tail -n ${lines} ${ASTERISK_LOG_FILE} 2>/dev/null || echo "(brak logów — Asterisk nie zainstalowany lub plik nieistnieje)"`);
        res.json({ success: true, log: result.stdout });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    // GET /api/asterisk/channels  — aktywne kanały przez CLI
    app.get('/api/asterisk/channels', async (req, res) => {
      try {
        const [channels, peers] = await Promise.all([
          runShell('asterisk -rx "core show channels concise" 2>/dev/null || echo ""'),
          runShell('asterisk -rx "sip show peers" 2>/dev/null || echo ""'),
        ]);
        res.json({ success: true, channels: channels.stdout, peers: peers.stdout });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    // POST /api/asterisk/cli  { command: string }  — dowolna komenda Asterisk CLI
    app.post('/api/asterisk/cli', async (req, res) => {
      const { command } = req.body;
      if (!command || typeof command !== 'string') return res.json({ success: false, error: 'No command' });
      const safe = command.replace(/[`$(){}|;&<>]/g, '').slice(0, 200);
      const result = await runShell(`asterisk -rx "${safe}" 2>&1`);
      res.json({ success: true, output: result.stdout, stderr: result.stderr });
    });

    // GET /api/asterisk/cdr?limit=100
    app.get('/api/asterisk/cdr', async (req, res) => {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      try {
        // Spróbuj z bazy, jeśli nie to z pliku CSV
        const dbResult = await safeQuery(`SELECT calldate,clid,src,dst,dcontext,channel,dstchannel,lastapp,lastdata,duration,billsec,disposition,amaflags,accountcode,uniqueid,userfield FROM cdr ORDER BY calldate DESC LIMIT ?`, [limit]).catch(() => null);
        if (dbResult && dbResult.length > 0) {
          return res.json({ success: true, source: 'db', cdr: dbResult });
        }
        // Fallback: plik CSV
        const csvResult = await runShell(`tail -n ${limit} /var/log/asterisk/cdr-csv/Master.csv 2>/dev/null || echo ""`);
        res.json({ success: true, source: 'csv', cdr: csvResult.stdout });
      } catch (e) {
        res.json({ success: false, error: e.message });
      }
    });

    console.log('[Asterisk] Routes zarejestrowane');

    app.listen(PORT, () => {
      console.log(`\n📡 API Server running on http://localhost:${PORT}`);
      console.log(`📊 Database: ${process.env.MYSQL_DATABASE || process.env.VITE_MYSQL_DATABASE || 'sql7817074'}`);
      console.log(`🚀 Ready to handle requests (DB connecting in background...)\n`);
      // DB init + background jobs uruchamiane w tryConnectDb() powyżej
    });
  } catch (error) {
    console.error('[Server] Failed to start HTTP server:', error);
    process.exit(1);
  }
}

// (Duplicate graceful shutdown handlers removed — handlers already registered above at gracefulShutdown)

start();
