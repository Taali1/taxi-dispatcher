import {
  Administrator,
  Driver,
  Dispatcher,
  SupportAgent,
  AccountingUser,
  UserRole,
  UserPermissions,
  UserFilter,
  AnyUser
} from '../types/users';
import { dataSourceService } from './dataSourceService';

function normalizeZones(v: unknown): number[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export class UserService {
  private administrators: Map<string, Administrator> = new Map();
  private drivers: Map<string, Driver> = new Map();
  private dispatchers: Map<string, Dispatcher> = new Map();
  private supportAgents: Map<string, SupportAgent> = new Map();
  private accountingUsers: Map<string, AccountingUser> = new Map();
  private userPermissions: Map<string, UserPermissions> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadData();
    if (this.getAllUsers().length === 0) {
      this.initializeBasicMockData();
    }
    this.isInitialized = true;

    dataSourceService.onDataChange((table) => {
      if (['drivers', 'administrators', 'dispatchers', 'support_agents', 'accounting_users'].includes(table)) {
        this.loadData();
      }
    });

    dataSourceService.onConfigChange(() => {
      console.log('[UserService] Config changed, reloading data...');
      this.loadData();
    });
  }

  private async loadData() {
    if (dataSourceService.isUsingExternalDatabase()) {
      await this.loadFromExternalDatabase();
    } else {
      this.loadFromStorage();
    }
  }

  private async loadFromExternalDatabase() {
    try {
      const [admins, drivers, dispatchers, support, accounting] = await Promise.all([
        dataSourceService.getAll<Administrator>('administrators'),
        dataSourceService.getAll<Driver>('drivers'),
        dataSourceService.getAll<Dispatcher>('dispatchers'),
        dataSourceService.getAll<SupportAgent>('support_agents'),
        dataSourceService.getAll<AccountingUser>('accounting_users')
      ]);

      this.administrators.clear();
      this.drivers.clear();
      this.dispatchers.clear();
      this.supportAgents.clear();
      this.accountingUsers.clear();

      if (admins.success && admins.data) {
        admins.data.forEach(admin => this.administrators.set(admin.id, admin));
      }
      if (drivers.success && drivers.data) {
        drivers.data.forEach(driver => this.drivers.set(driver.id, driver));
      }
      if (dispatchers.success && dispatchers.data) {
        dispatchers.data.forEach(dispatcher => {
          const d = { ...dispatcher, assignedZones: normalizeZones(dispatcher.assignedZones) };
          this.dispatchers.set(d.id, d);
        });
      }
      if (support.success && support.data) {
        support.data.forEach(agent => this.supportAgents.set(agent.id, agent));
      }
      if (accounting.success && accounting.data) {
        accounting.data.forEach(user => this.accountingUsers.set(user.id, user));
      }
    } catch (error) {
      console.error('Error loading from external database:', error);
      this.loadFromStorage();
    }
  }

  async refreshFromDatabase() {
    await this.loadData();
  }

  private initializeBasicMockData() {
    const admin1: Administrator = {
      id: 'admin_1',
      email: 'admin@taxi.com',
      password: 'admin123',
      name: 'Administrator Główny',
      status: 'active',
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-16T15:30:00Z',
      permissions: ['users', 'zones', 'pricing', 'reports', 'system'],
      department: 'IT',
      accessLevel: 'super',
    };

    const dispatcher1: Dispatcher = {
      id: 'dispatcher_1',
      email: 'dispatcher@taxi.com',
      password: 'dispatcher123',
      name: 'Dyspozytor Główny',
      status: 'active',
      createdAt: '2025-01-05T08:00:00Z',
      updatedAt: '2025-01-16T12:30:00Z',
      employeeId: 'OP-01',
      shift: 'morning',
      assignedZones: [1, 2, 3, 4, 5, 6],
      maxConcurrentOrders: 15,
      phoneExtension: '101',
      trainingCompleted: true
    };

    const support1: SupportAgent = {
      id: 'support_1',
      email: 'support@taxi.com',
      password: 'support123',
      name: 'Agent Wsparcia',
      status: 'active',
      createdAt: '2025-01-06T09:00:00Z',
      updatedAt: '2025-01-16T11:15:00Z',
      agentId: 'SUP001',
      department: 'customer',
      languages: ['pl', 'en'],
      ticketLimit: 20,
      specializations: ['billing', 'technical']
    };

    const accounting1: AccountingUser = {
      id: 'accounting_1',
      email: 'accounting@taxi.com',
      password: 'accounting123',
      name: 'Księgowy Główny',
      status: 'active',
      createdAt: '2025-01-07T10:00:00Z',
      updatedAt: '2025-01-16T14:00:00Z',
      employeeId: 'ACC001',
      accessLevel: 'manager',
      certifications: ['CPA', 'Tax Specialist'],
      department: 'billing'
    };

    const driver1: Driver = {
      id: 'driver_1',
      email: 'jan.kowalski@taxi.com',
      password: 'test123',
      name: 'Jan Kowalski',
      status: 'free',
      driverCode: '5401',
      pin: '1234',
      licenseNumber: 'LIC001',
      phoneNumber: '+48123456789',
      currentZone: 54,
      queuePosition: 1,
      rating: 4.8,
      totalRides: 245,
      createdAt: '2025-01-10T08:00:00Z',
      updatedAt: new Date().toISOString(),
      lastLocationUpdate: new Date().toISOString(),
      vehicleCategories: ['standard']
    };

    const driver2: Driver = {
      id: 'driver_2',
      email: 'anna.nowak@taxi.com',
      password: 'test123',
      name: 'Anna Nowak',
      status: 'free',
      driverCode: '5402',
      pin: '1234',
      licenseNumber: 'LIC002',
      phoneNumber: '+48123456790',
      currentZone: 54,
      queuePosition: 2,
      rating: 4.9,
      totalRides: 312,
      createdAt: '2025-01-10T09:00:00Z',
      updatedAt: new Date().toISOString(),
      lastLocationUpdate: new Date().toISOString(),
      vehicleCategories: ['standard']
    };

    const driver3: Driver = {
      id: 'driver_3',
      email: 'piotr.wisniewski@taxi.com',
      password: 'test123',
      name: 'Piotr Wiśniewski',
      status: 'free',
      driverCode: '14801',
      pin: '1234',
      licenseNumber: 'LIC003',
      phoneNumber: '+48123456791',
      currentZone: 148,
      queuePosition: 1,
      rating: 4.7,
      totalRides: 189,
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: new Date().toISOString(),
      lastLocationUpdate: new Date().toISOString(),
      vehicleCategories: ['standard']
    };

    const driver4: Driver = {
      id: 'driver_4',
      email: 'maria.wojcik@taxi.com',
      password: 'test123',
      name: 'Maria Wójcik',
      status: 'free',
      driverCode: '5403',
      pin: '1234',
      licenseNumber: 'LIC004',
      phoneNumber: '+48123456792',
      currentZone: 54,
      queuePosition: 3,
      rating: 4.6,
      totalRides: 156,
      createdAt: '2025-01-10T11:00:00Z',
      updatedAt: new Date().toISOString(),
      lastLocationUpdate: new Date().toISOString(),
      vehicleCategories: ['standard']
    };

    this.administrators.set(admin1.id, admin1);
    this.dispatchers.set(dispatcher1.id, dispatcher1);
    this.supportAgents.set(support1.id, support1);
    this.accountingUsers.set(accounting1.id, accounting1);
    this.drivers.set(driver1.id, driver1);
    this.drivers.set(driver2.id, driver2);
    this.drivers.set(driver3.id, driver3);
    this.drivers.set(driver4.id, driver4);

    this.userPermissions.set(admin1.id, {
      userId: admin1.id,
      roles: ['admin'],
      panelAccess: { admin: true, dispatcher: false, driver: false, support: false, accounting: false }
    });

    this.saveToStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('taxi_users_data');
      if (stored) {
        const data = JSON.parse(stored);

        if (data.administrators) {
          data.administrators.forEach((admin: Administrator) => {
            this.administrators.set(admin.id, admin);
          });
        }

        if (data.drivers) {
          data.drivers.forEach((driver: Driver) => {
            this.drivers.set(driver.id, driver);
          });
        }

        if (data.dispatchers) {
          data.dispatchers.forEach((dispatcher: Dispatcher) => {
            this.dispatchers.set(dispatcher.id, dispatcher);
          });
        }

        if (data.supportAgents) {
          data.supportAgents.forEach((agent: SupportAgent) => {
            this.supportAgents.set(agent.id, agent);
          });
        }

        if (data.accountingUsers) {
          data.accountingUsers.forEach((user: AccountingUser) => {
            this.accountingUsers.set(user.id, user);
          });
        }

        if (data.userPermissions) {
          data.userPermissions.forEach((perm: UserPermissions) => {
            this.userPermissions.set(perm.userId, perm);
          });
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  private saveToStorage() {
    try {
      const data = {
        administrators: Array.from(this.administrators.values()),
        drivers: Array.from(this.drivers.values()),
        dispatchers: Array.from(this.dispatchers.values()),
        supportAgents: Array.from(this.supportAgents.values()),
        accountingUsers: Array.from(this.accountingUsers.values()),
        userPermissions: Array.from(this.userPermissions.values()),
      };
      localStorage.setItem('taxi_users_data', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  }

  private async saveToDatabase<T extends AnyUser>(table: string, user: T): Promise<{ success: boolean; error?: string }> {
    if (dataSourceService.isUsingExternalDatabase()) {
      const result = await dataSourceService.insert(table, user);
      if (!result.success) {
        console.error(`Failed to save to database table ${table}:`, result.error);
        return { success: false, error: result.error };
      }
    }
    this.saveToStorage();
    return { success: true };
  }

  private async updateInDatabase<T extends AnyUser>(table: string, id: string, data: Partial<T>): Promise<{ success: boolean; error?: string }> {
    if (dataSourceService.isUsingExternalDatabase()) {
      const result = await dataSourceService.update(table, id, data);
      if (!result.success) {
        console.error(`Failed to update in database table ${table}:`, result.error);
        return { success: false, error: result.error };
      }
    }
    this.saveToStorage();
    return { success: true };
  }

  private async deleteFromDatabase(table: string, id: string): Promise<{ success: boolean; error?: string }> {
    if (dataSourceService.isUsingExternalDatabase()) {
      const result = await dataSourceService.delete(table, id);
      if (!result.success) {
        console.error(`Failed to delete from database table ${table}:`, result.error);
        return { success: false, error: result.error };
      }
    }
    this.saveToStorage();
    return { success: true };
  }

  getUsersByRole<T extends AnyUser>(role: UserRole): T[] {
    switch (role) {
      case 'admin':
        return Array.from(this.administrators.values()) as T[];
      case 'driver':
        return Array.from(this.drivers.values()) as T[];
      case 'dispatcher':
        return Array.from(this.dispatchers.values()) as T[];
      case 'support':
        return Array.from(this.supportAgents.values()) as T[];
      case 'accounting':
        return Array.from(this.accountingUsers.values()) as T[];
      default:
        return [];
    }
  }

  filterUsers<T extends AnyUser>(users: T[], filter: UserFilter): T[] {
    return users.filter(user => {
      const matchesSearch = !filter.search ||
        user.name.toLowerCase().includes(filter.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filter.search.toLowerCase());

      const matchesStatus = !filter.status || user.status === filter.status;

      const matchesZone = !filter.zone ||
        ('currentZone' in user && user.currentZone === filter.zone) ||
        ('assignedZones' in user && Array.isArray(user.assignedZones) && user.assignedZones.includes(filter.zone));

      return matchesSearch && matchesStatus && matchesZone;
    });
  }

  async createAdministrator(data: Omit<Administrator, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: Administrator; error?: string }> {
    const id = `admin_${Date.now()}`;
    const now = new Date().toISOString();
    const admin: Administrator = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.administrators.set(id, admin);

    const dbData: Record<string, unknown> = {};
    for (const key in admin) {
      const value = (admin as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    const result = await this.saveToDatabase('administrators', dbData);

    if (!result.success) {
      this.administrators.delete(id);
      return { success: false, error: result.error };
    }

    return { success: true, data: admin };
  }

  async updateAdministrator(id: string, data: Partial<Administrator>): Promise<{ success: boolean; data?: Administrator; error?: string }> {
    const admin = this.administrators.get(id);
    if (!admin) return { success: false, error: 'Administrator nie został znaleziony' };

    const updated = { ...admin, ...data, updatedAt: new Date().toISOString() };
    this.administrators.set(id, updated);

    const dbData = { ...data };
    delete (dbData as { updatedAt?: string }).updatedAt;

    const result = await this.updateInDatabase('administrators', id, dbData);

    if (!result.success) {
      this.administrators.set(id, admin);
      return { success: false, error: result.error };
    }

    return { success: true, data: updated };
  }

  async deleteAdministrator(id: string): Promise<{ success: boolean; error?: string }> {
    const admin = this.administrators.get(id);
    if (!admin) return { success: false, error: 'Administrator nie został znaleziony' };

    this.administrators.delete(id);
    this.userPermissions.delete(id);

    const result = await this.deleteFromDatabase('administrators', id);

    if (!result.success) {
      this.administrators.set(id, admin);
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  async createDriver(data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: Driver; error?: string }> {
    const id = `driver_${Date.now()}`;
    const now = new Date().toISOString();
    const driver: Driver = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.drivers.set(id, driver);

    const dbData: Record<string, unknown> = {};
    for (const key in driver) {
      const value = (driver as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    const result = await this.saveToDatabase('drivers', dbData);

    if (!result.success) {
      this.drivers.delete(id);
      return { success: false, error: result.error };
    }

    return { success: true, data: driver };
  }

  async updateDriver(id: string, data: Partial<Driver>): Promise<{ success: boolean; data?: Driver; error?: string }> {
    const driver = this.drivers.get(id);
    if (!driver) return { success: false, error: 'Kierowca nie został znaleziony' };

    console.log('[UserService] updateDriver called with data:', data);

    const updated = { ...driver, ...data, updatedAt: new Date().toISOString() };
    this.drivers.set(id, updated);

    const dbData: Record<string, unknown> = {};
    for (const key in data) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    console.log('[UserService] Sending to database:', dbData);

    const result = await this.updateInDatabase('drivers', id, dbData);

    if (!result.success) {
      console.error('[UserService] Failed to update driver in database:', result.error);
      this.drivers.set(id, driver);
      return { success: false, error: result.error };
    }

    console.log('[UserService] Driver updated successfully in database');
    return { success: true, data: updated };
  }

  deleteDriver(id: string): boolean {
    const deleted = this.drivers.delete(id);
    if (deleted) {
      this.userPermissions.delete(id);
      this.deleteFromDatabase('drivers', id);
    }
    return deleted;
  }

  async authenticateDriver(driverCode: string, pin: string): Promise<{ driver: Driver | null; error: string | null; suspendedUntil?: string }> {
    console.log('[UserService] ========================================');
    console.log('[UserService] authenticateDriver called:', { driverCode, pinLength: pin.length });

    await dataSourceService.waitForConfigLoad();

    const debugInfo = dataSourceService.getDebugInfo();
    console.log('[UserService] Data source config:', debugInfo);
    console.log('[UserService] Config source:', debugInfo.configSource);
    console.log('[UserService] Using external database:', dataSourceService.isUsingExternalDatabase());

    if (dataSourceService.isUsingExternalDatabase()) {
      console.log('[UserService] Querying external database for driver...');
      console.log('[UserService] SQL: SELECT * FROM drivers WHERE LOWER(driver_code) = LOWER(?) AND pin = ?');
      console.log('[UserService] Params:', [driverCode, pin]);

      const result = await dataSourceService.query<Driver>(
        'SELECT * FROM drivers WHERE LOWER(driver_code) = LOWER(?) AND pin = ?',
        [driverCode, pin]
      );

      console.log('[UserService] Query result:', {
        success: result.success,
        rowCount: result.data?.length,
        error: result.error,
        data: result.data
      });

      if (result.success && result.data && result.data.length > 0) {
        const driver = result.data[0];
        if (driver.status === 'inactive') {
          console.log('[UserService] ❌ Driver account is inactive');
          return { driver: null, error: 'Konto kierowcy jest nieaktywne' };
        }
        if (driver.status === 'suspended') {
          console.log('[UserService] ❌ Driver account is suspended');
          return { driver: null, error: 'suspended', suspendedUntil: driver.suspendedUntil };
        }
        console.log('[UserService] ✅ Driver authenticated successfully:', {
          id: driver.id,
          name: driver.name,
          code: driver.driverCode
        });
        console.log('[UserService] ========================================');
        return { driver, error: null };
      }

      console.log('[UserService] No match found, checking if driver code exists...');
      const codeCheck = await dataSourceService.query<Driver>(
        'SELECT * FROM drivers WHERE LOWER(driver_code) = LOWER(?)',
        [driverCode]
      );

      console.log('[UserService] Code check result:', {
        success: codeCheck.success,
        rowCount: codeCheck.data?.length,
        error: codeCheck.error
      });

      if (!codeCheck.success || !codeCheck.data || codeCheck.data.length === 0) {
        console.log('[UserService] ❌ Driver code not found in database');
        console.log('[UserService] ========================================');
        return { driver: null, error: 'Nieprawidlowy kod kierowcy' };
      }

      const driver = codeCheck.data[0];
      console.log('[UserService] Driver found:', {
        id: driver.id,
        name: driver.name,
        status: driver.status,
        pinInDb: driver.pin,
        pinProvided: pin,
        pinMatch: driver.pin === pin
      });

      if (driver.pin !== pin) {
        console.log('[UserService] ❌ Incorrect PIN');
        console.log('[UserService] ========================================');
        return { driver: null, error: 'Nieprawidlowy PIN' };
      }

      console.log('[UserService] ❌ Driver account is inactive');
      console.log('[UserService] ========================================');
      return { driver: null, error: 'Konto kierowcy jest nieaktywne' };
    }

    console.log('[UserService] Using local storage (fallback mode)');
    const drivers = Array.from(this.drivers.values());
    const driver = drivers.find(d => d.driverCode.toLowerCase() === driverCode.toLowerCase());

    if (!driver) {
      console.log('[UserService] ❌ Driver code not found in local storage');
      console.log('[UserService] ========================================');
      return { driver: null, error: 'Nieprawidlowy kod kierowcy' };
    }

    if (driver.pin !== pin) {
      console.log('[UserService] ❌ Incorrect PIN');
      console.log('[UserService] ========================================');
      return { driver: null, error: 'Nieprawidlowy PIN' };
    }

    if (driver.status === 'inactive') {
      console.log('[UserService] ❌ Driver account is inactive');
      console.log('[UserService] ========================================');
      return { driver: null, error: 'Konto kierowcy jest nieaktywne' };
    }

    if (driver.status === 'suspended') {
      console.log('[UserService] ❌ Driver account is suspended');
      console.log('[UserService] ========================================');
      return { driver: null, error: 'suspended', suspendedUntil: driver.suspendedUntil };
    }

    console.log('[UserService] ✅ Driver authenticated from local storage');
    console.log('[UserService] ========================================');
    return { driver, error: null };
  }

  getDrivers(): Driver[] {
    return Array.from(this.drivers.values());
  }

  async createDispatcher(data: Omit<Dispatcher, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: Dispatcher; error?: string }> {
    const id = `dispatcher_${Date.now()}`;
    const now = new Date().toISOString();
    const dispatcher: Dispatcher = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.dispatchers.set(id, dispatcher);

    const dbData: Record<string, unknown> = {};
    for (const key in dispatcher) {
      const value = (dispatcher as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    const result = await this.saveToDatabase('dispatchers', dbData);

    if (!result.success) {
      this.dispatchers.delete(id);
      return { success: false, error: result.error };
    }

    return { success: true, data: dispatcher };
  }

  async updateDispatcher(id: string, data: Partial<Dispatcher>): Promise<{ success: boolean; data?: Dispatcher; error?: string }> {
    const dispatcher = this.dispatchers.get(id);
    if (!dispatcher) return { success: false, error: 'Dyspozytor nie został znaleziony' };

    const updated = { ...dispatcher, ...data, updatedAt: new Date().toISOString() };
    this.dispatchers.set(id, updated);

    const dbData = { ...data };
    delete (dbData as { updatedAt?: string }).updatedAt;

    const result = await this.updateInDatabase('dispatchers', id, dbData);

    if (!result.success) {
      this.dispatchers.set(id, dispatcher);
      return { success: false, error: result.error };
    }

    return { success: true, data: updated };
  }

  deleteDispatcher(id: string): boolean {
    const deleted = this.dispatchers.delete(id);
    if (deleted) {
      this.userPermissions.delete(id);
      this.deleteFromDatabase('dispatchers', id);
    }
    return deleted;
  }

  async createSupportAgent(data: Omit<SupportAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: SupportAgent; error?: string }> {
    const id = `support_${Date.now()}`;
    const now = new Date().toISOString();
    const agent: SupportAgent = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.supportAgents.set(id, agent);

    const dbData: Record<string, unknown> = {};
    for (const key in agent) {
      const value = (agent as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    const result = await this.saveToDatabase('support_agents', dbData);

    if (!result.success) {
      this.supportAgents.delete(id);
      return { success: false, error: result.error };
    }

    return { success: true, data: agent };
  }

  async updateSupportAgent(id: string, data: Partial<SupportAgent>): Promise<{ success: boolean; data?: SupportAgent; error?: string }> {
    const agent = this.supportAgents.get(id);
    if (!agent) return { success: false, error: 'Agent wsparcia nie został znaleziony' };

    const updated = { ...agent, ...data, updatedAt: new Date().toISOString() };
    this.supportAgents.set(id, updated);

    const dbData = { ...data };
    delete (dbData as { updatedAt?: string }).updatedAt;

    const result = await this.updateInDatabase('support_agents', id, dbData);

    if (!result.success) {
      this.supportAgents.set(id, agent);
      return { success: false, error: result.error };
    }

    return { success: true, data: updated };
  }

  deleteSupportAgent(id: string): boolean {
    const deleted = this.supportAgents.delete(id);
    if (deleted) {
      this.userPermissions.delete(id);
      this.deleteFromDatabase('support_agents', id);
    }
    return deleted;
  }

  async createAccountingUser(data: Omit<AccountingUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: AccountingUser; error?: string }> {
    const id = `accounting_${Date.now()}`;
    const now = new Date().toISOString();
    const user: AccountingUser = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.accountingUsers.set(id, user);

    const dbData: Record<string, unknown> = {};
    for (const key in user) {
      const value = (user as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && key !== 'updatedAt') {
        dbData[key] = value;
      }
    }

    const result = await this.saveToDatabase('accounting_users', dbData);

    if (!result.success) {
      this.accountingUsers.delete(id);
      return { success: false, error: result.error };
    }

    return { success: true, data: user };
  }

  async updateAccountingUser(id: string, data: Partial<AccountingUser>): Promise<{ success: boolean; data?: AccountingUser; error?: string }> {
    const user = this.accountingUsers.get(id);
    if (!user) return { success: false, error: 'Użytkownik księgowości nie został znaleziony' };

    const updated = { ...user, ...data, updatedAt: new Date().toISOString() };
    this.accountingUsers.set(id, updated);

    const dbData = { ...data };
    delete (dbData as { updatedAt?: string }).updatedAt;

    const result = await this.updateInDatabase('accounting_users', id, dbData);

    if (!result.success) {
      this.accountingUsers.set(id, user);
      return { success: false, error: result.error };
    }

    return { success: true, data: updated };
  }

  deleteAccountingUser(id: string): boolean {
    const deleted = this.accountingUsers.delete(id);
    if (deleted) {
      this.userPermissions.delete(id);
      this.deleteFromDatabase('accounting_users', id);
    }
    return deleted;
  }

  getUserPermissions(userId: string): UserPermissions | null {
    return this.userPermissions.get(userId) || null;
  }

  updateUserPermissions(userId: string, permissions: Omit<UserPermissions, 'userId'>): UserPermissions {
    const userPermissions: UserPermissions = {
      userId,
      ...permissions,
    };

    this.userPermissions.set(userId, userPermissions);
    this.saveToStorage();
    return userPermissions;
  }

  getUserById(id: string): AnyUser | null {
    return this.administrators.get(id) ||
           this.drivers.get(id) ||
           this.dispatchers.get(id) ||
           this.supportAgents.get(id) ||
           this.accountingUsers.get(id) ||
           null;
  }

  getUserByEmail(email: string): AnyUser | null {
    const allUsers = [
      ...this.administrators.values(),
      ...this.drivers.values(),
      ...this.dispatchers.values(),
      ...this.supportAgents.values(),
      ...this.accountingUsers.values(),
    ];

    return allUsers.find(user => user.email === email) || null;
  }

  getAdministratorByEmail(email: string): Administrator | null {
    return Array.from(this.administrators.values()).find(admin => admin.email === email) || null;
  }

  getDriverByEmail(email: string): Driver | null {
    return Array.from(this.drivers.values()).find(driver => driver.email === email) || null;
  }

  getDispatcherByEmail(email: string): Dispatcher | null {
    return Array.from(this.dispatchers.values()).find(dispatcher => dispatcher.email === email) || null;
  }

  getSupportAgentByEmail(email: string): SupportAgent | null {
    return Array.from(this.supportAgents.values()).find(agent => agent.email === email) || null;
  }

  getAccountingUserByEmail(email: string): AccountingUser | null {
    return Array.from(this.accountingUsers.values()).find(user => user.email === email) || null;
  }

  getAllUsers(): AnyUser[] {
    return [
      ...this.administrators.values(),
      ...this.drivers.values(),
      ...this.dispatchers.values(),
      ...this.supportAgents.values(),
      ...this.accountingUsers.values(),
    ];
  }

  getStatistics() {
    return {
      total: this.getAllUsers().length,
      administrators: this.administrators.size,
      drivers: this.drivers.size,
      dispatchers: this.dispatchers.size,
      supportAgents: this.supportAgents.size,
      accountingUsers: this.accountingUsers.size,
      active: this.getAllUsers().filter(u => u.status === 'active').length,
      inactive: this.getAllUsers().filter(u => u.status === 'inactive').length,
    };
  }
}

export const userService = new UserService();
