import * as tmRepo from '../repository/taximeter.repository.js';

// GET /api/taximeter/config — dla kierowcy
export async function getTaximeterConfig(req, res) {
  try {
    const tariffs = await tmRepo.getTariffsPublic();
    const surcharges = await tmRepo.getSurcharges();
    const settingsRows = await tmRepo.getSettingsRow();
    const settings = settingsRows?.[0] ?? { initial_fee: 8, waiting_rate: 40, pulse_amount: 0.85, min_speed_kmh: 20 };
    res.json({ success: true, data: { tariffs: tariffs ?? [], surcharges: surcharges ?? [], settings } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/pricing/estimate?pickupLat=&pickupLng=&destLat=&destLng=
export async function getPricingEstimate(req, res) {
  try {
    const { pickupLat, pickupLng, destLat, destLng } = req.query;
    const pLat = parseFloat(pickupLat); const pLng = parseFloat(pickupLng);
    const dLat = parseFloat(destLat);   const dLng = parseFloat(destLng);
    if ([pLat, pLng, dLat, dLng].some(isNaN)) return res.status(400).json({ success: false, error: 'Nieprawidłowe współrzędne' });

    const settingsRows = await tmRepo.getSettingsRow();
    const settings = settingsRows?.[0] ?? { initial_fee: 8.00 };
    const tariffs = await tmRepo.getFirstTariffPerKm();
    const initialFee = parseFloat(settings.initial_fee) || 0;
    const perKm = parseFloat(tariffs?.[0]?.per_km_rate) || 0;

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
}

export async function getAdminTaximeterSettings(req, res) {
  try {
    const rows = await tmRepo.getSettingsRow();
    res.json({ success: true, data: rows?.[0] ?? { initial_fee: 8, waiting_rate: 40, pulse_amount: 0.85, min_speed_kmh: 20 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function putAdminTaximeterSettings(req, res) {
  const { initial_fee, waiting_rate, pulse_amount, min_speed_kmh } = req.body;
  try {
    await tmRepo.updateSettingsRow(initial_fee ?? 8, waiting_rate ?? 40, pulse_amount ?? 0.85, min_speed_kmh ?? 20);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function getAdminTariffs(req, res) {
  try {
    const rows = await tmRepo.getTariffsAdmin();
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function postAdminTariff(req, res) {
  const { name, per_km_rate, sort_order } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Brak nazwy taryfy' });
  try {
    const result = await tmRepo.insertTariff(name, per_km_rate ?? 2.5, sort_order ?? 0);
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function putAdminTariff(req, res) {
  const { name, per_km_rate, sort_order } = req.body;
  try {
    await tmRepo.updateTariff(name, per_km_rate, sort_order ?? 0, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function deleteAdminTariff(req, res) {
  try {
    await tmRepo.deleteTariff(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function getAdminSurcharges(req, res) {
  try {
    const rows = await tmRepo.getSurcharges();
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function postAdminSurcharge(req, res) {
  const { name, amount, sort_order } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Brak nazwy dopłaty' });
  try {
    const result = await tmRepo.insertSurcharge(name, amount ?? 0, sort_order ?? 0);
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function putAdminSurcharge(req, res) {
  const { name, amount, sort_order } = req.body;
  try {
    await tmRepo.updateSurcharge(name, amount, sort_order ?? 0, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function deleteAdminSurcharge(req, res) {
  try {
    await tmRepo.deleteSurcharge(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}
