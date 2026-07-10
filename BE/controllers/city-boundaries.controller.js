import * as cbRepo from '../repository/city-boundaries.repository.js';

export async function listCityBoundaries(req, res) {
  try {
    const rows = await cbRepo.listCityBoundaries();
    res.json({ success: true, data: rows ?? [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createCityBoundary(req, res) {
  const { id, name, color, coordinates } = req.body;
  if (!name || !coordinates) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  const newId = id || require('crypto').randomUUID();
  const coordsStr = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
  try {
    await cbRepo.insertCityBoundary(newId, name.trim(), color || '#f97316', coordsStr);
    res.json({ success: true, id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateCityBoundary(req, res) {
  const { name, color, coordinates } = req.body;
  if (!name || !coordinates) return res.status(400).json({ success: false, error: 'Brak wymaganych pól' });
  const coordsStr = typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates);
  try {
    try {
      await cbRepo.updateCityBoundaryWithTimestamp(name.trim(), color || '#f97316', coordsStr, req.params.id);
    } catch {
      await cbRepo.updateCityBoundaryNoTimestamp(name.trim(), color || '#f97316', coordsStr, req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteCityBoundary(req, res) {
  try {
    await cbRepo.deleteCityBoundary(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
