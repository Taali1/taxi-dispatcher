import * as blocksRepo from '../repository/blocks.repository.js';

export async function getBlocksForDriver(req, res) {
  try {
    const rows = await blocksRepo.getBlocksForDriver(req.params.driverId);
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function getBlocksForClient(req, res) {
  try {
    const rows = await blocksRepo.getBlocksForClient(req.params.clientId);
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function createBlock(req, res) {
  const { driver_id, client_id, blocked_by, reason } = req.body;
  if (!driver_id || !client_id || !blocked_by) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  try {
    const result = await blocksRepo.insertBlock(driver_id, client_id, blocked_by, reason);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.message.includes('Duplicate')) return res.json({ success: false, error: 'Blokada już istnieje' });
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getBlocksByPhone(req, res) {
  const phone = decodeURIComponent(req.params.phone || '').trim();
  if (!phone) return res.json({ success: true, data: [] });
  try {
    const rows = await blocksRepo.getBlocksByPhone(phone);
    res.json({ success: true, data: (rows ?? []).map(r => r.driver_id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteBlock(req, res) {
  try {
    const blockRows = await blocksRepo.getBlockPair(req.params.id);
    if (!blockRows || blockRows.length === 0) {
      return res.json({ success: true });
    }
    const { driver_id, client_id } = blockRows[0];
    await blocksRepo.deleteBlockPair(driver_id, client_id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function searchDrivers(req, res) {
  const q = `%${req.query.q ?? ''}%`;
  try {
    const rows = await blocksRepo.searchDrivers(q);
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}

export async function searchClients(req, res) {
  const q = `%${req.query.q ?? ''}%`;
  try {
    const rows = await blocksRepo.searchClients(q);
    res.json({ success: true, data: rows ?? [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
}
