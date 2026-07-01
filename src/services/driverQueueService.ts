import { driverAnalyticsService } from './driverAnalyticsService';
import { dataSourceService } from './dataSourceService';

// ============================================================================
// Typy dla nowego systemu kolejkowania (driver_state)
// ============================================================================
export type DriverState = 'wolna' | 'dojazd' | 'zajeta' | 'kursem';

export interface QueueEntry {
  driverId: string;
  driverCode: string;
  name: string;
  driverState: DriverState;
  zoneEnteredAt: string | null;
  queuePosition: number | null;
}

export interface QueueStateResult {
  success: boolean;
  driverState: DriverState | null;
  zoneNumber: number | null;
  queuePosition: number | null;
  error?: string;
}

const API_BASE = '/api';

// Pomocnicza funkcja do wywołań API kolejki
async function queueApiCall<T>(url: string, method: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok && response.status !== 422) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Przekroczono czas oczekiwania (10s). Sprawdź połączenie z serwerem.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface DriverInQueue {
  driver_id: string;
  driver_name: string;
  driver_code: string;
  queue_pos: number;
  free_duration: string;
  vehicle_categories: string[];
  current_zone?: number;
}

export interface DriverQueueStatus {
  driverId: string;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  currentZone: number | null;
  zoneName: string | null;
  zoneEnteredAt: string | null;
  queuePosition: number | null;
  freeSince: string | null;
  statusChangedAt: string | null;
  statusDuration: string;
}

export interface DriverData {
  id: string;
  name: string;
  email: string;
  driver_code: string;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  current_zone: number | null;
  current_region_number?: number | null;
  free_since: string | null;
  vehicle_categories: string[];
  is_online: boolean;
  last_seen: string | null;
  status_changed_at: string;
  status_started_at?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface DriverWithLocation {
  id: string;
  name: string;
  driverCode: string;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  currentZone: number | null;
  location: { lat: number; lng: number };
  statusDuration: string;
}

class DriverQueueService {
  private readonly STORAGE_KEY = 'taxi_drivers';
  private driversCache: DriverData[] = [];
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadDrivers();
    this.isInitialized = true;

    dataSourceService.onDataChange((table) => {
      if (table === 'driver_queue' || table === 'drivers') {
        this.loadDrivers();
      }
    });

    dataSourceService.onConfigChange(() => {
      console.log('[DriverQueueService] Config changed, reloading drivers...');
      this.loadDrivers();
    });
  }

  private async loadDrivers() {
    if (dataSourceService.isUsingExternalDatabase()) {
      await this.loadFromExternalDatabase();
    } else {
      this.ensureDriversExist();
    }
  }

  private async loadFromExternalDatabase() {
    try {
      const result = await dataSourceService.query<DriverData>(
        'SELECT * FROM driver_queue'
      );

      if (result.success && result.data) {
        this.driversCache = result.data;
        console.log('[loadFromExternalDatabase] Loaded drivers:', result.data.length);
      } else {
        console.warn('[loadFromExternalDatabase] Failed to load, falling back to localStorage');
        this.ensureDriversExist();
      }
    } catch (error) {
      console.error('[loadFromExternalDatabase] Error:', error);
      this.ensureDriversExist();
    }
  }

  private ensureDriversExist(): void {
    console.log('[ensureDriversExist] Synchronizuję kierowców z userService...');

    const usersData = localStorage.getItem('taxi_users_data');
    if (!usersData) {
      console.warn('[ensureDriversExist] Brak taxi_users_data w localStorage');
      return;
    }

    const parsed = JSON.parse(usersData);
    const userDrivers = parsed.drivers || [];

    console.log('[ensureDriversExist] Znaleziono kierowców w userService:', userDrivers.length);

    const existingDrivers = this.getAllDrivers();
    const driverStatusMap = new Map(existingDrivers.map(d => [d.id, d]));

    const syncedDrivers: DriverData[] = userDrivers.map((userDriver: any) => {
      const existingStatus = driverStatusMap.get(userDriver.id);

      return {
        id: userDriver.id,
        name: userDriver.name,
        email: userDriver.email,
        driver_code: userDriver.driverCode,
        status: existingStatus?.status || 'home',
        current_zone: existingStatus?.current_zone || null,
        current_region_number: existingStatus?.current_region_number || null,
        free_since: existingStatus?.free_since || null,
        vehicle_categories: userDriver.vehicleCategories || ['standard'],
        is_online: existingStatus?.is_online || false,
        last_seen: existingStatus?.last_seen || null,
        status_changed_at: existingStatus?.status_changed_at || new Date().toISOString(),
        status_started_at: existingStatus?.status_started_at || new Date().toISOString()
      };
    });

    this.driversCache = syncedDrivers;
    this.saveAllDrivers(syncedDrivers);
    console.log('[ensureDriversExist] Zsynchronizowano kierowców:', syncedDrivers.length);
  }

