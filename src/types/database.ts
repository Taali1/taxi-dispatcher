export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'local' | 'mariadb' | 'mysql' | 'postgresql';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  lastConnected?: string;
}

export interface DatabaseTable {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
  size: string;
  engine?: string;
  collation?: string;
  comment?: string;
}

export interface Corporation {
  id: string;
  name: string;
  databaseName: string;
  connectionId: string;
  createdAt: string;
  isActive: boolean;
  description?: string;
}

export interface DatabaseError {
  code: string;
  message: string;
  details?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: DatabaseError;
  tables?: DatabaseTable[];
  serverInfo?: {
    version: string;
    type: string;
  };
}

export interface SqlExportOptions {
  includeData: boolean;
  includeStructure: boolean;
  includeTriggers: boolean;
  includeViews: boolean;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  autoIncrement: boolean;
  maxLength?: number;
}

export interface TableIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface ForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface TableStructure {
  tableName: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  foreignKeys: ForeignKey[];
  engine?: string;
  collation?: string;
  comment?: string;
}

export interface TableData {
  columns: string[];
  rows: any[][];
  totalRows: number;
  currentPage: number;
  pageSize: number;
}