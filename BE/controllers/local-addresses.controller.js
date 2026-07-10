import * as laRepo from '../repository/local-addresses.repository.js';

export async function getAllAddresses(req, res) {
  try {
    const rows = await laRepo.listAllAddresses();
    res.json({ results: rows || [] });
  } catch (err) {
    res.status(500).json({ results: [], error: err.message });
  }
}

export async function getAdminAddresses(req, res) {
  try {
    const { q = '', page = '1', limit = '100' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE street LIKE ? OR city LIKE ? OR house_number LIKE ? OR notes LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const totalRow = await laRepo.countAddresses(where, params);
    const rows = await laRepo.pageAddresses(where, params, parseInt(limit), offset);
    res.json({ results: rows || [], total: totalRow?.cnt || 0 });
  } catch (err) {
    res.status(500).json({ results: [], total: 0, error: err.message });
  }
}

export async function createAddress(req, res) {
  try {
    const { street, house_number = null, city = '', postcode = null, lat, lng, notes = null } = req.body;
    if (!street || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Wymagane pola: street, lat, lng' });
    }
    const result = await laRepo.insertAddress(street.trim(), house_number || null, city.trim(), postcode || null, parseFloat(lat), parseFloat(lng), notes || null);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateAddress(req, res) {
  try {
    const { street, house_number = null, city = '', postcode = null, lat, lng, notes = null } = req.body;
    await laRepo.updateAddress(street.trim(), house_number || null, city.trim(), postcode || null, parseFloat(lat), parseFloat(lng), notes || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteAddress(req, res) {
  try {
    await laRepo.deleteAddress(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
