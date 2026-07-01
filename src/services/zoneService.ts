import { dataSourceService } from './dataSourceService';

export interface Zone {
  id: string;
  name: string;
  number: number;
  coordinates: { lat: number; lng: number }[];
  driversCount: number;
  color?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
  preference_id?: number | null;
  scheduledDispatchMinutes?: number;
}

interface ZoneDbRecord {
  id: string;
  name: string;
  number: number;
  coordinates: string | { lat: number; lng: number }[];
  drivers_count: number;
  color?: string;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  preference_id?: number | null;
  scheduled_dispatch_minutes?: number;
}

class ZoneService {
  private cache: Zone[] = [];
  private isInitialized = false;
  private isUpdating = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadData();
    this.isInitialized = true;

    dataSourceService.onDataChange((table) => {
      if (table === 'zones' && !this.isUpdating) {
        this.loadData();
      }
    });

    dataSourceService.onConfigChange(() => {
      console.log('[ZoneService] Config changed, reloading data...');
      this.loadData();
    });
  }

  private async loadData() {
    if (dataSourceService.isUsingExternalDatabase()) {
      await this.loadFromExternalDatabase();
    } else {
      this.cache = this.loadFromStorage();
    }
  }

  private async loadFromExternalDatabase() {
    try {
      const result = await dataSourceService.getAll<ZoneDbRecord>('zones');

      if (result.success && result.data) {
        this.cache = result.data.map(zone => this.convertDbRecordToZone(zone));
        console.log('[ZoneService] Loaded from external DB:', this.cache.length, 'zones');
      } else {
        console.error('[ZoneService] Error loading from external DB:', result.error);
        this.cache = [];
      }
    } catch (error) {
      console.error('[ZoneService] Error loading from external DB:', error);
      this.cache = [];
    }
  }

  private convertDbRecordToZone(record: ZoneDbRecord): Zone {
    let coordinates: { lat: number; lng: number }[] = [];

    if (typeof record.coordinates === 'string') {
      try {
        coordinates = JSON.parse(record.coordinates);
      } catch {
        coordinates = record.coordinates.split(';').map(coord => {
          const [lat, lng] = coord.split(',').map(Number);
          return { lat, lng };
        });
      }
    } else {
      coordinates = record.coordinates;
    }

    return {
      id: record.id,
      name: record.name,
      number: record.number,
      coordinates,
      driversCount: record.drivers_count,
      color: record.color,
      isActive: record.is_active,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      preference_id: record.preference_id ?? null,
      scheduledDispatchMinutes: record.scheduled_dispatch_minutes ?? 10,
    };
  }

  private convertZoneToDbRecord(zone: Partial<Zone>): Partial<ZoneDbRecord> {
    const dbRecord: Partial<ZoneDbRecord> = {
      id: zone.id,
      name: zone.name,
      number: zone.number,
      drivers_count: zone.driversCount,
      color: zone.color,
      is_active: zone.isActive,
      created_at: zone.createdAt,
      updated_at: zone.updatedAt,
      scheduled_dispatch_minutes: zone.scheduledDispatchMinutes,
    };

    if (zone.coordinates) {
      dbRecord.coordinates = JSON.stringify(zone.coordinates);
    }

    return dbRecord;
  }

  private loadFromStorage(): Zone[] {
    try {
      const stored = localStorage.getItem('taxi_zones');
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('[ZoneService] Error loading from localStorage:', error);
    }
    return [];
  }

  private saveToStorage(zones: Zone[]): void {
    try {
      localStorage.setItem('taxi_zones', JSON.stringify(zones));
    } catch (error) {
      console.error('[ZoneService] Error saving to localStorage:', error);
    }
  }

  private async saveData(zones: Zone[]): Promise<void> {
    this.cache = zones;
    if (!dataSourceService.isUsingExternalDatabase()) {
      this.saveToStorage(zones);
    }
  }

  async getZones(): Promise<Zone[]> {
    return [...this.cache].sort((a, b) => a.number - b.number);
  }

  async getZoneById(id: string): Promise<Zone | null> {
    return this.cache.find(z => z.id === id) || null;
  }

  async getZoneByNumber(number: number): Promise<Zone | null> {
    return this.cache.find(z => z.number === number) || null;
  }

  async createZone(zone: Omit<Zone, 'id' | 'createdAt' | 'updatedAt'>): Promise<Zone> {
    this.isUpdating = true;
    try {
      const newZone: Zone = {
        ...zone,
        id: `zone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        driversCount: zone.driversCount ?? 0,
        color: zone.color ?? '#3b82f6',
        isActive: zone.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (dataSourceService.isUsingExternalDatabase()) {
        const dbRecord = this.convertZoneToDbRecord(newZone);
        const result = await dataSourceService.insert('zones', dbRecord);

        if (!result.success) {
          throw new Error(result.error || 'Failed to create zone in database');
        }
      }

      this.cache.push(newZone);
      await this.saveData(this.cache);
      return newZone;
    } finally {
      this.isUpdating = false;
    }
  }

  async updateZone(id: string, updates: Partial<Omit<Zone, 'id' | 'createdAt'>>): Promise<Zone> {
    this.isUpdating = true;
    try {
      const index = this.cache.findIndex(z => z.id === id);
      if (index === -1) {
        throw new Error('Zone not found');
      }

      const updatedZone: Zone = {
        ...this.cache[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      if (dataSourceService.isUsingExternalDatabase()) {
        const dbRecord = this.convertZoneToDbRecord(updates);
        const result = await dataSourceService.update('zones', id, dbRecord);

        if (!result.success) {
          throw new Error(result.error || 'Failed to update zone in database');
        }
      }

      this.cache[index] = updatedZone;
      await this.saveData(this.cache);
      return updatedZone;
    } finally {
      this.isUpdating = false;
    }
  }

  async deleteZone(id: string): Promise<void> {
    this.isUpdating = true;
    try {
      if (dataSourceService.isUsingExternalDatabase()) {
        const result = await dataSourceService.delete('zones', id);

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete zone from database');
        }
      }

      this.cache = this.cache.filter(z => z.id !== id);
      await this.saveData(this.cache);
    } finally {
      this.isUpdating = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  initializeMockZones(): Zone[] {
    return [
      {
        id: 'zone_54',
        name: 'Brzoza',
        number: 54,
        coordinates: [
          { lat: 50.0647, lng: 19.9450 },
          { lat: 50.0650, lng: 19.9550 },
          { lat: 50.0550, lng: 19.9550 },
          { lat: 50.0550, lng: 19.9450 },
        ],
        driversCount: 0,
        color: '#3b82f6',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'zone_148',
        name: 'Rejon 148',
        number: 148,
        coordinates: [
          { lat: 50.0747, lng: 19.9350 },
          { lat: 50.0750, lng: 19.9450 },
          { lat: 50.0650, lng: 19.9450 },
          { lat: 50.0650, lng: 19.9350 },
        ],
        driversCount: 0,
        color: '#3b82f6',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

export const zoneService = new ZoneService();
