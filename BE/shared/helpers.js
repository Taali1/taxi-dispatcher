import { safeQuery } from '../db.js';

// ============================================================================
// ZONE DETECTION - Point-in-Polygon Algorithm
// ============================================================================

export function isPointInPolygon(point, polygon) {
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

export async function detectZoneFromCoordinates(latitude, longitude) {
  try {
    const zones = await safeQuery(
      'SELECT id, number, coordinates FROM zones WHERE is_active = true'
    );

    if (!zones || zones.length === 0) {
      console.log('[Zone Detection] No active zones found');
      return null;
    }

    const point = { lat: latitude, lng: longitude };

    for (const zone of zones) {
      let coordinates;
      try {
        coordinates = typeof zone.coordinates === 'string'
          ? JSON.parse(zone.coordinates)
          : zone.coordinates;
      } catch (e) {
        console.error('[Zone Detection] Failed to parse coordinates for zone:', zone.number);
        continue;
      }

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
// Cache dla odpowiedzi API (zmniejsza obciążenie bazy)
// ============================================================================
const apiCache = new Map();
const CACHE_TTL = 5000; // 5 sekund

export function getCached(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

export function setCache(key, data) {
  apiCache.set(key, {
    data: data,
    timestamp: Date.now()
  });

  if (apiCache.size > 100) {
    const firstKey = apiCache.keys().next().value;
    apiCache.delete(firstKey);
  }
}

// ============================================================================
// FUNKCJE POMOCNICZE — generowanie numerów, kodów, wykrywanie rejonu
// ============================================================================

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function generateClientCode(phone) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  const prefix = rand() + rand() + rand() + rand();
  const digits = String(phone || '').replace(/\D/g, '');
  const last3 = digits.slice(-3).padStart(3, '0');
  return `${prefix}-${last3}`;
}

// Wykrywanie rejonu z adresu — spójna z ZoneDetectionService w frontend
export function detectZoneFromAddressKeywords(address) {
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

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper: current time in Polish timezone as "YYYY-MM-DD HH:MM:SS"
export function nowPolish() {
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

// ── Helper: zapisz log przetwarzania zlecenia ─────────────────────────────────
export async function addOrderLog(orderId, type, message, data = null) {
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
export async function addDriverLog(driverId, type, title, description = null, metadata = null) {
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

export async function addSystemLog({ type, category = 'general', userId = null, userName = null, userRole = null, description, metadata = null, ipAddress = null }) {
  try {
    await safeQuery(
      `INSERT INTO system_logs (type, category, user_id, user_name, user_role, description, metadata, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, category, userId, userName, userRole, description, metadata ? JSON.stringify(metadata) : null, ipAddress]
    );
  } catch (e) {
    console.error('[SystemLog] Błąd zapisu logu:', e.message);
  }
}
