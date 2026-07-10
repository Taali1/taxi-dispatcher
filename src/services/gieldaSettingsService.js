export function createGieldaSettingsService({ safeQuery }) {
  async function ensureGieldaColumn() {
    try {
      const cols = await safeQuery('SHOW COLUMNS FROM settings');
      const colNames = cols.map(c => c.Field);
      if (!colNames.includes('gielda_timeout_minutes')) {
        await safeQuery('ALTER TABLE settings ADD COLUMN gielda_timeout_minutes INT DEFAULT 3');
        console.log('[GieldaSettings] Added gielda_timeout_minutes column');
      }
      if (!colNames.includes('gielda_enabled')) {
        await safeQuery('ALTER TABLE settings ADD COLUMN gielda_enabled TINYINT(1) DEFAULT 1');
        console.log('[GieldaSettings] Added gielda_enabled column');
      }
      if (!colNames.includes('gielda_registration_seconds')) {
        await safeQuery('ALTER TABLE settings ADD COLUMN gielda_registration_seconds INT DEFAULT 15');
        console.log('[GieldaSettings] Added gielda_registration_seconds column');
      }
      if (!colNames.includes('gielda_hours_enabled')) {
        await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_enabled TINYINT(1) DEFAULT 0`);
        console.log('[GieldaSettings] Added gielda_hours_enabled column');
      }
      if (!colNames.includes('gielda_hours_from')) {
        await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_from VARCHAR(5) DEFAULT '00:00'`);
        console.log('[GieldaSettings] Added gielda_hours_from column');
      }
      if (!colNames.includes('gielda_hours_to')) {
        await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_to VARCHAR(5) DEFAULT '23:59'`);
        console.log('[GieldaSettings] Added gielda_hours_to column');
      }
      if (!colNames.includes('gielda_priority_order')) {
        await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_priority_order VARCHAR(100) DEFAULT 'wolna,kursem,dojazd,zajeta'`);
        console.log('[GieldaSettings] Added gielda_priority_order column');
      }
    } catch (e) {
      console.warn('[GieldaSettings] ensureGieldaColumn:', e.message);
    }
  }

  return { ensureGieldaColumn };
}
