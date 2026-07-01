import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, XCircle, Server, HardDrive } from 'lucide-react';
import { databaseService } from '../../services/databaseService';
import { DatabaseConnection } from '../../types/database';

interface ConnectionIndicatorProps {
  compact?: boolean;
}

const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ compact = false }) => {
  const [activeConnection, setActiveConnection] = useState<DatabaseConnection | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadConnectionStatus();
    const interval = setInterval(loadConnectionStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConnectionStatus = async () => {
    const connection = await databaseService.getActiveConnection();
    setActiveConnection(connection);
    setIsOnline(true);
  };

  if (!activeConnection) {
    return null;
  }

  if (compact) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-700 transition-colors">
          {activeConnection.type === 'local' ? (
            <HardDrive className="w-4 h-4 text-blue-400" />
          ) : (
            <Server className="w-4 h-4 text-green-400" />
          )}
          <span className="text-sm text-white font-medium">{activeConnection.name}</span>
          {isOnline ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>

        {showDetails && (
          <div className="absolute top-full mt-2 right-0 z-50 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-xl min-w-[300px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <span className="text-xs text-slate-400">Status:</span>
                <div className="flex items-center space-x-2">
                  {isOnline ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400">Połączono</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-red-400">Rozłączono</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-400">Typ:</span>
                <span className="text-xs text-white font-medium capitalize">{activeConnection.type}</span>
              </div>

              {activeConnection.type !== 'local' && (
                <>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-400">Host:</span>
                    <span className="text-xs text-white font-medium">{activeConnection.host}:{activeConnection.port}</span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-400">Baza:</span>
                    <span className="text-xs text-white font-medium">{activeConnection.database}</span>
                  </div>
                </>
              )}

              {activeConnection.lastConnected && (
                <div className="pt-2 border-t border-slate-700">
                  <span className="text-xs text-slate-400">Ostatnie połączenie:</span>
                  <p className="text-xs text-white mt-1">
                    {new Date(activeConnection.lastConnected).toLocaleString('pl-PL')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Połączenie z Bazą</h3>
        </div>
        <div className="flex items-center space-x-2">
          {isOnline ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-400">Aktywne</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-sm text-red-400">Nieaktywne</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-3 bg-slate-900 rounded-lg p-3">
        {activeConnection.type === 'local' ? (
          <HardDrive className="w-6 h-6 text-blue-400" />
        ) : (
          <Server className="w-6 h-6 text-green-400" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{activeConnection.name}</p>
          <p className="text-xs text-slate-400 capitalize">{activeConnection.type}</p>
        </div>
      </div>
    </div>
  );
};

export default ConnectionIndicator;
