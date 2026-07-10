import mysql from 'mysql2/promise';

let pool = null;
let healthCheckInterval = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
let lastDbActivityTime = 0;

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
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
    connectTimeout: 15000,
    timezone: '+00:00',
  });

  console.log('[MySQL Pool] Pool initialized successfully');
  return pool;
}

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
          conn.release();
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
      try { await pool.end(); } catch { /* ignore */ }
      pool = null;
    }
    await initializePool();
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

export async function safeQuery(sql, params = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const connection = await getConnectionWithTimeout();
      try {
        const [result] = await connection.query(sql, params);
        connection.release();
        lastDbActivityTime = Date.now();
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
        error.message?.includes('getConnection timeout');

      if (isConnectionError && attempt < 2) {
        console.log(`[safeQuery] Connection error (attempt ${attempt + 1}/3): ${error.code || error.message} — reconnecting...`);
        await reconnectPool();
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw error;
    }
  }
}

async function checkDatabaseHealth() {
  try {
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

  healthCheckInterval = setInterval(async () => {
    await checkDatabaseHealth();
  }, 4000);

  console.log('[Ping] Started (interval: 4s - keeps FreeSQLDatabase alive)');
}

export async function closePool() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  if (pool) {
    try {
      await pool.end();
      console.log('[Server] DB pool closed cleanly — MySQL slots freed');
    } catch (e) {
      console.error('[Server] Error closing pool:', e.message);
    }
    pool = null;
  }
}

export function poolReadyMiddleware(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not initialized',
    });
  }
  next();
}
