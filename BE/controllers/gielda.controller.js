import { addOrderLog, addDriverLog, haversineKm } from '../shared/helpers.js';
import { sendPushToDriver } from '../shared/push.js';
import * as gieldaRepo from '../repository/gielda.repository.js';

export async function getDriverRegistrations(req, res) {
  const { driverId } = req.params;
  try {
    const rows = await gieldaRepo.getGieldaRegistrationsForDriver(driverId);
    return res.json({ success: true, orderIds: (rows ?? []).map(r => r.order_id) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/gielda/register — kierowca zgłasza chęć przyjęcia zleceń z giełdy
export async function registerForGielda(req, res) {
  const { driverId, orderIds } = req.body;
  if (!driverId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Brak driverId lub orderIds' });
  }
  try {
    const settings = await gieldaRepo.getGieldaSettingsForRegister();
    const gieldaEnabled = settings?.[0]?.gielda_enabled != null ? settings[0].gielda_enabled : 1;
    if (!gieldaEnabled) {
      return res.json({ success: false, error: 'disabled' });
    }
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

    const existingReg = await gieldaRepo.getExistingActiveRegistration(driverId);
    if (existingReg && existingReg.length > 0) {
      return res.json({ success: false, error: 'already_registered', orderId: existingReg[0].order_id });
    }

    const driverRows = await gieldaRepo.getDriverForRegister(driverId);
    const driverLat = driverRows?.[0]?.latitude ?? null;
    const driverLng = driverRows?.[0]?.longitude ?? null;
    const driverCode = driverRows?.[0]?.driver_code ?? driverId;
    let driverPrefs = [];
    try {
      const raw = driverRows?.[0]?.preference_ids;
      driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { driverPrefs = []; }

    for (const orderId of orderIds) {
      const orderRows = await gieldaRepo.getMarketOrderById(orderId);
      if (!orderRows || orderRows.length === 0) continue;
      const order = orderRows[0];

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

      if (order.pickup_region_id != null && driverLat != null && order.pickup_lat != null) {
        const zoneSettings = await gieldaRepo.getZoneMaxDistance(order.pickup_region_id);
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

      if (order.customer_id) {
        const blockRows = await gieldaRepo.getBlockForDriverClient(driverId, order.customer_id);
        if (blockRows && blockRows.length > 0) {
          return res.json({ success: false, error: 'blocked' });
        }
      }

      if (registrationSeconds === 0) {
        await gieldaRepo.directAssignOrder(driverId, orderId);
        await gieldaRepo.deleteGieldaRegistrationsForOrder(orderId);
        console.log(`[GieldaRegister] Direct assign order ${orderId} → driver ${driverId}`);
        await addOrderLog(orderId, 'gielda',
          `Giełda: bezpośredni przydział do kierowcy ${driverId} (czas rejestracji = 0)`,
          { kierowca_id: driverId, tryb: 'direct' }
        );
        addDriverLog(driverId, 'gielda_assigned', `Przydzielono zlecenie z giełdy (bezpośrednio)`,
          `Zlecenie #${orderId}`, { zlecenie_id: orderId, tryb: 'direct' }
        );
        const orderForPush = await gieldaRepo.getOrderPickupAddress(orderId);
        await sendPushToDriver(driverId, {
          title: '🔔 Nowe zlecenie',
          body: `Odbiór: ${orderForPush?.[0]?.pickup_address || '—'}`,
          url: '/driver'
        });
      } else {
        await gieldaRepo.upsertGieldaRegistration(orderId, driverId, driverLat, driverLng);
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
}

// ────────────────────────────────────────────────────────────────────────────
// GIEŁDA AUTO-DISPATCH — background job (co 3s)
// ────────────────────────────────────────────────────────────────────────────
let autoDispatchInterval = null;

export async function checkMarketAutoDispatch() {
  try {
    const settings = await gieldaRepo.getAutoDispatchSettings();
    const autoWolna   = settings?.[0]?.gielda_auto_dispatch_wolna  === 1;
    const autoDojazd  = settings?.[0]?.gielda_auto_dispatch_dojazd === 1;
    if (!autoWolna && !autoDojazd) return;

    const allowedStates = [
      ...(autoWolna  ? ['wolna']  : []),
      ...(autoDojazd ? ['dojazd'] : []),
    ];

    const marketOrders = await gieldaRepo.getMarketOrdersWithoutDriver();

    const allBlocks = await gieldaRepo.getAllDriverClientBlocks() ?? [];
    const blockSet = new Set(allBlocks.map(b => `${b.driver_id}|${b.client_id}`));
    if (allBlocks.length > 0) console.log(`[AutoDispatch] Załadowano ${allBlocks.length} blokad:`, allBlocks.map(b => `${b.driver_id}|${b.client_id}`));
    if (!marketOrders || marketOrders.length === 0) return;

    const dispatchedDriverIds = new Set();

    for (const order of marketOrders) {
      if (!order.pickup_region_id) continue;

      const rules = await gieldaRepo.getZoneAssignmentRulesForRegion(order.pickup_region_id);
      const steps = (rules && rules.length > 0)
        ? rules
        : [{ search_zone: order.pickup_region_id, driver_state: 'wolna', step_type: 'zone', radius_km: null }];

      let dispatched = false;
      for (const step of steps) {
        if (!allowedStates.includes(step.driver_state)) continue;

        let drivers;
        if (step.step_type === 'radius' && step.radius_km && order.pickup_lat != null && order.pickup_lng != null) {
          const allDrivers = await gieldaRepo.getDriversByStateWithGps(step.driver_state);
          drivers = (allDrivers ?? []).filter(d =>
            haversineKm(d.latitude, d.longitude, order.pickup_lat, order.pickup_lng) <= step.radius_km
          );
        } else if (step.step_type === 'radius') {
          continue;
        } else {
          drivers = await gieldaRepo.getDriversByStateZone(step.driver_state, step.search_zone);
        }
        if (!drivers || drivers.length === 0) continue;

        const zoneDistSettings = await gieldaRepo.getZoneMaxDistance(order.pickup_region_id);
        const maxDistKm = zoneDistSettings?.[0]?.gielda_max_distance_km ?? null;

        let requiredPrefs = [];
        try {
          const raw = order.preference_ids;
          requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch { requiredPrefs = []; }

        for (const driver of drivers) {
          if (dispatchedDriverIds.has(driver.id)) continue;

          const blockKey = `${driver.id}|${order.customer_id}`;
          const isBlocked = !!(order.customer_id && blockSet.has(blockKey));
          if (order.customer_id) console.log(`[AutoDispatch] Block check order=${order.order_number} customer_id=${order.customer_id} driver=${driver.driver_code}(${driver.id}) key=${blockKey} blocked=${isBlocked}`);
          if (isBlocked) continue;

          if (maxDistKm != null && order.pickup_lat != null && driver.latitude != null) {
            const dist = haversineKm(driver.latitude, driver.longitude, order.pickup_lat, order.pickup_lng);
            if (dist > maxDistKm) continue;
          }

          if (requiredPrefs.length > 0) {
            let driverPrefs = [];
            try {
              const raw = driver.preference_ids;
              driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
            } catch { driverPrefs = []; }
            if (!requiredPrefs.every(id => driverPrefs.includes(id))) continue;
          }

          const activeCount = await gieldaRepo.countActiveOrdersForDriver(driver.id);
          const cnt = activeCount?.[0]?.cnt ?? 0;
          if (cnt >= 2) continue;

          const newStatus = cnt >= 1 ? 'next_driver' : 'pending_driver';

          const updated = await gieldaRepo.assignFromMarket(newStatus, driver.id, order.id);
          if (!updated || updated.affectedRows === 0) continue;

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
          break;
        }
        if (dispatched) break;
      }
    }
  } catch (err) {
    console.error('[AutoDispatch] Error:', err.message);
  }
}

export function startAutoDispatch() {
  if (autoDispatchInterval) clearInterval(autoDispatchInterval);
  autoDispatchInterval = setInterval(checkMarketAutoDispatch, 3000);
  console.log('[AutoDispatch] Started (interval: 3s)');
}

// ────────────────────────────────────────────────────────────────────────────
// Background job — przydziel zlecenia z giełdy po upłynięciu czasu rejestracji
// ────────────────────────────────────────────────────────────────────────────
let gieldaRegistrationsInterval = null;
let _gieldaRegSecCache = null;
let _gieldaRegSecCacheAt = 0;
let _gieldaPriorityOrderCache = 'wolna,kursem,dojazd,zajeta';

export async function checkGieldaRegistrations() {
  try {
    const now = Date.now();
    if (_gieldaRegSecCache === null || now - _gieldaRegSecCacheAt > 30000) {
      const settings = await gieldaRepo.getGieldaSettingsForResolution();
      _gieldaRegSecCache = settings?.[0]?.gielda_registration_seconds ?? 15;
      _gieldaPriorityOrderCache = settings?.[0]?.gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta';
      _gieldaRegSecCacheAt = now;
    }
    const registrationSeconds = _gieldaRegSecCache;
    if (registrationSeconds === 0) return;

    const readyOrders = await gieldaRepo.getReadyMarketOrders(registrationSeconds);
    if (!readyOrders || readyOrders.length === 0) return;

    const priorityList = _gieldaPriorityOrderCache.split(',').map(s => s.trim());
    const priorityIndex = state => {
      const i = priorityList.indexOf(state);
      return i === -1 ? priorityList.length : i;
    };

    for (const order of readyOrders) {
      const regs = await gieldaRepo.getRegistrationsForOrder(order.id);
      if (!regs || regs.length === 0) continue;

      let requiredPrefs = [];
      try {
        const raw = order.preference_ids;
        requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      } catch { requiredPrefs = []; }
      let gieldaBlockSet = new Set();
      if (order.customer_id) {
        const gieldaBlocks = await gieldaRepo.getBlocksForClient(order.customer_id) ?? [];
        gieldaBlockSet = new Set(gieldaBlocks.map(b => b.driver_id));
      }

      const eligibleRegs = regs.filter(r => {
        if (gieldaBlockSet.has(r.driver_id)) return false;
        if (requiredPrefs.length === 0) return true;
        let driverPrefs = [];
        try {
          const raw = r.preference_ids;
          driverPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch { driverPrefs = []; }
        return requiredPrefs.every(id => driverPrefs.includes(id));
      });
      if (!eligibleRegs || eligibleRegs.length === 0) continue;

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

      const result = await gieldaRepo.assignFromRegistrations(bestDriverId, order.id);
      if (result?.affectedRows > 0) {
        await gieldaRepo.deleteGieldaRegistrationsForOrder(order.id);
        await addOrderLog(order.id, 'gielda',
          `Giełda: zlecenie przydzielono kierowcy ${best.code} (${best.name}) — stan: ${best.state}, odległość: ${best.dist != null ? best.dist + ' km' : 'nieznana'}`,
          { kierowca_id: bestDriverId, kierowca_kod: best.code, kierowca_nazwa: best.name, stan: best.state, odleglosc_km: best.dist }
        );
        addDriverLog(bestDriverId, 'gielda_assigned', `Wygrał rozstrzygnięcie giełdy — zlecenie przydzielone`,
          `Zlecenie #${order.order_number ?? order.id} · Odległość: ${best.dist != null ? best.dist + ' km' : '?'} · Stan: ${best.state}`,
          { zlecenie_id: order.id, numer_zlecenia: order.order_number, odleglosc_km: best.dist, stan: best.state, liczba_kandydatow: sorted.length }
        );
        console.log(`[GieldaRegistrations] Order ${order.id} → driver ${best.code} (priorytet: ${priorityList.join('>')})`);
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

export function startGieldaRegistrations() {
  if (gieldaRegistrationsInterval) clearInterval(gieldaRegistrationsInterval);
  gieldaRegistrationsInterval = setInterval(checkGieldaRegistrations, 5000);
  console.log('[GieldaRegistrations] Started (interval: 5s)');
  checkGieldaRegistrations();
}
