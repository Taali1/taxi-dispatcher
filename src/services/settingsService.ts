import { dataSourceService } from './dataSourceService';

export interface AppSettings {
  baseCity: string;
}

const DEFAULT_SETTINGS: AppSettings = { baseCity: '' };

class SettingsService {
  private cache: AppSettings | null = null;

  async getSettings(): Promise<AppSettings> {
    if (this.cache) return this.cache;

    await dataSourceService.waitForConfigLoad();

    if (!dataSourceService.isUsingExternalDatabase()) {
      return DEFAULT_SETTINGS;
    }

    try {
      const result = await dataSourceService.query<{ baseCity: string }>(
        'SELECT base_city FROM settings LIMIT 1'
      );
      if (result.success && result.data && result.data.length > 0) {
        const row = result.data[0];
        this.cache = {
          baseCity: row.baseCity || DEFAULT_SETTINGS.baseCity,
        };
        return this.cache;
      }
    } catch (e) {
      console.error('[SettingsService] Błąd pobierania ustawień:', e);
    }

    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<boolean> {
    if (!dataSourceService.isUsingExternalDatabase()) {
      return false;
    }

    try {
      const check = await dataSourceService.query<{ id: number }>(
        'SELECT id FROM settings LIMIT 1'
      );

      if (check.success && check.data && check.data.length > 0) {
        const id = (check.data[0] as unknown as { id: number }).id;
        await dataSourceService.query(
          'UPDATE settings SET base_city = ? WHERE id = ?',
          [settings.baseCity, id]
        );
      } else {
        await dataSourceService.query(
          'INSERT INTO settings (base_city) VALUES (?)',
          [settings.baseCity]
        );
      }

      this.cache = { ...settings };
      return true;
    } catch (e) {
      console.error('[SettingsService] Błąd zapisu ustawień:', e);
      return false;
    }
  }

  invalidateCache() {
    this.cache = null;
  }
}

export const settingsService = new SettingsService();
