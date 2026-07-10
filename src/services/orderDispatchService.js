export function createOrderDispatchService({ safeQuery, logging, push, haversineKm }) {
  const { addOrderLog } = logging;
  const { sendPushToDriver } = push;

  async function redispatchOrder(orderId, regionId, excludeDriverId) {
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

    const orderGeoRows = await safeQuery('SELECT pickup_lat, pickup_lng FROM orders WHERE id = ?', [orderId]);
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
        addOrderLog(orderId, 'dispatch',
          `Krok ${i + 1}: pominięty (brak GPS zlecenia) — promień: ${step.radius_km}km, stan: ${step.driver_state}`,
          { krok: i + 1, wynik: 'pominięty', powod: 'brak GPS zlecenia' }
        );
        continue;
      } else {
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
        nextDriverId = drivers[0].id;
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
      await safeQuery(
        `UPDATE orders SET status = 'pending_driver', driver_id = ?, updated_at = NOW() WHERE id = ?`,
        [nextDriverId, orderId]
      );
      addOrderLog(orderId, 'dispatch',
        `Zlecenie przydzielono do kierowcy ${nextDriverCode} (${nextDriverName}) — status: pending_driver`,
        { kierowca_id: nextDriverId, kierowca_kod: nextDriverCode, kierowca_nazwa: nextDriverName, status: 'pending_driver' }
      );
      safeQuery('SELECT pickup_address FROM orders WHERE id = ?', [orderId]).then(orderForPush => {
        sendPushToDriver(nextDriverId, {
          title: '🔔 Nowe zlecenie',
          body: `Odbiór: ${orderForPush?.[0]?.pickup_address || '—'}`,
          url: '/driver',
        }).catch(e => console.error('[Push] Błąd wysyłki:', e.message));
      }).catch(() => {});
      return { assigned: true, driverId: nextDriverId };
    }

    const settingsRows = await safeQuery(
      'SELECT fallback_status FROM zone_settings WHERE source_zone = ?',
      [regionId]
    );
    const fallback = settingsRows?.[0]?.fallback_status ?? 'pending';

    if (fallback === 'market') {
      await safeQuery(
        `UPDATE orders SET status = 'market', driver_id = NULL, market_at = NOW(), updated_at = NOW() WHERE id = ?`,
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
        `UPDATE orders SET status = 'pending', driver_id = NULL, updated_at = NOW() WHERE id = ?`,
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

  return { redispatchOrder };
}
