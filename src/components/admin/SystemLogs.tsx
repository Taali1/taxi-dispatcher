import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollText, RefreshCw, Search, Filter, X, ChevronLeft, ChevronRight,
  LogIn, LogOut, Settings, ShieldCheck, User, Layers, AlertCircle, Info,
} from 'lucide-react';

interface SystemLog {
  id: number;
  type: string;
  category: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  dispatcher: 'Dyspozytor',
  driver: 'Kierowca',
  support: 'Support',
  accounting: 'Księgowość',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-900/40 text-red-300 border border-red-700/40',
  dispatcher: 'bg-blue-900/40 text-blue-300 border border-blue-700/40',
  driver: 'bg-green-900/40 text-green-300 border border-green-700/40',
  support: 'bg-purple-900/40 text-purple-300 border border-purple-700/40',
  accounting: 'bg-amber-900/40 text-amber-300 border border-amber-700/40',
};

const TYPE_LABELS: Record<string, string> = {
  login: 'Logowanie',
  logout: 'Wylogowanie',
  settings_update: 'Zmiana ustawień',
  zone_rules_update: 'Zmiana reguł rejonów',
  driver_suspend: 'Blokada kierowcy',
  admin_action: 'Akcja admina',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  login: <LogIn className="w-3.5 h-3.5" />,
  logout: <LogOut className="w-3.5 h-3.5" />,
  settings_update: <Settings className="w-3.5 h-3.5" />,
  zone_rules_update: <Layers className="w-3.5 h-3.5" />,
  driver_suspend: <AlertCircle className="w-3.5 h-3.5" />,
  admin_action: <ShieldCheck className="w-3.5 h-3.5" />,
};

const TYPE_COLORS: Record<string, string> = {
  login: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40',
  logout: 'bg-slate-800/60 text-slate-300 border border-slate-600/40',
  settings_update: 'bg-orange-900/40 text-orange-300 border border-orange-700/40',
  zone_rules_update: 'bg-teal-900/40 text-teal-300 border border-teal-700/40',
  driver_suspend: 'bg-red-900/40 text-red-300 border border-red-700/40',
  admin_action: 'bg-violet-900/40 text-violet-300 border border-violet-700/40',
};

function formatDateTime(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return raw;
  }
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 50, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Available types from API
  const [availableTypes, setAvailableTypes] = useState<{ type: string; category: string }[]>([]);

  // Expanded row for metadata
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async (currentPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', '50');
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (filterRole) params.set('userRole', filterRole);
      if (filterType) params.set('type', filterType);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/system-logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setPagination(data.pagination);
      } else {
        setError(data.error || 'Błąd ładowania logów');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, filterRole, filterType, search]);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-logs/types');
      const data = await res.json();
      if (data.success) setAvailableTypes(data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchLogs(page);
  }, [page, dateFrom, dateTo, filterRole, filterType]);

  useEffect(() => {
    fetchTypes();
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      if (page === 1) fetchLogs(1);
    }, 30_000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [page, fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterRole('');
    setFilterType('');
    setSearch('');
    setPage(1);
    setTimeout(() => fetchLogs(1), 0);
  };

  const hasFilters = dateFrom || dateTo || filterRole || filterType || search;

  const allTypes = availableTypes.length > 0
    ? availableTypes
    : Object.keys(TYPE_LABELS).map(t => ({ type: t, category: 'general' }));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Logi systemowe</h2>
          {pagination.total > 0 && (
            <span className="text-sm text-gray-400">({pagination.total.toLocaleString('pl-PL')} wpisów)</span>
          )}
        </div>
        <button
          onClick={() => fetchLogs(page)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 hover:text-white rounded-md transition-colors text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Odśwież
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Filter className="w-4 h-4" />
          Filtry
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Date from */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Data od</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full bg-[#1e1e1e] border border-[#3d3d3d] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          {/* Date to */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Data do</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="w-full bg-[#1e1e1e] border border-[#3d3d3d] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          {/* Role filter */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Rola użytkownika</label>
            <select
              value={filterRole}
              onChange={e => { setFilterRole(e.target.value); setPage(1); }}
              className="w-full bg-[#1e1e1e] border border-[#3d3d3d] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Wszystkie role</option>
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          {/* Type filter */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Typ zdarzenia</label>
            <select
              value={filterType}
              onChange={e => { setFilterType(e.target.value); setPage(1); }}
              className="w-full bg-[#1e1e1e] border border-[#3d3d3d] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Wszystkie typy</option>
              {allTypes.map(t => (
                <option key={t.type} value={t.type}>{TYPE_LABELS[t.type] ?? t.type}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Szukaj po opisie lub nazwie użytkownika..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#3d3d3d] text-white rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Szukaj
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white rounded-md text-sm transition-colors"
            >
              <X className="w-4 h-4" />
              Wyczyść
            </button>
          )}
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/40 rounded-lg text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Ładowanie logów...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-2">
            <ScrollText className="w-8 h-8 opacity-40" />
            <p>Brak logów spełniających kryteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-medium">Data i czas</th>
                  <th className="px-4 py-3 text-left font-medium">Typ</th>
                  <th className="px-4 py-3 text-left font-medium">Rola</th>
                  <th className="px-4 py-3 text-left font-medium">Użytkownik</th>
                  <th className="px-4 py-3 text-left font-medium">Opis</th>
                  <th className="px-4 py-3 text-left font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`hover:bg-[#1a1a1a] transition-colors cursor-pointer ${expandedId === log.id ? 'bg-[#1a1a1a]' : ''}`}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[log.type] ?? 'bg-gray-800 text-gray-300 border border-gray-600/40'}`}>
                          {TYPE_ICONS[log.type] ?? <Info className="w-3.5 h-3.5" />}
                          {TYPE_LABELS[log.type] ?? log.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.userRole ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[log.userRole] ?? 'bg-gray-800 text-gray-300 border border-gray-600/40'}`}>
                            <User className="w-3 h-3" />
                            {ROLE_LABELS[log.userRole] ?? log.userRole}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-medium">
                        {log.userName ?? <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                        {log.description}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.metadata && (
                          <Info className="w-4 h-4 text-indigo-400/60 hover:text-indigo-400 transition-colors" />
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr className="bg-[#111]">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="space-y-2 text-xs">
                            <div className="text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
                              {log.userId && <span>ID: <span className="text-gray-300">{log.userId}</span></span>}
                              {log.ipAddress && <span>IP: <span className="text-gray-300">{log.ipAddress}</span></span>}
                              <span>Kategoria: <span className="text-gray-300">{log.category}</span></span>
                            </div>
                            <div className="text-gray-300">{log.description}</div>
                            {log.metadata && (
                              <pre className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-md p-3 text-xs text-green-300 overflow-x-auto max-h-48">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-500">
            Strona {pagination.page} z {pagination.pages} ({pagination.total.toLocaleString('pl-PL')} wpisów)
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPage(p => Math.max(1, p - 1)); }}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(7, pagination.pages) }, (_, i) => {
              const p = pagination.pages <= 7
                ? i + 1
                : page <= 4
                  ? i + 1
                  : page >= pagination.pages - 3
                    ? pagination.pages - 6 + i
                    : page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  disabled={loading}
                  className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'hover:bg-[#2a2a2a] text-gray-400 hover:text-white'} disabled:opacity-50`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => { setPage(p => Math.min(pagination.pages, p + 1)); }}
              disabled={page >= pagination.pages || loading}
              className="p-1.5 rounded-md hover:bg-[#2a2a2a] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
