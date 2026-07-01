import { userService } from './userService';
import { zoneService } from './zoneService';
import { ZoneDetectionService } from '../utils/zoneDetection';
import { dataSourceService } from './dataSourceService';

export class DriverLocationService {
  private updateInterval: number | null = null;
  private watchId: number | null = null; // watchPosition ID
  private lastKnownLocation: { lat: number; lng: number } | null = null;
  private zoneDetectionService: ZoneDetectionService | null = null;
  private currentDriverZone: Map<string, number | null> = new Map();
  private isSaving = false; // Throttle - zapobiega kolejkowaniu requestów
  private pendingLocation: { lat: number; lng: number } | null = null; // Bufor ostatniej pozycji

  async initializeZoneDetection() {
    try {
      console.log('[DriverLocationService] Loading zones from zoneService...');
      const zones = await zoneService.getZones();
      console.log('[DriverLocationService] Loaded zones:', zones.length);

      if (zones.length === 0) {
        console.warn('[DriverLocationService] No zones defined in database.');
      }

      const zonePoints = zones.map(zone => ({
        id: zone.number,
        name: zone.name,
        coordinates: zone.coordinates,
      }));
      this.zoneDetectionService = new ZoneDetectionService(zonePoints);
      console.log('[DriverLocationService] Zone detection initialized with', zonePoints.length, 'zones');
    } catch (error) {
      console.error('[DriverLocationService] Error initializing zone detection:', error);
    }
  }

  async startLocationTracking(driverId: string) {
    // GUARD: Jeśli tracking już działa, najpierw zatrzymaj (zapobiega memory leak)
    if (this.updateInterval || this.watchId !== null) {
      console.log('[DriverLocationService] ⚠️ Tracking already running, restarting...');
      this.stopLocationTracking();
    }

    console.log('[DriverLocationService] ========================================');
    console.log('[DriverLocationService] 🚀 Starting location tracking');
    console.log('[DriverLocationService] Driver ID:', driverId);
    console.log('[DriverLocationService] Backend URL: ');
    console.log('[DriverLocationService] Interval: 1 sekunda');
    console.log('[DriverLocationService] ========================================');

    // Sprawdź czy GPS jest dostępny
    if (!navigator.geolocation) {
      console.error('[DriverLocationService] ❌ GPS NOT AVAILABLE');
      alert('UWAGA: GPS nie jest dostępny w tej przeglądarce.');
      return;
    }

    // Zone detection w tle - NIE blokuj GPS tracking!
    if (!this.zoneDetectionService) {
      this.initializeZoneDetection().catch(err =>
        console.warn('[DriverLocationService] Zone detection init failed (non-blocking):', err)
      );
    }

    // watchPosition aktualizuje pozycję na bieżąco (zamiast pollowania getCurrentPosition)
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        console.log(`[DriverLocationService] 📍 GPS: ${newLocation.lat.toFixed(6)}, ${newLocation.lng.toFixed(6)} (acc: ${position.coords.accuracy?.toFixed(0)}m)`);
        this.pendingLocation = newLocation;
        this.lastKnownLocation = newLocation;
      },
      (error) => {
        console.error('[DriverLocationService] GPS watchPosition Error:', error.code, error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 500,
      }
    );

    // Interwał 5s wysyłający ostatnią pozycję do bazy - niezależnie od GPS update
    // (zmniejszone z 1s → odciążenie puli połączeń MySQL)
    this.updateInterval = window.setInterval(() => {
      const loc = this.pendingLocation || this.lastKnownLocation;
      if (loc) {
        this.updateDriverLocation(driverId, loc);
      } else {
        // Fallback: pobierz pozycję jednorazowo jeśli watchPosition jeszcze nie dał wyniku
        this.getCurrentLocationAndUpdate(driverId);
      }
    }, 5000);

    console.log('[DriverLocationService] ✅ Tracking started (watchPosition + 1s interval)');

