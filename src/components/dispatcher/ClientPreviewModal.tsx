import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ClientEditModal from './ClientEditModal';
import {
  X, MapPin, Clock, CheckCircle, XCircle, AlertCircle,
  Car, CreditCard, Search, Navigation, Building2, Pencil, History, User,
  Shield, Plus, Trash2,
} from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';
import type { Preference } from '../../services/preferencesService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientPreviewData {
  id?: string;
  clientCode: string;
  clientName: string;
  phoneNumber: string;
  createdAt: string;
  internalInfo: string | null;
  permanentPreferenceIds: number[] | string | null;
  orderCount: number;
  email: string | null;
  companyName: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  nip: string | null;
}

interface FullOrder {
  orderNumber: string;
  pickupAddress: string;
  destinationAddress: string;
  status: string;
  createdAt: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  notes: string;
  vehicleCategory: string;
  paymentMethod: string;
  operator: string;
  driverCode: string;
  price: number | null;
}

interface ClientPreviewModalProps {
  client: ClientPreviewData;
  preferences: Preference[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  new:         { label: 'Nowe',         cls: 'bg-blue-100   text-blue-700   dark:bg-blue-600/20   dark:text-blue-300',   Icon: AlertCircle },
  pending:     { label: 'Oczekujące',   cls: 'bg-amber-100  text-amber-700  dark:bg-amber-600/20  dark:text-amber-300',  Icon: Clock       },
  assigned:    { label: 'Przydzielone', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-600/20 dark:text-yellow-300', Icon: Car         },
  in_progress: { label: 'W trakcie',    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300', Icon: Car         },
  completed:   { label: 'Ukończone',    cls: 'bg-green-100  text-green-700  dark:bg-green-600/20  dark:text-green-300',  Icon: CheckCircle },
  cancelled:   { label: 'Anulowane',    cls: 'bg-red-100    text-red-700    dark:bg-red-600/20    dark:text-red-300',    Icon: XCircle     },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Gotówka', card: 'Karta', cashless: 'Bezgotówka',
};

const CATEGORY_LABELS: Record<string, string> = {
  standard: 'Standard', comfort: 'Comfort', premium: 'Premium', van: 'Bus/Van',
};

const STATUS_OPTIONS = [
  { value: '',            label: 'Wszystkie statusy' },
  { value: 'new',         label: 'Nowe'              },
  { value: 'pending',     label: 'Oczekujące'        },
  { value: 'assigned',    label: 'Przydzielone'      },
  { value: 'in_progress', label: 'W trakcie'         },
  { value: 'completed',   label: 'Ukończone'         },
  { value: 'cancelled',   label: 'Anulowane'         },
];

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const formatDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

const getPreferenceIds = (val: number[] | string | null): number[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(Number).filter(Boolean);
  try {
    const parsed = JSON.parse(val as string);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch { return []; }
};

// ── Pomocnicze komponenty (identyczne z DriverInfoModal) ──────────────────────

const Row: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-2 text-sm">
    <span className="text-gray-400 dark:text-gray-300 shrink-0">{label}</span>
    <span className="text-gray-900 dark:text-white font-semibold text-right break-all">
      {value ?? <span className="text-gray-300 dark:text-gray-300 font-normal">—</span>}
    </span>
  </div>
);

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
  gray: 'bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white',
};

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}> = ({ icon, label, color, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 h-9 text-[15px] font-semibold rounded-md transition-colors shadow-sm ${COLOR_MAP[color] ?? COLOR_MAP.gray}`}
  >
    {icon}{label}
  </button>
);

// ─── Component ────────────────────────────────────────────────────────────────

type ModalTab = 'info' | 'orders' | 'logi' | 'blokady';

const ClientPreviewModal: React.FC<ClientPreviewModalProps> = ({ client: initialClient, preferences, onClose }) => {
  const [client, setClient]           = useState(initialClient);
  const [isEditOpen, setIsEditOpen]   = useState(false);
  const [orders, setOrders]           = useState<FullOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<ModalTab>('info');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  // Blokady
  const [clientId, setClientId]             = useState<string | null>(initialClient.id ?? null);
  const [blocks, setBlocks]                 = useState<any[]>([]);
  const [showAddBlock, setShowAddBlock]     = useState(false);
  const [driverSearch, setDriverSearch]     = useState('');
  const [driverResults, setDriverResults]   = useState<any[]>([]);
  const [driverLoading, setDriverLoading]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dataSourceService.query<FullOrder>(
          `SELECT o.order_number, o.pickup_address, o.destination_address, o.status, o.created_at,
                  o.scheduled_date, o.scheduled_time, o.notes, o.vehicle_category, o.payment_method,
                  o.operator, o.cost AS price,
                  d.driver_code
           FROM orders o
           LEFT JOIN drivers d ON d.id = o.driver_id
           WHERE o.customer_phone = ?
           ORDER BY o.created_at DESC`,
          [client.phoneNumber],
        );
        if (!cancelled && res.success && res.data) setOrders(res.data);
        // Pobierz ID klienta (jeśli nie przekazane) i załaduj blokady
        let cid = initialClient.id ?? null;
        if (!cid) {
          const idRes = await dataSourceService.query<{ id: string }>(
            'SELECT id FROM clients WHERE phone_number = ? LIMIT 1', [client.phoneNumber]
          );
          if (idRes.success && idRes.data?.[0]) cid = idRes.data[0].id;
        }
        if (!cancelled && cid) {
          setClientId(cid);
          const bRes = await fetch(`/api/admin/blocks/client/${cid}`).then(r => r.json()).catch(() => ({ data: [] }));
          if (!cancelled) setBlocks(bRes.data ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [client.phoneNumber]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const successRate    = orders.length > 0 ? Math.round((completedCount / orders.length) * 100) : 0;

  const prefIds    = getPreferenceIds(client.permanentPreferenceIds);
  const prefBadges = prefIds.map(id => preferences.find(p => p.id === id)).filter((p): p is Preference => !!p);

  const { topPickup, topDest } = useMemo(() => {
    const pm = new Map<string, number>();
    const dm = new Map<string, number>();
    orders.forEach(o => {
      if (o.pickupAddress)      pm.set(o.pickupAddress,      (pm.get(o.pickupAddress)      ?? 0) + 1);
      if (o.destinationAddress) dm.set(o.destinationAddress, (dm.get(o.destinationAddress) ?? 0) + 1);
    });
    const dedupeByRecency = (map: Map<string, number>) => {
      const seen = new Set<string>();
      const result: [string, number][] = [];
      orders.forEach(o => {
        const addr = map === pm ? o.pickupAddress : o.destinationAddress;
        if (addr && !seen.has(addr)) { seen.add(addr); result.push([addr, map.get(addr)!]); }
      });
      return result.slice(0, 8);
    };
    return { topPickup: dedupeByRecency(pm), topDest: dedupeByRecency(dm) };
  }, [orders]);

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (orderStatus && o.status !== orderStatus) return false;
    if (orderSearch) {
      const q = orderSearch.toLowerCase();
      return [o.orderNumber, o.pickupAddress, o.destinationAddress, o.notes, o.operator, o.driverCode]
        .some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [orders, orderSearch, orderStatus]);

  const tabs: { key: ModalTab; label: string }[] = [
    { key: 'info',    label: 'Szczegóły'                                                          },
    { key: 'orders',  label: `Historia zleceń${orders.length > 0 ? ` (${orders.length})` : ''}` },
    { key: 'logi',    label: 'Logi'                                                               },
    { key: 'blokady', label: `Blokady${blocks.length > 0 ? ` (${blocks.length})` : ''}`          },
  ];

  const modal = createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-[92%] h-[82vh] bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl border border-[#c4c7cc] dark:border-[#7a7a7a] flex flex-col">

        {/* ══ NAGŁÓWEK ══════════════════════════════════════════════════════ */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#c4c7cc] dark:border-[#696969]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-[#383838] flex items-center justify-center">
              <User className="w-5 h-5 text-gray-500 dark:text-gray-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {client.clientCode ? `Klient nr: ${client.clientCode}` : (
                  <span className="bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full">Nowy klient</span>
                )}
              </h2>
            </div>
          </div>

          {/* Zakładki (segmented control) + X */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-[#7a7a7a]">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-5 py-1.5 text-sm font-semibold transition-all whitespace-nowrap ${
                    activeTab === t.key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#434343]'
                  }`}
                >{t.label}</button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ══ TREŚĆ ════════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 h-48 text-gray-400 dark:text-gray-300">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Ładowanie danych…</span>
            </div>
          ) : (
            <>

              {/* ══ ZAKŁADKA SZCZEGÓŁY ══ */}
              {activeTab === 'info' && (
                <div className="px-5 py-4 flex flex-col gap-4">

                  {/* Stats */}
                  <div className="grid grid-cols-3 divide-x divide-[#c4c7cc] dark:divide-[#4a4a4a] border border-[#c4c7cc] dark:border-[#696969] rounded-md">
                    <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{orders.length}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-300">Zleceń łącznie</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{completedCount}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-300">Ukończonych</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{successRate}%</span>
                      <span className="text-xs text-gray-400 dark:text-gray-300">Skuteczność</span>
                    </div>
                  </div>

                  {/* Dane klienta | Firma/Adres | Uwagi wewnętrzne + Preferencje */}
                  <div className="grid grid-cols-3 gap-4 items-stretch">

                    {/* Kolumna 1: Dane klienta */}
                    <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                      <div className="px-3 py-2">
                        <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                          Dane klienta
                        </h3>
                      </div>
                      <div className="px-3 pb-3 flex flex-col gap-2">
                        <Row label="Nazwa klienta"  value={client.clientName}  />
                        <Row label="Numer telefonu" value={client.phoneNumber} />
                        <Row label="E-mail"         value={client.email}       />
                        <Row label="Kod klienta"    value={client.clientCode}  />
                        <Row label="Klient od"      value={formatDate(client.createdAt)} />
                      </div>
                    </div>

                    {/* Kolumna 2: Firma / Adres */}
                    <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                      <div className="px-3 py-2">
                        <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                          Firma / Adres
                        </h3>
                      </div>
                      <div className="px-3 pb-3 flex flex-col gap-2">
                        <Row label="Nazwa firmy"  value={client.companyName} />
                        <Row label="NIP"          value={client.nip}         />
                        <Row label="Ulica"        value={client.street}      />
                        <Row label="Miasto"       value={client.city}        />
                        <Row label="Kod pocztowy" value={client.postalCode}  />
                      </div>
                    </div>

                    {/* Kolumna 3: Uwagi wewnętrzne + Preferencje */}
                    <div className="flex flex-col gap-4">
                      <div className="flex-1 rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden flex flex-col">
                        <div className="px-3 py-2">
                          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                            Uwagi wewnętrzne
                          </h3>
                        </div>
                        <div className="px-3 pb-3 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-pre-wrap">
                            {client.internalInfo || '—'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                        <div className="px-3 py-2">
                          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                            Preferencje stałe
                          </h3>
                        </div>
                        <div className="px-3 pb-3">
                          {prefBadges.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {prefBadges.map(p => (
                                <span key={p.id}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-white shadow-sm"
                                  style={{ backgroundColor: p.color || '#6b7280' }}
                                >
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">—</p>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Adresy odbioru + Adresy docelowe */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                      <div className="px-3 py-2">
                        <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                          Ostatnie adresy
                        </h3>
                      </div>
                      <div className="pb-1">
                        {topPickup.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-300 italic px-3 py-2">Brak adresów</p>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody>
                              {topPickup.map(([addr, count], i) => (
                                <tr key={addr} className={i < topPickup.length - 1 ? 'border-b border-[#e4e6ea] dark:border-[#696969]' : ''}>
                                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 truncate max-w-0 w-full" title={addr}>{addr}</td>
                                  <td className="px-3 py-1.5 text-gray-400 dark:text-gray-300 font-semibold whitespace-nowrap tabular-nums text-right">{count}×</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                      <div className="px-3 py-2">
                        <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-flex items-center gap-1.5 pr-6">
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                          Adresy docelowe ({topDest.length})
                        </h3>
                      </div>
                      <div className="px-3 pb-3">
                        {topDest.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-300 italic">Brak adresów</p>
                        ) : (
                          <div className="space-y-1.5">
                            {topDest.map(([addr, count], i) => (
                              <div key={addr} className="flex items-center gap-2 bg-gray-50 dark:bg-[#383838]/40 rounded-md px-2.5 py-1.5 border border-[#c4c7cc] dark:border-[#7a7a7a]">
                                <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <Navigation className="w-3 h-3 text-rose-500 shrink-0" />
                                <span className="flex-1 text-xs text-gray-800 dark:text-gray-100 truncate" title={addr}>{addr}</span>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-300 shrink-0 tabular-nums">{count}×</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ══ ZAKŁADKA HISTORIA ZLECEŃ ══ */}
              {activeTab === 'orders' && (
                <div className="px-5 py-4 flex flex-col gap-3">
                  {/* Filtry */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Szukaj…"
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                        className="h-7 pl-7 pr-2.5 text-xs rounded-md border border-[#c4c7cc] dark:border-[#7a7a7a] bg-white dark:bg-[#383838] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
                      />
                    </div>
                    <select
                      value={orderStatus}
                      onChange={e => setOrderStatus(e.target.value)}
                      className="h-7 px-2 text-xs rounded-md border border-[#c4c7cc] dark:border-[#7a7a7a] bg-white dark:bg-[#383838] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {filteredOrders.length !== orders.length && (
                      <span className="text-xs text-gray-400 dark:text-gray-300 whitespace-nowrap">
                        {filteredOrders.length} / {orders.length}
                      </span>
                    )}
                  </div>

                  {/* Lista */}
                  {filteredOrders.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-300">
                      <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Brak zleceń</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredOrders.map(order => {
                        const st = STATUS_MAP[order.status] ?? {
                          label: order.status,
                          cls: 'bg-gray-100 text-gray-700 dark:bg-[#444444] dark:text-gray-200',
                          Icon: AlertCircle,
                        };
                        const isScheduled = !!(order.scheduledDate && order.scheduledTime);
                        return (
                          <div key={order.orderNumber} className="rounded-md border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 dark:bg-[#383838]/40 border-b border-[#c4c7cc] dark:border-[#7a7a7a]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">#{order.orderNumber}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                                {isScheduled && <span className="text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full whitespace-nowrap">Terminowe</span>}
                              </div>
                              <span className="text-xs text-gray-400 dark:text-gray-300 whitespace-nowrap tabular-nums shrink-0">
                                {isScheduled
                                  ? `${order.scheduledDate?.slice(0, 10).split('-').reverse().join('-')} ${order.scheduledTime?.slice(0, 5)}`
                                  : formatDateTime(order.createdAt)}
                              </span>
                            </div>
                            <div className="px-3 py-2 space-y-0.5 bg-white dark:bg-[#2d2d2d]">
                              <div className="flex items-start gap-1.5">
                                <span className="text-emerald-500 text-[8px] mt-1.5 shrink-0">●</span>
                                <span className="text-xs text-gray-800 dark:text-gray-100 leading-tight">{order.pickupAddress || '—'}</span>
                              </div>
                              {order.destinationAddress && (
                                <div className="flex items-start gap-1.5">
                                  <span className="text-rose-500 text-[8px] mt-1.5 shrink-0">●</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-300 leading-tight">{order.destinationAddress}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#c4c7cc] dark:border-[#7a7a7a] text-[11px] text-gray-400 dark:text-gray-300 flex-wrap bg-white dark:bg-[#2d2d2d]">
                              <span className="flex items-center gap-1"><Car className="w-3 h-3" />{CATEGORY_LABELS[order.vehicleCategory] ?? (order.vehicleCategory || '—')}</span>
                              <span className="text-gray-200 dark:text-gray-600">·</span>
                              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{PAYMENT_LABELS[order.paymentMethod] ?? (order.paymentMethod || '—')}</span>
                              {order.driverCode && (<><span className="text-gray-200 dark:text-gray-600">·</span><span>Kier.: <strong className="text-gray-600 dark:text-gray-200">{order.driverCode}</strong></span></>)}
                              {order.operator   && (<><span className="text-gray-200 dark:text-gray-600">·</span><span>Przyjął: <strong className="text-gray-600 dark:text-gray-200">{order.operator}</strong></span></>)}
                              {order.price != null && (<><span className="text-gray-200 dark:text-gray-600">·</span><span className="font-semibold text-gray-700 dark:text-gray-200">{Number(order.price).toFixed(2)} zł</span></>)}
                            </div>
                            {order.notes && (
                              <div className="px-3 pb-2 bg-white dark:bg-[#2d2d2d]">
                                <p className="text-[11px] text-gray-400 dark:text-gray-300 italic leading-relaxed line-clamp-1">„{order.notes}"</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ ZAKŁADKA LOGI ══ */}
              {activeTab === 'logi' && (
                <div className="px-5 py-4">
                  {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-300">
                      <History className="w-8 h-8 opacity-40" />
                      <span className="text-sm">Brak logów</span>
                    </div>
                  ) : (
                    <div className="rounded-md border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                      {orders.map((order, idx) => {
                        const st = STATUS_MAP[order.status] ?? {
                          label: order.status,
                          cls: 'bg-gray-100 text-gray-700 dark:bg-[#444444] dark:text-gray-200',
                          Icon: AlertCircle,
                        };
                        const iconColor = order.status === 'completed'   ? 'text-green-500'
                                        : order.status === 'cancelled'   ? 'text-red-500'
                                        : order.status === 'in_progress' ? 'text-orange-500'
                                        : order.status === 'assigned'    ? 'text-yellow-500'
                                        : order.status === 'pending'     ? 'text-amber-500'
                                        : 'text-blue-500';
                        const isScheduled = !!(order.scheduledDate && order.scheduledTime);
                        return (
                          <div key={order.orderNumber}
                            className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#434343]/40 transition-colors ${
                              idx > 0 ? 'border-t border-[#c4c7cc] dark:border-[#696969]' : ''
                            }`}
                          >
                            <st.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">#{order.orderNumber}</span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                                {isScheduled && <span className="text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">Terminowe</span>}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-200 mt-0.5 truncate">
                                {order.pickupAddress || '—'}{order.destinationAddress ? ` → ${order.destinationAddress}` : ''}
                              </div>
                              {(order.driverCode || order.operator) && (
                                <div className="text-xs text-gray-400 dark:text-gray-300 mt-0.5 flex items-center gap-2">
                                  {order.driverCode && <span>Kierowca: <strong className="text-gray-600 dark:text-gray-200">{order.driverCode}</strong></span>}
                                  {order.operator   && <span>Przyjął: <strong className="text-gray-600 dark:text-gray-200">{order.operator}</strong></span>}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 dark:text-gray-300 shrink-0 whitespace-nowrap tabular-nums">
                              {isScheduled
                                ? `${order.scheduledDate?.slice(0, 10).split('-').reverse().join('-')} ${order.scheduledTime?.slice(0, 5)}`
                                : formatDateTime(order.createdAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ ZAKŁADKA BLOKADY ══ */}
              {activeTab === 'blokady' && (
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Zablokowane taksówki</p>
                    {clientId && (
                      <button
                        onClick={() => { setShowAddBlock(true); setDriverSearch(''); setDriverResults([]); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Dodaj blokadę
                      </button>
                    )}
                  </div>
                  {!clientId ? (
                    <p className="text-sm text-gray-400 text-center py-6">Klient nie zapisany w bazie</p>
                  ) : blocks.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-300">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Brak blokad</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {blocks.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between bg-gray-50 dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#7a7a7a] rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-300 font-mono">{b.driver_code}</span>
                            <span className="text-sm text-gray-900 dark:text-gray-100">{b.driver_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.blocked_by === 'client' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                              {b.blocked_by === 'client' ? 'przez klienta' : 'przez kierowcę'}
                            </span>
                          </div>
                          <button
                            onClick={async () => {
                              await fetch(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
                              setBlocks(prev => prev.filter(x => x.id !== b.id));
                            }}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Modal wyszukiwania kierowcy */}
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
                                setDriverLoading(true);
                                const res = await fetch(`/api/admin/drivers-search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ data: [] }));
                                setDriverResults(res.data ?? []);
                                setDriverLoading(false);
                              }}
                              placeholder="Szukaj po nazwie lub kodzie kierowcy..."
                              className="w-full pl-9 pr-3 py-2.5 bg-[#272727] border border-[#3d3d3d] rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                              autoFocus
                            />
                          </div>
                          {driverLoading && <p className="text-gray-400 text-sm text-center py-2">Szukam...</p>}
                          {driverResults.length > 0 && (
                            <div className="space-y-1 max-h-60 overflow-y-auto">
                              {driverResults.map((d: any) => (
                                <button key={d.id}
                                  onClick={async () => {
                                    if (!clientId) return;
                                    await fetch('/api/admin/blocks', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ driver_id: d.id, client_id: clientId, blocked_by: 'client' }),
                                    });
                                    const bRes = await fetch(`/api/admin/blocks/client/${clientId}`).then(r => r.json()).catch(() => ({ data: [] }));
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
                          {driverSearch.length >= 2 && !driverLoading && driverResults.length === 0 && (
                            <p className="text-gray-400 text-sm text-center py-2">Nie znaleziono kierowców</p>
                          )}
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
                </div>
              )}

            </>
          )}
        </div>

        {/* ══ STOPKA ════════════════════════════════════════════════════════ */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-end gap-2">
          <ActionBtn icon={<Pencil className="w-4 h-4" />} label="Edytuj"  color="blue" onClick={() => setIsEditOpen(true)} />
          <ActionBtn icon={<X      className="w-4 h-4" />} label="Zamknij" color="gray" onClick={onClose}                  />
        </div>

      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {modal}
      {isEditOpen && (
        <ClientEditModal
          client={client}
          preferences={preferences}
          onClose={() => setIsEditOpen(false)}
          onSave={updated => {
            setClient(updated);
            setIsEditOpen(false);
          }}
        />
      )}
    </>
  );
};

export default ClientPreviewModal;
