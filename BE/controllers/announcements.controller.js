import { nowPolish } from '../shared/helpers.js';
import * as annRepo from '../repository/announcements.repository.js';

let announcementsMigrated = false;

async function migrateAnnouncements() {
  if (announcementsMigrated) return;
  try {
    await annRepo.addAnnouncementColumn('announcements', 'scheduled_at', 'DATETIME NULL');
    await annRepo.addAnnouncementColumn('announcements', 'send_mode', "VARCHAR(10) DEFAULT 'now'");
    await annRepo.addAnnouncementColumn('announcements', 'repeat_config', 'JSON NULL');
    await annRepo.addAnnouncementColumn('announcements', 'confirmed_count', 'INT DEFAULT 0');
    await annRepo.createAnnouncementConfirmationsTable();
    announcementsMigrated = true;
    console.log('[Announcements] Schema migration OK');
  } catch (e) { console.error('[Announcements] Migration FAILED:', e.message); }
}

export async function getAnnouncements(req, res) {
  await migrateAnnouncements();
  try {
    const rows = announcementsMigrated
      ? await annRepo.listAnnouncementsFull()
      : await annRepo.listAnnouncementsBasic();
    return res.json({ success: true, announcements: rows ?? [] });
  } catch (err) {
    console.error('[Announcements] GET error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function postAnnouncement(req, res) {
  await migrateAnnouncements();
  const { senderId, senderName, message, scheduledAt, repeat, repeatUntil, repeatWeeks, repeatDays } = req.body;
  if (!senderId || !message?.trim()) return res.status(400).json({ success: false, error: 'Brak danych' });
  try {
    const sendMode = scheduledAt ? 'later' : 'now';
    const repeatConfig = repeat ? JSON.stringify({ until: repeatUntil, weeks: repeatWeeks, days: repeatDays }) : null;
    const schedAtStr = sendMode === 'later' && scheduledAt
      ? scheduledAt.replace('T', ' ').slice(0, 16) + ':00'
      : null;
    console.log('[Announcements] POST - sendMode:', sendMode, 'scheduledAt raw:', scheduledAt, 'stored:', schedAtStr);

    if (announcementsMigrated) {
      await annRepo.insertAnnouncementFull([senderId, senderName, message.trim(), schedAtStr ?? nowPolish(), sendMode, repeatConfig]);
      console.log('[Announcements] INSERT OK - send_mode:', sendMode);
    } else {
      console.error('[Announcements] Migration not done! Using old INSERT');
      await annRepo.insertAnnouncementBasic(senderId, senderName, message.trim());
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[Announcements] POST error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Driver fetches announcements — returns all that are due and not yet confirmed by this driver
export async function getLatestAnnouncements(req, res) {
  await migrateAnnouncements();
  const { since, driverId } = req.query;
  try {
    let rows;
    const sinceVal = since ?? new Date(Date.now() - 60000).toISOString();
    const now = nowPolish();

    if (driverId && announcementsMigrated) {
      rows = await annRepo.getLatestAnnouncementsForDriver(driverId, now);
    } else if (announcementsMigrated) {
      rows = await annRepo.getLatestAnnouncementsMigrated(now, sinceVal);
    } else {
      rows = await annRepo.getLatestAnnouncementsBasic(sinceVal);
    }
    console.log('[Announcements/latest] now(PL):', now, 'driverId:', driverId, 'returned:', (rows ?? []).length);
    return res.json({ success: true, announcements: rows ?? [] });
  } catch (err) {
    console.error('[Announcements/latest] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Driver confirms reading an announcement
export async function confirmAnnouncement(req, res) {
  const { id } = req.params;
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ success: false, error: 'Brak driverId' });
  try {
    await annRepo.confirmAnnouncement(id, driverId);
    await annRepo.updateConfirmedCount(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Scheduled announcements repeater — runs every minute, creates copies for repeat configs
let repeaterInterval = null;

async function repeaterTick() {
  try {
    const rows = await annRepo.getRepeatableAnnouncements();
    if (!rows || rows.length === 0) return;
    const now = new Date();
    for (const ann of rows) {
      try {
        const cfg = typeof ann.repeat_config === 'string' ? JSON.parse(ann.repeat_config) : ann.repeat_config;
        if (!cfg || !cfg.days) continue;
        const until = cfg.until ? new Date(cfg.until) : null;
        if (until && now > until) continue;
        const dayOfWeek = now.getDay(); // 0=Sun, need to map to Mon=0
        const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        if (!cfg.days[dayIdx]) continue;
        const todayStr = now.toISOString().slice(0, 10);
        const existing = await annRepo.findExistingRepeatForToday(ann.sender_id, ann.message, todayStr, ann.id);
        if (existing && existing.length > 0) continue;
        const schedTime = new Date(ann.scheduled_at);
        const newSched = new Date(`${todayStr}T${String(schedTime.getHours()).padStart(2,'0')}:${String(schedTime.getMinutes()).padStart(2,'0')}:00`);
        if (newSched > now) continue;
        await annRepo.insertRepeatCopy(ann.sender_id, ann.sender_name, ann.message, newSched);
        console.log(`[Announcements] Repeated announcement ${ann.id} for ${todayStr}`);
      } catch (e) { console.error('[Announcements] Repeat error:', e.message); }
    }
  } catch {}
}

export function startAnnouncementsRepeater() {
  if (repeaterInterval) clearInterval(repeaterInterval);
  repeaterInterval = setInterval(repeaterTick, 60000);
}
