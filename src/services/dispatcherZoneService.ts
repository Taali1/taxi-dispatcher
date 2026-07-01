import { dataSourceService } from './dataSourceService';
import { zoneService } from './zoneService';
import { ZoneDetectionService } from '../utils/zoneDetection';

export interface DriverWithZone {
  id: string;
  name: string;
  driverCode: string;
  status: string;
  currentLocation: { lat: number; lng: number } | null;
  currentZone: number | null;
  lastLocationUpdate: string | null;
  isOnline: boolean;
  statusChangedAt: string | null;
  freeSince: string | null;
  vehicleCategories: string[];
}

class DispatcherZoneService {
  private zoneDetection: ZoneDetectionService | null = null;
  private lastZoneMap: Map<string, number | null> = new Map();
  private cachedDrivers: DriverWithZone[] = [];
  private pendingPromise: Promise<DriverWithZone[]> | null = null;

  private parseLocation(loc: unknown): { lat: number; lng: number } | null {
    if (!loc) return null;
    if (typeof loc === 'string') {
      try {
        const parsed = JSON.parse(loc);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return parsed;
        }
      } catch {
        return null;
      }
    }
    if (typeof loc === 'object' && loc !== null && 'lat' in loc && 'lng' in loc) {
      const obj = loc as Record<string, unknown>;
      if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
        return { lat: obj.lat, lng: obj.lng };
      }
    }
    return null;
  }

  private async initZoneDetection(): Promise<boolean> {
    try {
      const zones = await zoneService.getZones();
      if (zones.length === 0) {
        this.zoneDetection = null;
        return false;
      }
      const zonePoints = zones.map(z => ({
        id: z.number,
        name: z.name,
        coordinates: z.coordinates,
      }));
      this.zoneDetection = new ZoneDetectionService(zonePoints);
      return true;
    } catch (error) {
      console.error('[DispatcherZoneService] Blad inicjalizacji detekcji stref:', error);
      return false;
    }
  }

  private async fetchDriversFromDb(): Promise<DriverWithZone[]> {
    if (!dataSourceService.isUsingExternalDatabase()) {
      return [];
    }

    try {
      const result = await dataSourceService.getAll<Record<string, unknown>>('drivers');
      if (!result.success || !result.data) {
        console.error('[DispatcherZoneService] Blad pobierania kierowcow:', result.error);
        return this.cachedDrivers;
      }

      return result.data.map(d => ({
        id: String(d.id || ''),
        name: String(d.name || ''),
        driverCode: String(d.driverCode || ''),
        status: String(d.status || 'home'),
        currentLocation: this.parseLocation(d.currentLocation),
        currentZone: typeof d.currentZone === 'number' ? d.currentZone : null,
        lastLocationUpdate: typeof d.lastLocationUpdate === 'string' ? d.lastLocationUpdate : null,
        isOnline: d.isOnline === true,
        statusChangedAt: typeof d.statusChangedAt === 'string' ? d.statusChangedAt : null,
        freeSince: typeof d.freeSince === 'string' ? d.freeSince : null,
        vehicleCategories: Array.isArray(d.vehicleCategories) ? d.vehicleCategories : ['standard'],
      }));
    } catch (error) {
      console.error('[DispatcherZoneService] Blad pobierania kierowcow:', error);
      return this.cachedDrivers;
    }
  }

  async detectAndUpdateZones(): Promise<DriverWithZone[]> {
    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    this.pendingPromise = this.doDetectAndUpdate();

    try {
      const result = await this.pendingPromise;
      return result;
    } finally {
      this.pendingPromise = null;
    }
  }

  private async doDetectAndUpdate(): Promise<DriverWithZone[]> {
    try {
      if (!this.zoneDetection) {
        const ok = await this.initZoneDetection();
        if (!ok) {
          const drivers = await this.fetchDriversFromDb();
          this.cachedDrivers = drivers;
          return drivers;
        }
      }

      const drivers = await this.fetchDriversFromDb();
      if (drivers.length === 0) {
        this.cachedDrivers = drivers;
        return drivers;
      }

      for (const driver of drivers) {
        if (!driver.currentLocation) continue;
        if (!this.zoneDetection) continue;

        const detectedZone = this.zoneDetection.detectZoneFromCoordinates(
          driver.currentLocation.lat,
          driver.currentLocation.lng
        );

        const previousZone = this.lastZoneMap.get(driver.id) ?? driver.currentZone;

        if (detectedZone !== previousZone) {
          console.log(
            `[DispatcherZoneService] Kierowca ${driver.driverCode} zmiana strefy: ${previousZone} -> ${detectedZone}`
          );

          const now = new Date().toISOString();
          const updateData: Record<string, unknown> = {
            currentZone: detectedZone,
            currentRegionNumber: detectedZone,
            zoneEnteredAt: now,
          };

          try {
            await dataSourceService.update('drivers', driver.id, updateData);
          } catch (err) {
            console.error(`[DispatcherZoneService] Blad aktualizacji strefy dla ${driver.driverCode}:`, err);
          }

          driver.currentZone = detectedZone;
          this.lastZoneMap.set(driver.id, detectedZone);
        } else {
          this.lastZoneMap.set(driver.id, detectedZone ?? previousZone);
        }
      }

      this.cachedDrivers = drivers;
      return drivers;
    } catch (error) {
      console.error('[DispatcherZoneService] Blad w doDetectAndUpdate:', error);
      return this.cachedDrivers;
    }
  }

  getCachedDrivers(): DriverWithZone[] {
    return this.cachedDrivers;
  }

  async refreshZoneDetection(): Promise<void> {
    this.zoneDetection = null;
    await this.initZoneDetection();
  }

  // Pobierz kierowców z bazą danych - strefy są już wykryte przez backend
  async getAllDriversWithZones(): Promise<DriverWithZone[]> {
    try {
      console.log('[DispatcherZoneService] Fetching drivers with zones from database');
      const drivers = await this.fetchDriversFromDb();
      this.cachedDrivers = drivers;
      return drivers;
    } catch (error) {
      console.error('[DispatcherZoneService] Error fetching drivers:', error);
      return this.cachedDrivers;
    }
  }
}

export const dispatcherZoneService = new DispatcherZoneService();
