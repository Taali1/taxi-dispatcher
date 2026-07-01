import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  order_number: string | null;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  pickup_region_id: number | null;
  vehicle_category: string | null;
  payment_method: string | null;
  taxi_count: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  notes: string | null;
  cost: number | null;
  created_at: string | null;
  driver_code: string | null;
  driver_name: string | null;
}

// ─── Słowniki ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending:        'Oczekujące',
  market:         'Giełda',
  pending_driver: 'Wysłane',
  accepted:       'Wydane',
  at_pickup:      'Pod adresem',
  in_progress:    'Z klientem',
  completed:      'Zakończone',
  new:            'Nowe',
  assigned:       'Wydane',
};

const STATUS_COLOR: Record<string, string> = {
  pending:        'bg-gray-100 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600',
  market:         'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700',
  pending_driver: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 ring-1 ring-yellow-300 dark:ring-yellow-700',
  accepted:       'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700',
  at_pickup:      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700',
  in_progress:    'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700',
  completed:      'bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600',
  new:            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700',
  assigned:       'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash:      'Gotówka',
  card:      'Karta',
  transfer:  'Przelew',
  corporate: 'Firmowe',
};

const CATEGORY_LABEL: Record<string, string> = {
  standard: 'Standard',
  comfort:  'Comfort',
  premium:  'Premium',
  van:      'Bus/Van',
};

// ─── Zakładki ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',            label: 'Wszystkie' },
  { id: 'pending',        label: 'Oczekujące' },
  { id: 'market',         label: 'Giełda' },
  { id: 'pending_driver', label: 'Wysłane' },
  { id: 'active',         label: 'Aktywne' },
  { id: 'completed',      label: 'Zakończone' },
];

const ACTIVE_STATUSES = new Set(['accepted', 'at_pickup', 'in_progress']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const time  = timeStr ? timeStr.slice(0, 5) : '';
  return time ? `${day}.${month} ${time}` : `${day}.${month}`;
}

