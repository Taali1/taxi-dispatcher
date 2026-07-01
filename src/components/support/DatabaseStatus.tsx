import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, AlertCircle, Loader, RefreshCw, Server, Table2, Users, HardDrive } from 'lucide-react';

interface DatabaseInfo {
  host: string;
  port: number;
  database: string;
  user: string;
}

interface ConnectionStatus {
  connected: boolean;
  message: string;
  version?: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
}

const DatabaseStatus: React.FC = () => {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [requiredTables] = useState([
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
    'map_tokens',
    'custom_addresses',
    'driver_queue',
    'driver_history'
  ]);

  useEffect(() => {
    loadDatabaseStatus();
  }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await fetch('/api/migrate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const parts: string[] = [];
        if (data.tablesCreated?.length) parts.push(`Tabele: ${data.tablesCreated.join(', ')}`);
        if (data.columnsAdded?.length)  parts.push(`Kolumny: ${data.columnsAdded.join(', ')}`);
        setMigrateResult(parts.length
          ? `✅ Dodano: ${parts.join(' | ')}`
          : '✅ Baza aktualna — nic do zrobienia');
        loadDatabaseStatus();
      } else {
        setMigrateResult(`❌ Błąd: ${data.error}`);
      }
    } catch (e: any) {
      setMigrateResult(`❌ Błąd połączenia: ${e.message}`);
    } finally {
      setMigrating(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const response = await fetch('/api/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        await loadDatabaseStatus();
      } else {
        setStatus({
          connected: false,
          message: 'Reconnect nie powiódł się. Sprawdź czy serwer jest uruchomiony.'
        });
      }
    } catch {
      setStatus({
        connected: false,
        message: 'Nie można połączyć się z API na .'
      });
    } finally {
      setReconnecting(false);
    }
  };

  const loadDatabaseStatus = async () => {
    setLoading(true);
    try {
      // Pobierz informacje z .env
      const host = import.meta.env.VITE_MYSQL_HOST || 'localhost';
      const port = parseInt(import.meta.env.VITE_MYSQL_PORT || '3306');
      const database = import.meta.env.VITE_MYSQL_DATABASE || 'taxi_dispatch';
      const user = import.meta.env.VITE_MYSQL_USER || 'root';

      setDbInfo({ host, port, database, user });

      // Test połączenia
      try {
        const response = await fetch('/health', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          setStatus({
            connected: true,
            message: 'Połączenie z MySQL aktywne',
            version: 'MySQL/MariaDB'
          });

          // Pobierz listę tabel
          try {
            const tablesResponse = await fetch('/api/tables', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (tablesResponse.ok) {
              const result = await tablesResponse.json();
              if (result.success && result.data) {
                setTables(
                  result.data.map(table => ({
                    name: table,
                    rowCount: 0
                  }))
                );
              }
            }
          } catch (tableError) {
            console.error('Error fetching tables:', tableError);
          }
        } else {
          setStatus({
            connected: false,
            message: `Backend zwrócił błąd: ${response.status}. Upewnij się, że backend jest uruchomiony (npm run dev)`
          });
        }
      } catch (fetchError) {
        setStatus({
          connected: false,
          message: 'Nie można się połączyć z API na . Upewnij się, że uruchomiłeś: npm run dev'
        });
      }
    } catch (error) {
      setStatus({
        connected: false,
        message: 'Błąd: ' + (error instanceof Error ? error.message : 'Nieznany błąd')
      });
    } finally {
      setLoading(false);
    }
  };

  const missingTables = requiredTables.filter(
    req => !tables.some(t => t.name === req)
  );

  const completeness = Math.round(
    ((requiredTables.length - missingTables.length) / requiredTables.length) * 100
  );

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className={`rounded-xl p-6 border ${
        status?.connected
          ? 'bg-green-900/20 border-green-700'
          : 'bg-red-900/20 border-red-700'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            {status?.connected ? (
              <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold text-white">
                {status?.connected ? 'Baza Danych Połączona' : 'Błąd Połączenia'}
              </h3>
              <p className={`mt-1 ${status?.connected ? 'text-green-300' : 'text-red-300'}`}>
                {status?.message}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2 justify-end">
              {!status?.connected && (
                <button
                  onClick={handleReconnect}
                  disabled={reconnecting || loading}
                  className="flex items-center space-x-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {reconnecting ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>{reconnecting ? 'Łączenie...' : 'Reconnect'}</span>
                </button>
              )}
              <button
                onClick={handleMigrate}
                disabled={migrating || loading || reconnecting}
                className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {migrating ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                <span>{migrating ? 'Aktualizuję...' : 'Aktualizuj bazę'}</span>
              </button>
              <button
                onClick={loadDatabaseStatus}
                disabled={loading || reconnecting}
                className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                {loading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>Odśwież</span>
              </button>
            </div>
            {migrateResult && (
              <div className={`text-sm px-3 py-2 rounded w-full text-right ${
                migrateResult.startsWith('✅')
                  ? 'bg-green-900/40 text-green-300'
                  : 'bg-red-900/40 text-red-300'
              }`}>
                {migrateResult}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Database Information */}
      {dbInfo && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Server className="w-5 h-5 text-gray-400" />
              <h4 className="font-semibold text-gray-200">Host</h4>
            </div>
            <p className="text-gray-300 font-mono text-sm">{dbInfo.host}:{dbInfo.port}</p>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Database className="w-5 h-5 text-gray-400" />
              <h4 className="font-semibold text-gray-200">Baza Danych</h4>
            </div>
            <p className="text-gray-300 font-mono text-sm">{dbInfo.database}</p>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Users className="w-5 h-5 text-gray-400" />
              <h4 className="font-semibold text-gray-200">Użytkownik</h4>
            </div>
            <p className="text-gray-300 font-mono text-sm">{dbInfo.user}</p>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <HardDrive className="w-5 h-5 text-gray-400" />
              <h4 className="font-semibold text-gray-200">Port</h4>
            </div>
            <p className="text-gray-300 font-mono text-sm">{dbInfo.port}</p>
          </div>
        </div>
      )}

      {/* Schema Completeness */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
          <Table2 className="w-5 h-5" />
          <span>Status Schemy Bazy Danych</span>
        </h3>

        {/* Completeness Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Kompletność schematu</span>
            <span className={`text-lg font-bold ${
              completeness === 100 ? 'text-green-600' : 'text-yellow-600'
            }`}>
              {completeness}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                completeness === 100 ? 'bg-green-600' : 'bg-yellow-600'
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>

        {/* Tables Status */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-200 mb-4">
            Tabele ({tables.length}/{requiredTables.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {requiredTables.map(table => {
              const exists = tables.some(t => t.name === table);
              return (
                <div
                  key={table}
                  className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${
                    exists
                      ? 'bg-green-900/30 text-green-300 border border-green-700'
                      : 'bg-red-900/30 text-red-300 border border-red-700'
                  }`}
                >
                  {exists ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="truncate">{table}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Missing Tables Warning */}
        {missingTables.length > 0 && (
          <div className="mt-6 bg-red-900/30 border border-red-700 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-red-300 mb-2">Brakujące tabele ({missingTables.length}):</h5>
            <div className="flex flex-wrap gap-2">
              {missingTables.map(table => (
                <span
                  key={table}
                  className="bg-red-900/50 text-red-200 px-2 py-1 rounded text-xs border border-red-700"
                >
                  {table}
                </span>
              ))}
            </div>
            <p className="text-sm text-red-300 mt-3">
              ⚠️ System nie będzie działać prawidłowo bez wszystkich wymaganych tabel.
              Upewnij się, że wgrałeś schemat bazy danych do phpMyAdmin.
            </p>
          </div>
        )}

        {/* Success Message */}
        {missingTables.length === 0 && tables.length > 0 && (
          <div className="mt-6 bg-green-900/30 border border-green-700 rounded-lg p-4">
            <p className="text-sm text-green-300">
              ✅ Wszystkie wymagane tabele są obecne! System jest w pełni funkcjonalny.
            </p>
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Informacje Konfiguracyjne</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
            <span className="text-gray-300">Typ bazy danych</span>
            <span className="text-gray-200 font-mono">MySQL / MariaDB</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
            <span className="text-gray-300">Backend API</span>
            <span className="text-gray-200 font-mono"></span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
            <span className="text-gray-300">Konfiguracja źródła</span>
            <span className="text-gray-200 font-mono">.env (VITE_MYSQL_*)</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
            <span className="text-gray-300">Połączenie</span>
            <span className={`font-mono ${status?.connected ? 'text-green-400' : 'text-red-400'}`}>
              {status?.connected ? 'Aktywne' : 'Nieaktywne'}
            </span>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-300 mb-4">Potrzeba Pomocy?</h3>
        <div className="space-y-3 text-sm text-blue-300">
          <p>
            <strong>Backend nie działa?</strong><br/>
            Upewnij się, że uruchomiłeś aplikację za pomocą: <code className="bg-gray-700 px-2 py-1 rounded">npm run dev</code>
          </p>
          <p>
            <strong>Brakujące tabele?</strong><br/>
            Wgraj schemat bazy danych do phpMyAdmin, korzystając z pliku <code className="bg-gray-700 px-2 py-1 rounded">db_schema_fixed.sql</code>
          </p>
          <p>
            <strong>Zmiana danych dostępu?</strong><br/>
            Zaktualizuj zmienne <code className="bg-gray-700 px-2 py-1 rounded">VITE_MYSQL_*</code> w pliku <code className="bg-gray-700 px-2 py-1 rounded">.env</code> i uruchom ponownie.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DatabaseStatus;
