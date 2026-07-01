const API_BASE = '/api';

export interface Preference {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface DriverPreference {
  id: number;
  driver_id: string;
  preference_id: number;
  preference_name: string;
}

class PreferencesService {
  /** Pobierz wszystkie preferencje */
  async getAll(): Promise<Preference[]> {
    try {
      const res = await fetch(`${API_BASE}/table/preferences`);
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.columns && Array.isArray(json.data.rows)) {
          const cols: string[] = json.data.columns;
          return json.data.rows.map((row: any[]) => {
            const obj: any = {};
            cols.forEach((col, i) => { obj[col] = row[i]; });
            return obj as Preference;
          });
        }
        if (Array.isArray(json.data)) {
          return json.data as Preference[];
        }
      }
      return [];
    } catch (err) {
      console.error('[PreferencesService] getAll error:', err);
      return [];
    }
  }

  /** Dodaj nowa preferencje */
  async create(name: string, color: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/insert/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      return await res.json();
    } catch (err) {
      console.error('[PreferencesService] create error:', err);
      return { success: false, error: String(err) };
    }
  }

  /** Aktualizuj preferencje */
  async update(id: number, name: string, color: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/update/preferences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      return await res.json();
    } catch (err) {
      console.error('[PreferencesService] update error:', err);
      return { success: false, error: String(err) };
    }
  }

  /** Usun preferencje */
  async delete(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/delete/preferences/${id}`, {
        method: 'DELETE',
      });
      return await res.json();
    } catch (err) {
      console.error('[PreferencesService] delete error:', err);
      return { success: false, error: String(err) };
    }
  }

  /** Pobierz preferencje kierowcy z drivers.preference_ids */
  async getDriverPreferences(driverId: string): Promise<DriverPreference[]> {
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT preference_ids FROM drivers WHERE id = ?`,
          params: [driverId],
        }),
      });
      const json = await res.json();
      const row = json.data?.[0];
      if (!row) return [];
      let ids: number[] = [];
      try {
        const raw = row.preference_ids;
        ids = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      } catch { return []; }
      if (!ids.length) return [];
      const allPrefs = await this.getAll();
      return ids.map((prefId, i) => ({
        id: i + 1,
        driver_id: driverId,
        preference_id: Number(prefId),
        preference_name: allPrefs.find(p => Number(p.id) === Number(prefId))?.name ?? '',
      }));
    } catch (err) {
      console.error('[PreferencesService] getDriverPreferences error:', err);
      return [];
    }
  }

  /** Zapisz preferencje kierowcy — drivers.preference_ids (używane przez cały system) */
  async setDriverPreferences(driverId: string, preferenceIds: number[]): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `UPDATE drivers SET preference_ids = ? WHERE id = ?`,
          params: [JSON.stringify(preferenceIds), driverId],
        }),
      });
      return await res.json();
    } catch (err) {
      console.error('[PreferencesService] setDriverPreferences error:', err);
      return { success: false, error: String(err) };
    }
  }

  /** Przypisz pojedyncza preferencje do kierowcy */
  async assignPreference(driverId: string, preferenceId: number): Promise<{ success: boolean; error?: string }> {
    const current = await this.getDriverPreferences(driverId);
    const ids = current.map(dp => dp.preference_id);
    if (!ids.includes(preferenceId)) {
      ids.push(preferenceId);
    }
    return this.setDriverPreferences(driverId, ids);
  }

  /** Usun pojedyncza preferencje z kierowcy */
  async removePreference(driverId: string, preferenceId: number): Promise<{ success: boolean; error?: string }> {
    const current = await this.getDriverPreferences(driverId);
    const ids = current.map(dp => dp.preference_id).filter(id => id !== preferenceId);
    return this.setDriverPreferences(driverId, ids);
  }
}

export const preferencesService = new PreferencesService();