function formatCreatedAt(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hour  = String(d.getHours()).padStart(2, '0');
  const min   = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hour}:${min}`;
}

// ─── Komponent ───────────────────────────────────────────────────────────────

const OrderList: React.FC = () => {
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.data ?? []);
      } else {
        setError(data.error ?? 'Błąd pobierania zleceń');
      }
    } catch (e: any) {
      setError('Brak połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 15_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  const filtered = orders.filter(o => {
    if (activeTab === 'all')    return true;
    if (activeTab === 'active') return ACTIVE_STATUSES.has(o.status);
    return o.status === activeTab;
  });

  const counts: Record<string, number> = {
    all:            orders.length,
    pending:        orders.filter(o => o.status === 'pending').length,
    market:         orders.filter(o => o.status === 'market').length,
    pending_driver: orders.filter(o => o.status === 'pending_driver').length,
    active:         orders.filter(o => ACTIVE_STATUSES.has(o.status)).length,
    completed:      orders.filter(o => o.status === 'completed').length,
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#202020] overflow-hidden">

      {/* ── Pasek zakładek ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-[#696969] bg-white dark:bg-[#202020] px-4">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-3.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100'
              }`}
            >
              {tab.label}
              {counts[tab.id] > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded text-xs font-semibold ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-[#383838] dark:text-gray-200'
                }`}>
                  {counts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={fetchOrders}
          disabled={loading}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 dark:text-gray-300 disabled:opacity-40 transition-colors"
          title="Odśwież"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Treść ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">

        {error && (
          <div className="m-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!error && filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm">
            Brak zleceń
          </div>
        )}

        {!error && filtered.length > 0 && (
          <table className="w-full border-collapse">

            {/* Nagłówek */}
            <thead>
              <tr className="bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-[#696969]">
                {[
                  'Nr zlecenia', 'Status', 'Klient', 'Telefon',
                  'Adres odbioru', 'Cel', 'Rej.', 'Kierowca',
                  'Kategoria', 'Płatność', 'Termin', 'Dodano',
                ].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Wiersze */}
            <tbody className="divide-y divide-gray-100 dark:divide-[#4a4a4a]/60">
              {filtered.map(order => {
                const isExpanded = expandedId === order.id;
                return (
                  <React.Fragment key={order.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className={`cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-blue-50 dark:bg-blue-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-[#434343]/60'
                      }`}
                    >
                      {/* Nr zlecenia */}
                      <td className="px-4 py-3 text-[0.9375rem] font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {order.order_number ?? '—'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-[0.9375rem] whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-700 ring-1 ring-gray-300'}`}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      </td>

                      {/* Klient */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-900 dark:text-white whitespace-nowrap max-w-[140px]">
                        <span className="block truncate" title={order.customer_name ?? ''}>
                          {order.customer_name || '—'}
                        </span>
                      </td>

                      {/* Telefon */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 whitespace-nowrap tabular-nums">
                        {order.customer_phone || '—'}
                      </td>

                      {/* Odbiór */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-900 dark:text-white max-w-[200px]">
                        <span className="block truncate" title={order.pickup_address ?? ''}>
                          {order.pickup_address || '—'}
                        </span>
                      </td>

                      {/* Cel */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 max-w-[160px]">
                        <span className="block truncate" title={order.destination_address ?? ''}>
                          {order.destination_address || '—'}
                        </span>
                      </td>

                      {/* Rejon */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 whitespace-nowrap tabular-nums">
                        {order.pickup_region_id != null
                          ? <span className="font-medium">{order.pickup_region_id}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>

                      {/* Kierowca */}
                      <td className="px-4 py-3 text-[0.9375rem] whitespace-nowrap">
                        {order.driver_code
                          ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">{order.driver_code}</span>
                          : <span className="text-gray-400 dark:text-gray-300">—</span>
                        }
                      </td>

                      {/* Kategoria */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 whitespace-nowrap">
                        {CATEGORY_LABEL[order.vehicle_category ?? ''] ?? order.vehicle_category ?? '—'}
                      </td>

                      {/* Płatność */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 whitespace-nowrap">
                        {PAYMENT_LABEL[order.payment_method ?? ''] ?? order.payment_method ?? '—'}
                      </td>

                      {/* Termin */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-600 dark:text-gray-200 whitespace-nowrap tabular-nums">
                        {formatDateTime(order.scheduled_date, order.scheduled_time)}
                      </td>

                      {/* Dodano */}
                      <td className="px-4 py-3 text-[0.9375rem] text-gray-400 dark:text-gray-300 whitespace-nowrap tabular-nums">
                        {formatCreatedAt(order.created_at)}
                      </td>
                    </tr>

                    {/* ── Rozwinięty szczegół ── */}
                    {isExpanded && (
                      <tr className="bg-blue-50 dark:bg-blue-900/10">
                        <td colSpan={12} className="px-6 py-4 border-b border-blue-100 dark:border-blue-900/30">
                          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 text-sm">
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Adres odbioru</dt>
                              <dd className="text-gray-900 dark:text-white">{order.pickup_address || '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Cel podróży</dt>
                              <dd className="text-gray-900 dark:text-white">{order.destination_address || '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Kierowca</dt>
                              <dd className="text-gray-900 dark:text-white">
                                {order.driver_code
                                  ? <><span className="font-semibold text-emerald-700 dark:text-emerald-400">{order.driver_code}</span> · {order.driver_name ?? ''}</>
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Koszt</dt>
                              <dd className="text-gray-900 dark:text-white font-semibold">
                                {order.cost != null ? `${Number(order.cost).toFixed(2)} zł` : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Liczba taxi</dt>
                              <dd className="text-gray-900 dark:text-white">{order.taxi_count ?? 1}</dd>
                            </div>
                            {order.notes && (
                              <div className="col-span-2 lg:col-span-3">
                                <dt className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-0.5">Notatki</dt>
                                <dd className="text-gray-900 dark:text-white">{order.notes}</dd>
                              </div>
                            )}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Stopka ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-t border-gray-200 dark:border-[#696969] bg-gray-50 dark:bg-[#2d2d2d] flex items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
        <span className="font-medium text-gray-700 dark:text-gray-200">{filtered.length}</span>
        <span>{filtered.length === 1 ? 'zlecenie' : filtered.length < 5 ? 'zlecenia' : 'zleceń'}</span>
        {activeTab !== 'all' && (
          <>
            <span className="text-gray-300 dark:text-gray-300">·</span>
            <span>{orders.length} łącznie</span>
          </>
        )}
        {loading && (
          <>
            <span className="text-gray-300 dark:text-gray-300">·</span>
            <span className="text-blue-500">odświeżanie…</span>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderList;
