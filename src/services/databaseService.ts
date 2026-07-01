import { DatabaseConnection, DatabaseTable, Corporation, ConnectionTestResult, SqlExportOptions } from '../types/database';
import { dataSourceService } from './dataSourceService';
import { MySQLSchemaGenerator, MySQLExportOptions } from './mysqlSchemaGenerator';

export class DatabaseService {
  private connections: Map<string, DatabaseConnection> = new Map();
  private corporations: Map<string, Corporation> = new Map();
  private activeConnection: DatabaseConnection | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async initializeDefaultConnections() {
    const localConnection: DatabaseConnection = {
      id: 'local-default',
      name: 'Lokalna Baza Danych',
      type: 'local',
      isActive: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
    };

    this.connections.set(localConnection.id, localConnection);
    this.activeConnection = localConnection;
  }

  async initialize() {
    if (this.initialized) return;
    await this.initializeDefaultConnections();
    await this.loadFromStorage();
    this.initialized = true;
  }

  private async loadFromStorage() {
    console.warn('[DatabaseService] Using in-memory connections only');
  }

  private async saveToStorage() {
    console.warn('[DatabaseService] In-memory storage - no persistence');
  }

  async testConnection(connection: Omit<DatabaseConnection, 'id' | 'isActive' | 'isDefault' | 'createdAt'>): Promise<ConnectionTestResult> {
    try {
      if (connection.type === 'local') {
        return {
          success: true,
          tables: this.getMockLocalTables(),
          serverInfo: {
            version: 'SQLite 3.36.0',
            type: 'SQLite'
          }
        };
      }

      if (!connection.host || !connection.username || !connection.database) {
        return {
          success: false,
          error: {
            code: 'MISSING_PARAMS',
            message: 'Brak wymaganych parametrów połączenia',
            details: 'Host, użytkownik i nazwa bazy są wymagane'
          }
        };
      }

      const result = await dataSourceService.testConnection({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        database: connection.database
      });

      if (result.success && result.data) {
        const data = result.data as { version?: string; tables?: string[]; tableCount?: number };
        const tables: DatabaseTable[] = (data.tables || []).map((tableName: string) => ({
          name: tableName,
          type: 'table' as const,
          rowCount: 0,
          size: '0 KB',
          engine: 'InnoDB',
          collation: 'utf8mb4_unicode_ci'
        }));

        return {
          success: true,
          tables,
          serverInfo: {
            version: data.version || 'Unknown',
            type: connection.type === 'mariadb' ? 'MariaDB' : 'MySQL'
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'CONNECTION_ERROR',
          message: 'Błąd połączenia z bazą danych',
          details: result.error || 'Nieznany błąd'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONNECTION_ERROR',
          message: 'Błąd połączenia z bazą danych',
          details: error instanceof Error ? error.message : 'Nieznany błąd'
        }
      };
    }
  }

  private getMockLocalTables(): DatabaseTable[] {
    const tables: DatabaseTable[] = [];
    
    try {
      // Users data
      const usersData = localStorage.getItem('taxi_users_data');
      const parsed = usersData ? JSON.parse(usersData) : {};
      
      // Always add user tables
      tables.push({ 
        name: 'administrators', 
        type: 'table', 
        rowCount: parsed.administrators?.length || 0, 
        size: parsed.administrators ? `${Math.round(JSON.stringify(parsed.administrators).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      tables.push({ 
        name: 'drivers', 
        type: 'table', 
        rowCount: parsed.drivers?.length || 0,
        size: parsed.drivers ? `${Math.round(JSON.stringify(parsed.drivers).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      tables.push({ 
        name: 'dispatchers', 
        type: 'table', 
        rowCount: parsed.dispatchers?.length || 0, 
        size: parsed.dispatchers ? `${Math.round(JSON.stringify(parsed.dispatchers).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      tables.push({ 
        name: 'support_agents', 
        type: 'table', 
        rowCount: parsed.supportAgents?.length || 0, 
        size: parsed.supportAgents ? `${Math.round(JSON.stringify(parsed.supportAgents).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      tables.push({ 
        name: 'accounting_users', 
        type: 'table', 
        rowCount: parsed.accountingUsers?.length || 0, 
        size: parsed.accountingUsers ? `${Math.round(JSON.stringify(parsed.accountingUsers).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      // Always add core system tables
      tables.push({ 
        name: 'orders', 
        type: 'table', 
        rowCount: 2, 
        size: '0.5 KB'
      });
      
      tables.push({ 
        name: 'zones', 
        type: 'table', 
        rowCount: 3, 
        size: '0.3 KB'
      });
      
      tables.push({ 
        name: 'pricing_rules', 
        type: 'table', 
        rowCount: 4, 
        size: '0.4 KB'
      });
      
      // Database connections
      const connectionsData = localStorage.getItem('taxi_database_connections');
      const connectionsDataParsed = connectionsData ? JSON.parse(connectionsData) : {};
      
      tables.push({ 
        name: 'database_connections', 
        type: 'table', 
        rowCount: connectionsDataParsed.connections?.length || 1, 
        size: connectionsDataParsed.connections ? `${Math.round(JSON.stringify(connectionsDataParsed.connections).length / 1024 * 10) / 10} KB` : '0.1 KB'
      });
      
      tables.push({ 
        name: 'corporations', 
        type: 'table', 
        rowCount: connectionsDataParsed.corporations?.length || 0, 
        size: connectionsDataParsed.corporations ? `${Math.round(JSON.stringify(connectionsDataParsed.corporations).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      // Map tokens
      const mapTokensData = localStorage.getItem('taxi_map_tokens');
      const mapTokensParsed = mapTokensData ? JSON.parse(mapTokensData) : [];
      
      tables.push({ 
        name: 'map_tokens', 
        type: 'table', 
        rowCount: mapTokensParsed.length || 0, 
        size: mapTokensParsed.length > 0 ? `${Math.round(JSON.stringify(mapTokensParsed).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      // Custom addresses
      const customAddressesData = localStorage.getItem('taxi_custom_addresses');
      const customAddressesParsed = customAddressesData ? JSON.parse(customAddressesData) : [];
      
      tables.push({ 
        name: 'custom_addresses', 
        type: 'table', 
        rowCount: customAddressesParsed.length || 0, 
        size: customAddressesParsed.length > 0 ? `${Math.round(JSON.stringify(customAddressesParsed).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
      // Zones data
      const zonesData = localStorage.getItem('taxi_zones');
      const zonesParsed = zonesData ? JSON.parse(zonesData) : [];
      
      tables.push({
        name: 'zones',
        type: 'table',
        rowCount: zonesParsed.length || 0,
        size: zonesParsed.length > 0 ? `${Math.round(JSON.stringify(zonesParsed).length / 1024 * 10) / 10} KB` : '0 KB'
      });

      const regionsData = localStorage.getItem('taxi_regions_data');
      const regionsParsed = regionsData ? JSON.parse(regionsData) : { regions: [], taxiCodes: [] };

      tables.push({
        name: 'regions',
        type: 'table',
        rowCount: regionsParsed.regions?.length || 0,
        size: regionsParsed.regions ? `${Math.round(JSON.stringify(regionsParsed.regions).length / 1024 * 10) / 10} KB` : '0 KB'
      });

      tables.push({
        name: 'taxi_codes',
        type: 'table',
        rowCount: regionsParsed.taxiCodes?.length || 0,
        size: regionsParsed.taxiCodes ? `${Math.round(JSON.stringify(regionsParsed.taxiCodes).length / 1024 * 10) / 10} KB` : '0 KB'
      });
      
    } catch (error) {
      console.error('Error reading localStorage data:', error);
    }
    
    return tables;
  }

  private getMockMariaDBTables(): DatabaseTable[] {
    return [
      { name: 'users', type: 'table', rowCount: 25, size: '2.1 KB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
      { name: 'orders', type: 'table', rowCount: 1247, size: '156.3 KB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
      { name: 'drivers', type: 'table', rowCount: 24, size: '3.8 KB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
      { name: 'zones', type: 'table', rowCount: 12, size: '1.2 KB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
      { name: 'pricing_rules', type: 'table', rowCount: 4, size: '0.8 KB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
      { name: 'order_history_view', type: 'view', rowCount: 1247, size: '0 KB' },
    ];
  }

  async saveConnection(connection: Omit<DatabaseConnection, 'id' | 'createdAt'>): Promise<string> {
    await this.ensureInitialized();
    const id = `conn_${Date.now()}`;
    const newConnection: DatabaseConnection = {
      ...connection,
      id,
      createdAt: new Date().toISOString(),
      lastConnected: new Date().toISOString(),
    };

    this.connections.set(id, newConnection);
    await this.saveToStorage();
    return id;
  }

  async setActiveConnection(connectionId: string): Promise<boolean> {
    await this.ensureInitialized();
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.error('[DatabaseService] Connection not found:', connectionId);
      return false;
    }

    console.log('[DatabaseService] Setting active connection:', {
      id: connection.id,
      type: connection.type,
      host: connection.host,
      database: connection.database
    });

    this.connections.forEach(conn => {
      conn.isActive = false;
    });

    connection.isActive = true;
    connection.lastConnected = new Date().toISOString();
    this.activeConnection = connection;

    await this.saveToStorage();

    if (connection.type !== 'local' && connection.host && connection.username && connection.database) {
      console.log('[DatabaseService] Activating external database connection in dataSourceService');
      dataSourceService.setActiveExternalConnection({
        host: connection.host,
        port: connection.port || 3306,
        username: connection.username,
        password: connection.password || '',
        database: connection.database
      });
    } else {
      console.log('[DatabaseService] Clearing external database connection (using local storage)');
      dataSourceService.clearActiveConnection();
    }

    console.log('[DatabaseService] Connection activated successfully');
    console.log('[DatabaseService] Current dataSource config:', dataSourceService.getDebugInfo());
    return true;
  }

  async getActiveConnection(): Promise<DatabaseConnection | null> {
    await this.ensureInitialized();
    return this.activeConnection;
  }

  async getAllConnections(): Promise<DatabaseConnection[]> {
    await this.ensureInitialized();
    return Array.from(this.connections.values());
  }

  async getTables(connectionId?: string): Promise<DatabaseTable[]> {
    const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;
    if (!connection) return [];

    if (connection.type === 'local') {
      return this.getMockLocalTables();
    }

    if (dataSourceService.isUsingExternalDatabase()) {
      const result = await dataSourceService.getTables();
      if (result.success && result.data) {
        return result.data.map((tableName: string) => ({
          name: tableName,
          type: 'table' as const,
          rowCount: 0,
          size: '0 KB',
          engine: 'InnoDB',
          collation: 'utf8mb4_unicode_ci'
        }));
      }
    }

    return this.getMockMariaDBTables();
  }

  async createCorporation(name: string, connectionId?: string): Promise<Corporation> {
    const id = `corp_${Date.now()}`;
    const databaseName = `taxi_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${id.slice(-6)}`;
    const activeConnectionId = connectionId || this.activeConnection?.id || 'local-default';

    const corporation: Corporation = {
      id,
      name,
      databaseName,
      connectionId: activeConnectionId,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    this.corporations.set(id, corporation);
    this.saveToStorage();

    // In real app, would create actual database here
    console.log(`Created database: ${databaseName} for corporation: ${name}`);

    return corporation;
  }

  getCorporations(): Corporation[] {
    return Array.from(this.corporations.values());
  }

  async updateCorporation(corporationId: string, updates: Partial<Corporation>): Promise<Corporation | null> {
    const corporation = this.corporations.get(corporationId);
    if (!corporation) return null;

    const updatedCorporation = { ...corporation, ...updates };
    this.corporations.set(corporationId, updatedCorporation);
    this.saveToStorage();

    return updatedCorporation;
  }

  async deleteCorporation(corporationId: string): Promise<boolean> {
    try {
      const corporation = this.corporations.get(corporationId);
      if (!corporation) {
        throw new Error('Korporacja nie została znaleziona');
      }

      // In real app, would also drop the database
      console.log(`Deleting database: ${corporation.databaseName} for corporation: ${corporation.name}`);
      
      const deleted = this.corporations.delete(corporationId);
      if (deleted) {
        this.saveToStorage();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting corporation:', error);
      throw error;
    }
  }

  async deleteConnection(connectionId: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        throw new Error('Połączenie nie zostało znalezione');
      }

      if (connection.isDefault) {
        throw new Error('Nie można usunąć domyślnego połączenia');
      }

      if (connection.isActive) {
        throw new Error('Nie można usunąć aktywnego połączenia');
      }

      const corporationsUsingConnection = Array.from(this.corporations.values())
        .filter(corp => corp.connectionId === connectionId);

      if (corporationsUsingConnection.length > 0) {
        const corpNames = corporationsUsingConnection.map(c => c.name).join(', ');
        throw new Error(`Nie można usunąć połączenia. Jest używane przez korporacje: ${corpNames}`);
      }

      const deleted = this.connections.delete(connectionId);
      if (deleted) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw error;
    }
  }

  async exportSQL(connectionId?: string, options: SqlExportOptions = {
    includeData: false,
    includeStructure: true,
    includeTriggers: false,
    includeViews: true,
  }): Promise<string> {
    const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;
    if (!connection) throw new Error('Brak aktywnego połączenia');

    const tables = await this.getTables(connectionId);
    let sql = `-- SQL Export for ${connection.name}\n`;
    sql += `-- Generated on: ${new Date().toISOString()}\n`;
    sql += `-- Connection type: ${connection.type}\n\n`;

    if (options.includeStructure) {
      sql += "-- Table structures\n";
      for (const table of tables.filter(t => t.type === 'table')) {
        sql += this.generateCreateTableSQL(table, connection.type);
      }
    }

    if (options.includeViews) {
      sql += "\n-- Views\n";
      for (const view of tables.filter(t => t.type === 'view')) {
        sql += this.generateCreateViewSQL(view);
      }
    }

    if (options.includeData) {
      sql += "\n-- Data inserts\n";
      for (const table of tables.filter(t => t.type === 'table')) {
        sql += this.generateInsertSQL(table);
      }
    }

    return sql;
  }

  private generateCreateTableSQL(table: DatabaseTable, dbType: string): string {
    // Mock SQL generation - in real app would fetch actual schema
    const engine = dbType === 'mariadb' || dbType === 'mysql' ? ` ENGINE=${table.engine || 'InnoDB'}` : '';
    const collation = table.collation ? ` COLLATE ${table.collation}` : '';
    
    return `CREATE TABLE \`${table.name}\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
)${engine}${collation};\n\n`;
  }

  private generateCreateViewSQL(view: DatabaseTable): string {
    return `CREATE VIEW \`${view.name}\` AS
SELECT * FROM orders WHERE status = 'completed';\n\n`;
  }

  private generateInsertSQL(table: DatabaseTable): string {
    return `-- INSERT statements for ${table.name} would be here\n\n`;
  }

  async downloadSQLExport(connectionId?: string, options?: SqlExportOptions): Promise<void> {
    try {
      const sql = await this.exportSQL(connectionId, options);
      const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;
      const filename = `${connection?.name || 'database'}_export_${new Date().toISOString().slice(0, 10)}.sql`;
      
      const blob = new Blob([sql], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading SQL export:', error);
      throw error;
    }
  }

  async getTableStructure(tableName: string, connectionId?: string): Promise<TableStructure> {
    const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;
    if (!connection) throw new Error('Brak aktywnego połączenia');

    // Mock table structures - in real app would query INFORMATION_SCHEMA
    const mockStructures: Record<string, TableStructure> = {
      orders: {
        tableName: 'orders',
        columns: [
          { name: 'id', type: 'varchar(36)', nullable: false, isPrimaryKey: true, isForeignKey: false, autoIncrement: false },
          { name: 'customer_name', type: 'varchar(100)', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'customer_phone', type: 'varchar(20)', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'pickup_address', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'destination_address', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'pickup_zone', type: 'int(11)', nullable: true, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'destination_zone', type: 'int(11)', nullable: true, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'status', type: 'enum', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false, defaultValue: 'new' },
          { name: 'driver_id', type: 'int(11)', nullable: true, isPrimaryKey: false, isForeignKey: true, autoIncrement: false },
          { name: 'cost', type: 'decimal(10,2)', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false },
          { name: 'created_at', type: 'timestamp', nullable: false, isPrimaryKey: false, isForeignKey: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
        indexes: [
          { name: 'PRIMARY', columns: ['id'], isUnique: true, isPrimary: true },
          { name: 'status_index', columns: ['status'], isUnique: false, isPrimary: false },
          { name: 'driver_index', columns: ['driver_id'], isUnique: false, isPrimary: false },
        ],
        foreignKeys: [
          {
            name: 'fk_orders_driver',
            column: 'driver_id',
            referencedTable: 'users',
            referencedColumn: 'id',
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
        ],
        engine: 'InnoDB',
        collation: 'utf8mb4_unicode_ci',
      },
    };

    const structure = mockStructures[tableName];
    if (!structure) {
      throw new Error(`Struktura tabeli ${tableName} nie została znaleziona`);
    }

    return structure;
  }

  async getTableData(tableName: string, page: number = 1, pageSize: number = 50, connectionId?: string): Promise<TableData> {
    const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;
    if (!connection) throw new Error('Brak aktywnego połączenia');

    if (connection.type !== 'local' && dataSourceService.isUsingExternalDatabase()) {
      try {
        const offset = (page - 1) * pageSize;
        const countResult = await dataSourceService.query<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
        const totalRows = countResult.success && countResult.data && countResult.data[0] ? countResult.data[0].count : 0;

        const dataResult = await dataSourceService.query(`SELECT * FROM ${tableName} LIMIT ${pageSize} OFFSET ${offset}`);

        if (dataResult.success && dataResult.data && dataResult.data.length > 0) {
          const columns = Object.keys(dataResult.data[0] as object);
          const rows = dataResult.data.map((row: unknown) => columns.map(col => (row as Record<string, unknown>)[col]));

          return {
            columns,
            rows,
            totalRows,
            currentPage: page,
            pageSize
          };
        }

        return {
          columns: ['id'],
          rows: [],
          totalRows: 0,
          currentPage: page,
          pageSize
        };
      } catch (error) {
        console.error('Error fetching data from external database:', error);
      }
    }

    try {
      if (tableName === 'drivers') {
        const usersData = localStorage.getItem('taxi_users_data');
        const queueData = localStorage.getItem('taxi_drivers');

        const queueDrivers = queueData ? JSON.parse(queueData) : [];
        const queueMap = new Map(queueDrivers.map((d: any) => [d.id, d]));

        if (usersData) {
          const parsed = JSON.parse(usersData);
          const drivers = parsed.drivers || [];

          const rows = drivers.map((driver: any) => {
            const queueDriver = queueMap.get(driver.id) as any;
            const statusStartedAt = queueDriver?.status_started_at || null;
            const regionNumber = queueDriver?.current_region_number || null;

            return [
              driver.id,
              driver.email,
              driver.name,
              driver.driverCode,
              driver.phoneNumber,
              driver.sideNumber,
              `${driver.vehicleBrand} ${driver.vehicleModel}`,
              driver.vehicleColor,
              driver.registrationNumber,
              regionNumber,
              statusStartedAt ? new Date(statusStartedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Brak',
              queueDriver?.status || driver.status,
              driver.createdAt
            ];
          });

          return {
            columns: ['id', 'email', 'name', 'code_number', 'phone', 'side_number', 'vehicle', 'color', 'registration', 'region_number', 'status_started_at', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: drivers.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'administrators') {
        const usersData = localStorage.getItem('taxi_users_data');
        if (usersData) {
          const parsed = JSON.parse(usersData);
          const administrators = parsed.administrators || [];
          
          const rows = administrators.map((admin: any) => [
            admin.id,
            admin.email,
            admin.name,
            admin.department || '--',
            admin.accessLevel,
            admin.permissions?.join(', ') || '',
            admin.status,
            admin.createdAt
          ]);
          
          return {
            columns: ['id', 'email', 'name', 'department', 'access_level', 'permissions', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: administrators.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'dispatchers') {
        const usersData = localStorage.getItem('taxi_users_data');
        if (usersData) {
          const parsed = JSON.parse(usersData);
          const dispatchers = parsed.dispatchers || [];
          
          const rows = dispatchers.map((dispatcher: any) => [
            dispatcher.id,
            dispatcher.email,
            dispatcher.name,
            dispatcher.employeeId,
            dispatcher.shift,
            dispatcher.assignedZones?.join(', ') || '',
            dispatcher.maxConcurrentOrders,
            dispatcher.status,
            dispatcher.createdAt
          ]);
          
          return {
            columns: ['id', 'email', 'name', 'employee_id', 'shift', 'assigned_zones', 'max_orders', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: dispatchers.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'support_agents') {
        const usersData = localStorage.getItem('taxi_users_data');
        if (usersData) {
          const parsed = JSON.parse(usersData);
          const supportAgents = parsed.supportAgents || [];
          
          const rows = supportAgents.map((agent: any) => [
            agent.id,
            agent.email,
            agent.name,
            agent.agentId,
            agent.department,
            agent.languages?.join(', ') || '',
            agent.ticketLimit,
            agent.specializations?.join(', ') || '',
            agent.status,
            agent.createdAt
          ]);
          
          return {
            columns: ['id', 'email', 'name', 'agent_id', 'department', 'languages', 'ticket_limit', 'specializations', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: supportAgents.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'accounting_users') {
        const usersData = localStorage.getItem('taxi_users_data');
        if (usersData) {
          const parsed = JSON.parse(usersData);
          const accountingUsers = parsed.accountingUsers || [];
          
          const rows = accountingUsers.map((user: any) => [
            user.id,
            user.email,
            user.name,
            user.employeeId,
            user.accessLevel,
            user.certifications?.join(', ') || '',
            user.department,
            user.status,
            user.createdAt
          ]);
          
          return {
            columns: ['id', 'email', 'name', 'employee_id', 'access_level', 'certifications', 'department', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: accountingUsers.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'database_connections') {
        const connectionsData = localStorage.getItem('taxi_database_connections');
        if (connectionsData) {
          const parsed = JSON.parse(connectionsData);
          const connections = parsed.connections || [];
          
          const rows = connections.map((conn: any) => [
            conn.id,
            conn.name,
            conn.type,
            conn.host || 'localhost',
            conn.isActive ? 'active' : 'inactive',
            conn.createdAt
          ]);
          
          return {
            columns: ['id', 'name', 'type', 'host', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: connections.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'corporations') {
        const connectionsData = localStorage.getItem('taxi_database_connections');
        if (connectionsData) {
          const parsed = JSON.parse(connectionsData);
          const corporations = parsed.corporations || [];
          
          const rows = corporations.map((corp: any) => [
            corp.id,
            corp.name,
            corp.databaseName,
            corp.connectionId,
            corp.isActive ? 'active' : 'inactive',
            corp.createdAt
          ]);
          
          return {
            columns: ['id', 'name', 'database_name', 'connection_id', 'status', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: corporations.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'map_tokens') {
        const mapTokensData = localStorage.getItem('taxi_map_tokens');
        if (mapTokensData) {
          const parsed = JSON.parse(mapTokensData);
          
          const rows = parsed.map((token: any) => [
            token.id,
            token.token.substring(0, 20) + '...',
            token.created_at
          ]);
          
          return {
            columns: ['id', 'token', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: parsed.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      if (tableName === 'custom_addresses') {
        const customAddressesData = localStorage.getItem('taxi_custom_addresses');
        if (customAddressesData) {
          const parsed = JSON.parse(customAddressesData);
          
          const rows = parsed.map((address: any) => [
            address.id,
            address.name,
            address.lat.toFixed(6),
            address.lng.toFixed(6),
            address.created_at
          ]);
          
          return {
            columns: ['id', 'name', 'latitude', 'longitude', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: parsed.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }
      
      // Mock orders table (since we don't have real orders yet)
      if (tableName === 'orders') {
        return {
          columns: ['id', 'customer_name', 'customer_phone', 'pickup_address', 'destination_address', 'status', 'driver_id', 'cost', 'created_at'],
          rows: [
            ['ORD001', 'Maria Kowalska', '+48 123 456 789', 'ul. Floriańska 15', 'Lotnisko Balice', 'completed', 'driver_1', '45.50', '2025-01-16 14:30:00'],
            ['ORD002', 'Tomasz Nowak', '+48 987 654 321', 'Dworzec Główny', 'Galeria Krakowska', 'completed', 'driver_2', '18.00', '2025-01-16 14:45:00'],
          ],
          totalRows: 2,
          currentPage: page,
          pageSize: pageSize,
        };
      }
      
      // Mock zones table
      if (tableName === 'zones') {
        const zonesData = localStorage.getItem('taxi_zones');
        if (zonesData) {
          const parsed = JSON.parse(zonesData);
          
          const rows = parsed.map((zone: any) => [
            zone.id,
            zone.name,
            zone.number,
            `${zone.coordinates.length} punktów`,
            zone.driversCount,
            zone.createdAt
          ]);
          
          return {
            columns: ['id', 'name', 'number', 'coordinates', 'drivers_count', 'created_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: parsed.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
        
        // Fallback to mock data if no zones in localStorage
        return {
          columns: ['id', 'name', 'number', 'coordinates', 'drivers_count', 'created_at'],
          rows: [
            ['zone_1', 'Stare Miasto', 1, '4 punkty', 3, '2025-01-16T10:00:00Z'],
            ['zone_2', 'Kazimierz', 2, '5 punktów', 2, '2025-01-16T10:15:00Z'],
            ['zone_3', 'Podgórze', 3, '4 punkty', 1, '2025-01-16T10:30:00Z'],
          ],
          totalRows: 3,
          currentPage: page,
          pageSize: pageSize,
        };
      }
      
      // Mock pricing rules table
      if (tableName === 'pricing_rules') {
        return {
          columns: ['id', 'category', 'base_fare', 'per_km_rate', 'waiting_rate'],
          rows: [
            [1, 'standard', '8.00', '2.50', '0.50'],
            [2, 'comfort', '10.00', '3.00', '0.60'],
            [3, 'premium', '15.00', '4.00', '0.80'],
            [4, 'van', '12.00', '3.50', '0.70'],
          ],
          totalRows: 4,
          currentPage: page,
          pageSize: pageSize,
        };
      }

      if (tableName === 'regions') {
        const regionsData = localStorage.getItem('taxi_regions_data');
        if (regionsData) {
          const parsed = JSON.parse(regionsData);
          const regions = parsed.regions || [];

          const rows = regions.map((region: any) => [
            region.id,
            region.name,
            region.number,
            region.description || '',
            region.created_at,
            region.updated_at
          ]);

          return {
            columns: ['id', 'name', 'number', 'description', 'created_at', 'updated_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: regions.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }

      if (tableName === 'taxi_codes') {
        const regionsData = localStorage.getItem('taxi_regions_data');
        if (regionsData) {
          const parsed = JSON.parse(regionsData);
          const taxiCodes = parsed.taxiCodes || [];

          const rows = taxiCodes.map((code: any) => [
            code.id,
            code.code,
            code.region_id,
            code.driver_id || '',
            code.status,
            code.created_at,
            code.updated_at
          ]);

          return {
            columns: ['id', 'code', 'region_id', 'driver_id', 'status', 'created_at', 'updated_at'],
            rows: rows.slice((page - 1) * pageSize, page * pageSize),
            totalRows: taxiCodes.length,
            currentPage: page,
            pageSize: pageSize,
          };
        }
      }

    } catch (error) {
      console.error('Error reading localStorage for table data:', error);
    }

    // Fallback - empty table
    return {
      columns: ['id', 'created_at'],
      rows: [],
      totalRows: 0,
      currentPage: page,
      pageSize: pageSize,
    };
  }

  async exportMySQLSchema(options?: Partial<MySQLExportOptions>): Promise<string> {
    const generator = new MySQLSchemaGenerator(options);
    return generator.generateFullSchema();
  }

  async downloadMySQLSchema(options?: Partial<MySQLExportOptions>): Promise<void> {
    try {
      const sql = await this.exportMySQLSchema(options);
      const databaseName = options?.databaseName || 'taxi_dispatch';
      const filename = `${databaseName}_mysql_schema_${new Date().toISOString().slice(0, 10)}.sql`;

      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading MySQL schema:', error);
      throw error;
    }
  }

  async validateDatabaseSchema(connectionId?: string): Promise<{
    isValid: boolean;
    existingTables: string[];
    missingTables: string[];
    allRequiredTables: string[];
  }> {
    const requiredTables = [
      'administrators',
      'drivers',
      'dispatchers',
      'support_agents',
      'accounting_users',
      'zones',
      'regions',
      'taxi_codes',
      'orders',
      'pricing_rules',
      'database_connections',
      'corporations',
      'map_tokens',
      'custom_addresses',
      'driver_queue',
      'queue_sessions',
      'zone_transitions',
      'driver_history',
      'chat_messages',
      'assignment_rules'
    ];

    console.log('[DatabaseService] Validating schema...');
    console.log('[DatabaseService] DataSource debug info:', dataSourceService.getDebugInfo());

    try {
      const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;

      if (!connection) {
        console.warn('[DatabaseService] No active connection for validation');
        return {
          isValid: false,
          existingTables: [],
          missingTables: requiredTables,
          allRequiredTables: requiredTables
        };
      }

      console.log('[DatabaseService] Validating connection:', connection.type, connection.database);

      if (!dataSourceService.isUsingExternalDatabase()) {
        console.log('[DatabaseService] Using local storage mode');
        return {
          isValid: true,
          existingTables: requiredTables,
          missingTables: [],
          allRequiredTables: requiredTables
        };
      }

      console.log('[DatabaseService] Getting tables from external database...');
      const result = await dataSourceService.getTables();

      if (!result.success || !result.data) {
        return {
          isValid: false,
          existingTables: [],
          missingTables: requiredTables,
          allRequiredTables: requiredTables
        };
      }

      const existingTables = result.data;
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));

      return {
        isValid: missingTables.length === 0,
        existingTables,
        missingTables,
        allRequiredTables: requiredTables
      };
    } catch (error) {
      console.error('Error validating database schema:', error);
      return {
        isValid: false,
        existingTables: [],
        missingTables: requiredTables,
        allRequiredTables: requiredTables
      };
    }
  }

  async installDatabaseSchema(connectionId?: string, options?: Partial<MySQLExportOptions>): Promise<{
    success: boolean;
    error?: string;
    details?: string;
  }> {
    try {
      const connection = connectionId ? this.connections.get(connectionId) : this.activeConnection;

      if (!connection) {
        return {
          success: false,
          error: 'Brak aktywnego połączenia',
          details: 'Wybierz lub aktywuj połączenie z bazą danych'
        };
      }

      if (!dataSourceService.isUsingExternalDatabase()) {
        return {
          success: false,
          error: 'Brak zewnetrznej bazy danych',
          details: 'Ustaw zmienne VITE_MYSQL_* w pliku .env i uruchom ponownie aplikacje'
        };
      }

      const config = dataSourceService.getExternalConfig();
      console.log('[DatabaseService] Installing schema to database:', config?.database);

      const generator = new MySQLSchemaGenerator({
        ...options,
        includeDropStatements: true,
        includeForeignKeys: true,
        includeIndexes: true,
        includeTriggers: true,
        databaseName: config?.database || 'taxi_dispatch'
      });

      const sql = generator.generateFullSchema();

      const lines = sql.split('\n');
      const statements: string[] = [];
      let currentStatement = '';
      let inMultiLineComment = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('/*')) {
          inMultiLineComment = true;
        }
        if (inMultiLineComment) {
          if (trimmedLine.endsWith('*/')) {
            inMultiLineComment = false;
          }
          continue;
        }

        if (trimmedLine.startsWith('--') || trimmedLine.length === 0) {
          continue;
        }

        currentStatement += ' ' + line;

        if (trimmedLine.endsWith(';')) {
          const stmt = currentStatement.trim();
          if (stmt.length > 0 &&
              !stmt.toUpperCase().startsWith('SET ') &&
              !stmt.toUpperCase().startsWith('USE ') &&
              !stmt.toUpperCase().includes('CREATE DATABASE')) {
            statements.push(stmt);
          }
          currentStatement = '';
        }
      }

      if (currentStatement.trim().length > 0) {
        statements.push(currentStatement.trim());
      }

      console.log(`[DatabaseService] Parsed ${statements.length} SQL statements to execute`);

      let executedCount = 0;
      let failedCount = 0;
      let lastError = '';

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        console.log(`[DatabaseService] Executing statement ${i + 1}/${statements.length}...`);

        try {
          const result = await dataSourceService.query(statement);
          if (result.success) {
            executedCount++;
            console.log(`[DatabaseService] Statement ${i + 1} executed successfully`);
          } else {
            failedCount++;
            lastError = result.error || 'Unknown error';
            console.error(`[DatabaseService] Statement ${i + 1} failed:`, result.error);
            console.error('[DatabaseService] Failed statement:', statement.substring(0, 200));
          }
        } catch (error) {
          failedCount++;
          lastError = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[DatabaseService] Statement ${i + 1} exception:`, error);
          console.error('[DatabaseService] Failed statement:', statement.substring(0, 200));
        }
      }

      if (failedCount > 0) {
        return {
          success: false,
          error: 'Instalacja schematu zakończona z błędami',
          details: `Wykonano: ${executedCount}, Błędy: ${failedCount}. Ostatni błąd: ${lastError}`
        };
      }

      return {
        success: true,
        details: `Pomyślnie zainstalowano schemat bazy danych. Wykonano ${executedCount} instrukcji SQL.`
      };

    } catch (error) {
      console.error('Error installing database schema:', error);
      return {
        success: false,
        error: 'Błąd podczas instalacji schematu',
        details: error instanceof Error ? error.message : 'Nieznany błąd'
      };
    }
  }

  async updateDriversTableSchema(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      console.log('[DatabaseService] Updating drivers table schema...');

      // Check if suspended_until column exists
      const checkColumnQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'drivers'
        AND COLUMN_NAME = 'suspended_until'
      `;

      const checkResult = await dataSourceService.query<{ count: number }>(checkColumnQuery);

      if (!checkResult.success) {
        return {
          success: false,
          error: 'Nie można sprawdzić struktury tabeli',
          details: checkResult.error
        };
      }

      const columnExists = checkResult.data && checkResult.data.length > 0 && checkResult.data[0].count > 0;

      if (columnExists) {
        console.log('[DatabaseService] Column suspended_until already exists');
        return {
          success: true,
          details: 'Kolumna suspended_until już istnieje w tabeli drivers'
        };
      }

      console.log('[DatabaseService] Adding suspended_until column...');

      // Add suspended_until column
      const alterTableQuery = `
        ALTER TABLE drivers
        ADD COLUMN suspended_until DATETIME NULL DEFAULT NULL
        COMMENT 'Date until which the account is suspended'
      `;

      const alterResult = await dataSourceService.query(alterTableQuery);

      if (!alterResult.success) {
        return {
          success: false,
          error: 'Nie można dodać kolumny suspended_until',
          details: alterResult.error
        };
      }

      // Update status ENUM to include 'suspended'
      console.log('[DatabaseService] Updating status ENUM...');

      const updateStatusQuery = `
        ALTER TABLE drivers
        MODIFY COLUMN status ENUM('free', 'driving', 'pickup', 'home', 'active', 'inactive', 'suspended')
        NOT NULL DEFAULT 'inactive'
      `;

      const statusResult = await dataSourceService.query(updateStatusQuery);

      if (!statusResult.success) {
        console.warn('[DatabaseService] Warning: Could not update status ENUM:', statusResult.error);
        return {
          success: true,
          details: 'Dodano kolumnę suspended_until, ale nie udało się zaktualizować ENUM status (może już być zaktualizowany)'
        };
      }

      // Update previous_status ENUM to include 'suspended'
      const updatePreviousStatusQuery = `
        ALTER TABLE drivers
        MODIFY COLUMN previous_status ENUM('free', 'driving', 'pickup', 'home', 'active', 'inactive', 'suspended')
        DEFAULT NULL
      `;

      await dataSourceService.query(updatePreviousStatusQuery);

      console.log('[DatabaseService] Schema update completed successfully');

      return {
        success: true,
        details: 'Pomyślnie zaktualizowano strukturę tabeli drivers (dodano suspended_until i zaktualizowano status ENUM)'
      };

    } catch (error) {
      console.error('[DatabaseService] Error updating drivers table schema:', error);
      return {
        success: false,
        error: 'Błąd podczas aktualizacji struktury tabeli',
        details: error instanceof Error ? error.message : 'Nieznany błąd'
      };
    }
  }

  async updateDriversLocationColumnsSchema(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      console.log('[DatabaseService] Adding latitude and longitude columns to drivers table...');

      // Check if latitude column exists
      const checkLatitudeQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'drivers'
        AND COLUMN_NAME = 'latitude'
        AND TABLE_SCHEMA = DATABASE()
      `;

      const latitudeCheck = await dataSourceService.query<{ count: number }>(checkLatitudeQuery);

      if (!latitudeCheck.success) {
        return {
          success: false,
          error: 'Nie można sprawdzić struktury tabeli drivers',
          details: latitudeCheck.error
        };
      }

      const latitudeExists = latitudeCheck.data && latitudeCheck.data.length > 0 && latitudeCheck.data[0].count > 0;

      // Check if longitude column exists
      const checkLongitudeQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'drivers'
        AND COLUMN_NAME = 'longitude'
        AND TABLE_SCHEMA = DATABASE()
      `;

      const longitudeCheck = await dataSourceService.query<{ count: number }>(checkLongitudeQuery);

      if (!longitudeCheck.success) {
        return {
          success: false,
          error: 'Nie można sprawdzić struktury tabeli drivers',
          details: longitudeCheck.error
        };
      }

      const longitudeExists = longitudeCheck.data && longitudeCheck.data.length > 0 && longitudeCheck.data[0].count > 0;

      if (latitudeExists && longitudeExists) {
        console.log('[DatabaseService] Columns latitude and longitude already exist');
        return {
          success: true,
          details: 'Kolumny latitude i longitude już istnieją w tabeli drivers'
        };
      }

      let addedColumns: string[] = [];

      // Add latitude column if not exists
      if (!latitudeExists) {
        console.log('[DatabaseService] Adding latitude column...');
        const addLatitudeQuery = `
          ALTER TABLE drivers
          ADD COLUMN latitude DOUBLE PRECISION NULL DEFAULT NULL
          COMMENT 'Driver latitude coordinate'
        `;

        const latResult = await dataSourceService.query(addLatitudeQuery);

        if (!latResult.success) {
          return {
            success: false,
            error: 'Nie można dodać kolumny latitude',
            details: latResult.error
          };
        }
        addedColumns.push('latitude');
      }

      // Add longitude column if not exists
      if (!longitudeExists) {
        console.log('[DatabaseService] Adding longitude column...');
        const addLongitudeQuery = `
          ALTER TABLE drivers
          ADD COLUMN longitude DOUBLE PRECISION NULL DEFAULT NULL
          COMMENT 'Driver longitude coordinate'
        `;

        const lngResult = await dataSourceService.query(addLongitudeQuery);

        if (!lngResult.success) {
          return {
            success: false,
            error: 'Nie można dodać kolumny longitude',
            details: lngResult.error
          };
        }
        addedColumns.push('longitude');
      }

      // Create index for geospatial queries
      console.log('[DatabaseService] Creating index for location columns...');
      const createIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_drivers_location
        ON drivers(latitude, longitude)
      `;

      await dataSourceService.query(createIndexQuery);

      // Update existing records with coordinates from current_location JSON
      console.log('[DatabaseService] Updating existing records with coordinates from current_location...');
      const updateQuery = `
        UPDATE drivers
        SET
          latitude = JSON_UNQUOTE(JSON_EXTRACT(current_location, '$.lat')),
          longitude = JSON_UNQUOTE(JSON_EXTRACT(current_location, '$.lng'))
        WHERE current_location IS NOT NULL
          AND JSON_EXTRACT(current_location, '$.lat') IS NOT NULL
          AND JSON_EXTRACT(current_location, '$.lng') IS NOT NULL
          AND (latitude IS NULL OR longitude IS NULL)
      `;

      await dataSourceService.query(updateQuery);

      console.log('[DatabaseService] Location columns schema update completed successfully');

      return {
        success: true,
        details: `Pomyślnie dodano kolumny ${addedColumns.join(', ')} do tabeli drivers oraz utworzono indeks lokalizacyjny`
      };

    } catch (error) {
      console.error('[DatabaseService] Error updating drivers location columns schema:', error);
      return {
        success: false,
        error: 'Błąd podczas dodawania kolumn lokalizacji',
        details: error instanceof Error ? error.message : 'Nieznany błąd'
      };
    }
  }

  async updateChatMessagesTableSchema(): Promise<{ success: boolean; error?: string; details?: string }> {
    try {
      console.log('[DatabaseService] Updating chat_messages table schema...');

      const checkTableQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.TABLES
        WHERE TABLE_NAME = 'chat_messages'
        AND TABLE_SCHEMA = DATABASE()
      `;

      const tableCheck = await dataSourceService.query<{ count: number }>(checkTableQuery);

      if (!tableCheck.success || !tableCheck.data || tableCheck.data.length === 0 || tableCheck.data[0].count === 0) {
        return {
          success: false,
          error: 'Tabela chat_messages nie istnieje',
          details: 'Najpierw zainstaluj pełny schemat bazy danych używając przycisku "Zainstaluj schemat automatycznie"'
        };
      }

      const requiredColumns = [
        { name: 'sender_name', type: 'VARCHAR(255)', nullable: false, default: "''", comment: 'Name of message sender' },
        { name: 'recipient_name', type: 'VARCHAR(255)', nullable: false, default: "''", comment: 'Name of message recipient' },
        { name: 'content', type: 'TEXT', nullable: false, comment: 'Message content' },
        { name: 'timestamp', type: 'DATETIME', nullable: true, default: null, comment: 'When message was sent' },
        { name: 'is_broadcast', type: 'BOOLEAN', nullable: false, default: 'FALSE', comment: 'Whether this is a broadcast message' }
      ];

      let addedColumns: string[] = [];
      let renamedColumns: string[] = [];

      for (const column of requiredColumns) {
        const checkColumnQuery = `
          SELECT COUNT(*) as count
          FROM information_schema.COLUMNS
          WHERE TABLE_NAME = 'chat_messages'
          AND COLUMN_NAME = '${column.name}'
          AND TABLE_SCHEMA = DATABASE()
        `;

        const checkResult = await dataSourceService.query<{ count: number }>(checkColumnQuery);

        if (!checkResult.success) {
          return {
            success: false,
            error: `Nie można sprawdzić kolumny ${column.name}`,
            details: checkResult.error
          };
        }

        const columnExists = checkResult.data && checkResult.data.length > 0 && checkResult.data[0].count > 0;

        if (!columnExists) {
          console.log(`[DatabaseService] Adding column ${column.name}...`);

          const nullableClause = column.nullable ? 'NULL' : 'NOT NULL';
          const defaultClause = column.default !== null && column.default !== undefined ? `DEFAULT ${column.default}` : '';
          const commentClause = column.comment ? `COMMENT '${column.comment}'` : '';

          const alterQuery = `
            ALTER TABLE chat_messages
            ADD COLUMN ${column.name} ${column.type} ${nullableClause} ${defaultClause} ${commentClause}
          `;

          const alterResult = await dataSourceService.query(alterQuery);

          if (!alterResult.success) {
            console.warn(`[DatabaseService] Could not add column ${column.name}:`, alterResult.error);
            return {
              success: false,
              error: `Nie można dodać kolumny ${column.name}`,
              details: alterResult.error
            };
          } else {
            addedColumns.push(column.name);
          }
        }
      }

      const checkContentColumn = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'chat_messages'
        AND COLUMN_NAME = 'content'
        AND TABLE_SCHEMA = DATABASE()
      `;

      const contentCheck = await dataSourceService.query<{ count: number }>(checkContentColumn);
      const contentColumnExists = contentCheck.data && contentCheck.data.length > 0 && contentCheck.data[0].count > 0;

      if (!contentColumnExists) {
        const checkMessageColumn = `
          SELECT COUNT(*) as count
          FROM information_schema.COLUMNS
          WHERE TABLE_NAME = 'chat_messages'
          AND COLUMN_NAME = 'message'
          AND TABLE_SCHEMA = DATABASE()
        `;

        const messageCheck = await dataSourceService.query<{ count: number }>(checkMessageColumn);
        const messageColumnExists = messageCheck.data && messageCheck.data.length > 0 && messageCheck.data[0].count > 0;

        if (messageColumnExists) {
          console.log('[DatabaseService] Renaming column message to content...');

          const renameQuery = `
            ALTER TABLE chat_messages
            CHANGE COLUMN message content TEXT NOT NULL
          `;

          const renameResult = await dataSourceService.query(renameQuery);

          if (renameResult.success) {
            renamedColumns.push('message -> content');
          } else {
            console.warn('[DatabaseService] Could not rename message column:', renameResult.error);
            return {
              success: false,
              error: 'Nie można zmienić nazwy kolumny message',
              details: renameResult.error
            };
          }
        }
      }

      if (addedColumns.includes('timestamp')) {
        console.log('[DatabaseService] Updating NULL timestamp values with created_at or NOW()...');

        const updateTimestampQuery = `
          UPDATE chat_messages
          SET timestamp = COALESCE(created_at, NOW())
          WHERE timestamp IS NULL
        `;

        await dataSourceService.query(updateTimestampQuery);
      }

      if (addedColumns.length === 0 && renamedColumns.length === 0) {
        return {
          success: true,
          details: 'Struktura tabeli chat_messages jest już aktualna - wszystkie wymagane kolumny istnieją'
        };
      }

      const details = [];
      if (addedColumns.length > 0) {
        details.push(`Dodano kolumny: ${addedColumns.join(', ')}`);
      }
      if (renamedColumns.length > 0) {
        details.push(`Zmieniono nazwy: ${renamedColumns.join(', ')}`);
      }

      return {
        success: true,
        details: `Pomyślnie zaktualizowano tabelę chat_messages. ${details.join('. ')}`
      };

    } catch (error) {
      console.error('[DatabaseService] Error updating chat_messages table schema:', error);
      return {
        success: false,
        error: 'Błąd podczas aktualizacji struktury tabeli chat_messages',
        details: error instanceof Error ? error.message : 'Nieznany błąd'
      };
    }
  }
}

export const databaseService = new DatabaseService();