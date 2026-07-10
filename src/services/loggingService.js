export function createLoggingService({ logsRepository }) {
  async function addOrderLog(orderId, type, message, data = null) {
    try {
      await logsRepository.insertOrderLog(orderId, type, message, data);
    } catch (e) {
      console.error('[OrderLog] Błąd zapisu logu:', e.message);
    }
  }

  async function addDriverLog(driverId, type, title, description = null, metadata = null) {
    if (!driverId) return;
    try {
      await logsRepository.insertDriverLog(driverId, type, title, description, metadata);
    } catch (e) {
      console.error('[DriverLog] Błąd zapisu logu:', e.message);
    }
  }

  async function addSystemLog({ type, category = 'general', userId = null, userName = null, userRole = null, description, metadata = null, ipAddress = null }) {
    try {
      await logsRepository.insertSystemLog({ type, category, userId, userName, userRole, description, metadata, ipAddress });
    } catch (e) {
      console.error('[SystemLog] Błąd zapisu logu:', e.message);
    }
  }

  return { addOrderLog, addDriverLog, addSystemLog };
}
