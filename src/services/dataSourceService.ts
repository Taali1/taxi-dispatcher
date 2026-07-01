// Supabase import removed

export type DataSourceType = 'local' | 'external';

export interface QueryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rowCount?: number;
}

export interface DataSourceConfig {
  type: DataSourceType;
  connectionId?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

type DataChangeCallback = (table: string, action: 'insert' | 'update' | 'delete') => void;
type ConfigChangeCallback = () => void;

class DataSourceService {
  private currentSource: DataSourceType = 'local';
  private externalConfig: DataSourceConfig | null = null;
  private listeners: DataChangeCallback[] = [];
  private configListeners: ConfigChangeCallback[] = [];
  private apiBaseUrl: string = '/api';
  private configLoadPromise: Promise<void> | null = null;

  constructor() {
    this.configLoadPromise = this.loadConfig();
  }

  private async loadConfig() {
    console.log('[DataSourceService] ========================================');
    console.log('[DataSourceService] Loading configuration...');

    try {
      const activeConnectionData = localStorage.getItem('taxi_active_db_connection');
      if (activeConnectionData) {
        const config = JSON.parse(activeConnectionData);
        console.log('[DataSourceService] Found active connection in localStorage:', {
          host: config.host,
          database: config.database,
          username: config.username
        });

        if (config.host && config.username && config.database) {
          this.currentSource = 'external';
          this.externalConfig = {
            type: 'external',
            host: config.host,
            port: config.port || 3306,
            username: config.username,
            password: config.password,
            database: config.database
          };

          console.log('[DataSourceService] Using external database from localStorage');
          console.log('[DataSourceService] Final configuration:', {
            currentSource: this.currentSource,
            isExternal: this.isUsingExternalDatabase(),
            hasConfig: !!this.externalConfig,
            database: this.externalConfig?.database
          });
          console.log('[DataSourceService] ========================================');
          return;
        }
      }
    } catch (error) {
      console.error('[DataSourceService] Error loading from localStorage:', error);
    }

    console.log('[DataSourceService] No active connection in localStorage, checking .env...');

    const host = import.meta.env.VITE_MYSQL_HOST;
    const port = parseInt(import.meta.env.VITE_MYSQL_PORT || '3306', 10);
    const username = import.meta.env.VITE_MYSQL_USER;
    const password = import.meta.env.VITE_MYSQL_PASSWORD;
    const database = import.meta.env.VITE_MYSQL_DATABASE;

    if (host && username && database) {
      this.currentSource = 'external';
      this.externalConfig = {
        type: 'external',
        host,
        port,
        username,
        password,
        database
      };
      console.log('[DataSourceService] MySQL config from .env:', {
        host,
        port,
        database,
        username,
        hasPassword: !!password
      });
      console.log('[DataSourceService] Using external MySQL database');
    } else {
      console.log('[DataSourceService] No MySQL config, using local storage');
      this.currentSource = 'local';
      this.externalConfig = null;
    }

    console.log('[DataSourceService] Final configuration:', {
      currentSource: this.currentSource,
      isExternal: this.isUsingExternalDatabase(),
      hasConfig: !!this.externalConfig,
      database: this.externalConfig?.database,
      apiBaseUrl: this.apiBaseUrl
    });
    console.log('[DataSourceService] ========================================');
  }

  private notifyConfigListeners() {
    console.log('[DataSourceService] Notifying config listeners:', this.configListeners.length);
    this.configListeners.forEach(cb => {
      try {
        cb();
      } catch (error) {
        console.error('[DataSourceService] Error in config listener:', error);
      }
    });
  }

  onConfigChange(callback: ConfigChangeCallback) {
    this.configListeners.push(callback);
    return () => {
      this.configListeners = this.configListeners.filter(l => l !== callback);
    };
  }

  getCurrentSource(): DataSourceType {
    return this.currentSource;
  }

  getExternalConfig(): DataSourceConfig | null {
    return this.externalConfig;
  }

