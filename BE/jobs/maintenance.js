// ============================================================================
// MAINTENANCE JOBS — offline kierowcy + timeout zleceń
// Orkiestruje interwały łączące logikę z drivers.controller i orders.controller
// ============================================================================
import { checkOfflineDrivers } from '../controllers/drivers.controller.js';
import { checkPendingDriverTimeout } from '../controllers/orders.controller.js';

let maintenanceInterval = null;
let pendingTimeoutInterval = null;

export function startMaintenance() {
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  if (pendingTimeoutInterval) clearInterval(pendingTimeoutInterval);

  maintenanceInterval = setInterval(checkOfflineDrivers, 30000);
  pendingTimeoutInterval = setInterval(checkPendingDriverTimeout, 15000);

  console.log('[Maintenance] Started (offline: 30s, pendingTimeout: 15s)');
  // Uruchom natychmiast przy starcie
  checkOfflineDrivers();
  checkPendingDriverTimeout();
}
