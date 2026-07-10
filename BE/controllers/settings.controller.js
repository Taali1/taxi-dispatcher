import { addSystemLog } from '../shared/helpers.js';
import * as settingsRepo from '../repository/settings.repository.js';

export async function getSettings(req, res) {
  try {
    const rows = await settingsRepo.getSettingsRow();
    if (!rows || rows.length === 0) {
      await settingsRepo.insertDefaultSettings();
      return res.json({ success: true, data: { id: 1, base_city: 'Bydgoszcz' } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Settings] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function postSettings(req, res) {
  const { base_city, pin_style } = req.body;
  if (!base_city || typeof base_city !== 'string') {
    return res.status(400).json({ success: false, error: 'Brakuje pola base_city' });
  }
  const validPinStyles = ['classic', 'pulse', 'badge', 'arrow'];
  const pinStyleValue = pin_style && validPinStyles.includes(pin_style) ? pin_style : 'classic';
  try {
    const rows = await settingsRepo.getSettingsIdRow();
    if (!rows || rows.length === 0) {
      await settingsRepo.insertSettings(base_city.trim(), pinStyleValue);
    } else {
      await settingsRepo.updateSettings(base_city.trim(), pinStyleValue, rows[0].id);
    }
    addSystemLog({ type: 'settings_update', category: 'admin', description: `Zaktualizowano ustawienia systemowe (miasto: ${base_city.trim()}, styl pinów: ${pinStyleValue})`, metadata: { base_city: base_city.trim(), pin_style: pinStyleValue } });
    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Pomocnicza funkcja — upewnij się że kolumny gielda_* istnieją
export async function ensureGieldaColumn() {
  try {
    const cols = await settingsRepo.showSettingsColumns();
    const colNames = cols.map(c => c.Field);
    if (!colNames.includes('gielda_timeout_minutes')) {
      await settingsRepo.addSettingsColumn('ALTER TABLE settings ADD COLUMN gielda_timeout_minutes INT DEFAULT 3');
      console.log('[GieldaSettings] Added gielda_timeout_minutes column');
    }
    if (!colNames.includes('gielda_enabled')) {
      await settingsRepo.addSettingsColumn('ALTER TABLE settings ADD COLUMN gielda_enabled TINYINT(1) DEFAULT 1');
      console.log('[GieldaSettings] Added gielda_enabled column');
    }
    if (!colNames.includes('gielda_registration_seconds')) {
      await settingsRepo.addSettingsColumn('ALTER TABLE settings ADD COLUMN gielda_registration_seconds INT DEFAULT 15');
      console.log('[GieldaSettings] Added gielda_registration_seconds column');
    }
    if (!colNames.includes('gielda_hours_enabled')) {
      await settingsRepo.addSettingsColumn(`ALTER TABLE settings ADD COLUMN gielda_hours_enabled TINYINT(1) DEFAULT 0`);
      console.log('[GieldaSettings] Added gielda_hours_enabled column');
    }
    if (!colNames.includes('gielda_hours_from')) {
      await settingsRepo.addSettingsColumn(`ALTER TABLE settings ADD COLUMN gielda_hours_from VARCHAR(5) DEFAULT '00:00'`);
      console.log('[GieldaSettings] Added gielda_hours_from column');
    }
    if (!colNames.includes('gielda_hours_to')) {
      await settingsRepo.addSettingsColumn(`ALTER TABLE settings ADD COLUMN gielda_hours_to VARCHAR(5) DEFAULT '23:59'`);
      console.log('[GieldaSettings] Added gielda_hours_to column');
    }
    if (!colNames.includes('gielda_priority_order')) {
      await settingsRepo.addSettingsColumn(`ALTER TABLE settings ADD COLUMN gielda_priority_order VARCHAR(100) DEFAULT 'wolna,kursem,dojazd,zajeta'`);
      console.log('[GieldaSettings] Added gielda_priority_order column');
    }
  } catch (e) {
    console.warn('[GieldaSettings] ensureGieldaColumn:', e.message);
  }
}

// GET /api/settings/gielda
export async function getGieldaSettings(req, res) {
  try {
    await ensureGieldaColumn();
    const rows = await settingsRepo.getGieldaSettingsRow();
    const row = rows?.[0] ?? {};
    res.json({
      success: true,
      data: {
        gielda_timeout_minutes:        row.gielda_timeout_minutes ?? 3,
        gielda_enabled:                row.gielda_enabled != null ? row.gielda_enabled : 1,
        gielda_registration_seconds:   row.gielda_registration_seconds ?? 15,
        gielda_hours_enabled:          row.gielda_hours_enabled != null ? row.gielda_hours_enabled : 0,
        gielda_hours_from:             row.gielda_hours_from ?? '00:00',
        gielda_hours_to:               row.gielda_hours_to ?? '23:59',
        gielda_priority_order:         row.gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta',
        gielda_auto_dispatch_wolna:    row.gielda_auto_dispatch_wolna ?? 0,
        gielda_auto_dispatch_dojazd:   row.gielda_auto_dispatch_dojazd ?? 0,
      }
    });
  } catch (err) {
    console.error('[GieldaSettings] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/settings/gielda
export async function postGieldaSettings(req, res) {
  const { gielda_timeout_minutes, gielda_enabled, gielda_registration_seconds, gielda_hours_enabled, gielda_hours_from, gielda_hours_to, gielda_priority_order, gielda_auto_dispatch_wolna, gielda_auto_dispatch_dojazd } = req.body;

  if (gielda_timeout_minutes !== undefined) {
    const val = parseInt(gielda_timeout_minutes);
    if (isNaN(val) || val < 1 || val > 999) {
      return res.status(400).json({ success: false, error: 'Timeout musi być liczbą od 1 do 999' });
    }
  }
  if (gielda_registration_seconds !== undefined) {
    const val = parseInt(gielda_registration_seconds);
    if (isNaN(val) || val < 0 || val > 3600) {
      return res.status(400).json({ success: false, error: 'Czas rejestracji musi być od 0 do 3600' });
    }
  }
  const timeRe = /^\d{2}:\d{2}$/;
  if (gielda_hours_from !== undefined && !timeRe.test(gielda_hours_from)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy format godziny od (HH:MM)' });
  }
  if (gielda_hours_to !== undefined && !timeRe.test(gielda_hours_to)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy format godziny do (HH:MM)' });
  }
  if (gielda_priority_order !== undefined && (typeof gielda_priority_order !== 'string' || gielda_priority_order.trim() === '')) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowa kolejność priorytetów' });
  }

  try {
    await ensureGieldaColumn();
    const rows = await settingsRepo.getSettingsIdRow();
    if (!rows || rows.length === 0) {
      await settingsRepo.insertGieldaSettings([
        'Bydgoszcz',
        gielda_timeout_minutes != null ? parseInt(gielda_timeout_minutes) : 3,
        gielda_enabled != null ? (gielda_enabled ? 1 : 0) : 1,
        gielda_registration_seconds != null ? parseInt(gielda_registration_seconds) : 15,
        gielda_hours_enabled != null ? (gielda_hours_enabled ? 1 : 0) : 0,
        gielda_hours_from ?? '00:00',
        gielda_hours_to ?? '23:59',
        gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta',
      ]);
    } else {
      const setParts = [];
      const setVals = [];
      if (gielda_timeout_minutes !== undefined) { setParts.push('gielda_timeout_minutes = ?'); setVals.push(parseInt(gielda_timeout_minutes)); }
      if (gielda_enabled !== undefined) { setParts.push('gielda_enabled = ?'); setVals.push(gielda_enabled ? 1 : 0); }
      if (gielda_registration_seconds !== undefined) { setParts.push('gielda_registration_seconds = ?'); setVals.push(parseInt(gielda_registration_seconds)); }
      if (gielda_hours_enabled !== undefined) { setParts.push('gielda_hours_enabled = ?'); setVals.push(gielda_hours_enabled ? 1 : 0); }
      if (gielda_hours_from !== undefined) { setParts.push('gielda_hours_from = ?'); setVals.push(gielda_hours_from); }
      if (gielda_hours_to !== undefined) { setParts.push('gielda_hours_to = ?'); setVals.push(gielda_hours_to); }
      if (gielda_priority_order !== undefined) { setParts.push('gielda_priority_order = ?'); setVals.push(gielda_priority_order); }
      if (gielda_auto_dispatch_wolna !== undefined) { setParts.push('gielda_auto_dispatch_wolna = ?'); setVals.push(gielda_auto_dispatch_wolna ? 1 : 0); }
      if (gielda_auto_dispatch_dojazd !== undefined) { setParts.push('gielda_auto_dispatch_dojazd = ?'); setVals.push(gielda_auto_dispatch_dojazd ? 1 : 0); }
      if (setParts.length > 0) {
        setVals.push(rows[0].id);
        await settingsRepo.updateGieldaSettings(setParts.join(', '), setVals);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[GieldaSettings] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