  isUsingExternalDatabase(): boolean {
    return this.currentSource === 'external' && this.externalConfig !== null;
  }

  async waitForConfigLoad(): Promise<void> {
    if (this.configLoadPromise) {
      await this.configLoadPromise;
    }
  }

  getDebugInfo() {
    return {
      currentSource: this.currentSource,
      externalConfig: this.externalConfig ? {
        host: this.externalConfig.host,
        port: this.externalConfig.port,
        database: this.externalConfig.database,
        username: this.externalConfig.username,
        hasPassword: !!this.externalConfig.password
      } : null,
      apiBaseUrl: this.apiBaseUrl,
      configSource: '.env file (VITE_MYSQL_* variables)',
      envVars: {
        VITE_MYSQL_HOST: import.meta.env.VITE_MYSQL_HOST || '(not set)',
        VITE_MYSQL_PORT: import.meta.env.VITE_MYSQL_PORT || '3306',
        VITE_MYSQL_USER: import.meta.env.VITE_MYSQL_USER || '(not set)',
        VITE_MYSQL_DATABASE: import.meta.env.VITE_MYSQL_DATABASE || '(not set)',
        hasPassword: !!import.meta.env.VITE_MYSQL_PASSWORD
      }
    };
  }

  onDataChange(callback: DataChangeCallback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(table: string, action: 'insert' | 'update' | 'delete') {
    this.listeners.forEach(cb => cb(table, action));
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T[]>> {
    if (this.currentSource === 'local') {
      return { success: false, error: 'SQL queries not supported for local storage' };
    }

    console.log('[DataSourceService] Executing query:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));

    try {
      const response = await this.executeExternalQuery(sql, params);

      if (!response.success) {
        console.error('[DataSourceService] Query failed:', response.error);
        return response as QueryResult<T[]>;
      }

      if (response.data && Array.isArray(response.data)) {
        const convertedData = this.convertArrayToCamelCase<T>(response.data);
        return { ...response, data: convertedData } as QueryResult<T[]>;
      }

      return response as QueryResult<T[]>;
    } catch (error) {
      console.error('[DataSourceService] Query exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query execution failed'
      };
    }
  }

  private async executeExternalQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.externalConfig) {
      return { success: false, error: 'No external database configured. Set VITE_MYSQL_* variables in .env' };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API Error: ${response.status} - ${errorText}` };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error while executing query'
      };
    }
  }

  async getAll<T>(table: string): Promise<QueryResult<T[]>> {
    if (this.currentSource === 'local') {
      return this.getFromLocalStorage<T>(table);
    }

    const result = await this.query<T>(`SELECT * FROM ${table}`);

    if (!result.success && result.error) {
      console.error(`Failed to get all from ${table}:`, result.error);
      if (result.error.includes("doesn't exist") || result.error.includes('Table')) {
        return {
          success: false,
          error: `Tabela '${table}' nie istnieje w bazie danych. Zainstaluj schemat bazy danych w panelu Support.`,
          data: []
        };
      }
    }

    return result;
  }

  async getById<T>(table: string, id: string): Promise<QueryResult<T>> {
    if (this.currentSource === 'local') {
      const result = await this.getFromLocalStorage<T>(table);
      if (!result.success || !result.data) {
        return { success: false, error: 'Not found' };
      }
      const item = result.data.find((item: T) => (item as { id: string }).id === id);
      return item ? { success: true, data: item } : { success: false, error: 'Not found' };
    }

    const result = await this.query<T>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (result.success && result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }
    return { success: false, error: 'Not found' };
  }

  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private convertKeysToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[this.camelToSnakeCase(key)] = obj[key];
    }
    return result;
  }

  private convertKeysToCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      const camelKey = this.snakeToCamelCase(key);
      let value = obj[key];

      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value);
        } catch {
        }
      }

      result[camelKey] = value;
    }
    return result;
  }

  private convertArrayToCamelCase<T>(arr: unknown[]): T[] {
    return arr.map(item => {
      if (item && typeof item === 'object') {
        return this.convertKeysToCamelCase(item as Record<string, unknown>) as T;
      }
      return item as T;
    });
  }

  private prepareValueForDatabase(value: unknown): unknown {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (value !== null && typeof value === 'object') {
      return JSON.stringify(value);
    }
    // Konwersja ISO 8601 → MySQL DATETIME ('2026-02-22T07:16:32.778Z' → '2026-02-22 07:16:32')
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return value.replace('T', ' ').replace(/\.\d+Z?$/, '');
    }
    return value;
  }

  async insert<T>(table: string, data: Partial<T>): Promise<QueryResult<T>> {
    console.log('[DataSourceService] Insert called:', { table, source: this.currentSource });

    if (this.currentSource === 'local') {
      return this.insertToLocalStorage<T>(table, data);
    }

    const convertedData = this.convertKeysToSnakeCase(data as Record<string, unknown>);
    const columns = Object.keys(convertedData);
    const values = Object.values(convertedData).map(v => this.prepareValueForDatabase(v));
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    console.log('[DataSourceService] Insert SQL:', sql);
    console.log('[DataSourceService] Insert values:', values);
    console.log('[DataSourceService] Insert to database:', this.externalConfig?.database);

    const result = await this.query(sql, values);

    if (result.success) {
      console.log('[DataSourceService] Insert successful');
      this.notifyListeners(table, 'insert');
    } else {
      console.error(`[DataSourceService] Failed to insert into ${table}:`, result.error);
      if (result.error?.includes("doesn't exist") || result.error?.includes('Table')) {
        return {
          success: false,
          error: `Tabela '${table}' nie istnieje w bazie danych. Zainstaluj schemat bazy danych w panelu Support.`
        } as QueryResult<T>;
      }
    }

    return result as QueryResult<T>;
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<QueryResult<T>> {
    if (this.currentSource === 'local') {
      return this.updateInLocalStorage<T>(table, id, data);
    }

    const convertedData = this.convertKeysToSnakeCase(data as Record<string, unknown>);
    const columns = Object.keys(convertedData);
    const values = Object.values(convertedData).map(v => this.prepareValueForDatabase(v));
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    console.log('[DataSourceService] Update SQL:', sql);

    const result = await this.query(sql, [...values, id]);

    if (result.success) {
      this.notifyListeners(table, 'update');
    } else {
      console.error(`[DataSourceService] Failed to update in ${table}:`, result.error);
      if (result.error?.includes("doesn't exist") || result.error?.includes('Table')) {
        return {
          success: false,
          error: `Tabela '${table}' nie istnieje w bazie danych. Zainstaluj schemat bazy danych w panelu Support.`
        } as QueryResult<T>;
      }
    }

    return result as QueryResult<T>;
  }

  async delete(table: string, id: string): Promise<QueryResult> {
    if (this.currentSource === 'local') {
      return this.deleteFromLocalStorage(table, id);
    }

    const result = await this.query(`DELETE FROM ${table} WHERE id = ?`, [id]);

    if (result.success) {
      this.notifyListeners(table, 'delete');
    } else {
      console.error(`Failed to delete from ${table}:`, result.error);
      if (result.error?.includes("doesn't exist") || result.error?.includes('Table')) {
        return {
          success: false,
          error: `Tabela '${table}' nie istnieje w bazie danych. Zainstaluj schemat bazy danych w panelu Support.`
        };
      }
    }

    return result;
  }

  private getStorageKeyForTable(table: string): string {
    const tableMapping: Record<string, string> = {
      'drivers': 'taxi_users_data',
      'administrators': 'taxi_users_data',
      'dispatchers': 'taxi_users_data',
      'support_agents': 'taxi_users_data',
      'accounting_users': 'taxi_users_data',
      'zones': 'taxi_zones',
      'regions': 'taxi_regions_data',
      'taxi_codes': 'taxi_regions_data',
      'chat_messages': 'taxi_chat_messages',
      'driver_queue': 'taxi_drivers',
      'database_connections': 'taxi_database_connections',
      'map_tokens': 'taxi_map_tokens',
      'custom_addresses': 'taxi_custom_addresses',
      'driver_history': 'taxi_driver_history'
    };
    return tableMapping[table] || `taxi_${table}`;
  }

  private getFromLocalStorage<T>(table: string): QueryResult<T[]> {
    try {
      const key = this.getStorageKeyForTable(table);
      const stored = localStorage.getItem(key);

      if (!stored) {
        return { success: true, data: [], rowCount: 0 };
      }

      const parsed = JSON.parse(stored);

      if (key === 'taxi_users_data') {
        const tableKeyMap: Record<string, string> = {
          'drivers': 'drivers',
          'administrators': 'administrators',
          'dispatchers': 'dispatchers',
          'support_agents': 'supportAgents',
          'accounting_users': 'accountingUsers'
        };
        const dataKey = tableKeyMap[table];
        const data = dataKey ? (parsed[dataKey] || []) : [];
        return { success: true, data: data as T[], rowCount: data.length };
      }

      if (key === 'taxi_regions_data') {
        const data = table === 'regions' ? (parsed.regions || []) : (parsed.taxiCodes || []);
        return { success: true, data: data as T[], rowCount: data.length };
      }

      if (key === 'taxi_database_connections') {
        const data = table === 'database_connections' ? (parsed.connections || []) : (parsed.corporations || []);
        return { success: true, data: data as T[], rowCount: data.length };
      }

      const data = Array.isArray(parsed) ? parsed : [];
      return { success: true, data: data as T[], rowCount: data.length };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read from localStorage'
      };
    }
  }

  private insertToLocalStorage<T>(table: string, data: Partial<T>): QueryResult<T> {
    try {
      const key = this.getStorageKeyForTable(table);
      const stored = localStorage.getItem(key);
      let parsed = stored ? JSON.parse(stored) : {};

      const newItem = { ...data, id: data.id || `${table}_${Date.now()}` } as T;

      if (key === 'taxi_users_data') {
        const tableKeyMap: Record<string, string> = {
          'drivers': 'drivers',
          'administrators': 'administrators',
          'dispatchers': 'dispatchers',
          'support_agents': 'supportAgents',
          'accounting_users': 'accountingUsers'
        };
        const dataKey = tableKeyMap[table];
        if (dataKey) {
          parsed[dataKey] = parsed[dataKey] || [];
          parsed[dataKey].push(newItem);
        }
      } else if (key === 'taxi_regions_data') {
        const arrayKey = table === 'regions' ? 'regions' : 'taxiCodes';
        parsed[arrayKey] = parsed[arrayKey] || [];
        parsed[arrayKey].push(newItem);
      } else if (Array.isArray(parsed)) {
        parsed.push(newItem);
      } else {
        parsed = [newItem];
      }

      localStorage.setItem(key, JSON.stringify(parsed));
      this.notifyListeners(table, 'insert');

      return { success: true, data: newItem };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to insert to localStorage'
      };
    }
  }

  private updateInLocalStorage<T>(table: string, id: string, data: Partial<T>): QueryResult<T> {
    try {
      const key = this.getStorageKeyForTable(table);
      const stored = localStorage.getItem(key);
      if (!stored) {
        return { success: false, error: 'Table not found' };
      }

      let parsed = JSON.parse(stored);
      let targetArray: T[] = [];
      let arrayKey = '';

      if (key === 'taxi_users_data') {
        const tableKeyMap: Record<string, string> = {
          'drivers': 'drivers',
          'administrators': 'administrators',
          'dispatchers': 'dispatchers',
          'support_agents': 'supportAgents',
          'accounting_users': 'accountingUsers'
        };
        arrayKey = tableKeyMap[table];
        targetArray = parsed[arrayKey] || [];
      } else if (key === 'taxi_regions_data') {
        arrayKey = table === 'regions' ? 'regions' : 'taxiCodes';
        targetArray = parsed[arrayKey] || [];
      } else if (Array.isArray(parsed)) {
        targetArray = parsed;
      }

      const index = targetArray.findIndex((item: T) => (item as { id: string }).id === id);
      if (index === -1) {
        return { success: false, error: 'Item not found' };
      }

      const updatedItem = { ...targetArray[index], ...data } as T;
      targetArray[index] = updatedItem;

      if (arrayKey) {
        parsed[arrayKey] = targetArray;
      } else {
        parsed = targetArray;
      }

      localStorage.setItem(key, JSON.stringify(parsed));
      this.notifyListeners(table, 'update');

      return { success: true, data: updatedItem };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update in localStorage'
      };
    }
  }

  private deleteFromLocalStorage(table: string, id: string): QueryResult {
    try {
      const key = this.getStorageKeyForTable(table);
      const stored = localStorage.getItem(key);
      if (!stored) {
        return { success: false, error: 'Table not found' };
      }

      let parsed = JSON.parse(stored);
      let targetArray: unknown[] = [];
      let arrayKey = '';

      if (key === 'taxi_users_data') {
        const tableKeyMap: Record<string, string> = {
          'drivers': 'drivers',
          'administrators': 'administrators',
          'dispatchers': 'dispatchers',
          'support_agents': 'supportAgents',
          'accounting_users': 'accountingUsers'
        };
        arrayKey = tableKeyMap[table];
        targetArray = parsed[arrayKey] || [];
      } else if (key === 'taxi_regions_data') {
        arrayKey = table === 'regions' ? 'regions' : 'taxiCodes';
        targetArray = parsed[arrayKey] || [];
      } else if (Array.isArray(parsed)) {
        targetArray = parsed;
      }

      const index = targetArray.findIndex((item) => (item as { id: string }).id === id);
      if (index === -1) {
        return { success: false, error: 'Item not found' };
      }

      targetArray.splice(index, 1);

      if (arrayKey) {
        parsed[arrayKey] = targetArray;
      } else {
        parsed = targetArray;
      }

      localStorage.setItem(key, JSON.stringify(parsed));
      this.notifyListeners(table, 'delete');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete from localStorage'
      };
    }
  }

  async testConnection(config: Omit<DataSourceConfig, 'type'>): Promise<QueryResult> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Connection failed: ${errorText}` };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  async getTables(): Promise<QueryResult<string[]>> {
    if (this.currentSource === 'local') {
      return {
        success: true,
        data: [
          'drivers', 'administrators', 'dispatchers', 'support_agents',
          'accounting_users', 'zones', 'regions', 'taxi_codes',
          'chat_messages', 'driver_queue'
        ]
      };
    }

    try {
      console.log('[DataSourceService] Getting tables from external database...');
      console.log('[DataSourceService] Config:', {
        host: this.externalConfig?.host,
        database: this.externalConfig?.database
      });

      const response = await fetch(`${this.apiBaseUrl}/tables`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DataSourceService] Failed to get tables:', errorText);
        return { success: false, error: `API Error: ${response.status}` };
      }

      const result = await response.json();
      console.log('[DataSourceService] Found tables:', result.data);
      return result;
    } catch (error) {
      console.error('[DataSourceService] Failed to get tables:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tables'
      };
    }
  }

  async refreshConfig() {
    await this.loadConfig();
    this.notifyConfigListeners();
  }

  setActiveExternalConnection(config: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  }) {
    console.log('[DataSourceService] Setting active external connection:', {
      host: config.host,
      database: config.database,
      username: config.username
    });

    localStorage.setItem('taxi_active_db_connection', JSON.stringify(config));

    this.currentSource = 'external';
    this.externalConfig = {
      type: 'external',
      ...config
    };

    this.notifyConfigListeners();
  }

  clearActiveConnection() {
    console.log('[DataSourceService] Clearing active connection');
    localStorage.removeItem('taxi_active_db_connection');
    this.currentSource = 'local';
    this.externalConfig = null;
    this.notifyConfigListeners();
  }
}

export const dataSourceService = new DataSourceService();
