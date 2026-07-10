import { getConnectionWithTimeout, safeQuery } from '../db.js';
import {
  addOrderLog,
  addDriverLog,
  generateUUID,
  generateClientCode,
  detectZoneFromAddressKeywords,
} from '../shared/helpers.js';
import { sendPushToDriver } from '../shared/push.js';
import * as ordersRepo from '../repository/orders.repository.js';

// GET /api/orders/:orderId/logs — historia przetwarzania zlecenia
export async function getOrderLogs(req, res) {
  const { orderId } = req.params;
  try {
    const logs = await ordersRepo.getOrderLogs(orderId);
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
}

// POST /api/orders/:orderId/accept — kierowca akceptuje zlecenie → status: accepted
export async function acceptOrder(req, res) {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await ordersRepo.getOrderInfoBasic(orderId);
    await ordersRepo.acceptOrderUpdate(orderId);
    if (driverId) {
      await ordersRepo.setDriverBusyAccept(driverId);
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
}

// POST /api/orders/:orderId/accept-next
export async function acceptNextOrder(req, res) {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const result = await ordersRepo.acceptNextOrderUpdate(orderId, driverId);
    if (!result || result.affectedRows === 0) {
      return res.status(422).json({ success: false, error: 'Zlecenie nie mogło zostać przyjęte (sprawdź status)' });
    }
    addOrderLog(orderId, 'dispatch', `Kierowca przyjął następny kurs`, { driverId, status: 'next_accepted' });
    if (driverId) addDriverLog(driverId, 'order_accept_next', `Zarezerwował następne zlecenie`, null, { zlecenie_id: orderId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/orders/:orderId/reject-next
export async function rejectNextOrder(req, res) {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    await ordersRepo.rejectNextOrderUpdate(orderId, driverId);
    addOrderLog(orderId, 'dispatch', `Kierowca odrzucił następny kurs — zlecenie wraca na giełdę`, { driverId });
    if (driverId) addDriverLog(driverId, 'order_reject', `Odrzucił następne zlecenie — wróciło na giełdę`, null, { zlecenie_id: orderId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/orders/:orderId/at-pickup
export async function atPickupOrder(req, res) {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await ordersRepo.getOrderInfoForPickup(orderId);
    await ordersRepo.atPickupUpdate(orderId);
    if (driverId) {
      await ordersRepo.setDriverBusyAtPickup(driverId);
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
}

// ── Helper: znajdź kolejnego kierowcę wg reguł rejonu i przydziel zlecenie ───
export async function redispatchOrder(orderId, regionId, excludeDriverId) {
  const orderForBlock = await ordersRepo.getOrderCustomerId(orderId);
  const customerId = orderForBlock?.[0]?.customer_id ?? null;

  const ruleRows = await ordersRepo.getZoneAssignmentRules(regionId);
  const usedDefaultRule = !ruleRows || ruleRows.length === 0;
  const steps = usedDefaultRule
    ? [{ search_zone: regionId, driver_state: 'wolna', priority: 1, step_type: 'zone', radius_km: null }]
    : ruleRows;

  const orderGeoRows = await ordersRepo.getOrderPickupGeo(orderId);
  const pickupLat = orderGeoRows?.[0]?.pickup_lat ?? null;
  const pickupLng = orderGeoRows?.[0]?.pickup_lng ?? null;

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

  let nextDriverId = null;
  let nextDriverCode = null;
  let nextDriverName = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let drivers = null;

    if (step.step_type === 'radius' && step.radius_km && pickupLat != null && pickupLng != null) {
      const { haversineKm } = await import('../shared/helpers.js');
      const allDrivers = await ordersRepo.findDriversByStateRadius(step.driver_state, excludeDriverId, customerId);
      const inRadius = (allDrivers ?? []).filter(d =>
        haversineKm(d.latitude, d.longitude, pickupLat, pickupLng) <= step.radius_km
      );
      drivers = inRadius.length > 0 ? [inRadius[0]] : [];
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: szukam w promieniu ${step.radius_km}km — stan: ${step.driver_state}, znaleziono: ${inRadius.length}`,
        { krok: i + 1, promien: step.radius_km, stan: step.driver_state, znaleziono: inRadius.length }
      );
    } else if (step.step_type === 'radius') {
      addOrderLog(orderId, 'dispatch',
        `Krok ${i + 1}: pominięty (brak GPS zlecenia) — promień: ${step.radius_km}km, stan: ${step.driver_state}`,
        { krok: i + 1, wynik: 'pominięty', powod: 'brak GPS zlecenia' }
      );
      continue;
    } else {
      drivers = await ordersRepo.findDriversByStateZone(step.driver_state, step.search_zone, excludeDriverId, customerId);
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
    await ordersRepo.assignOrderToDriver(orderId, nextDriverId);
    addOrderLog(orderId, 'dispatch',
      `Zlecenie przydzielono do kierowcy ${nextDriverCode} (${nextDriverName}) — status: pending_driver`,
      { kierowca_id: nextDriverId, kierowca_kod: nextDriverCode, kierowca_nazwa: nextDriverName, status: 'pending_driver' }
    );
    ordersRepo.getOrderPickupAddress(orderId).then(orderForPush => {
      sendPushToDriver(nextDriverId, {
        title: '🔔 Nowe zlecenie',
        body: `Odbiór: ${orderForPush?.[0]?.pickup_address || '—'}`,
        url: '/driver'
      }).catch(e => console.error('[Push] Błąd wysyłki:', e.message));
    }).catch(() => {});
    return { assigned: true, driverId: nextDriverId };
  }

  const settingsRows = await ordersRepo.getZoneFallbackStatus(regionId);
  const fallback = settingsRows?.[0]?.fallback_status ?? 'pending';

  if (fallback === 'market') {
    await ordersRepo.marketFallbackUpdate(orderId);
    await ordersRepo.deleteGieldaRegistrationsForOrder(orderId);
    addOrderLog(orderId, 'gielda',
      `Brak dostępnych kierowców — zlecenie trafia na giełdę (fallback rejonu ${regionId}: market)`,
      { regionId, fallback: 'market' }
    );
    console.log(`[Redispatch] Order ${orderId} → brak kierowcy, status: market`);
  } else {
    await ordersRepo.pendingFallbackUpdate(orderId);
    addOrderLog(orderId, 'dispatch',
      `Brak dostępnych kierowców — zlecenie oczekuje (fallback rejonu ${regionId}: pending)`,
      { regionId, fallback: 'pending' }
    );
    console.log(`[Redispatch] Order ${orderId} → brak kierowcy, status: pending`);
  }
  return { assigned: false, fallback };
}

// POST /api/orders/:orderId/reject
export async function rejectOrder(req, res) {
  const { orderId } = req.params;
  try {
    const orders = await ordersRepo.getOrderForReject(orderId);
    if (!orders || orders.length === 0) {
      return res.json({ success: true });
    }
    const { driver_id: rejectingDriverId, pickup_region_id: regionId, driver_code, driver_name } = orders[0];

    if (rejectingDriverId) {
      await ordersRepo.setDriverBusy(rejectingDriverId);
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

    if (regionId != null) {
      await redispatchOrder(orderId, regionId, rejectingDriverId || '');
    } else {
      await ordersRepo.pendingFallbackUpdate(orderId);
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
}

// GET /api/orders/:id/status
export async function getOrderStatusQuick(req, res) {
  const { id } = req.params;
  try {
    const rows = await ordersRepo.getOrderStatus(id);
    if (!rows || rows.length === 0) return res.json({ success: false });
    return res.json({ success: true, status: rows[0].status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/orders/:orderId/pickup
export async function pickupOrder(req, res) {
  const { orderId } = req.params;
  const { driverId } = req.body;
  try {
    const orderInfo = await ordersRepo.getOrderInfoForPickupFull(orderId);
    await ordersRepo.pickupOrderUpdate(orderId);
    if (driverId) {
      await ordersRepo.clearDriverZoneOnPickup(driverId);
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
}

// POST /api/orders/:orderId/complete
export async function completeOrder(req, res) {
  const { orderId } = req.params;
  try {
    const orderRows = await ordersRepo.getOrderInfoForComplete(orderId);
    const driverId = orderRows?.[0]?.driver_id ?? null;
    const orderNum = orderRows?.[0]?.order_number ?? orderId;
    const orderCost = orderRows?.[0]?.cost ?? null;

    await ordersRepo.completeOrderUpdate(orderId);
    await addOrderLog(orderId, 'status', `Zlecenie zakończone`, { driverId });

    if (driverId) {
      const promotedAccepted = await ordersRepo.promoteNextAccepted(driverId);
      if (promotedAccepted && promotedAccepted.affectedRows > 0) {
        console.log(`[CompleteOrder] Awans next_accepted → accepted dla kierowcy ${driverId}`);
      } else {
        const promoted = await ordersRepo.promoteNextDriver(driverId);
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
}

// POST /api/orders/:id/finish — zakończ zlecenie (anulowanie, mina, brak taxi)
export async function finishOrder(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  const STATUS_MAP = {
    cancelled: 'cancelled',
    mina:      'mina',
    no_taxi:   'no_taxi',
  };
  const newStatus = STATUS_MAP[reason];
  if (!newStatus) return res.status(400).json({ success: false, error: 'Nieprawidłowy powód zakończenia' });

  try {
    const rows = await ordersRepo.getOrderForFinish(id);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'Zlecenie nie istnieje' });
    const order = rows[0];

    if (reason === 'no_taxi' && order.driver_id) {
      return res.status(400).json({ success: false, error: 'Opcja "Brak taksówki" niedostępna — zlecenie ma przypisanego kierowcę' });
    }

    if (order.driver_id && reason !== 'no_taxi') {
      const notifTitle = reason === 'mina' ? 'Mina !' : 'Anulowanie zlecenia';
      const notifMsg = reason === 'cancelled'
        ? 'Dyspozytor anulował Twoje zlecenie'
        : 'Klient się nie pojawił — Mina';
      await ordersRepo.insertDriverNotification(order.driver_id, reason, notifTitle, notifMsg, id);
    }

    await ordersRepo.finishOrderUpdate(newStatus, id);

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
}

// POST /api/orders/:id/update — edytuj dane zlecenia
export async function updateOrder(req, res) {
  const { id } = req.params;
  const {
    customerPhone, customerName,
    pickupAddress, destinationAddress,
    taxiCount, paymentMethod, vehicleCategory,
    scheduledDate, scheduledTime, notes,
  } = req.body;
  try {
    await ordersRepo.updateOrderFields([
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
    ], id);
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/orders/:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/orders — lista wszystkich zleceń z danymi kierowcy
export async function listOrders(req, res) {
  try {
    const { status, statuses, limit = 200, offset = 0 } = req.query;

    let statusFilter = '';
    if (statuses) {
      const list = String(statuses).split(',').map(s => `'${s.trim().replace(/'/g, '')}'`).join(',');
      statusFilter = `AND o.status IN (${list})`;
    } else if (status) {
      statusFilter = `AND o.status = ${JSON.stringify(status)}`;
    }

    const rows = await ordersRepo.listOrders(statusFilter, parseInt(limit), parseInt(offset));

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Orders] GET /api/orders error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/orders/:id — szczegóły pojedynczego zlecenia
export async function getOrderDetail(req, res) {
  const { id } = req.params;
  try {
    const rows = await ordersRepo.getOrderById(id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Zlecenie nie znalezione' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Orders] GET /api/orders/:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// NOWE ZLECENIE — tworzenie zlecenia z automatycznym wykrywaniem rejonu,
// typowaniem kierowcy FIFO i obsługą klienta
export async function createOrder(req, res) {
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

    const zoneNumber = (pickupRegionId != null ? parseInt(pickupRegionId) : null)
      ?? detectZoneFromAddressKeywords(pickupAddress);
    console.log(`[OrderCreate] pickupRegionId=${pickupRegionId} → zoneNumber=${zoneNumber}`);

    let assignedDriverId = null;
    let assignedDriverName = null;
    let assignedDriverCode = null;
    let zoneFallbackStatus = 'pending';
    const dispatchStepsLog = [];
    const detailedSteps = [];
    let dispatchRulesMeta = null;
    if (zoneNumber !== null) {
      const ruleRows = await ordersRepo.getZoneRulesTx(connection, zoneNumber);
      const zoneSettingsRows = await ordersRepo.getZoneSettingsTx(connection, zoneNumber);
      zoneFallbackStatus = zoneSettingsRows?.[0]?.fallback_status ?? 'pending';

      const usedDefaultRule = ruleRows.length === 0;
      const steps = usedDefaultRule
        ? [{ search_zone: zoneNumber, driver_state: 'wolna', priority: 1, step_type: 'zone', radius_km: null }]
        : ruleRows;

      dispatchRulesMeta = { usedDefaultRule, steps, fallbackStatus: zoneFallbackStatus };

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let drivers = [];

        if (step.step_type === 'radius' && step.radius_km) {
          dispatchStepsLog.push({ krok: i + 1, promien: step.radius_km, stan: step.driver_state, wynik: 'pominięty (brak GPS)' });
          detailedSteps.push({ type: 'skip_radius', krok: i + 1, promien: step.radius_km, stan: step.driver_state });
          continue;
        }

        drivers = await ordersRepo.findZoneDriversTx(connection, step.driver_state, step.search_zone, customerPhone);

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

    let clientId = null;
    let clientCode = null;
    if (customerPhone) {
      const existingClients = await ordersRepo.findClientByPhoneTx(connection, customerPhone);
      if (existingClients.length > 0) {
        clientId = existingClients[0].id;
        clientCode = existingClients[0].client_code;
      } else {
        clientId = generateUUID();
        clientCode = generateClientCode(customerPhone);
        await ordersRepo.insertClientTx(connection, clientId, customerPhone, customerName, clientCode);
      }
    }

    const nextNum = await ordersRepo.getNextOrderNumberTx(connection);
    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YY = String(now.getFullYear()).slice(-2);
    const orderNumber = `${nextNum}/${MM}/${YY}`;

    const newOrderStatus = assignedDriverId
      ? 'pending_driver'
      : (date && time ? 'scheduled' : zoneFallbackStatus);

    const orderId = generateUUID();
    await ordersRepo.insertOrderTx(connection, [
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
    ]);

    connection.release();

    console.log(`[Orders] Nowe zlecenie ${orderNumber} — rejon: ${zoneNumber}, kierowca: ${assignedDriverCode || 'brak'}`);

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
}

// ============================================================================
// SCHEDULED ORDERS AUTO-DISPATCH — co 60s (background job)
// ============================================================================
let scheduledCheckInterval = null;

export async function checkScheduledOrders() {
  try {
    const _nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
    const nowLocalStr = _nowLocal.getFullYear() + '-' +
      String(_nowLocal.getMonth() + 1).padStart(2, '0') + '-' +
      String(_nowLocal.getDate()).padStart(2, '0') + ' ' +
      String(_nowLocal.getHours()).padStart(2, '0') + ':' +
      String(_nowLocal.getMinutes()).padStart(2, '0') + ':' +
      String(_nowLocal.getSeconds()).padStart(2, '0');

    const dueOrders = await ordersRepo.getDueScheduledOrders(nowLocalStr);

    if (!dueOrders || dueOrders.length === 0) return;

    console.log(`[ScheduledCheck] ${dueOrders.length} zlecenie(ń) do wydania`);

    for (const order of dueOrders) {
      try {
        const zoneNumber = order.pickup_region_id;
        let assignedDriver = null;

        if (zoneNumber !== null && zoneNumber !== undefined) {
          const rulesResult = await safeQuery(
            `SELECT search_zone, driver_state, step_type, radius_km FROM zone_assignment_rules
             WHERE source_zone = ? ORDER BY priority ASC`,
            [zoneNumber]
          );

          const steps = (rulesResult && rulesResult.length > 0)
            ? rulesResult.map(r => ({ searchZone: r.search_zone, driverState: r.driver_state, stepType: r.step_type ?? 'zone', radiusKm: r.radius_km ?? null }))
            : [{ searchZone: zoneNumber, driverState: 'wolna', stepType: 'zone', radiusKm: null }];

          let requiredPrefs = [];
          try {
            const raw = order.preference_ids;
            requiredPrefs = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
          } catch { requiredPrefs = []; }

          for (const step of steps) {
            let drivers;
            if (step.stepType === 'radius' && step.radiusKm) {
              continue;
            } else {
              drivers = await ordersRepo.findScheduledCandidateDrivers(step.driverState, step.searchZone, order.customer_id);
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
          await ordersRepo.assignScheduledOrder(assignedDriver.id, order.id);
          console.log(`[ScheduledCheck] Zlecenie ${order.order_number} → kierowca ${assignedDriver.code} (pending_driver)`);
        } else {
          await ordersRepo.marketScheduledOrder(order.id);
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

export function startScheduledCheck() {
  if (scheduledCheckInterval) clearInterval(scheduledCheckInterval);
  scheduledCheckInterval = setInterval(checkScheduledOrders, 60000);
  console.log('[ScheduledCheck] Started (interval: 60s)');
  checkScheduledOrders();
}

// ============================================================================
// PENDING DRIVER TIMEOUT — co 15s (background job)
// ============================================================================
export async function checkPendingDriverTimeout() {
  try {
    const timedOut = await ordersRepo.getPendingDriverTimeouts();
    if (!timedOut || timedOut.length === 0) return;

    for (const order of timedOut) {
      const { id: orderId, driver_id: driverId, pickup_region_id: regionId, driver_code, driver_name } = order;

      if (driverId) {
        await ordersRepo.setDriverBusy(driverId);
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

      if (regionId != null) {
        await redispatchOrder(orderId, regionId, driverId || '');
      } else {
        await ordersRepo.pendingFallbackUpdate(orderId);
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
