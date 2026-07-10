import { detectZoneFromCoordinates } from '../shared/helpers.js';
import { addSystemLog } from '../shared/helpers.js';
import * as zonesRepo from '../repository/zones.repository.js';

// GET /api/zones/detect?lat=X&lng=Y
export async function detectZone(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ success: false, error: 'Brakuje lat/lng' });
  try {
    const zone = await detectZoneFromCoordinates(lat, lng);
    res.json({ success: true, zone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/zones
export async function listZones(req, res) {
  try {
    const rows = await zonesRepo.listZones();
    res.json({ success: true, zones: rows ?? [] });
  } catch (err) {
    console.error('[Zones] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/zones/sim-data
export async function getZonesSimData(req, res) {
  try {
    const rows = await zonesRepo.getZonesSimData();
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
}

// GET /api/admin/zone-rules
export async function getAllZoneRules(req, res) {
  try {
    const rows = await zonesRepo.getZoneRulesGrouped();
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
}

// DELETE /api/admin/zone-rules/cleanup
export async function cleanupZoneRules(req, res) {
  try {
    const result = await zonesRepo.cleanupZoneRules();
    const deleted = result?.affectedRows ?? 0;
    console.log(`[ZoneRules] Cleanup: usunięto ${deleted} reguł dla nieistniejących rejonów`);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[ZoneRules] Cleanup error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/admin/zone-rules/:sourceZone
export async function deleteZoneRulesForSource(req, res) {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });
  try {
    const result = await zonesRepo.deleteZoneRulesForSource(sourceZone);
    const deleted = result?.affectedRows ?? 0;
    console.log(`[ZoneRules] Usunięto ${deleted} reguł dla rejonu ${sourceZone}`);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[ZoneRules] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/zone-rules/:sourceZone
export async function getZoneRulesForSource(req, res) {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });
  try {
    const rows = await zonesRepo.getZoneRulesForSource(sourceZone);
    const settingsRows = await zonesRepo.getZoneSettingsForSource(sourceZone);
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
}

// PUT /api/admin/zone-rules/:sourceZone — bulk-replace reguł dla rejonu
export async function putZoneRulesForSource(req, res) {
  const sourceZone = parseInt(req.params.sourceZone);
  if (isNaN(sourceZone)) return res.status(400).json({ success: false, error: 'Nieprawidłowy numer rejonu' });

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
    await zonesRepo.deleteZoneRulesForSource(sourceZone);
    if (steps.length > 0) {
      const values = steps.map((s, i) => {
        const stepType = s.stepType ?? 'zone';
        const searchZone = stepType === 'zone' ? parseInt(s.searchZone) : null;
        const radiusKm = stepType === 'radius' ? parseFloat(s.radiusKm) : null;
        return [sourceZone, i + 1, searchZone, s.driverState, stepType, radiusKm];
      });
      await zonesRepo.insertZoneRules(values);
    }
    await zonesRepo.upsertZoneSettings(sourceZone, fallbackStatus, gieldaMaxDistanceKm);
    addSystemLog({ type: 'zone_rules_update', category: 'admin', description: `Zaktualizowano reguły przydziału dla rejonu ${sourceZone} (${steps.length} kroków, fallback: ${fallbackStatus})`, metadata: { sourceZone, steps, fallbackStatus, gieldaMaxDistanceKm } });
    res.json({ success: true, saved: steps.length, fallbackStatus, gieldaMaxDistanceKm });
  } catch (err) {
    console.error('[ZoneRules] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