    // Pierwszy update od razu przez getCurrentPosition
    this.getCurrentLocationAndUpdate(driverId);
  }

  stopLocationTracking() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.pendingLocation = null;
    console.log('[DriverLocationService] ⏹️ Location tracking stopped');
  }

  private getCurrentLocationAndUpdate(driverId: string) {
    if (!navigator.geolocation) {
      console.warn('[DriverLocationService] Geolocation not available');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        this.pendingLocation = newLocation;
        this.lastKnownLocation = newLocation;
        this.updateDriverLocation(driverId, newLocation);
      },
      (error) => {
        console.error('[DriverLocationService] GPS Error:', error.code, error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 500,
      }
    );
  }

  private hasLocationChanged(newLocation: { lat: number; lng: number }): boolean {
    return true;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private async updateDriverLocation(driverId: string, location: { lat: number; lng: number }) {
    // KROK 1: Wyślij do bazy MySQL - niezależnie od reszty
    this.saveLocationToDatabase(driverId, location); // NIE await - nie blokuj interwału

    // KROK 2: Opcjonalnie - aktualizuj lokalną pamięć (niezależnie od kroku 1)
    try {
      const driver = userService.getUserById(driverId);
      if (driver && 'driverCode' in driver) {
        const updates: any = {
          currentLocation: location,
          latitude: location.lat,
          longitude: location.lng,
          lastLocationUpdate: new Date().toISOString(),
        };

        if (this.zoneDetectionService) {
          const detectedZone = this.zoneDetectionService.detectZoneFromCoordinates(location.lat, location.lng);
          const currentZone = this.currentDriverZone.get(driverId);
          if (detectedZone !== currentZone) {
            updates.currentZone = detectedZone;
            updates.zoneEnteredAt = new Date().toISOString();
            this.currentDriverZone.set(driverId, detectedZone);
          }
        }

        userService.updateDriver(driverId, updates); // NIE await - nie blokuj
      }
    } catch (error) {
      // Cichy błąd - lokalna pamięć to nie priorytet
    }
  }

  private async saveLocationToDatabase(driverId: string, location: { lat: number; lng: number }) {
    // THROTTLE: Jeśli poprzedni request jeszcze trwa, pomiń ten
    if (this.isSaving) {
      console.log('[DriverLocationService] ⏳ Previous save in progress, skipping');
      return;
    }

    this.isSaving = true;
    try {
      const url = `/api/drivers/${driverId}/location`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: location.lat,
          longitude: location.lng,
        }),
      });

      if (!response.ok) {
        console.error(`[DriverLocationService] ❌ HTTP Error: ${response.status} ${response.statusText}`);
        return; // isSaving = false w finally
      }

      const result = await response.json();
      if (result.success) {
        const zoneInfo = result.data?.currentZone ? ` | Zone: ${result.data.currentZone}` : ' | No zone';
        const zoneChanged = result.data?.zoneChanged ? ' (CHANGED!)' : '';
        console.log(`[DriverLocationService] ✅ Saved: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${zoneInfo}${zoneChanged}`);
      } else {
        console.error(`[DriverLocationService] ❌ Save failed:`, result.error);
      }
    } catch (error) {
      console.error('[DriverLocationService] ❌ Network error:', error);
    } finally {
      this.isSaving = false; // ZAWSZE resetuj - nawet przy błędzie HTTP
    }
  }

  // Manual location update
  async updateLocationNow(driverId: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.zoneDetectionService) {
      await this.initializeZoneDetection();
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          await this.updateDriverLocation(driverId, location);
          this.lastKnownLocation = location;
          resolve(location);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000,
        }
      );
    });
  }

  // Pobierz wszystkie lokalizacje kierowców z bazy danych
  async getAllDriverLocations(): Promise<any[]> {
    try {
      const response = await fetch('/api/drivers/locations');

      if (!response.ok) {
        console.error('[DriverLocationService] Failed to fetch locations, status:', response.status);
        return [];
      }

      const result = await response.json();

      if (result.success) {
        console.log(`[DriverLocationService] Fetched ${result.data.length} driver locations from database`);
        return result.data;
      } else {
        console.error('[DriverLocationService] Failed to fetch locations:', result.error);
        return [];
      }
    } catch (error) {
      console.error('[DriverLocationService] Error fetching driver locations:', error);
      return [];
    }
  }
}

export const driverLocationService = new DriverLocationService();
