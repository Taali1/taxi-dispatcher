import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, MapPin, User, Clock, CheckCircle, XCircle, AlertCircle,
  Car, CreditCard, Shield, Plus, Search, Trash2,
} from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface ClientInfo {
  id: string;
  client_name: string;
  client_code: string;
  phone_number: string;
  created_at: string;
}

interface Order {
  order_number: string;
  pickup_address: string;
  destination_address: string;
  status: string;
  created_at: string;
  notes: string;
  vehicle_category: string;
  payment_method: string;
}

interface ClientInfoModalProps {
  phone: string;
  /** null = jeszcze szuka, '' = nowy klient, string = kod istniejącego */
  clientCode: string | null;
  clientName: string;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  new:         { label: 'Nowe',        cls: 'bg-blue-100   text-blue-700   dark:bg-blue-600/20  dark:text-blue-300',   Icon: AlertCircle  },
  pending:     { label: 'Oczekujące',  cls: 'bg-amber-100  text-amber-700  dark:bg-amber-600/20 dark:text-amber-300',  Icon: Clock        },
  assigned:    { label: 'Przydzielone',cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-600/20 dark:text-yellow-300',Icon: Car          },
  in_progress: { label: 'W trakcie',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300',Icon: Car          },
  completed:   { label: 'Ukończone',   cls: 'bg-green-100  text-green-700  dark:bg-green-600/20  dark:text-green-300', Icon: CheckCircle  },
  cancelled:   { label: 'Anulowane',   cls: 'bg-red-100    text-red-700    dark:bg-red-600/20    dark:text-red-300',   Icon: XCircle      },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Gotówka', card: 'Karta', cashless: 'Bezgotówka',
};

const CATEGORY_LABELS: Record<string, string> = {
  standard: 'Standard', comfort: 'Comfort', premium: 'Premium', van: 'Bus/Van',
};

const formatDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const formatDateTime = (d: string) =>
  d
    ? new Date(d).toLocaleDateString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

const buildInitials = (name: string, fallback: string) => {
  const src = name || fallback;
  const parts = src.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '?';
  return parts.map(p => p[0].toUpperCase()).join('');
};

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'info' | 'orders' | 'logi' | 'blokady';

const ClientInfoModal: React.FC<ClientInfoModalProps> = ({ phone, clientCode, clientName, onClose }) => {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [activeTab, setActiveTab]   = useState<Tab>('info');
  // Blokady
  const [blocks, setBlocks]                     = useState<any[]>([]);
  const [showAddBlock, setShowAddBlock]         = useState(false);
  const [driverSearch, setDriverSearch]         = useState('');
  const [driverResults, setDriverResults]       = useState<any[]>([]);
  const [driverSearchLoading, setDriverSearchLoading] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [cRes, oRes] = await Promise.all([
          dataSourceService.query<ClientInfo>(
            'SELECT id, client_name, client_code, phone_number, created_at FROM clients WHERE phone_number = ? LIMIT 1',
            [phone],
          ),
          dataSourceService.query<Order>(
            `SELECT order_number, pickup_address, destination_address, status, created_at,
                    notes, vehicle_category, payment_method
             FROM orders WHERE customer_phone = ?
             ORDER BY created_at DESC LIMIT 20`,
            [phone],
          ),
        ]);
        if (cancelled) return;
        if (cRes.success && cRes.data?.length) {
          setClientInfo(cRes.data[0]);
          // Załaduj blokady
          const bRes = await fetch(`/api/admin/blocks/client/${cRes.data[0].id}`).then(r => r.json()).catch(() => ({ data: [] }));
          setBlocks(bRes.data ?? []);
        }
        if (oRes.success && oRes.data)            setOrders(oRes.data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone]);

  // Top-N unique pickup addresses with frequency
  const topAddresses = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      if (o.pickup_address) map.set(o.pickup_address, (map.get(o.pickup_address) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const isNewClient    = !isLoading && !clientInfo;
  const displayName    = clientInfo?.client_name || clientName || '';
  const displayCode    = clientInfo?.client_code || (clientCode && clientCode !== '' ? clientCode : null);
  const initials       = buildInitials(displayName, phone);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#696969] rounded-xl shadow-2xl w-full max-w-5xl flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">

        {/* ── Nagłówek z awatarem ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-300 dark:border-[#7a7a7a]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <span className="text-white text-sm font-bold tracking-wide select-none">{initials}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                  {displayCode ? `Klient nr: ${displayCode}` : (
                    <span className="bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full">Nowy klient</span>
                  )}
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Statystyki */}
          {!isLoading && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-xl px-3 py-2.5 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">{orders.length}</div>
                <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">Zleceń</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/40 rounded-xl px-3 py-2.5 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completedCount}</div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Ukończonych</div>
              </div>
              <div className="bg-gray-100 dark:bg-[#383838] border border-gray-200 dark:border-[#4a4a4a] rounded-xl px-3 py-2.5 text-center">
                <div className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                  {clientInfo?.created_at ? formatDate(clientInfo.created_at) : '—'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Klient od</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Zakładki ── */}
        <div className="shrink-0 flex items-center justify-end border-b border-gray-300 dark:border-[#7a7a7a] px-5">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-[#7a7a7a] my-2">
            {([
              { key: 'info',    label: 'Szczegóły' },
              { key: 'orders',  label: `Historia zleceń${orders.length > 0 ? ` (${orders.length})` : ''}` },
              { key: 'logi',    label: 'Logi' },
              { key: 'blokady', label: `Blokady${blocks.length > 0 ? ` (${blocks.length})` : ''}` },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-5 py-1.5 text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#434343]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Treść (przewijalna) ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 h-40 text-gray-400 dark:text-gray-300">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Ładowanie danych…</span>
            </div>
          ) : (
            <>
              {/* ── Szczegóły ── */}
              {activeTab === 'info' && (
                <div className="px-5 py-4 flex flex-col gap-4">
                  {/* Dane klienta */}
                  {clientInfo ? (
                    <div className="rounded-xl border-2 border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden text-sm">
                      {[
                        { label: 'Nazwa',       value: clientInfo.client_name || '—' },
                        { label: 'Telefon',     value: clientInfo.phone_number },
                        { label: 'Kod klienta', value: clientInfo.client_code || '—' },
                        { label: 'Klient od',   value: formatDate(clientInfo.created_at) },
                      ].map(({ label, value }, i, arr) => (
                        <div key={label} className={`flex items-center ${i < arr.length - 1 ? 'border-b border-[#b0b3b8] dark:border-[#7a7a7a]' : ''}`}>
                          <span className="w-32 shrink-0 px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#363636] text-sm">{label}</span>
                          <span className="px-4 py-2.5 text-gray-900 dark:text-white text-sm">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400 dark:text-gray-300">
                      <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Brak danych o kliencie
                    </div>
                  )}

                  {/* Ostatnie adresy */}
                  <div className="rounded-xl border-2 border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#b0b3b8] dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#363636]">
                      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        Ostatnie adresy odbioru
                      </h3>
                    </div>
                    <div className="px-4 py-3">
                      {topAddresses.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-300 italic">Brak adresów</p>
                      ) : (
                        <div className="space-y-1.5">
                          {topAddresses.map(([addr, count]) => (
                            <div key={addr} className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{addr}</span>
                              <span className="text-xs font-semibold text-gray-400 dark:text-gray-300 shrink-0 tabular-nums">{count}×</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* ── Historia zleceń ── */}
              {activeTab === 'orders' && (
                <div className="px-5 py-4">
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">
                      <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Brak historii zleceń
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {orders.map((order) => {
                        const st = STATUS_MAP[order.status] ?? {
                          label: order.status,
                          cls: 'bg-gray-100 text-gray-700 dark:bg-[#444444] dark:text-gray-200',
                          Icon: AlertCircle,
                        };
                        return (
                          <div
                            key={order.order_number}
                            className="bg-gray-50 dark:bg-[#383838]/60 rounded-xl px-3.5 py-3 border border-gray-100 dark:border-[#7a7a7a]/50"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                                #{order.order_number}
                              </span>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>
                                  {st.label}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-300 whitespace-nowrap hidden sm:block">
                                  {formatDateTime(order.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-start gap-1.5">
                                <span className="text-emerald-500 text-[10px] mt-1 shrink-0">●</span>
                                <span className="text-xs text-gray-800 dark:text-gray-100 leading-tight line-clamp-1">
                                  {order.pickup_address || '—'}
                                </span>
                              </div>
                              {order.destination_address && (
                                <div className="flex items-start gap-1.5">
                                  <span className="text-rose-500 text-[10px] mt-1 shrink-0">●</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-300 leading-tight line-clamp-1">
                                    {order.destination_address}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-[#7a7a7a]/50">
                              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-300">
                                <Car className="w-3 h-3" />
                                {CATEGORY_LABELS[order.vehicle_category] ?? order.vehicle_category}
                              </span>
                              <span className="text-gray-300 dark:text-gray-300">·</span>
                              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-300">
                                <CreditCard className="w-3 h-3" />
                                {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-300 sm:hidden ml-auto">
                                {formatDate(order.created_at)}
                              </span>
                            </div>
                            {order.notes && (
                              <p className="mt-2 text-xs text-gray-400 dark:text-gray-300 italic line-clamp-2 leading-relaxed">
                                "{order.notes}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Logi ── */}
              {activeTab === 'logi' && (
                <div className="px-5 py-4">
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Brak logów
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {orders.map((order) => {
                        const st = STATUS_MAP[order.status] ?? {
                          label: order.status,
                          cls: 'bg-gray-100 text-gray-700 dark:bg-[#444444] dark:text-gray-200',
                          Icon: AlertCircle,
                        };
                        return (
                          <div
                            key={order.order_number}
                            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#434343]/40 transition-colors"
                          >
                            <div className="mt-0.5 shrink-0">
                              <st.Icon className={`w-4 h-4 ${st.cls.includes('green') ? 'text-green-500' : st.cls.includes('red') ? 'text-red-500' : st.cls.includes('blue') ? 'text-blue-500' : st.cls.includes('amber') ? 'text-amber-500' : 'text-gray-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">#{order.order_number}</span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-200 mt-0.5 truncate">
                                {order.pickup_address || '—'}
                                {order.destination_address ? ` → ${order.destination_address}` : ''}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 dark:text-gray-300 shrink-0 whitespace-nowrap tabular-nums">
                              {formatDateTime(order.created_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Blokady taksówek ── */}
              {activeTab === 'blokady' && (
                <div className="px-5 py-4 space-y-3">
                  {!clientInfo ? (
                    <p className="text-gray-400 text-sm text-center py-6">Brak danych klienta</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-200">Zablokowane taksówki</p>
                        <button
                          onClick={() => { setShowAddBlock(true); setDriverSearch(''); setDriverResults([]); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Dodaj blokadę
                        </button>
                      </div>
                      {blocks.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">Brak blokad</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {blocks.map((b: any) => (
                            <div key={b.id} className="flex items-center justify-between bg-[#1e1e1e] dark:bg-[#2a2a2a] border border-[#3d3d3d] rounded-lg px-3 py-2.5">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-300 font-mono">{b.driver_code}</span>
                                <span className="text-sm text-gray-200">{b.driver_name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.blocked_by === 'client' ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'}`}>
                                  {b.blocked_by === 'client' ? 'przez klienta' : 'przez kierowcę'}
                                </span>
                              </div>
                              <button
                                onClick={async () => {
                                  await fetch(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
                                  setBlocks(prev => prev.filter(x => x.id !== b.id));
                                }}
                                className="p-1.5 hover:bg-red-600/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {/* Modal dodawania blokady kierowcy */}
      {showAddBlock && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10002] p-4">
          <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-base font-bold text-white">Zablokuj taksówkę</h3>
              <button onClick={() => setShowAddBlock(false)} className="p-1.5 hover:bg-[#272727] rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={driverSearch}
                  onChange={async e => {
                    const q = e.target.value;
                    setDriverSearch(q);
                    if (q.length < 2) { setDriverResults([]); return; }
                    setDriverSearchLoading(true);
                    const res = await fetch(`/api/admin/drivers-search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ data: [] }));
                    setDriverResults(res.data ?? []);
                    setDriverSearchLoading(false);
                  }}
                  placeholder="Szukaj po nazwie lub kodzie kierowcy..."
                  className="w-full pl-9 pr-3 py-2.5 bg-[#272727] border border-[#3d3d3d] rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              {driverSearchLoading && <p className="text-gray-400 text-sm text-center py-2">Szukam...</p>}
              {driverResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {driverResults.map((d: any) => (
                    <button key={d.id}
                      onClick={async () => {
                        if (!clientInfo) return;
                        await fetch('/api/admin/blocks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ driver_id: d.id, client_id: clientInfo.id, blocked_by: 'client' }),
                        });
                        const bRes = await fetch(`/api/admin/blocks/client/${clientInfo.id}`).then(r => r.json()).catch(() => ({ data: [] }));
                        setBlocks(bRes.data ?? []);
                        setShowAddBlock(false);
                        setDriverSearch('');
                        setDriverResults([]);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a2a2a] rounded-lg text-left transition-colors"
                    >
                      <span className="text-xs font-bold text-gray-400 font-mono w-12 shrink-0">{d.driver_code}</span>
                      <span className="text-sm text-white flex-1">{d.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {driverSearch.length >= 2 && !driverSearchLoading && driverResults.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-2">Nie znaleziono kierowców</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
};

export default ClientInfoModal;
