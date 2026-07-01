/**
 * simulate-drivers.js
 * Symuluje aktywność 100 testowych kierowców (ruch + zmiany statusów).
 * Uruchom: node simulate-drivers.js
 * Zatrzymaj: Ctrl+C
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT || '3306'),
  user:     process.env.MYSQL_USER     || 'duocab',
  password: process.env.MYSQL_PASSWORD || '68233177',
  database: process.env.MYSQL_DATABASE || 'duocab',
  charset:  'utf8mb4',
});

// Warszawa — centrum + obszary
const CENTER_LAT = 52.2297, CENTER_LNG = 21.0122;

// Prędkość losowego chodu — max ~0.0005° ≈ 50 m na tick
const MAX_DRIFT = 0.0004;

// Stan każdego kierowcy w pamięci
const drivers = {};

// Jak często [ms] zmieniać lokalizację
const LOCATION_INTERVAL = 3000;
// Jak często [ms] losowo zmieniać status
const STATUS_INTERVAL = 15000;

const ACTIVE_STATUSES = ['free', 'active', 'driving', 'pickup'];
const STATES_BY_STATUS = {
  free:    ['wolna'],
  active:  ['wolna', 'dojazd', 'kursem'],
  driving: ['kursem', 'zajeta'],
  pickup:  ['dojazd'],
};

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function drift() { return (Math.random() - 0.5) * 2 * MAX_DRIFT; }
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function loadDrivers() {
  const [rows] = await pool.query(
    `SELECT id, driver_code, status, driver_state, latitude, longitude
     FROM drivers WHERE driver_code REGEXP '^T[0-9]{3}$'`
  );
  for (const row of rows) {
    drivers[row.id] = {
      id:     row.id,
      code:   row.driver_code,
      status: row.status || 'active',
      state:  row.driver_state || 'wolna',
      lat:    row.latitude  || CENTER_LAT + (Math.random() - 0.5) * 0.2,
      lng:    row.longitude || CENTER_LNG + (Math.random() - 0.5) * 0.2,
    };
  }
  console.log(`🚕 Załadowano ${Object.keys(drivers).length} kierowców testowych.\n`);
}

async function updateLocations() {
  const conn = await pool.getConnection();
  try {
    for (const d of Object.values(drivers)) {
      if (!ACTIVE_STATUSES.includes(d.status)) continue;

      // losowy ruch
      d.lat = clamp(d.lat + drift(), 52.05, 52.40);
      d.lng = clamp(d.lng + drift(), 20.75, 21.30);

      await conn.query(
        `UPDATE drivers SET latitude=?, longitude=?, last_location_update=NOW(), last_seen=NOW(), is_online=1 WHERE id=?`,
        [d.lat, d.lng, d.id]
      );
    }
    process.stdout.write(`[${new Date().toLocaleTimeString()}] 📍 Lokalizacje zaktualizowane (${Object.keys(drivers).length} kierowców)\r`);
  } finally {
    conn.release();
  }
}

async function updateStatuses() {
  const conn = await pool.getConnection();
  try {
    let changed = 0;
    for (const d of Object.values(drivers)) {
      // ~20% szansa na zmianę statusu
      if (Math.random() > 0.20) continue;

      // losowy nowy status
      const newStatus = rand(ACTIVE_STATUSES);
      const newState  = rand(STATES_BY_STATUS[newStatus] || ['wolna']);

      d.status = newStatus;
      d.state  = newState;

      await conn.query(
        `UPDATE drivers SET status=?, driver_state=?, status_changed_at=NOW(), updated_at=NOW() WHERE id=?`,
        [newStatus, newState, d.id]
      );
      changed++;
    }
    if (changed > 0) {
      console.log(`\n[${new Date().toLocaleTimeString()}] 🔄 Zmieniono statusy: ${changed} kierowców`);
    }
  } finally {
    conn.release();
  }
}

// ── Stats co 30s ───────────────────────────────────────────────────────────────
async function printStats() {
  const [rows] = await pool.query(
    `SELECT status, driver_state, COUNT(*) as cnt
     FROM drivers WHERE driver_code REGEXP '^T[0-9]{3}$'
     GROUP BY status, driver_state ORDER BY cnt DESC`
  );
  console.log('\n──────────────────────────────────');
  console.log('  STATUS         STATE      LICZBA');
  console.log('──────────────────────────────────');
  for (const r of rows) {
    const s = (r.status || '').padEnd(14);
    const st = (r.driver_state || '—').padEnd(10);
    console.log(`  ${s} ${st} ${r.cnt}`);
  }
  console.log('──────────────────────────────────\n');
}

async function main() {
  await loadDrivers();

  if (Object.keys(drivers).length === 0) {
    console.error('❌ Brak kierowców testowych! Najpierw uruchom: node seed-drivers.js');
    process.exit(1);
  }

  console.log('▶  Symulacja uruchomiona. Zatrzymaj przez Ctrl+C.\n');

  // pierwsze uruchomienie od razu
  await updateLocations();
  await updateStatuses();
  await printStats();

  const locTimer    = setInterval(updateLocations, LOCATION_INTERVAL);
  const statusTimer = setInterval(updateStatuses, STATUS_INTERVAL);
  const statsTimer  = setInterval(printStats, 30000);

  process.on('SIGINT', async () => {
    console.log('\n\n⏹  Zatrzymywanie symulacji...');
    clearInterval(locTimer);
    clearInterval(statusTimer);
    clearInterval(statsTimer);
    await pool.end();
    console.log('✅ Symulacja zatrzymana.');
    process.exit(0);
  });
}

main().catch(err => { console.error('❌ Błąd:', err.message); process.exit(1); });
