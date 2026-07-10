import mysql from 'mysql2/promise';

// ============================================================================
// MySQL Pool - główna konfiguracja bazy danych
// ============================================================================
let pool;

export function getPool() {
  return pool;
}

export async function initializePool() {
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

// Pobierz połączenie z TWARDYM timeoutem - nigdy nie wisi w nieskończoność
// WAŻNE: poprawna implementacja bez wycieku połączeń.
export async function getConnectionWithTimeout(timeoutMs = 5000) {
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

export async function reconnectPool() {
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

let lastDbActivityTime = 0;
export function getLastDbActivityTime() {
  return lastDbActivityTime;
}

// Bezpieczne wykonanie zapytania z auto-reconnect
export async function safeQuery(sql, params = []) {
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
let healthCheckInterval = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

export function isHealthCheckRunning() {
  return !!healthCheckInterval;
}

export async function checkDatabaseHealth() {
  try {
    // Pomiń ping jeśli baza była aktywna w ciągu ostatnich 3,5s
    if (Date.now() - lastDbActivityTime < 3500) {
      return true;
    }

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

export function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Ping co 4 sekundy - FreeSQLDatabase zamyka idle po ~8s, więc 4s z marginesem
  healthCheckInterval = setInterval(async () => {
    await checkDatabaseHealth();
  }, 4000);

  console.log('[Ping] Started (interval: 4s - keeps FreeSQLDatabase alive)');
}

export function clearHealthCheckInterval() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
