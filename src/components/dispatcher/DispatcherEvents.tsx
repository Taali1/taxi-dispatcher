import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';

// ── Typy ────────────────────────────────────────────────────────────────────
type EventType = 'order_new' | 'order_accepted' | 'order_pickup' | 'order_done' | 'order_cancelled' | 'driver_online';

interface AppEvent {
  type: EventType;
  ref: string | null;
  label: string | null;
  detail: string | null;
  driver_code: string | null;
  ts: string;
}

// ── Konfiguracja ──────────────────────────────────────────────────────────────
const EVENT_CFG: Record<EventType, {
  dot: string;
  title: (e: AppEvent) => string;
}> = {
  order_new:       { dot: 'bg-blue-500',    title: e => `Nowe zlecenie ${e.ref ?? ''}` },
  order_accepted:  { dot: 'bg-indigo-500',  title: e => `Zlecenie ${e.ref ?? ''} przyjęte · Taxi ${e.driver_code ?? ''}` },
  order_pickup:    { dot: 'bg-violet-500',  title: e => `Przy odbiorze ${e.ref ?? ''} · Taxi ${e.driver_code ?? ''}` },
  order_done:      { dot: 'bg-emerald-500', title: e => `Kurs zakończony ${e.ref ?? ''}` },
  order_cancelled: { dot: 'bg-red-500',     title: e => `Zlecenie ${e.ref ?? ''} anulowane` },
  driver_online:   { dot: 'bg-teal-500',    title: e => `Taxi ${e.ref ?? ''} online` },
};

// ── Czas względny ────────────────────────────────────────────────────────────
const relTime = (ts: string) => {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)  return `${diff} s temu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
  return new Date(ts).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
};

const absTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ── Komponent ────────────────────────────────────────────────────────────────
const DispatcherEvents: React.FC = () => {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/events?limit=200`);
      const d = await r.json();
      if (d.success) {
        setEvents(d.data ?? []);
        setLastRefresh(new Date());
      } else {
        setError(d.error || 'Błąd serwera');
      }
    } catch (e: any) {
      setError(e?.message || 'Brak połączenia z serwerem');
    }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => {
    fetchEvents();
    const iv = setInterval(fetchEvents, 15_000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  const FILTER_TABS: { id: EventType | 'all'; label: string }[] = [
    { id: 'all',              label: 'Wszystkie' },
    { id: 'order_new',        label: 'Nowe' },
    { id: 'order_accepted',   label: 'Przyjęte' },
    { id: 'order_done',       label: 'Zakończone' },
    { id: 'order_cancelled',  label: 'Anulowane' },
    { id: 'driver_online',    label: 'Online' },
  ];

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#1a1a1a]">

      {/* ── Nagłówek ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white dark:bg-[#202020] border-b border-gray-200 dark:border-[#696969]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-sm text-gray-900 dark:text-white">Zdarzenia systemowe</span>
          {events.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 h-5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-[#2d2d2d] text-gray-500 dark:text-gray-300">
              {filtered.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-gray-400 dark:text-gray-300 tabular-nums">
              {absTime(lastRefresh.toISOString())}
            </span>
          )}
          <button
            onClick={fetchEvents}
            disabled={loading}
            title="Odśwież"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 dark:text-gray-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Filtry ── */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 bg-white dark:bg-[#202020] border-b border-gray-200 dark:border-[#696969] overflow-x-auto">
        {FILTER_TABS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              filter === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-[#2d2d2d] text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#434343]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
            <Activity className="w-10 h-10" />
            <p className="text-sm font-semibold">Błąd</p>
            <p className="text-xs text-center break-all max-w-xs">{error}</p>
            <p className="text-[10px] text-gray-400">URL: {apiBase}/events</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300 dark:text-gray-300">
            <Activity className="w-10 h-10" />
            <p className="text-sm">Brak zdarzeń</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {filtered.map((ev, i) => {
                const cfg = EVENT_CFG[ev.type] ?? EVENT_CFG.order_new;
                return (
                  <tr key={i} className="border-b border-gray-200 dark:border-[#696969] hover:bg-gray-50 dark:hover:bg-[#434343]/40">
                    {/* Kolorowa kropka */}
                    <td className="pl-4 pr-2 py-1.5 w-5">
                      <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                    </td>
                    {/* Treść */}
                    <td className="py-1.5 pr-4 text-[0.9375rem] text-gray-900 dark:text-white font-medium whitespace-nowrap">
                      {cfg.title(ev)}
                    </td>
                    {/* Czas względny */}
                    <td className="py-2 pr-3 text-gray-400 dark:text-gray-300 tabular-nums whitespace-nowrap text-right text-xs">
                      {relTime(ev.ts)}
                    </td>
                    {/* Czas bezwzględny */}
                    <td className="py-2 pr-4 text-gray-400 dark:text-gray-300 tabular-nums whitespace-nowrap text-right text-xs">
                      {absTime(ev.ts)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DispatcherEvents;
