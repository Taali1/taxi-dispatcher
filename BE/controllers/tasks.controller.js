import { generateUUID } from '../shared/helpers.js';
import * as tasksRepo from '../repository/tasks.repository.js';

export async function getTasks(req, res) {
  try {
    const rows = await tasksRepo.listTasks();
    res.json({ success: true, data: rows ?? [] });
  } catch (err) {
    console.error('[Tasks] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createTask(req, res) {
  const { title, description, taxi_code, operator, order_id, order_number, source } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Tytuł zadania jest wymagany' });
  }
  try {
    const id = generateUUID();
    await tasksRepo.insertTask([id, title, description || null, taxi_code || null, operator || null, order_id || null, order_number || null, source || 'manual']);
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[Tasks] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateTaskStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['new', 'in_progress', 'done', 'dismissed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy status' });
  }
  try {
    await tasksRepo.updateTaskStatus(status, id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Tasks] PATCH status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteTask(req, res) {
  const { id } = req.params;
  try {
    await tasksRepo.softDeleteTask(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Tasks] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GIEŁDA AUTO-TASK — sprawdzanie co 30s czy zlecenia na giełdzie nie czekają za długo
// ────────────────────────────────────────────────────────────────────────────
let gieldaCheckInterval = null;

export async function checkGieldaTimeout() {
  try {
    const settings = await tasksRepo.getGieldaTimeoutMinutes();
    const timeoutMin = (settings && settings.length > 0 && settings[0].gielda_timeout_minutes)
      ? settings[0].gielda_timeout_minutes
      : 3;

    const overdueOrders = await tasksRepo.getOverdueMarketOrders(timeoutMin);

    if (!overdueOrders || overdueOrders.length === 0) return;

    for (const order of overdueOrders) {
      const existing = await tasksRepo.findTaskByOrderId(order.id);
      if (existing && existing.length > 0) continue;

      const id = generateUUID();
      const title = `Zlecenie czeka za długo na giełdzie`;
      const desc = `Adres: ${order.pickup_address || '—'}, Tel: ${order.customer_phone || '—'}`;

      await tasksRepo.insertSystemTaskForOverdueOrder(id, title, desc, order.id, order.order_number);
      console.log(`[GieldaCheck] Utworzono zadanie dla zlecenia ${order.order_number} (czeka ${order.waiting_minutes} min)`);
    }
  } catch (err) {
    console.error('[GieldaCheck] Error:', err.message);
  }
}

export function startGieldaCheck() {
  if (gieldaCheckInterval) clearInterval(gieldaCheckInterval);
  gieldaCheckInterval = setInterval(checkGieldaTimeout, 30000);
  console.log('[GieldaCheck] Started (interval: 30s)');
}
