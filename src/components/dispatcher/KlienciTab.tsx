import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Info } from 'lucide-react';

import { dataSourceService } from '../../services/dataSourceService';
import { preferencesService } from '../../services/preferencesService';
import type { Preference } from '../../services/preferencesService';
import ClientPreviewModal from './ClientPreviewModal';

// ─── Typy ────────────────────────────────────────────────────────────────────
// dataSourceService.query() automatycznie konwertuje snake_case → camelCase
// i auto-parsuje JSON stringi → tablice

interface ClientRow {
  id: string;
  clientCode: string;
  clientName: string;
  phoneNumber: string;
  createdAt: string;
  internalInfo: string | null;
  permanentPreferenceIds: number[] | string | null; // auto-parsowany przez serwis
  orderCount: number;
  email: string | null;
  companyName: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  nip: string | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const formatDate = (d: string) =>
  d
    ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

const getPreferenceIds = (val: number[] | string | null): number[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(Number).filter(Boolean);
  try {
    const parsed = JSON.parse(val as string);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

const KlienciTab: React.FC = () => {
  const [clients, setClients]             = useState<ClientRow[]>([]);
  const [preferences, setPreferences]     = useState<Preference[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cRes, prefs] = await Promise.all([
          dataSourceService.query<ClientRow>(
            `SELECT c.id, c.client_code, c.client_name, c.phone_number, c.created_at,
                    c.internal_info, c.permanent_preference_ids,
                    c.email, c.company_name, c.street, c.city, c.postal_code, c.nip,
                    COUNT(o.id) AS order_count
             FROM clients c
             LEFT JOIN orders o ON o.customer_phone = c.phone_number
             GROUP BY c.id
             ORDER BY c.created_at DESC`
          ),
          preferencesService.getAll(),
        ]);
        if (cancelled) return;
        if (cRes.success && cRes.data) {
          setClients(cRes.data);
        } else if (!cRes.success) {
          setError(cRes.error ?? 'Błąd pobierania danych');
        }
        setPreferences(prefs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Nieznany błąd');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (dateFrom) {
        const d = c.createdAt ? c.createdAt.slice(0, 10) : '';
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = c.createdAt ? c.createdAt.slice(0, 10) : '';
        if (d > dateTo) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          (c.clientCode   ?? '').toLowerCase().includes(q) ||
          (c.clientName   ?? '').toLowerCase().includes(q) ||
          (c.phoneNumber  ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [clients, searchQuery, dateFrom, dateTo]);

  const getPrefBadges = (val: ClientRow['permanentPreferenceIds']) => {
    const ids = getPreferenceIds(val);
    return ids
      .map(id => preferences.find(p => p.id === id))
      .filter((p): p is Preference => !!p);
  };

  const hasFilters = searchQuery || dateFrom || dateTo;

  const thCls = 'px-3 py-2.5 text-left text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]';
  const tdCls = 'bg-inherit px-3 py-2 whitespace-nowrap text-[0.9375rem] border-t border-b border-gray-200 dark:border-[#7a7a7a]';

  return (
    <>
    <div className="flex flex-col h-full">

      {/* ── Filtry ── */}
      <div className="shrink-0 flex flex-wrap items-end gap-3 px-4 py-3 border-b border-gray-200 dark:border-[#7a7a7a]">

        {/* Szukaj */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Szukaj</label>
          <div className="relative">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Telefon, nazwa, nr klienta…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-3 text-base rounded border border-gray-300 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {/* Utworzono od */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Utworzono od</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 text-base rounded border border-gray-300 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Utworzono do */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Utworzono do</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 text-base rounded border border-gray-300 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Wyczyść */}
        {hasFilters && (
          <button
            onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-base rounded bg-red-600 hover:bg-red-700 active:bg-red-800 text-white transition-colors"
          >
            <X size={16} />
            Wyczyść
          </button>
        )}

        {/* Licznik */}
        <span className="ml-auto text-base font-medium text-gray-900 dark:text-white self-end pb-1">
          {filtered.length}{filtered.length !== clients.length ? ` z ${clients.length}` : ''} klientów
        </span>
      </div>

      {/* ── Treść ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm">
            Ładowanie klientów…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500 text-sm px-6 text-center">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm">
            {hasFilters ? 'Brak wyników dla podanych filtrów' : 'Brak klientów'}
          </div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-white dark:bg-[#202020]">
                <th className={thCls}>Nr. klienta</th>
                <th className={thCls}>Utworzono</th>
                <th className={thCls}>Telefon</th>
                <th className={thCls}>Nazwa klienta</th>
                <th className={`${thCls} max-w-[220px]`}>Uwagi wewnętrzne</th>
                <th className={thCls}>Preferencje</th>
                <th className={`${thCls} text-center`}>Ilość zleceń</th>
                <th className={`${thCls} text-center`}>Info</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, idx) => {
                const prefBadges = getPrefBadges(client.permanentPreferenceIds);
                const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
                return (
                  <tr
                    key={client.clientCode || client.phoneNumber}
                    className={`${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors cursor-pointer`}
                    onClick={() => setSelectedClient(client)}
                  >
                    {/* Nr. klienta */}
                    <td className={`${tdCls} font-mono text-sm text-gray-500 dark:text-gray-300`}>
                      {client.clientCode || '—'}
                    </td>

                    {/* Utworzono */}
                    <td className={`${tdCls} tabular-nums text-gray-900 dark:text-white`}>
                      {formatDate(client.createdAt)}
                    </td>

                    {/* Telefon */}
                    <td className={`${tdCls} font-semibold text-gray-900 dark:text-white`}>
                      {client.phoneNumber || '—'}
                    </td>

                    {/* Nazwa klienta */}
                    <td className={`${tdCls} text-gray-900 dark:text-white`}>
                      {client.clientName || <span className="text-gray-300 dark:text-gray-300">—</span>}
                    </td>

                    {/* Uwagi wewnętrzne */}
                    <td className={`${tdCls} max-w-[220px] text-gray-700 dark:text-gray-200`}>
                      <span className="block truncate" title={client.internalInfo ?? ''}>
                        {client.internalInfo || <span className="text-gray-300 dark:text-gray-300">—</span>}
                      </span>
                    </td>

                    {/* Preferencje */}
                    <td className={tdCls}>
                      {prefBadges.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {prefBadges.map(p => (
                            <span
                              key={p.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: p.color || '#6b7280' }}
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-300">—</span>
                      )}
                    </td>

                    {/* Ilość zleceń */}
                    <td className={`${tdCls} text-center tabular-nums font-semibold text-gray-900 dark:text-white`}>
                      {client.orderCount ?? 0}
                    </td>

                    {/* Akcje */}
                    <td className={`${tdCls} text-center`} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedClient(client)}
                        className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all"
                        title="Podgląd klienta"
                      >
                        <Info size={22} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {/* Modal podglądu klienta */}
    {selectedClient && (
      <ClientPreviewModal
        client={selectedClient}
        preferences={preferences}
        onClose={() => setSelectedClient(null)}
      />
    )}
    </>
  );
};

export default KlienciTab;
