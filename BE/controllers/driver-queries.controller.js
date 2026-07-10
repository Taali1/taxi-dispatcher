import * as dqRepo from '../repository/driver-queries.repository.js';

export async function createDriverQuery(req, res) {
  const { driver_id, question } = req.body;
  if (!driver_id || !question) return res.status(400).json({ success: false, error: 'driver_id i question są wymagane' });
  try {
    await dqRepo.insertDriverQuery(driver_id, question);
    res.json({ success: true });
  } catch (e) {
    console.error('[DriverQueries] POST error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
}

export async function getRecentAnswers(req, res) {
  try {
    const rows = await dqRepo.getRecentAnswers();
    res.json({ success: true, answers: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.error('[DriverQueries] recent-answers error:', e.message);
    res.status(500).json({ success: false, answers: [] });
  }
}

export async function getPendingQuery(req, res) {
  try {
    const rows = await dqRepo.getPendingQuery(req.params.driverId);
    const query = Array.isArray(rows) ? rows[0] : null;
    res.json({ success: true, query: query ?? null });
  } catch (e) {
    console.error('[DriverQueries] pending error:', e.message);
    res.status(500).json({ success: false, query: null, error: e.message });
  }
}

export async function respondToQuery(req, res) {
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ success: false, error: 'answer jest wymagany' });
  try {
    await dqRepo.respondToQuery(answer, req.params.queryId);
    res.json({ success: true });
  } catch (e) {
    console.error('[DriverQueries] respond error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
}