  private getAllDrivers(): DriverData[] {
    if (this.driversCache.length > 0) {
      return this.driversCache;
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) {
        console.log('[getAllDrivers] Brak danych w localStorage');
        return [];
      }
      const drivers = JSON.parse(data);
      this.driversCache = drivers;
      console.log('[getAllDrivers] Pobrano kierowców:', drivers.length);
      return drivers;
    } catch (error) {
      console.error('[getAllDrivers] Błąd podczas pobierania:', error);
      return [];
    }
  }

  private async saveAllDrivers(drivers: DriverData[]): Promise<void> {
    this.driversCache = drivers;

    if (dataSourceService.isUsingExternalDatabase()) {
      for (const driver of drivers) {
        await dataSourceService.update('driver_queue', driver.id, driver);
      }
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(drivers));
      console.log('[saveAllDrivers] Zapisano do localStorage:', drivers.length, 'kierowców');
    } catch (error) {
      console.error('[saveAllDrivers] Błąd podczas zapisu:', error);
    }
  }

  private getDriverById(driverId: string): DriverData | null {
    const drivers = this.getAllDrivers();
    const driver = drivers.find(d => d.id === driverId);

    if (!driver) {
      console.warn('[getDriverById] Kierowca nie znaleziony:', driverId);
    }

    return driver || null;
  }

  async updateDriverStatus(
    driverId: string,
    status: 'free' | 'driving' | 'pickup' | 'busy' | 'home',
    currentZone?: number | null,
    location?: { lat: number; lng: number },
    orderId?: string
  ): Promise<DriverQueueStatus | null> {
    console.log('[updateDriverStatus] START:', { driverId, status, currentZone, orderId });

    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(d => d.id === driverId);

    if (index === -1) {
      console.error('[updateDriverStatus] Kierowca NIE ZNALEZIONY:', driverId);
      return null;
    }

    const now = new Date().toISOString();
    const oldStatus = drivers[index].status;
    const currentLocation = location || drivers[index].location;

    drivers[index] = {
      ...drivers[index],
      status,
      status_changed_at: now,
      status_started_at: now,
      is_online: true,
      last_seen: now,
      current_zone: status === 'home' ? null : (currentZone !== undefined ? currentZone : drivers[index].current_zone),
      current_region_number: status === 'home' ? null : (currentZone !== undefined ? currentZone : drivers[index].current_region_number),
      free_since: status === 'free' ? now : null,
      location: currentLocation
    };

    console.log('[updateDriverStatus] Zmiana statusu:', oldStatus, '->', status);

    await this.saveAllDrivers(drivers);

    const queuePosition = status === 'free' ? await this.getDriverQueuePosition(driverId) : null;

    const isExternal = dataSourceService.isUsingExternalDatabase();
    console.log('[updateDriverStatus] isUsingExternalDatabase:', isExternal);

    if (isExternal) {
      console.log('[updateDriverStatus] Updating driver in drivers table, driverId:', driverId);
      const updateData: Record<string, unknown> = {
        status,
        previous_status: oldStatus,
        status_changed_at: now,
        status_started_at: now,
        is_online: true,
        last_seen: now,
        current_zone: drivers[index].current_zone,
        current_region_number: drivers[index].current_region_number,
        free_since: drivers[index].free_since,
        queue_position: queuePosition,
        // current_location: currentLocation, // kolumna nie istnieje w schemacie
      };
      if (currentLocation) {
        updateData.latitude = currentLocation.lat;
        updateData.longitude = currentLocation.lng;
      }
      console.log('[updateDriverStatus] Data to update:', updateData);
      try {
        const result = await dataSourceService.update('drivers', driverId, updateData);
        console.log('[updateDriverStatus] Update result:', result);
      } catch (err) {
        console.error('[updateDriverStatus] Update error:', err);
      }
    } else {
      console.warn('[updateDriverStatus] External DB NOT enabled, using local storage only');
    }
    const statusDuration = this.calculateDuration(drivers[index].status_changed_at);

    driverAnalyticsService.logStatusChange(
      driverId,
      status,
      drivers[index].current_zone,
      queuePosition,
      oldStatus,
      location,
      orderId
    );

    if (status === 'free' && drivers[index].current_zone !== null && queuePosition !== null) {
      driverAnalyticsService.updateQueuePosition(driverId, drivers[index].current_zone, queuePosition);
    }

    console.log('[updateDriverStatus] SUKCES - pozycja w kolejce:', queuePosition);

    return {
      driverId: drivers[index].id,
      status: drivers[index].status,
      currentZone: drivers[index].current_zone,
      queuePosition,
      freeSince: drivers[index].free_since,
      statusChangedAt: drivers[index].status_changed_at,
      statusDuration
    };
  }

  async getDriverStatus(driverId: string): Promise<DriverQueueStatus | null> {
    // Pobierz aktualny stan BEZPOŚREDNIO z bazy MySQL przez REST API
    try {
      const result = await queueApiCall<{
        success: boolean;
        driverId: string;
        driverState: string | null;
        status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
        currentZone: number | null;
        zoneName: string | null;
        zoneEnteredAt: string | null;
        queuePosition: number | null;
        freeSince: string | null;
        statusChangedAt: string | null;
        statusDuration: string;
        error?: string;
      }>(`${API_BASE}/drivers/${driverId}/status`, 'GET');

      if (!result.success) {
        console.warn('[getDriverStatus] API error:', result.error);
        return null;
      }

      return {
        driverId: result.driverId,
        status: result.status,
        currentZone: result.currentZone,
        zoneName: result.zoneName ?? null,
        zoneEnteredAt: result.zoneEnteredAt ?? null,
        queuePosition: result.queuePosition,
        freeSince: result.freeSince,
        statusChangedAt: result.statusChangedAt,
        statusDuration: result.statusDuration,
      };
    } catch (err: any) {
      // Fallback: stara metoda z localStorage jeśli backend niedostępny
      console.warn('[getDriverStatus] REST API niedostępne, fallback localStorage:', err.message);
      const driver = this.getDriverById(driverId);
      if (!driver) return null;
      const queuePosition = driver.status === 'free' ? await this.getDriverQueuePosition(driverId) : null;
      return {
        driverId: driver.id,
        status: driver.status,
        currentZone: driver.current_zone,
        zoneName: null,
        zoneEnteredAt: (driver as any).zone_entered_at ?? null,
        queuePosition,
        freeSince: driver.free_since,
        statusChangedAt: driver.status_changed_at,
        statusDuration: this.calculateDuration(driver.status_changed_at),
      };
    }
  }

  async getDriverQueuePosition(driverId: string): Promise<number | null> {
    const driver = this.getDriverById(driverId);

    if (!driver || driver.status !== 'free' || !driver.current_zone || !driver.free_since) {
      return null;
    }

    const drivers = this.getAllDrivers()
      .filter(d =>
        d.status === 'free' &&
        d.current_zone === driver.current_zone &&
        d.free_since &&
        new Date(d.free_since) < new Date(driver.free_since)
      );

    return drivers.length + 1;
  }

  async getDriversInQueue(zoneNumber: number): Promise<DriverInQueue[]> {
    const drivers = this.getAllDrivers()
      .filter(d =>
        d.status === 'free' &&
        d.current_zone === zoneNumber &&
        d.free_since
      )
      .sort((a, b) => {
        const dateA = new Date(a.free_since!).getTime();
        const dateB = new Date(b.free_since!).getTime();
        return dateA - dateB;
      });

    return drivers.map((driver, index) => ({
      driver_id: driver.id,
      driver_name: driver.name,
      driver_code: driver.driver_code,
      queue_pos: index + 1,
      free_duration: this.calculateDuration(driver.free_since),
      vehicle_categories: driver.vehicle_categories || []
    }));
  }

  async getAllDriversInQueues(): Promise<DriverInQueue[]> {
    const drivers = this.getAllDrivers()
      .filter(d =>
        d.current_zone !== null &&
        ['free', 'driving', 'pickup'].includes(d.status)
      )
      .sort((a, b) => {
        if (a.current_zone !== b.current_zone) {
          return (a.current_zone || 0) - (b.current_zone || 0);
        }
        const dateA = a.free_since ? new Date(a.free_since).getTime() : 0;
        const dateB = b.free_since ? new Date(b.free_since).getTime() : 0;
        return dateA - dateB;
      });

    const driversByZone: { [key: number]: DriverData[] } = {};

    drivers.forEach(driver => {
      if (!driversByZone[driver.current_zone!]) {
        driversByZone[driver.current_zone!] = [];
      }
      driversByZone[driver.current_zone!].push(driver);
    });

    const result: DriverInQueue[] = [];

    Object.values(driversByZone).forEach(zoneDrivers => {
      zoneDrivers.forEach((driver, index) => {
        result.push({
          driver_id: driver.id,
          driver_name: driver.name,
          driver_code: driver.driver_code,
          queue_pos: index + 1,
          free_duration: this.calculateDuration(driver.free_since),
          vehicle_categories: driver.vehicle_categories || [],
          current_zone: driver.current_zone!
        });
      });
    });

    return result;
  }

  async subscribeToQueueChanges(
    zoneNumber: number | null,
    callback: (drivers: DriverInQueue[]) => void
  ): Promise<() => void> {
    const intervalId = setInterval(async () => {
      if (zoneNumber) {
        const drivers = await this.getDriversInQueue(zoneNumber);
        callback(drivers);
      } else {
        const drivers = await this.getAllDriversInQueues();
        callback(drivers);
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }

  async recalculateQueuePositions(): Promise<void> {
    return;
  }

  refreshDriverData(): void {
    console.log('[refreshDriverData] Odświeżanie danych kierowców');
    this.driversCache = [];
    this.loadDrivers();
  }

  async setDriverOnline(driverId: string): Promise<void> {
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(d => d.id === driverId);

    if (index !== -1) {
      drivers[index].is_online = true;
      drivers[index].last_seen = now;
      await this.saveAllDrivers(drivers);
    }

    if (dataSourceService.isUsingExternalDatabase()) {
      try {
        await dataSourceService.update('drivers', driverId, {
          is_online: true,
          last_seen: now,
          session_id: sessionId,
        });
      } catch (err) {
        console.error('[setDriverOnline] Update error:', err);
      }
    }
    console.log('[setDriverOnline] Driver online:', driverId, 'session:', sessionId);
  }

  async setDriverOffline(driverId: string): Promise<void> {
    const now = new Date().toISOString();
    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(d => d.id === driverId);

    if (index !== -1) {
      drivers[index].is_online = false;
      drivers[index].last_seen = now;
      await this.saveAllDrivers(drivers);
    }

    if (dataSourceService.isUsingExternalDatabase()) {
      try {
        await dataSourceService.update('drivers', driverId, {
          is_online: false,
          last_seen: now,
          session_id: null,
        });
      } catch (err) {
        console.error('[setDriverOffline] Update error:', err);
      }
    }
    console.log('[setDriverOffline] Driver offline:', driverId);
  }

  async setDriverTargetZone(driverId: string, targetZone: number | null): Promise<void> {
    if (dataSourceService.isUsingExternalDatabase()) {
      try {
        await dataSourceService.update('drivers', driverId, {
          target_zone: targetZone,
        });
      } catch (err) {
        console.error('[setDriverTargetZone] Update error:', err);
      }
    }
    console.log('[setDriverTargetZone] Target zone set:', driverId, '->', targetZone);
  }

  private calculateDuration(statusChangedAt: string | null): string {
    if (!statusChangedAt) {
      return '0m';
    }

    const start = new Date(statusChangedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins}m`;
    }

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }

  formatFreeDuration(freeSince: string | null): string {
    return this.calculateDuration(freeSince);
  }

  async getQueueStatistics(zoneNumber?: number): Promise<{
    totalInQueue: number;
    averageWaitTime: string;
    longestWait: string;
  }> {
    let drivers = this.getAllDrivers()
      .filter(d => d.status === 'free' && d.free_since);

    if (zoneNumber) {
      drivers = drivers.filter(d => d.current_zone === zoneNumber);
    }

    if (drivers.length === 0) {
      return {
        totalInQueue: 0,
        averageWaitTime: '0m',
        longestWait: '0m'
      };
    }

    const now = new Date();
    const waitTimes = drivers.map(driver => {
      const start = new Date(driver.free_since!);
      return now.getTime() - start.getTime();
    });

    const avgWaitMs = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    const maxWaitMs = Math.max(...waitTimes);

    return {
      totalInQueue: drivers.length,
      averageWaitTime: this.calculateDuration(new Date(now.getTime() - avgWaitMs).toISOString()),
      longestWait: this.calculateDuration(new Date(now.getTime() - maxWaitMs).toISOString())
    };
  }

  async createDriver(driver: Omit<DriverData, 'id'>): Promise<DriverData> {
    const drivers = this.getAllDrivers();
    const newDriver: DriverData = {
      id: crypto.randomUUID(),
      ...driver
    };

    drivers.push(newDriver);
    await this.saveAllDrivers(drivers);

    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.insert('driver_queue', newDriver);
    }

    console.log('[createDriver] Utworzono kierowcę:', newDriver.id);

    driverAnalyticsService.logStatusChange(
      newDriver.id,
      newDriver.status,
      newDriver.current_zone,
      null,
      undefined,
      newDriver.location
    );

    return newDriver;
  }

  async updateDriverLocation(driverId: string, location: { lat: number; lng: number }): Promise<void> {
    // Aktualizuj lokalny cache
    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(d => d.id === driverId);
    if (index !== -1) {
      drivers[index].location = location;
      drivers[index].last_seen = new Date().toISOString();
      // Nie wywołuj saveAllDrivers — nadmiarowe zapisy, lokalizację obsługuje driverLocationService
    }

    // Wyślij lokalizację przez dedykowany endpoint (tylko lat/lng, bez nieistniejących kolumn)
    if (dataSourceService.isUsingExternalDatabase()) {
      try {
        await fetch(`${API_BASE}/drivers/${driverId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: location.lat, longitude: location.lng }),
        });
      } catch (err) {
        // cichy błąd — driverLocationService obsługuje GPS niezależnie
      }
    }
  }

  getAllDriversWithLocations(): DriverWithLocation[] {
    const drivers = this.getAllDrivers();
    return drivers
      .filter(d => d.location && d.location.lat && d.location.lng)
      .map(d => ({
        id: d.id,
        name: d.name,
        driverCode: d.driver_code,
        status: d.status,
        currentZone: d.current_zone,
        location: d.location!,
        statusDuration: this.calculateDuration(d.status_changed_at)
      }));
  }

  getAllDriversForMap(): DriverWithLocation[] {
    const drivers = this.getAllDrivers();
    // Pokazuj na mapie tylko zalogowanych kierowców (is_online = true)
    return drivers
      .filter(d => d.is_online === true)
      .map(d => ({
        id: d.id,
        name: d.name,
        driverCode: d.driver_code,
        status: d.status,
        currentZone: d.current_zone,
        location: d.location || { lat: 0, lng: 0 },
        statusDuration: this.calculateDuration(d.status_changed_at)
      }));
  }

  // ==========================================================================
  // NOWE API — system kolejkowania z driver_state
  // ==========================================================================

  /**
   * Wejście do rejonu + ustawienie stanu.
   * wolna/dojazd  → backend wykrywa rejon z GPS
   * kursem        → wymagany zoneNumber (kierowca podaje ręcznie)
   */
  async enterZone(driverId: string, driverState: DriverState, zoneNumber?: number): Promise<QueueStateResult> {
    try {
      const result = await queueApiCall<QueueStateResult>(
        `${API_BASE}/drivers/${driverId}/enter-zone`,
        'POST',
        { driverState, zoneNumber: zoneNumber ?? null }
      );
      return result;
    } catch (err: any) {
      console.error('[driverQueueService] enterZone error:', err.message);
      return { success: false, driverState: null, zoneNumber: null, queuePosition: null, error: err.message };
    }
  }

  /**
   * Zmiana stanu kierowcy w obecnym rejonie.
   * Walidacja GPS dla wolna/dojazd po stronie backendu.
   */
  async changeDriverState(driverId: string, driverState: DriverState): Promise<QueueStateResult> {
    try {
      const result = await queueApiCall<QueueStateResult>(
        `${API_BASE}/drivers/${driverId}/state`,
        'POST',
        { driverState }
      );
      return result;
    } catch (err: any) {
      console.error('[driverQueueService] changeDriverState error:', err.message);
      return { success: false, driverState: null, zoneNumber: null, queuePosition: null, error: err.message };
    }
  }

  /**
   * Wyjście z kolejki (przycisk Dom).
   */
  async leaveZone(driverId: string): Promise<QueueStateResult> {
    try {
      const result = await queueApiCall<QueueStateResult>(
        `${API_BASE}/drivers/${driverId}/leave-zone`,
        'POST'
      );
      return result;
    } catch (err: any) {
      console.error('[driverQueueService] leaveZone error:', err.message);
      return { success: false, driverState: null, zoneNumber: null, queuePosition: null, error: err.message };
    }
  }

  /**
   * Pobierz kolejkę konkretnego rejonu.
   */
  async getZoneQueue(zoneNumber: number): Promise<QueueEntry[]> {
    try {
      const result = await queueApiCall<{ success: boolean; drivers: QueueEntry[] }>(
        `${API_BASE}/queue/zone/${zoneNumber}`,
        'GET'
      );
      return result.drivers ?? [];
    } catch (err: any) {
      console.error('[driverQueueService] getZoneQueue error:', err.message);
      return [];
    }
  }

  /**
   * Pobierz wszystkie kolejki ze wszystkich rejonów.
   * Zwraca { [zoneNumber]: QueueEntry[] }
   */
  async getAllZoneQueues(): Promise<Record<string, QueueEntry[]>> {
    try {
      const result = await queueApiCall<{ success: boolean; queues: Record<string, QueueEntry[]> }>(
        `${API_BASE}/queue/all`,
        'GET'
      );
      return result.queues ?? {};
    } catch (err: any) {
      console.error('[driverQueueService] getAllZoneQueues error:', err.message);
      return {};
    }
  }

  async updateDriverZone(driverId: string, zoneNumber: number): Promise<DriverQueueStatus | null> {
    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(d => d.id === driverId);

    if (index === -1) {
      return null;
    }

    drivers[index].current_zone = zoneNumber;
    drivers[index].current_region_number = zoneNumber;

    await this.saveAllDrivers(drivers);

    const isExternal = dataSourceService.isUsingExternalDatabase();
    console.log('[updateDriverZone] isUsingExternalDatabase:', isExternal);

    if (isExternal) {
      console.log('[updateDriverZone] Updating driver zone in drivers table');
      const updateData = {
        current_zone: zoneNumber,
        current_region_number: zoneNumber
      };
      console.log('[updateDriverZone] Data to update:', updateData);
      try {
        const result = await dataSourceService.update('drivers', driverId, updateData);
        console.log('[updateDriverZone] Update result:', result);
      } catch (err) {
        console.error('[updateDriverZone] Update error:', err);
      }
    } else {
      console.warn('[updateDriverZone] External DB NOT enabled');
    }

    const queuePosition = drivers[index].status === 'free' ? await this.getDriverQueuePosition(driverId) : null;

    return {
      driverId: drivers[index].id,
      status: drivers[index].status,
      currentZone: drivers[index].current_zone,
      queuePosition,
      freeSince: drivers[index].free_since,
      statusChangedAt: drivers[index].status_changed_at,
      statusDuration: this.calculateDuration(drivers[index].status_changed_at)
    };
  }
}

export const driverQueueService = new DriverQueueService();
