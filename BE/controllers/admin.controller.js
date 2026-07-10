import { getConnectionWithTimeout } from '../db.js';
import { addDriverLog } from '../shared/helpers.js';
import { runMigrationsWithReport } from '../migrations.js';
import * as adminRepo from '../repository/admin.repository.js';

// ── POST /api/admin/seed-test-drivers — tworzy/aktualizuje 150 testowych kierowców 100-249 ──
export async function seedTestDrivers(req, res) {
  const { randomUUID } = await import('crypto');
  const BRANDS = [['Toyota','Corolla'],['Skoda','Octavia'],['Volkswagen','Passat'],['Ford','Focus'],['Opel','Astra'],['BMW','5 Series'],['Mercedes','E-Class'],['Hyundai','i30'],['Kia','Ceed'],['Dacia','Logan']];
  const COLORS = ['Biały','Czarny','Srebrny','Szary','Granatowy','Czerwony'];
  const STATUSES = ['free','active','active','active','driving','pickup','home'];
  const STATES   = ['wolna','kursem','dojazd','zajeta'];
  const FNAMES   = ['Adam','Piotr','Krzysztof','Andrzej','Tomasz','Marek','Michał','Paweł','Jakub','Grzegorz','Rafał','Łukasz','Dariusz','Mariusz'];
  const LNAMES   = ['Kowalski','Nowak','Wiśniewski','Wójcik','Kowalczyk','Kamiński','Lewandowski','Zieliński','Szymański','Woźniak','Dąbrowski','Kozłowski'];
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const randPlate = () => { const L='ABCDEFGHJKLMNPRSTUVWXYZ'; const l=()=>L[Math.floor(Math.random()*L.length)]; const d=()=>Math.floor(Math.random()*10); return `B${l()}${l()} ${d()}${d()}${d()}${d()}`; };

  const zoneRows = await adminRepo.getActiveZonesForSeed();
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

  const fallbackZone = { number: null, latMin: 53.09, latMax: 53.16, lngMin: 17.99, lngMax: 18.14 };

  const randInZone = (zone) => ({
    lat: +(zone.latMin + Math.random() * (zone.latMax - zone.latMin)).toFixed(6),
    lng: +(zone.lngMin + Math.random() * (zone.lngMax - zone.lngMin)).toFixed(6),
  });

  let added = 0, updated = 0, errors = 0;
  for (let i = 0; i < 150; i++) {
    const code = String(100 + i);
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
      const existing = await adminRepo.findDriverByCode(code);
      if (existing && existing.length > 0) {
        await adminRepo.updateSeedDriver([name, status, state, isOnline, lat, lng, zoneNum], code);
        updated++;
      } else {
        await adminRepo.insertSeedDriver([
          randomUUID(), email, name, 'unused', code, pin, status, state, isOnline, lat, lng, zoneNum, brand, model, rand(COLORS), plate,
          `+48${500+Math.floor(Math.random()*499)}${100+Math.floor(Math.random()*899)}${100+Math.floor(Math.random()*899)}`.replace(/\s/g,''),
          String(Math.floor(Math.random()*900)+100)
        ]);
        added++;
      }
    } catch (e) { errors++; console.error(`[Seed] ${code}:`, e.message); }
  }
  return res.json({ success: true, added, updated, errors, total: added + updated });
}

// ── POST /api/admin/sim/test-order — tworzy testowe zlecenie pending_driver dla konkretnego kierowcy ──
export async function simTestOrder(req, res) {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ success: false, error: 'Wymagane driverId' });
  try {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const num = Math.floor(Math.random() * 9000) + 1000;
    const orderNumber = `SIM-${num}`;
    const pickups = ['ul. Gdańska 100, Bydgoszcz','ul. Dworcowa 5, Bydgoszcz','ul. Focha 12, Bydgoszcz','pl. Wolności 1, Bydgoszcz'];
    const dests   = ['ul. Andersa 8, Bydgoszcz','ul. Kujawska 20, Bydgoszcz','Lotnisko Bydgoszcz','ul. Szpitalna 19, Bydgoszcz'];
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];
    await adminRepo.insertSimTestOrder([id, orderNumber, driverId, rand(pickups), rand(dests)]);
    return res.json({ success: true, orderId: id, orderNumber });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/admin/sim/set-state — symulator: bezpośredni update stanu bez walidacji GPS ──
export async function simSetState(req, res) {
  const { driverId, driverState, status, zone } = req.body;
  if (!driverId || !driverState) return res.status(400).json({ success: false, error: 'Wymagane driverId i driverState' });
  const allowed = ['wolna', 'dojazd', 'zajeta', 'kursem'];
  if (!allowed.includes(driverState)) return res.status(400).json({ success: false, error: 'Nieprawidłowy driverState' });
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const freeSince = driverState === 'wolna' ? now : null;
    const clearZone = driverState === 'zajeta';
    if (clearZone) {
      await adminRepo.simSetStateClearZone(driverState, freeSince, now, driverId);
    } else {
      await adminRepo.simSetState(driverState, freeSince, now, driverId);
    }
    if (status) {
      await adminRepo.simSetStatus(status, driverId);
    }
    if (zone != null) {
      await adminRepo.simSetZone(zone, driverId);
    }
    const STATE_LABELS = { wolna: 'Wolna', dojazd: 'Dojazd', zajeta: 'Zajęta', kursem: 'Kursem' };
    addDriverLog(driverId, 'state_change', `Zmiana stanu na: ${STATE_LABELS[driverState] ?? driverState}`, null, { nowy_stan: driverState });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/admin/sim/location — symulator: update GPS BEZ resetowania current_zone ──
export async function simUpdateLocation(req, res) {
  const { driverId, lat, lng } = req.body;
  if (!driverId || lat == null || lng == null) return res.status(400).json({ success: false, error: 'Wymagane driverId, lat, lng' });
  try {
    await adminRepo.simUpdateLocation(lat, lng, driverId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/sql-upload — wykonaj skrypt SQL wgrany z panelu wsparcia
export async function sqlUpload(req, res) {
  const { sql } = req.body;

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.status(400).json({ success: false, error: 'Brak treści SQL' });
  }

  console.log('[SQL Upload] Received script, length:', sql.length);

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
}

// POST /api/migrate — uruchom migracje z panelu wsparcia
export async function migrate(req, res) {
  console.log('[Migrate] Manual migration requested');
  try {
    const report = await runMigrationsWithReport();
    console.log('[Migrate] Done. Created:', report.tablesCreated, 'Columns:', report.columnsAdded);
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('[Migrate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
