import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const originalConsole = useRef({
    log: console.log,
    warn: console.warn,
    error: console.error
  });

  useEffect(() => {
    const addLog = (level: 'info' | 'warn' | 'error' | 'success', args: any[]) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      setLogs(prev => [...prev.slice(-99), { timestamp, level, message }]);
    };

    console.log = (...args: any[]) => {
      originalConsole.current.log(...args);
      const message = args[0];
      let level: 'info' | 'success' = 'info';

      if (typeof message === 'string') {
        if (message.includes('✅') || message.includes('SUKCES')) {
          level = 'success';
        }
      }

      addLog(level, args);
    };

    console.warn = (...args: any[]) => {
      originalConsole.current.warn(...args);
      addLog('warn', args);
    };

    console.error = (...args: any[]) => {
      originalConsole.current.error(...args);
      addLog('error', args);
    };

    return () => {
      console.log = originalConsole.current.log;
      console.warn = originalConsole.current.warn;
      console.error = originalConsole.current.error;
    };
  }, []);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-gray-300';
    }
  };

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-900/20';
      case 'warn':
        return 'bg-yellow-900/20';
      case 'success':
        return 'bg-green-900/20';
      default:
        return 'bg-gray-900/20';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 rounded-lg">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">Konsola Debugowania</h2>
          <span className="text-sm text-gray-400">({logs.length} wpisów)</span>
        </div>
        <button
          onClick={clearLogs}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Wyczyść
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            Brak logów. Wykonaj jakąś akcję w panelu kierowcy.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`p-2 rounded ${getLevelBg(log.level)} border border-gray-800`}
            >
              <div className="flex items-start gap-2">
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {log.timestamp}
                </span>
                <span className={`text-xs font-semibold uppercase whitespace-nowrap ${getLevelColor(log.level)}`}>
                  [{log.level}]
                </span>
                <span className={`flex-1 whitespace-pre-wrap break-all ${getLevelColor(log.level)}`}>
                  {log.message}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={consoleEndRef} />
      </div>

      <div className="p-3 border-t border-gray-700 bg-gray-800/50">
        <div className="text-xs text-gray-400 space-y-1">
          <p>💡 Ta konsola przechwytuje wszystkie logi z console.log(), console.warn() i console.error()</p>
          <p>🔍 Kliknij przycisk statusu (Wolna, Kursem, etc.) żeby zobaczyć logi zapisu do bazy danych</p>
        </div>
      </div>
    </div>
  );
}
