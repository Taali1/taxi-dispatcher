let announcementsMigrated = false;

export function createAnnouncementsService({ safeQuery }) {
  async function migrateAnnouncements() {
    if (announcementsMigrated) return;
    const addCol = async (table, col, def) => {
      try {
        await safeQuery(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[Migration] Added ${col} to ${table}`);
      } catch (e) {
        console.log(`[Migration] Column ${col}: ${e.message.includes('Duplicate') ? 'already exists' : e.message}`);
      }
    };
    try {
      await addCol('announcements', 'scheduled_at', 'DATETIME NULL');
      await addCol('announcements', 'send_mode', "VARCHAR(10) DEFAULT 'now'");
      await addCol('announcements', 'repeat_config', 'JSON NULL');
      await addCol('announcements', 'confirmed_count', 'INT DEFAULT 0');
      await safeQuery(`CREATE TABLE IF NOT EXISTS announcement_confirmations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        announcement_id INT NOT NULL,
        driver_id VARCHAR(36) NOT NULL,
        confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ann_driver (announcement_id, driver_id)
      )`);
      announcementsMigrated = true;
      console.log('[Announcements] Schema migration OK');
    } catch (e) {
      console.error('[Announcements] Migration FAILED:', e.message);
    }
  }

  return {
    migrateAnnouncements,
    get announcementsMigrated() { return announcementsMigrated; },
  };
}
