import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Layout from '../common/Layout';
import OrderForm from './OrderForm';
import OrderForm2, { OrderData2 } from './OrderForm2';
import OrderList from './OrderList';
import CostCalculator from './CostCalculator';
import DriverSuggestion, { QueueDriver } from './DriverSuggestion';
import DispatcherMiniMap from './DispatcherMiniMap';
import { DebugConsole } from '../driver/DebugConsole';
import { DispatcherChat } from './DispatcherChat';
import TaxiQueue from './TaxiQueue';
import DispatcherRejonTab from './DispatcherRejonTab';
import DriverInfoModal from './DriverInfoModal';
import DispatcherEvents from './DispatcherEvents';
import { dataSourceService } from '../../services/dataSourceService';
import { zoneService } from '../../services/zoneService';
import type { Zone } from '../../services/zoneService';
import { ChevronLeft, ChevronRight, Map, User, ChevronDown, ChevronUp, LogOut, Sun, Moon, RotateCcw, ClipboardList, Check, X as XIcon, Trash2, Info, Phone, MapPin, Calendar, Hand, Store, Ban, Car, Navigation, Pencil, Clock, MessageSquare, ChevronsUpDown, Send, ArrowRightCircle, PenLine, Search, AlertTriangle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { CreateOrderResult, dispatchOrderToDriver } from '../../services/orderService';
import { OrderData } from './OrderForm';
import KlienciTab from './KlienciTab';
import { chatService } from '../../services/chatService';
import { preferencesService, Preference } from '../../services/preferencesService';

type TabType = 'new-order' | 'new-order-2' | 'orders' | 'chat' | 'console' | 'taxi' | 'zdarzenia' | 'klienci';

interface SubmittedOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupRegionId: number | null;
  vehicleCategory: string;
  paymentMethod: string;
  taxiCount: number;
  clientCode: string | null;
  assignedDriver: { id: string; name: string; code: string } | null;
  scheduledDate: string;
  scheduledTime: string;
  createdAt: string;
  createdAtISO: string;
  updatedAtISO: string;
  notes: string | null;
  operator: string | null;
  orderType: string;
  clientInfo: string | null;
  preferenceIds: number[] | null;
  cost: number | null;
  status: 'scheduled' | 'pending' | 'market' | 'pending_driver' | 'accepted' | 'at_pickup' | 'in_progress' | 'completed';
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending:        { label: 'Oczekujące', bg: 'bg-gray-500',   text: 'text-white' },
  market:         { label: 'Giełda',     bg: 'bg-orange-500', text: 'text-white' },
  pending_driver: { label: 'Wysłane',    bg: 'bg-yellow-500', text: 'text-white' },
  accepted:       { label: 'Przyjęte',   bg: 'bg-green-800',  text: 'text-white' },
  at_pickup:      { label: 'Na miejscu', bg: 'bg-blue-600',   text: 'text-white' },
  in_progress:    { label: 'W trakcie',  bg: 'bg-indigo-600', text: 'text-white' },
  completed:      { label: 'Zakończone', bg: 'bg-[#474747]',  text: 'text-white' },
  scheduled:      { label: 'Terminowe',  bg: 'bg-cyan-600',   text: 'text-white' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Gotówka', card: 'Karta', transfer: 'Przelew', corporate: 'Firmowe',
};

const CATEGORY_LABELS: Record<string, string> = {
  standard: 'Standard', comfort: 'Comfort', premium: 'Premium', van: 'Bus/Van',
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATE_LABEL: Record<string, string> = { wolna: 'Wolna', dojazd: 'Dojazd', zajeta: 'Zajęta', kursem: 'Kursem' };
const STATE_BG: Record<string, string>    = { wolna: '#007a1e', dojazd: '#991100', zajeta: '#4d2260', kursem: '#003d99' };

interface GpsRow { driverId: string; code: string; name: string; state: string; zone: number; lat: number | null; lng: number | null; dist: number | null; stateMinutes: number | null; queuePosition: number; endsInMinutes: number | null; queryAnswer: string | null; queryAnsweredAt: string | null; }

interface SelectedDriver { driverId: string; lat: number; lng: number; code: string; dist: number | null; state: string; }

// ── Mini czat w modalu podglądu zlecenia ────────────────────────────────────
const OrderChatPanel: React.FC<{
  driverId: string;
  driverName: string;
  dispatcherId: string;
  dispatcherName: string;
}> = ({ driverId, driverName, dispatcherId, dispatcherName }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!dispatcherId) return;
    const msgs = chatService.getConversationMessages(dispatcherId, driverId);
    setMessages(msgs);
    const unread = msgs.filter((m: any) => m.senderType === 'driver' && !m.isRead).map((m: any) => m.id);
    if (unread.length > 0) chatService.markAsRead(unread);
  }, [dispatcherId, driverId]);

  useEffect(() => {
    load();
    const unsub = chatService.subscribe(load);
    return () => unsub();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !dispatcherId || sending) return;
    setSending(true);
    try {
      await chatService.sendMessage(dispatcherId, dispatcherName, 'dispatcher', driverId, driverName, input.trim());
      setInput('');
    } catch { /* ignore */ } finally { setSending(false); }
  };

  const fmtT = (ts: string) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#202020]/60">
      {/* Nagłówek czatu */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-[#696969] bg-white dark:bg-[#202020]">
        <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-800 dark:text-white">Czat · {driverName}</span>
      </div>
      {/* Wiadomości */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-300 gap-2">
            <MessageSquare className="w-7 h-7 opacity-30" />
            <p className="text-xs">Brak wiadomości</p>
          </div>
        )}
        {messages.map((msg: any) => {
          const isDisp = msg.senderType === 'dispatcher';
          return (
            <div key={msg.id} className={`flex ${isDisp ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-sm leading-snug ${
                isDisp
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-[#696969] rounded-bl-sm'
              }`}>
                <p>{msg.content}</p>
                <p className={`text-[10px] mt-0.5 ${isDisp ? 'text-blue-200' : 'text-gray-400 dark:text-gray-300'} text-right`}>{fmtT(msg.timestamp)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-gray-200 dark:border-[#696969] bg-white dark:bg-[#202020]">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Wpisz wiadomość..."
          className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#696969] rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const GieldaGpsTab: React.FC<{
  pickupCoords:    { lat: number; lng: number } | null;
  onDriverSelect?: (driver: SelectedDriver | null) => void;
}> = ({ pickupCoords, onDriverSelect }) => {
  const [rows, setRows]               = useState<GpsRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [sortKey, setSortKey]         = useState<keyof GpsRow>('dist');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');
  const [waitingDrivers, setWaitingDrivers] = useState<Set<string>>(new Set());
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const handleSort = (key: keyof GpsRow) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const SortIcon = ({ col }: { col: keyof GpsRow }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />;
  };

  const fetchData = useCallback(async () => {
    try {
      const [queuesRes, locsRes, answersRes] = await Promise.all([
        fetch('/api/queue/all'),
        fetch('/api/drivers/locations'),
        fetch('/api/driver-queries/recent-answers'),
      ]);
      const queuesData  = await queuesRes.json();
      const locsData    = await locsRes.json();
      const answersData = answersRes.ok ? await answersRes.json() : { answers: [] };
      const queues: Record<string, any[]> = queuesData.queues ?? {};
      const locs: any[] = locsData.data ?? locsData.drivers ?? [];

      // Mapa: driverId → { answer, answeredAt } (tylko najnowszy wpis na kierowcę)
      const answerMap: Record<string, { answer: string; answeredAt: string | null }> = {};
      for (const a of (answersData.answers ?? [])) {
        if (a.driver_id in answerMap) continue;
        if (a.status === 'pending') {
          answerMap[a.driver_id] = { answer: '__CZEKAM__', answeredAt: null };
        } else {
          answerMap[a.driver_id] = { answer: String(a.answer ?? ''), answeredAt: a.answered_at ?? null };
        }
      }

      const locMap: Record<string, { lat: number; lng: number }> = {};
      locs.forEach((d: any) => {
        if (d.latitude && d.longitude) locMap[d.id ?? d.driver_id] = { lat: d.latitude, lng: d.longitude };
      });

      const all: GpsRow[] = [];
      const zonePosCounter: Record<number, number> = {};
      for (const [zoneStr, drivers] of Object.entries(queues)) {
        const zone = parseInt(zoneStr);
        zonePosCounter[zone] = 1;
        for (const d of drivers) {
          const loc = locMap[d.driverId ?? d.id];
          const lat = loc?.lat ?? null;
          const lng = loc?.lng ?? null;
          const changedAt = d.stateChangedAt ?? d.state_changed_at ?? null;
          const stateMinutes = changedAt ? Math.floor((Date.now() - new Date(changedAt).getTime()) / 60000) : null;
          const driverId = d.driverId ?? d.id;
          all.push({
            driverId,
            code:     d.driverCode ?? d.driver_code ?? '—',
            name:     d.name ?? '',
            state:    d.driverState ?? d.driver_state ?? '—',
            zone,
            lat, lng,
            dist: lat !== null && lng !== null && pickupCoords ? haversineKm(lat, lng, pickupCoords.lat, pickupCoords.lng) : null,
            stateMinutes,
            queuePosition: zonePosCounter[zone]++,
            endsInMinutes: null,
            queryAnswer:     answerMap[driverId]?.answer     ?? null,
            queryAnsweredAt: answerMap[driverId]?.answeredAt ?? null,
          });
        }
      }

      all.sort((a, b) => a.dist !== null && b.dist !== null ? a.dist - b.dist : a.dist !== null ? -1 : 1);
      setRows(all);
      // Auto-zaznacz pierwszego (najbliższego) kierowcę
      const first = all[0];
      if (first && first.lat !== null && first.lng !== null) {
        setSelectedDriverId(first.driverId);
        onDriverSelect?.({ driverId: first.driverId, lat: first.lat, lng: first.lng, code: first.code, dist: first.dist, state: first.state });
      }
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [pickupCoords]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-gray-400">Ładowanie...</div>;
  if (rows.length === 0) return <div className="flex items-center justify-center h-full text-sm text-gray-400">Brak kierowców</div>;

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'pl');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const thCls = "px-3 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors";

  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr className="sticky top-0 z-10 bg-white dark:bg-[#2d2d2d]">
          <th onClick={() => handleSort('code')} className={thCls}><span className="flex items-center gap-1">Taxi<SortIcon col="code" /></span></th>
          <th onClick={() => handleSort('state')} className={thCls}><span className="flex items-center gap-1">Stan<SortIcon col="state" /></span></th>
          <th onClick={() => handleSort('zone')} className={thCls}><span className="flex items-center gap-1">Rejon<SortIcon col="zone" /></span></th>
          <th onClick={() => handleSort('dist')} className={thCls}><span className="flex items-center gap-1">Dojazd<SortIcon col="dist" /></span></th>
          <th onClick={() => handleSort('endsInMinutes')} className={thCls}><span className="flex items-center gap-1">Kończy za<SortIcon col="endsInMinutes" /></span></th>
          <th className="px-3 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Akcje</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const distStr = r.dist !== null ? (r.dist < 1 ? `${Math.round(r.dist * 1000)} m` : `${r.dist.toFixed(1)} km`) : '—';
          const timeStr = r.dist !== null ? (() => { const m = Math.round((r.dist / 30) * 60); return m < 1 ? '< 1 min' : `${m} min`; })() : '';
          const isSelected = r.driverId === selectedDriverId;
          const handleRowClick = () => {
            if (r.lat === null || r.lng === null) return;
            if (isSelected) {
              setSelectedDriverId(null);
              onDriverSelect?.(null);
            } else {
              setSelectedDriverId(r.driverId);
              onDriverSelect?.({ driverId: r.driverId, lat: r.lat, lng: r.lng, code: r.code, dist: r.dist, state: r.state });
            }
          };
          return (
            <tr
              key={r.driverId}
              onClick={handleRowClick}
              className={`transition-colors ${r.lat !== null ? 'cursor-pointer' : ''} ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/25 ring-1 ring-inset ring-blue-400/40'
                  : i % 2 === 0 ? 'bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-[#434343]/30'
                                : 'bg-gray-50 dark:bg-[#2d2d2d]/40 hover:bg-gray-100 dark:hover:bg-[#434343]/40'
              }`}
            >
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded text-white font-bold text-sm select-none" style={{ backgroundColor: STATE_BG[r.state] ?? '#52525b' }}>{r.code}</span>
              </td>
              <td className="px-3 py-2 text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {(() => {
                  const min = r.stateMinutes !== null ? `od ${r.stateMinutes} min` : '';
                  const pos = `pozycja ${r.queuePosition}`;
                  if (r.state === 'wolna')  return `Wolna na rejonie ${r.zone} ${min} ${pos}`.trim();
                  if (r.state === 'kursem') return `Kursem do Rejonu ${r.zone} ${min} ${pos}`.trim();
                  if (r.state === 'dojazd') return `Dojazd do rejonu ${r.zone} ${min} ${pos}`.trim();
                  return `${STATE_LABEL[r.state] ?? r.state} ${min} ${pos}`.trim();
                })()}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{r.zone}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {distStr}{timeStr ? <span className="ml-1.5 text-gray-400 dark:text-gray-300 text-xs">~{timeStr}</span> : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {(r.queryAnswer === '__CZEKAM__' || (r.queryAnswer === null && waitingDrivers.has(r.driverId)))
                  ? <span className="text-blue-500 font-semibold animate-pulse">Czekam...</span>
                  : r.queryAnswer === null
                    ? <span className="text-gray-400">—</span>
                    : r.queryAnswer === 'POMINIĘTO'
                      ? <span className="text-red-500 font-medium">brak odp.</span>
                      : r.queryAnswer === 'TERAZ'
                        ? <span className="text-green-600 font-semibold">Teraz</span>
                        : r.queryAnswer === 'DŁUGO'
                          ? <span className="text-amber-500 font-semibold">Długo</span>
                          : (() => {
                              const declared = parseInt(r.queryAnswer ?? '');
                              if (isNaN(declared)) return <span className="font-medium">{r.queryAnswer}</span>;
                              const elapsed = r.queryAnsweredAt
                                ? Math.floor((Date.now() - new Date(r.queryAnsweredAt).getTime()) / 60000)
                                : 0;
                              const remaining = declared - elapsed;
                              if (remaining <= 0) return <span className="text-red-500 font-semibold">już kończy</span>;
                              return <span className={`font-semibold tabular-nums ${remaining <= 2 ? 'text-red-500' : remaining <= 5 ? 'text-amber-500' : 'text-green-600'}`}>{remaining} min</span>;
                            })()}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setWaitingDrivers(prev => new Set([...prev, r.driverId]));
                    try {
                      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
                      await fetch(`${apiBase}/driver-queries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ driver_id: r.driverId, question: 'Za ile minut kończysz kurs?' }),
                      });
                    } catch { /* ignoruj */ }
                  }}
                  className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all"
                >
                  <Clock size={13} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// ─── GieldaRulesTab — tabela kandydatów wg reguł rejonu ──────────────────────
const GieldaRulesTab: React.FC<{
  zone:            number | null;
  pickupCoords:    { lat: number; lng: number } | null;
  onDriverSelect?: (driver: SelectedDriver | null) => void;
}> = ({ zone, pickupCoords, onDriverSelect }) => {
  type RuleRow = GpsRow & { ruleStep: number };

  const [rows, setRows]               = useState<RuleRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [sortKey, setSortKey]         = useState<keyof GpsRow | 'ruleStep'>('ruleStep');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [waitingDrivers, setWaitingDrivers]     = useState<Set<string>>(new Set());

  const handleSort = (key: keyof GpsRow | 'ruleStep') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const SortIcon = ({ col }: { col: keyof GpsRow | 'ruleStep' }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />;
  };

  const fetchData = useCallback(async () => {
    if (zone === null) { setRows([]); setLoading(false); return; }
    try {
      const [rulesRes, queuesRes, locsRes, answersRes] = await Promise.all([
        fetch(`/api/admin/zone-rules/${zone}`).then(r => r.json()),
        fetch('/api/queue/all').then(r => r.json()),
        fetch('/api/drivers/locations').then(r => r.json()),
        fetch('/api/driver-queries/recent-answers').then(r => r.json()).catch(() => ({ answers: [] })),
      ]);

      const rules: { searchZone: number | null; driverState: string; stepType: string; radiusKm: number | null }[] =
        (rulesRes.data ?? []).map((r: any) => ({
          searchZone:  r.searchZone  ?? r.search_zone  ?? null,
          driverState: r.driverState ?? r.driver_state,
          stepType:    r.stepType    ?? r.step_type    ?? 'zone',
          radiusKm:    r.radiusKm    ?? r.radius_km    ?? null,
        }));

      const queues: Record<string, any[]> = queuesRes.queues ?? {};
      const locs: any[] = locsRes.data ?? locsRes.drivers ?? [];

      const locMap: Record<string, { lat: number; lng: number }> = {};
      locs.forEach((d: any) => {
        if (d.latitude && d.longitude) locMap[d.id ?? d.driver_id] = { lat: d.latitude, lng: d.longitude };
      });

      const answerMap: Record<string, { answer: string; answeredAt: string | null }> = {};
      for (const a of (answersRes.answers ?? [])) {
        if (a.driver_id in answerMap) continue;
        if (a.status === 'pending') {
          answerMap[a.driver_id] = { answer: '__CZEKAM__', answeredAt: null };
        } else {
          answerMap[a.driver_id] = { answer: String(a.answer ?? ''), answeredAt: a.answered_at ?? null };
        }
      }

      const zoneMap: Record<number, any[]> = {};
      for (const [zStr, drivers] of Object.entries(queues)) zoneMap[parseInt(zStr)] = drivers;

      const result: RuleRow[] = [];
      const seen = new Set<string>();
      const zonePosCounter: Record<number, number> = {};

      // Jeśli brak reguł — użyj domyślnej (wolna w strefie zlecenia)
      const steps = rules.length > 0
        ? rules
        : [{ searchZone: zone, driverState: 'wolna', stepType: 'zone', radiusKm: null }];

      steps.forEach((rule, idx) => {
        const ruleStep = idx + 1;
        let candidates: { driverId: string; zone: number; raw: any }[] = [];

        if (rule.stepType === 'radius') {
          const km = rule.radiusKm ?? 1;
          for (const [zStr, drivers] of Object.entries(queues)) {
            const z = parseInt(zStr);
            for (const d of drivers) {
              const dId = d.driverId ?? d.id;
              if (seen.has(dId)) continue;
              if ((d.driverState ?? d.driver_state) !== rule.driverState) continue;
              const loc = locMap[dId];
              if (!loc || !pickupCoords) continue;
              if (haversineKm(pickupCoords.lat, pickupCoords.lng, loc.lat, loc.lng) > km) continue;
              candidates.push({ driverId: dId, zone: z, raw: d });
            }
          }
        } else {
          const sz = rule.searchZone;
          if (sz == null) return;
          for (const d of (zoneMap[sz] ?? [])) {
            const dId = d.driverId ?? d.id;
            if (seen.has(dId)) continue;
            if ((d.driverState ?? d.driver_state) !== rule.driverState) continue;
            candidates.push({ driverId: dId, zone: sz, raw: d });
          }
        }

        for (const { driverId, zone: z, raw: d } of candidates) {
          seen.add(driverId);
          if (!zonePosCounter[z]) zonePosCounter[z] = 1;
          const loc = locMap[driverId];
          const lat = loc?.lat ?? null;
          const lng = loc?.lng ?? null;
          const changedAt = d.stateChangedAt ?? d.state_changed_at ?? null;
          const stateMinutes = changedAt ? Math.floor((Date.now() - new Date(changedAt).getTime()) / 60000) : null;
          result.push({
            driverId,
            code:          d.driverCode ?? d.driver_code ?? '—',
            name:          d.name ?? '',
            state:         d.driverState ?? d.driver_state ?? '—',
            zone:          z,
            lat, lng,
            dist:          lat !== null && lng !== null && pickupCoords
                             ? haversineKm(lat, lng, pickupCoords.lat, pickupCoords.lng)
                             : null,
            stateMinutes,
            queuePosition: zonePosCounter[z]++,
            endsInMinutes:   null,
            queryAnswer:     answerMap[driverId]?.answer     ?? null,
            queryAnsweredAt: answerMap[driverId]?.answeredAt ?? null,
            ruleStep,
          });
        }
      });

      setRows(result);
      const first = result[0];
      if (first && first.lat !== null && first.lng !== null) {
        setSelectedDriverId(first.driverId);
        onDriverSelect?.({ driverId: first.driverId, lat: first.lat, lng: first.lng, code: first.code, dist: first.dist, state: first.state });
      } else {
        onDriverSelect?.(null);
      }
    } catch { setRows([]); onDriverSelect?.(null); }
    finally { setLoading(false); }
  }, [zone, pickupCoords]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-gray-400">Ładowanie...</div>;
  if (rows.length === 0) return <div className="flex items-center justify-center h-full text-sm text-gray-400">{zone === null ? 'Brak rejonu zlecenia' : 'Brak kandydatów wg reguł'}</div>;

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey as keyof RuleRow] ?? '';
    const bv = b[sortKey as keyof RuleRow] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'pl');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const thCls = "px-3 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors";

  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr className="sticky top-0 z-10 bg-white dark:bg-[#2d2d2d]">
          <th onClick={() => handleSort('ruleStep')} className={thCls}><span className="flex items-center gap-1">Krok<SortIcon col="ruleStep" /></span></th>
          <th onClick={() => handleSort('code')}     className={thCls}><span className="flex items-center gap-1">Taxi<SortIcon col="code" /></span></th>
          <th onClick={() => handleSort('state')}    className={thCls}><span className="flex items-center gap-1">Stan<SortIcon col="state" /></span></th>
          <th onClick={() => handleSort('zone')}     className={thCls}><span className="flex items-center gap-1">Rejon<SortIcon col="zone" /></span></th>
          <th onClick={() => handleSort('dist')}     className={thCls}><span className="flex items-center gap-1">Dojazd<SortIcon col="dist" /></span></th>
          <th className="px-3 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Kończy za</th>
          <th className="px-3 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Akcje</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const distStr = r.dist !== null ? (r.dist < 1 ? `${Math.round(r.dist * 1000)} m` : `${r.dist.toFixed(1)} km`) : '—';
          const timeStr = r.dist !== null ? (() => { const m = Math.round((r.dist / 30) * 60); return m < 1 ? '< 1 min' : `${m} min`; })() : '';
          const isSelected = r.driverId === selectedDriverId;
          return (
            <tr
              key={r.driverId}
              onClick={() => {
                if (r.lat === null || r.lng === null) return;
                if (isSelected) { setSelectedDriverId(null); onDriverSelect?.(null); }
                else { setSelectedDriverId(r.driverId); onDriverSelect?.({ driverId: r.driverId, lat: r.lat, lng: r.lng, code: r.code, dist: r.dist, state: r.state }); }
              }}
              className={`transition-colors ${r.lat !== null ? 'cursor-pointer' : ''} ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/25 ring-1 ring-inset ring-blue-400/40'
                  : i % 2 === 0 ? 'bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-[#434343]/30'
                                : 'bg-gray-50 dark:bg-[#2d2d2d]/40 hover:bg-gray-100 dark:hover:bg-[#434343]/40'
              }`}
            >
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-600 text-white font-bold text-xs select-none">{r.ruleStep}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded text-white font-bold text-sm select-none" style={{ backgroundColor: STATE_BG[r.state] ?? '#52525b' }}>{r.code}</span>
              </td>
              <td className="px-3 py-2 text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {(() => {
                  const min = r.stateMinutes !== null ? `od ${r.stateMinutes} min` : '';
                  const pos = `pozycja ${r.queuePosition}`;
                  if (r.state === 'wolna')  return `Wolna na rejonie ${r.zone} ${min} ${pos}`.trim();
                  if (r.state === 'kursem') return `Kursem do Rejonu ${r.zone} ${min} ${pos}`.trim();
                  if (r.state === 'dojazd') return `Dojazd do rejonu ${r.zone} ${min} ${pos}`.trim();
                  return `${STATE_LABEL[r.state] ?? r.state} ${min} ${pos}`.trim();
                })()}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{r.zone}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {distStr}{timeStr ? <span className="ml-1.5 text-gray-400 dark:text-gray-300 text-xs">~{timeStr}</span> : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem] text-gray-700 dark:text-gray-200">
                {(r.queryAnswer === '__CZEKAM__' || (r.queryAnswer === null && waitingDrivers.has(r.driverId)))
                  ? <span className="text-blue-500 font-semibold animate-pulse">Czekam...</span>
                  : r.queryAnswer === null ? <span className="text-gray-400">—</span>
                  : r.queryAnswer === 'POMINIĘTO' ? <span className="text-red-500 font-medium">brak odp.</span>
                  : r.queryAnswer === 'TERAZ'     ? <span className="text-green-600 font-semibold">Teraz</span>
                  : r.queryAnswer === 'DŁUGO'     ? <span className="text-amber-500 font-semibold">Długo</span>
                  : (() => {
                      const declared = parseInt(r.queryAnswer ?? '');
                      if (isNaN(declared)) return <span className="font-medium">{r.queryAnswer}</span>;
                      const elapsed = r.queryAnsweredAt
                        ? Math.floor((Date.now() - new Date(r.queryAnsweredAt).getTime()) / 60000)
                        : 0;
                      const remaining = declared - elapsed;
                      if (remaining <= 0) return <span className="text-red-500 font-semibold">już kończy</span>;
                      return <span className={`font-semibold tabular-nums ${remaining <= 2 ? 'text-red-500' : remaining <= 5 ? 'text-amber-500' : 'text-green-600'}`}>{remaining} min</span>;
                    })()}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[0.9375rem]">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setWaitingDrivers(prev => new Set([...prev, r.driverId]));
                    try {
                      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
                      await fetch(`${apiBase}/driver-queries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ driver_id: r.driverId, question: 'Za ile minut kończysz kurs?' }),
                      });
                    } catch { /* ignoruj */ }
                  }}
                  className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all"
                >
                  <Clock size={13} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// ─── Widget dynamicznego statusu zlecenia ──────────────────────────────────────
const OrderStatusWidget: React.FC<{
  status: string;
  updatedAtISO: string;
  assignedDriverId: string | null;
  pickupCoords: { lat: number; lng: number } | null;
  destCoords: { lat: number; lng: number } | null;
}> = ({ status, updatedAtISO, assignedDriverId, pickupCoords, destCoords }) => {
  const [elapsed, setElapsed] = React.useState(0);
  const [eta, setEta] = React.useState<number | null>(null);
  const [destZone, setDestZone] = React.useState<number | null>(null);

  React.useEffect(() => {
    const calc = () => {
      if (!updatedAtISO) return;
      const diff = Math.floor((Date.now() - new Date(updatedAtISO).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [updatedAtISO]);

  React.useEffect(() => {
    if (status !== 'in_progress' || !destCoords) { setDestZone(null); return; }
    const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
    fetch(`${apiBase}/zones/detect?lat=${destCoords.lat}&lng=${destCoords.lng}`)
      .then(r => r.json())
      .then(d => setDestZone(d.zone ?? null))
      .catch(() => {});
  }, [status, destCoords]);

  // ETA tylko dla statusu "accepted" (zlecenie przyjęte, kierowca jedzie po klienta)
  React.useEffect(() => {
    if (!assignedDriverId || !pickupCoords || status !== 'accepted') {
      setEta(null);
      return;
    }
    const fetchEta = async () => {
      try {
        const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
        const res = await fetch(`${apiBase}/drivers/locations`);
        const data = await res.json();
        const driver = (data.drivers || data.data || []).find((d: any) =>
          String(d.id) === String(assignedDriverId)
        );
        if (driver?.latitude && driver?.longitude) {
          const km = haversineKm(driver.latitude, driver.longitude, pickupCoords.lat, pickupCoords.lng);
          setEta(Math.max(1, Math.round(km / 25 * 60)));
        }
      } catch { /* ignoruj */ }
    };
    fetchEta();
    const iv = setInterval(fetchEta, 10000);
    return () => clearInterval(iv);
  }, [assignedDriverId, pickupCoords, status]);

  const fmtTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0
      ? `${m} min ${String(s).padStart(2,'0')} sek`
      : `${s} sek`;
  };

  type Cfg = { bg: string; border: string; text: string; label: string };
  const cfg: Cfg | null = (() => {
    switch (status) {
      case 'pending_driver':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-400 dark:border-yellow-600',
          text: 'text-gray-900 dark:text-gray-100',
          label: 'Zlecenie wysłane - oczekuje na akceptację kierowcy',
        };
      case 'accepted':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-300 dark:border-blue-600',
          text: 'text-gray-900 dark:text-gray-100',
          label: eta != null
            ? `Zlecenie przyjęte przez kierowcę - szacowany czas dojazdu: ${eta} min`
            : 'Zlecenie przyjęte przez kierowcę - obliczanie czasu dojazdu...',
        };
      case 'at_pickup':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-300 dark:border-orange-600',
          text: 'text-gray-900 dark:text-gray-100',
          label: `Taxi czeka pod adresem od ${fmtTime(elapsed)}`,
        };
      case 'in_progress':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-300 dark:border-green-600',
          text: 'text-gray-900 dark:text-gray-100',
          label: `Taxi w drodze z klientem${destZone != null ? ` do rejonu ${destZone}` : ''} od ${fmtTime(elapsed)}`,
        };
      case 'completed':
        return {
          bg: 'bg-gray-50 dark:bg-[#383838]/50',
          border: 'border-gray-300 dark:border-[#7a7a7a]',
          text: 'text-gray-900 dark:text-gray-100',
          label: 'Zlecenie zakończone',
        };
      default:
        return null;
    }
  })();

  if (!cfg) return null;

  return (
    <div className={`px-3.5 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
    </div>
  );
};

const DispatcherPanel: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [restartState, setRestartState] = useState<'idle' | 'restarting' | 'waiting' | 'done'>('idle');
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [restartLogs, setRestartLogs] = useState('');
  const restartLogsRef = useRef<HTMLPreElement>(null);
  const [clockDisplay, setClockDisplay] = useState(() => new Date().toTimeString().slice(0, 8));
  useEffect(() => {
    const id = setInterval(() => setClockDisplay(new Date().toTimeString().slice(0, 8)), 1000);
    return () => clearInterval(id);
  }, []);
  const [zones, setZones] = useState<Zone[]>([]);
  useEffect(() => { zoneService.getZones().then(setZones); }, []);
  const [gieldaModalOrder, setGieldaModalOrder] = useState<SubmittedOrder | null>(null);
  const [gieldaModalTab, setGieldaModalTab] = useState<'gps' | 'rules' | 'all'>('gps');
  const [orderInfoModal, setOrderInfoModal] = useState<SubmittedOrder | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderInfoTab, setOrderInfoTab] = useState<'dane' | 'logi'>('dane');
  const [orderInfoMapCoords, setOrderInfoMapCoords] = useState<{ pickup: { lat: number; lng: number } | null; dest: { lat: number; lng: number } | null }>({ pickup: null, dest: null });
  const [orderInfoDispatchTab, setOrderInfoDispatchTab] = useState<'gps' | 'rules' | 'all'>('all');
  const [orderInfoGpsDriver, setOrderInfoGpsDriver] = useState<SelectedDriver | null>(null);
  const [orderInfoDispatchError, setOrderInfoDispatchError] = useState<string | null>(null);
  const [orderInfoChatOpen, setOrderInfoChatOpen] = useState(false);
  const [allPreferences, setAllPreferences] = useState<Preference[]>([]);
  const [orderInfoLogs, setOrderInfoLogs] = useState<{ id: number; type: string; message: string; data: any; created_at: string }[]>([]);
  const [orderInfoLogsLoading, setOrderInfoLogsLoading] = useState(false);
  const [deleteReasonModal, setDeleteReasonModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [finishModal, setFinishModal] = useState(false);
  const [finishOrderTarget, setFinishOrderTarget] = useState<SubmittedOrder | null>(null);
  const [finishLoading, setFinishLoading] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [gieldaMapCoords, setGieldaMapCoords] = useState<{ pickup: { lat: number; lng: number } | null; dest: { lat: number; lng: number } | null }>({ pickup: null, dest: null });
  const [selectedGpsDriver, setSelectedGpsDriver] = useState<SelectedDriver | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('new-order');
  const [activeOrderTab, setActiveOrderTab] = useState('assigned');
  const [bottomSearch, setBottomSearch] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedZone, setDetectedZone] = useState<number | null>(null);
  const [orderPrefIds, setOrderPrefIds] = useState<number[]>([]);
  // Strefa efektywna dla DriverSuggestion — GPS lub ręcznie wpisana w polu Rejon
  // Pozwala typować kierowców nawet gdy auto-detekcja GPS nie zadziała
  const [rightPage, setRightPage] = useState<0 | 1>(0);
  const [topView, setTopView] = useState<'form' | 'orders' | 'chat' | 'console' | 'zdarzenia' | 'klienci'>('form');

  // ── Nowe zlecenie 2 — osobny stan formularza ────────────────────────────
  const [orderData2, setOrderData2] = useState<OrderData2>({
    customerPhone: '',
    customerName: '',
    pickupAddress: '',
    destinationAddress: '',
    taxiCount: 1,
    paymentMethod: 'cash',
    vehicleCategory: 'standard',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0].slice(0, 5),
    notes: '',
  });
  const [pickupCoords2, setPickupCoords2] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords2, setDestinationCoords2] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedZone2, setDetectedZone2] = useState<number | null>(null);
  const [rightPage2, setRightPage2] = useState<'drivers' | 'map'>('drivers');
  const [activeOrderTab2, setActiveOrderTab2] = useState('new');


  // ── Zadania ────────────────────────────────────────────────────────────────
  interface DispatcherTask {
    id: string;
    title: string;
    description: string | null;
    taxi_code: string | null;
    operator: string | null;
    order_id: string | null;
    order_number: string | null;
    status: 'new' | 'in_progress' | 'done' | 'dismissed';
    source: 'system' | 'manual';
    created_at: string;
    // Dołączone dane zlecenia (LEFT JOIN z orders)
    customer_name: string | null;
    customer_phone: string | null;
    pickup_address: string | null;
    destination_address: string | null;
    notes: string | null;
    cost: number | null;
    order_created_at: string | null;
  }
  const [tasks, setTasks] = useState<DispatcherTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DispatcherTask | null>(null);

  const fetchTasks = async () => {
    try {
      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
      const r = await fetch(`${apiBase}/tasks`);
      const data = await r.json();
      if (data.success) setTasks(data.data ?? []);
    } catch {}
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
      await fetch(`${apiBase}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchTasks();
    } catch {}
  };

  const deleteTask = async (taskId: string) => {
    try {
      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
      await fetch(`${apiBase}/tasks/${taskId}`, { method: 'DELETE' });
      if (selectedTask?.id === taskId) setSelectedTask(null);
      fetchTasks();
    } catch {}
  };

  // Pobieraj zadania: co 10s gdy na zakładce Zadania, co 30s w tle (dla badge)
  useEffect(() => {
    fetchTasks(); // pobierz od razu przy mount
    const iv = setInterval(fetchTasks, 30000); // tło: co 30s
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (activeOrderTab !== 'zadania') return;
    setTasksLoading(true);
    fetchTasks().finally(() => setTasksLoading(false));
    const iv = setInterval(fetchTasks, 10000); // aktywna zakładka: co 10s
    return () => clearInterval(iv);
  }, [activeOrderTab]);

  // ── Taxi list ──────────────────────────────────────────────────────────────
  interface TaxiInfo {
    id: string;
    driver_code: string;
    name: string;
    vehicle_brand: string | null;
    vehicle_model: string | null;
    registration_number: string | null;
    driver_state: string | null;
    current_zone: number | null;
    queue_position: number | null;
    is_online: number;
    active_order_address: string | null;
    active_order_number: string | null;
  }
  const TAXI_STATE_COLOR: Record<string, string> = {
    wolna:  '#007a1e',
    dojazd: '#991100',
    zajeta: '#4d2260',
    kursem: '#003d99',
  };
  const [taxiList, setTaxiList] = useState<TaxiInfo[]>([]);
  const [taxiLoading, setTaxiLoading] = useState(false);
  const [taxiSortKey, setTaxiSortKey] = useState<keyof TaxiInfo | null>(null);
  const [taxiSortDir, setTaxiSortDir] = useState<'asc' | 'desc'>('asc');
  const [driverModalId, setDriverModalId] = useState<string | null>(null);
  const [suspendModal, setSuspendModal] = useState<{ id: string; name: string; code: string } | null>(null);
  const [suspendHours, setSuspendHours] = useState<string>('24');
  const [suspendLoading, setSuspendLoading] = useState(false);

  const fetchTaxiList = async () => {
    try {
      const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
      const r = await fetch(`${apiBase}/drivers/all-info`);
      if (!r.ok) throw new Error('endpoint not available');
      const data = await r.json();
      if (data.success) setTaxiList(data.data ?? []);
    } catch {
      // Fallback: pobierz z podstawowego endpointu /api/drivers
      try {
        const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
        const r2 = await fetch(`${apiBase}/drivers`);
        const data2 = await r2.json();
        if (data2.success) {
          setTaxiList((data2.data ?? []).map((d: any) => ({
            id: d.id, driver_code: d.driver_code, name: d.name,
            vehicle_brand: null, vehicle_model: null, registration_number: null,
            driver_state: null, current_zone: null, queue_position: null,
            is_online: 0, active_order_address: null, active_order_number: null,
          })));
        }
      } catch {}
    }
  };

  useEffect(() => {
    if (activeOrderTab !== 'taxi') return;
    setTaxiLoading(true);
    fetchTaxiList().finally(() => setTaxiLoading(false));
    const iv = setInterval(fetchTaxiList, 10000);
    return () => clearInterval(iv);
  }, [activeOrderTab]);

  const [submittedOrders, setSubmittedOrders] = useState<SubmittedOrder[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [dispatchingOrderId, setDispatchingOrderId] = useState<string | null>(null);
  const [driverCodeInput, setDriverCodeInput] = useState('');
  const [formSuggestedDriverCode, setFormSuggestedDriverCode] = useState('');
  const [typowanyDriverCode, setTypowanyDriverCode] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [orderSortKey, setOrderSortKey] = useState<keyof SubmittedOrder | null>(null);
  const [orderSortDir, setOrderSortDir] = useState<'asc' | 'desc'>('asc');
  const [gieldaDispatchError, setGieldaDispatchError] = useState<string | null>(null);
  const [isGieldaDispatching, setIsGieldaDispatching] = useState(false);
  const [nextOrderConfirm, setNextOrderConfirm] = useState<{ driverCode: string; driverName: string } | null>(null);

  // Polling zleceń z bazy danych
  const fetchOrders = React.useCallback(async () => {
    const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
    const ACTIVE_STATUSES = 'scheduled,pending,market,pending_driver,accepted,at_pickup,in_progress,completed';
    try {
      const res = await fetch(`${apiBase}/orders?statuses=${ACTIVE_STATUSES}&limit=200`);
      const data = await res.json();
      if (!data.success || !data.data) return;
      const mapped: SubmittedOrder[] = data.data.map((o: any) => ({
        orderId: String(o.id),
        orderNumber: o.order_number ?? '',
        customerName: o.customer_name ?? '',
        customerPhone: o.customer_phone ?? '',
        pickupAddress: o.pickup_address ?? '',
        destinationAddress: o.destination_address ?? '',
        pickupRegionId: o.pickup_region_id ?? null,
        vehicleCategory: o.vehicle_category ?? '',
        paymentMethod: o.payment_method ?? '',
        taxiCount: o.taxi_count ?? 1,
        clientCode: null,
        assignedDriver: o.driver_code ? {
          id: o.driver_id ?? '',
          name: o.driver_name ?? '',
          code: o.driver_code,
          vehicleBrand: o.vehicle_brand ?? '',
          vehicleModel: o.vehicle_model ?? '',
          vehicleColor: o.vehicle_color ?? '',
          registrationNumber: o.registration_number ?? '',
          sideNumber: o.side_number ?? '',
        } : null,
        scheduledDate: o.scheduled_date ?? '',
        scheduledTime: o.scheduled_time ?? '',
        createdAt: o.created_at ? new Date(o.created_at).toTimeString().slice(0, 5) : '',
        createdAtISO: o.created_at ?? '',
        updatedAtISO: o.updated_at ?? '',
        notes: o.notes ?? null,
        operator: o.operator ?? o.created_by ?? null,
        orderType: o.order_type ?? 'standard',
        clientInfo: o.client_info ?? null,
        preferenceIds: (() => { try { return o.preference_ids ? (typeof o.preference_ids === 'string' ? JSON.parse(o.preference_ids) : o.preference_ids) : null; } catch { return null; } })(),
        cost: o.cost ?? null,
        status: o.status as SubmittedOrder['status'],
      }));
      setSubmittedOrders(mapped);
    } catch {
      // serwer niedostępny
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const iv = setInterval(fetchOrders, 5000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  useEffect(() => {
    preferencesService.getAll().then(setAllPreferences).catch(() => {});
  }, []);

  const handleRestartServer = async () => {
    if (restartState !== 'idle') return;
    const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';

    // Otwórz modal i wyczyść poprzednie logi
    setRestartLogs('Łączenie z serwerem...\n');
    setRestartModalOpen(true);
    setRestartState('restarting');

    try {
      await fetch(`${apiBase}/restart`, { method: 'POST' });
    } catch {
      // Serwer mógł zakończyć połączenie zanim odpowiedział — to normalne
    }

    setRestartState('waiting');

    // Polling logów co 400ms
    let lastLogLength = 0;
    const logPoll = setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}/restart-console`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) {
          const data = await r.json();
          if (data.content && data.content.length !== lastLogLength) {
            lastLogLength = data.content.length;
            setRestartLogs(data.content);
            // Auto-scroll do końca
            setTimeout(() => {
              if (restartLogsRef.current) {
                restartLogsRef.current.scrollTop = restartLogsRef.current.scrollHeight;
              }
            }, 50);
          }
        }
      } catch { /* serwer jeszcze nie żyje */ }
    }, 400);

    // Odpytuj /health co 800ms aż serwer wróci (maks 45s)
    const start = Date.now();
    const healthPoll = setInterval(async () => {
      if (Date.now() - start > 45_000) {
        clearInterval(healthPoll);
        clearInterval(logPoll);
        setRestartLogs(prev => prev + '\n[BŁĄD] Przekroczono czas oczekiwania (45s). Sprawdź serwer ręcznie.\n');
        setRestartState('idle');
        return;
      }
      try {
        const r = await fetch(`${apiBase.replace('/api', '')}/health`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) {
          clearInterval(healthPoll);
          clearInterval(logPoll);
          // Pobierz ostatnie logi po sukcesie
          try {
            const lr = await fetch(`${apiBase}/restart-console`, { signal: AbortSignal.timeout(2000) });
            if (lr.ok) {
              const ld = await lr.json();
              if (ld.content) setRestartLogs(ld.content + '\n✓ Serwer uruchomiony i gotowy!\n');
            }
          } catch {}
          setTimeout(() => {
            if (restartLogsRef.current) {
              restartLogsRef.current.scrollTop = restartLogsRef.current.scrollHeight;
            }
          }, 50);
          setRestartState('done');
          setTimeout(() => setRestartState('idle'), 3000);
        }
      } catch { /* serwer jeszcze nie działa */ }
    }, 800);
  };

  useEffect(() => {
    console.log('[DispatcherPanel] Mounted - forcing config refresh');
    dataSourceService.refreshConfig();
    const debugInfo = dataSourceService.getDebugInfo();
    console.log('[DispatcherPanel] Current data source:', debugInfo);
  }, []);

  // Broadcast address pins to map page via localStorage (cross-tab, per-user key)
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`dispatch_address_pin_${user.id}`, JSON.stringify({
      pickup: pickupCoords,
      destination: destinationCoords,
      ts: Date.now(),
    }));
  }, [pickupCoords, destinationCoords, user]);

  const [orderData, setOrderData] = useState<OrderData>({
    customerPhone: '',
    customerName: '',
    companyName: '',
    pickupAddress: '',
    destinationAddress: '',
    taxiCount: 1,
    paymentMethod: 'cash',
    vehicleCategory: 'standard',
    orderType: 'standard',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0].slice(0, 5),
    notes: '',
    clientInfo: '',
    internalInfo: '',
    discount: '',
    travelTime: '',
    quote: '',
    contract: '',
    pickupZone: '',
    destinationZone: '',
  });

  // Strefa dla DriverSuggestion — GPS (detectedZone) ma priorytet.
  // Jeśli GPS nie wykrył — parsuj numer z ręcznie wpisanego pola Rejon (np. "R-3" lub "3").
  const zoneForDriverSuggestion = useMemo<number | null>(() => {
    if (detectedZone !== null) return detectedZone;
    const raw = (orderData as any).pickupZone as string | undefined;
    if (!raw) return null;
    const m = raw.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  }, [detectedZone, (orderData as any).pickupZone]);

  const lastAutoTime = useRef(new Date().toTimeString().slice(0, 5));
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date().toTimeString().slice(0, 5);
      if (now !== lastAutoTime.current) {
        const prev = lastAutoTime.current;
        lastAutoTime.current = now;
        setOrderData(d => d.time === prev ? { ...d, time: now } : d);
        setOrderData2(d => d.time === prev ? { ...d, time: now } : d);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!user || user.role !== 'dispatcher') {
    return <Navigate to="/login" />;
  }

  const handleOrderCreated = (result: CreateOrderResult, orderData: OrderData) => {
    if (!result.success || !result.orderId || !result.orderNumber) return;
    const now = new Date();
    const newOrder: SubmittedOrder = {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      pickupAddress: orderData.pickupAddress,
      destinationAddress: orderData.destinationAddress,
      pickupRegionId: result.pickupRegionId ?? null,
      vehicleCategory: orderData.vehicleCategory,
      paymentMethod: orderData.paymentMethod,
      taxiCount: orderData.taxiCount,
      clientCode: result.clientCode ?? null,
      assignedDriver: result.assignedDriver ?? null,
      scheduledDate: orderData.date,
      scheduledTime: orderData.time,
      createdAt: now.toTimeString().slice(0, 5),
      createdAtISO: now.toISOString(),
      updatedAtISO: now.toISOString(),
      notes: (orderData as any).notes ?? null,
      operator: user?.employeeId ?? user?.name ?? null,
      orderType: (orderData as any).orderType ?? 'standard',
      clientInfo: (orderData as any).clientInfo ?? null,
      preferenceIds: (orderData as any).preferenceIds ?? null,
      cost: null,
      status: result.assignedDriver
        ? 'pending_driver'
        : orderData.orderType === 'scheduled'
          ? 'scheduled'
          : 'pending',
    };
    setSubmittedOrders(prev => [newOrder, ...prev]);
    setActiveOrderTab(result.assignedDriver
      ? 'assigned'
      : orderData.orderType === 'scheduled'
        ? 'scheduled'
        : 'pending',
    );
  };

  const handleOrderCreated2 = (result: CreateOrderResult, data: OrderData2) => {
    if (!result.success || !result.orderId || !result.orderNumber) return;
    const now = new Date();
    const newOrder: SubmittedOrder = {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      pickupAddress: data.pickupAddress,
      destinationAddress: data.destinationAddress,
      pickupRegionId: result.pickupRegionId ?? null,
      vehicleCategory: data.vehicleCategory,
      paymentMethod: data.paymentMethod,
      taxiCount: data.taxiCount,
      clientCode: result.clientCode ?? null,
      assignedDriver: result.assignedDriver ?? null,
      scheduledDate: data.date,
      scheduledTime: data.time,
      createdAt: now.toTimeString().slice(0, 5),
      createdAtISO: now.toISOString(),
      updatedAtISO: now.toISOString(),
      notes: data.notes ?? null,
      operator: user?.employeeId ?? user?.name ?? null,
      status: result.assignedDriver ? 'pending_driver' : 'pending',
    };
    setSubmittedOrders(prev => [newOrder, ...prev]);
    setActiveOrderTab2(result.assignedDriver ? 'assigned' : 'pending');
  };

  const handleDispatch = async (orderId: string) => {
    const code = driverCodeInput.trim().toUpperCase();
    if (!code) return;
    setIsDispatching(true);
    setDispatchError(null);
    const result = await dispatchOrderToDriver(orderId, code);
    setIsDispatching(false);
    if (result.success) {
      const code = driverCodeInput.trim().toUpperCase();
      setSubmittedOrders(prev => prev.map(o =>
        o.orderId !== orderId ? o : {
          ...o,
          status: 'pending_driver' as const,
          assignedDriver: { id: result.driverId ?? '', name: result.driverName ?? '', code },
        }
      ));
      setDispatchingOrderId(null);
      setDriverCodeInput('');
      setExpandedOrderId(null);
      setActiveOrderTab('assigned');
    } else {
      setDispatchError(result.error ?? 'Błąd wydawania zlecenia.');
    }
  };

  const handleGieldaForceDispatch = async (driver: QueueDriver) => {
    if (!gieldaModalOrder || isGieldaDispatching) return;
    setIsGieldaDispatching(true);
    setGieldaDispatchError(null);
    const result = await dispatchOrderToDriver(gieldaModalOrder.orderId, driver.driverCode);
    setIsGieldaDispatching(false);
    if (result.success) {
      setSubmittedOrders(prev => prev.map(o =>
        o.orderId !== gieldaModalOrder.orderId ? o : {
          ...o,
          status: 'pending_driver' as const,
          assignedDriver: { id: result.driverId ?? '', name: result.driverName ?? '', code: driver.driverCode }
        }
      ));
      setGieldaModalOrder(null);
      setGieldaDispatchError(null);
      setActiveOrderTab('assigned');
    } else {
      setGieldaDispatchError(result.error ?? 'Błąd wydawania zlecenia.');
    }
  };

  useEffect(() => {
    setSelectedGpsDriver(null);
    if (!gieldaModalOrder) { setGieldaMapCoords({ pickup: null, dest: null }); return; }
    const geocode = async (address: string) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`);
        const data = await res.json();
        if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      } catch { /* ignore */ }
      return null;
    };
    setGieldaMapCoords({ pickup: null, dest: null });
    Promise.all([
      gieldaModalOrder.pickupAddress ? geocode(gieldaModalOrder.pickupAddress) : Promise.resolve(null),
      gieldaModalOrder.destinationAddress ? geocode(gieldaModalOrder.destinationAddress) : Promise.resolve(null),
    ]).then(([pickup, dest]) => setGieldaMapCoords({ pickup, dest }));
  }, [gieldaModalOrder]);

  // Synchronizuj modal z aktualnym stanem zleceń (polling co 5s może zaktualizować dane)
  useEffect(() => {
    if (!orderInfoModal) return;
    const updated = submittedOrders.find(o => o.orderId === orderInfoModal.orderId);
    if (updated && (
      updated.operator     !== orderInfoModal.operator ||
      updated.status       !== orderInfoModal.status ||
      updated.updatedAtISO !== orderInfoModal.updatedAtISO ||
      updated.assignedDriver?.id !== orderInfoModal.assignedDriver?.id
    )) {
      setOrderInfoModal(updated);
    }
  }, [submittedOrders]);

  useEffect(() => {
    if (!orderInfoModal) {
      setOrderInfoLogs([]);
      setOrderInfoTab('dane');
      return;
    }
    // Pobierz logi przy otwarciu modalu
    setOrderInfoLogsLoading(true);
    fetch(`/api/orders/${orderInfoModal.orderId}/logs`)
      .then(r => r.json())
      .then(d => { setOrderInfoLogs(d.logs ?? []); })
      .catch(() => { setOrderInfoLogs([]); })
      .finally(() => setOrderInfoLogsLoading(false));
  }, [orderInfoModal?.orderId]);

  // ── Logi zlecenia: syntetyczne + z bazy, posortowane ──────────────────────
  const allOrderInfoLogs = React.useMemo(() => {
    const o2 = orderInfoModal;
    if (!o2) return [];
    const synth: { id: number; type: string; message: string; data: any; created_at: string }[] = [];
    if (o2.createdAtISO) {
      synth.push({
        id: -1, type: 'created',
        message: `Zlecenie utworzone przez dyspozytora ${o2.operator || '—'} | status zlecenia: ${STATUS_MAP[o2.status]?.label ?? o2.status}`,
        data: null,
        created_at: o2.createdAtISO,
      });
    }
    if (!orderInfoLogs.some(l => l.type === 'dispatch')) {
      const region = o2.pickupRegionId;
      synth.push({
        id: -2, type: 'dispatch',
        message: o2.assignedDriver
          ? `System wytypował kierowcę według reguły domyślnej dla rejonu ${region ?? '—'}`
          : `System nie znalazł dostępnego kierowcy według reguły domyślnej dla rejonu ${region ?? '—'}`,
        data: {
          kroki: o2.assignedDriver
            ? [{ krok: 1, rejon: region, stan: 'wolna', wynik: 'znaleziono', kierowca: o2.assignedDriver.code }]
            : [{ krok: 1, rejon: region, stan: 'wolna', wynik: 'brak' }],
        },
        created_at: o2.createdAtISO,
      });
    }
    return [...synth, ...orderInfoLogs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [orderInfoModal, orderInfoLogs]);

  useEffect(() => {
    if (!orderInfoModal) { setOrderInfoMapCoords({ pickup: null, dest: null }); return; }
    const geocode = async (address: string) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`);
        const data = await res.json();
        if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      } catch { /* ignore */ }
      return null;
    };
    setOrderInfoMapCoords({ pickup: null, dest: null });
    Promise.all([
      orderInfoModal.pickupAddress ? geocode(orderInfoModal.pickupAddress) : Promise.resolve(null),
      orderInfoModal.destinationAddress ? geocode(orderInfoModal.destinationAddress) : Promise.resolve(null),
    ]).then(([pickup, dest]) => setOrderInfoMapCoords({ pickup, dest }));
  }, [orderInfoModal]);

  const scheduledOrders = submittedOrders.filter(o => o.status === 'scheduled');
  const pendingOrders   = submittedOrders.filter(o => o.status === 'pending');
  const gieldaOrders    = submittedOrders.filter(o => o.status === 'market');
  const assignedOrders  = submittedOrders.filter(o => ['pending_driver', 'accepted', 'at_pickup', 'in_progress', 'completed'].includes(o.status));

  const renderPendingTable = (orders: SubmittedOrder[]) => {
    if (orders.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
          Brak oczekujących zleceń
        </div>
      );
    }
    const now = Date.now();
    return (
      <div className="overflow-auto -mt-4 -mx-4">
        <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
          <thead>
            <tr className="bg-white dark:bg-[#202020]">
              {(['Data i godzina przyjęcia', 'Przyjął', 'Rejon', 'Adres z', 'Adres do', 'Uwagi', 'Oczekuje', 'Akcje'] as string[]).map(label => (
                <th key={label} className={`${label === 'Data i godzina przyjęcia' ? 'pl-2 pr-0' : label === 'Przyjął' ? 'pl-0 pr-6' : label === 'Rejon' ? 'pl-4 pr-6' : label === 'Adres z' ? 'pl-4 pr-2' : label === 'Adres do' ? 'pl-2 pr-0' : label === 'Uwagi' ? 'pl-0 pr-2' : label === 'Oczekuje' ? 'pl-[180px] pr-2' : label === 'Akcje' ? 'p-0' : 'px-2'} ${label === 'Akcje' ? '' : 'py-2.5'} align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]`}>
                  {label === 'Akcje' ? (
                    <div className="flex justify-end pr-2 py-2.5">
                      <span className="w-[72px]">Akcje</span>
                    </div>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const createdDate = order.createdAtISO ? new Date(order.createdAtISO) : null;
              const dateStr = createdDate
                ? `${String(createdDate.getDate()).padStart(2, '0')}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${createdDate.getFullYear()}  ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`
                : order.createdAt || '—';
              const diffMin = createdDate ? Math.floor((now - createdDate.getTime()) / 60000) : null;
              const waitStr = diffMin != null
                ? diffMin < 60
                  ? `${diffMin} min`
                  : `${Math.floor(diffMin / 60)} h ${diffMin % 60} min`
                : '—';
              const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
              return (
                <tr key={order.orderId} className={`${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors`}>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-2 pr-0 py-2.5 whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                    {dateStr}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-0 pr-6 py-2.5 whitespace-nowrap text-gray-900 dark:text-white">
                    {order.operator || <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-4 pr-6 py-2.5 whitespace-nowrap">
                    {order.pickupRegionId != null
                      ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.pickupRegionId}</span>
                      : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-4 pr-2 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[220px]">
                    <span className="block truncate" title={order.pickupAddress}>{order.pickupAddress || '—'}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-2 pr-0 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[140px]">
                    <span className="block truncate" title={order.destinationAddress}>{order.destinationAddress || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-0 pr-2 py-2.5 text-gray-700 dark:text-gray-200 max-w-[200px]">
                    <span className="block truncate" title={order.notes ?? ''}>{order.notes || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-[180px] pr-2 py-2.5 whitespace-nowrap tabular-nums font-semibold text-orange-600 dark:text-orange-400">
                    {waitStr}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2 text-[0.9375rem] whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setGieldaModalOrder(order); setGieldaModalTab('gps'); }} className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all">
                        <Send size={16} />
                      </button>
                      <button onClick={() => setOrderInfoModal(order)} className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all">
                        <Info size={22} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderScheduledTable = (orders: SubmittedOrder[]) => {
    if (orders.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
          Brak zleceń terminowych
        </div>
      );
    }
    const tdBase = 'bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] py-2.5 whitespace-nowrap';
    return (
      <div className="overflow-auto -mt-4 -mx-4">
        <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
          <thead>
            <tr className="bg-white dark:bg-[#202020]">
              <th className="pl-2 pr-4 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Data i godz. odbioru</th>
              <th className="pl-0 pr-4 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Do wysyłki</th>
              <th className="pl-0 pr-6 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Przyjął</th>
              <th className="pl-4 pr-6 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Rejon</th>
              <th className="pl-4 pr-2 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Adres z</th>
              <th className="pl-2 pr-4 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Adres do</th>
              <th className="pl-0 pr-4 py-2.5 text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Uwagi</th>
              <th className="p-0 border-b border-gray-200 dark:border-[#7a7a7a]">
                <div className="flex justify-end pr-2 py-2.5"><span className="w-[72px] text-left text-sm font-semibold text-gray-900 dark:text-white">Akcje</span></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              // Data: weź pierwsze 10 znaków (YYYY-MM-DD) i odwróć → DD-MM-YYYY
              const pickupDate = order.scheduledDate
                ? order.scheduledDate.slice(0, 10).split('-').reverse().join('-')
                : <span className="text-gray-300 dark:text-gray-300">—</span>;
              // Czas: HH:MM:SS → HH:MM (usuń sekundy jeśli są)
              const pickupTime = order.scheduledTime
                ? order.scheduledTime.slice(0, 5)
                : <span className="text-gray-300 dark:text-gray-300">—</span>;
              // Do wysyłki: czas pozostały do momentu wysyłki (scheduledDateTime - dispatchMins - teraz)
              const zone = order.pickupRegionId != null ? zones.find(z => z.number === order.pickupRegionId) : null;
              const dispatchMins = zone?.scheduledDispatchMinutes ?? 10;
              const doWysylki: { label: string; overdue: boolean } | null = (() => {
                if (!order.scheduledDate || !order.scheduledTime) return null;
                const dateStr = order.scheduledDate.slice(0, 10);
                const timeStr = order.scheduledTime.slice(0, 5);
                const dispatchAt = new Date(`${dateStr}T${timeStr}:00`).getTime() - dispatchMins * 60000;
                const diffMs = dispatchAt - Date.now();
                const overdue = diffMs < 0;
                const absDiff = Math.abs(diffMs);
                const totalMins = Math.floor(absDiff / 60000);
                const days = Math.floor(totalMins / 1440);
                const hours = Math.floor((totalMins % 1440) / 60);
                const mins = totalMins % 60;
                let label: string;
                if (days > 0) label = `${days}d ${hours}h ${mins}m`;
                else if (hours > 0) label = `${hours}h ${mins}m`;
                else label = `${mins}m`;
                return { label, overdue };
              })();
              const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
              return (
                <tr key={order.orderId} className={`${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors`}>
                  <td className={`${tdBase} pl-2 pr-4 tabular-nums text-gray-900 dark:text-white`}>
                    {order.scheduledDate || order.scheduledTime
                      ? <><span>{order.scheduledDate ? order.scheduledDate.slice(0, 10).split('-').reverse().join('-') : '—'}</span>{' '}<span>{order.scheduledTime ? order.scheduledTime.slice(0, 5) : '—'}</span></>
                      : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className={`${tdBase} pl-0 pr-4 tabular-nums font-semibold ${doWysylki ? (doWysylki.overdue ? 'text-red-600 dark:text-red-400' : 'text-orange-500 dark:text-orange-400') : 'text-gray-300 dark:text-gray-300'}`}>
                    {doWysylki ? (doWysylki.overdue ? `-${doWysylki.label}` : doWysylki.label) : '—'}
                  </td>
                  <td className={`${tdBase} pl-0 pr-6 text-gray-900 dark:text-white`}>
                    {order.operator || <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className={`${tdBase} pl-4 pr-6`}>
                    {order.pickupRegionId != null
                      ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.pickupRegionId}</span>
                      : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className={`${tdBase} pl-4 pr-2 font-semibold text-gray-900 dark:text-white max-w-[220px]`}>
                    <span className="block truncate" title={order.pickupAddress}>{order.pickupAddress || '—'}</span>
                  </td>
                  <td className={`${tdBase} pl-2 pr-4 font-semibold text-gray-900 dark:text-white max-w-[140px]`}>
                    <span className="block truncate" title={order.destinationAddress}>{order.destinationAddress || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className={`${tdBase} pl-0 pr-4 text-gray-700 dark:text-gray-200 max-w-[200px]`}>
                    <span className="block truncate" title={order.notes ?? ''}>{order.notes || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className={`${tdBase} px-2 text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setGieldaModalOrder(order); setGieldaModalTab('gps'); }} className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all">
                        <Send size={16} />
                      </button>
                      <button onClick={() => setOrderInfoModal(order)} className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all">
                        <Info size={22} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderGieldaTable = (orders: SubmittedOrder[]) => {
    if (orders.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
          Brak zleceń na giełdzie
        </div>
      );
    }
    const now = Date.now();
    return (
      <div className="overflow-auto -mt-4 -mx-4">
        <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
          <thead>
            <tr className="bg-white dark:bg-[#202020]">
              {(['Data i godzina przyjęcia', 'Przyjął', 'Rejon', 'Adres z', 'Adres do', 'Uwagi', 'Na giełdzie', 'Akcje'] as string[]).map(label => (
                <th key={label} className={`${label === 'Data i godzina przyjęcia' ? 'pl-2 pr-0' : label === 'Przyjął' ? 'pl-0 pr-6' : label === 'Rejon' ? 'pl-4 pr-6' : label === 'Adres z' ? 'pl-4 pr-2' : label === 'Adres do' ? 'pl-2 pr-0' : label === 'Uwagi' ? 'pl-0 pr-2' : label === 'Na giełdzie' ? 'pl-[180px] pr-2' : label === 'Akcje' ? 'p-0' : 'px-2'} ${label === 'Akcje' ? '' : 'py-2.5'} align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]`}>
                  {label === 'Akcje' ? (
                    <div className="flex justify-end pr-2 py-2.5">
                      <span className="w-[72px]">Akcje</span>
                    </div>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const createdDate = order.createdAtISO ? new Date(order.createdAtISO) : null;
              const dateStr = createdDate
                ? `${String(createdDate.getDate()).padStart(2, '0')}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${createdDate.getFullYear()}  ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`
                : order.createdAt || '—';
              // Dla zleceń terminowych czas "na giełdzie" liczymy od momentu wpadnięcia (scheduledTime - dispatchMins), nie od createdAt
              const marketEntryTime = (() => {
                if (order.scheduledDate && order.scheduledTime) {
                  const zoneG = order.pickupRegionId != null ? zones.find(z => z.number === order.pickupRegionId) : null;
                  const dMins = zoneG?.scheduledDispatchMinutes ?? 10;
                  return new Date(`${order.scheduledDate.slice(0, 10)}T${order.scheduledTime.slice(0, 5)}:00`).getTime() - dMins * 60000;
                }
                return createdDate ? createdDate.getTime() : null;
              })();
              const diffMin = marketEntryTime != null ? Math.floor((now - marketEntryTime) / 60000) : null;
              const marketStr = diffMin != null
                ? diffMin < 60
                  ? `${diffMin} min`
                  : `${Math.floor(diffMin / 60)} h ${diffMin % 60} min`
                : '—';
              const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
              return (
                <tr key={order.orderId} className={`${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors`}>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-2 pr-0 py-2.5 whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                    {dateStr}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-0 pr-6 py-2.5 whitespace-nowrap text-gray-900 dark:text-white">
                    {order.operator || <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-4 pr-6 py-2.5 whitespace-nowrap">
                    {order.pickupRegionId != null
                      ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.pickupRegionId}</span>
                      : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-4 pr-2 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[220px]">
                    <span className="block truncate" title={order.pickupAddress}>{order.pickupAddress || '—'}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-2 pr-0 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[140px]">
                    <span className="block truncate" title={order.destinationAddress}>{order.destinationAddress || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-0 pr-2 py-2.5 text-gray-700 dark:text-gray-200 max-w-[200px]">
                    <span className="block truncate" title={order.notes ?? ''}>{order.notes || <span className="text-gray-300 dark:text-gray-300">—</span>}</span>
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] pl-[180px] pr-2 py-2.5 whitespace-nowrap tabular-nums font-semibold text-red-600 dark:text-red-400">
                    {marketStr}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2 text-[0.9375rem] whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setGieldaModalOrder(order); setGieldaModalTab('gps'); }} className="inline-flex items-center justify-center w-8 h-6 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all">
                        <Send size={16} />
                      </button>
                      <button onClick={() => setOrderInfoModal(order)} className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all">
                        <Info size={22} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAssignedTable = (orders: SubmittedOrder[]) => {
    if (orders.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
          Brak wydanych zleceń
        </div>
      );
    }
    return (
      <div className="overflow-auto -mt-4 -mx-4">
        <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
          <thead>
            <tr className="bg-white dark:bg-[#202020]">
              {['Data i godzina przyjęcia', 'Stan zlecenia', 'Przyjął', 'Rejon', 'Adres z', 'Adres do', 'Taksówka', 'Uwagi', ''].map(h => (
                <th key={h} className="px-2 py-2.5 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
              const statusInfo = STATUS_MAP[order.status];
              // Formatuj pełną datę i godzinę z createdAtISO
              const createdDt = order.createdAtISO ? new Date(order.createdAtISO) : null;
              const createdLabel = createdDt
                ? `${String(createdDt.getDate()).padStart(2,'0')}.${String(createdDt.getMonth()+1).padStart(2,'0')} ${String(createdDt.getHours()).padStart(2,'0')}:${String(createdDt.getMinutes()).padStart(2,'0')}`
                : '—';
              return (
                <tr key={order.orderId} className={`transition-colors ${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40`}>
                  {/* Data i godzina przyjęcia */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                    {createdLabel}
                  </td>
                  {/* Stan zlecenia */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 whitespace-nowrap">
                    {statusInfo
                      ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  {/* Przyjął — dyspozytor */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-200">
                    {order.operator || <span className="text-gray-400 dark:text-gray-300">—</span>}
                  </td>
                  {/* Rejon */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 whitespace-nowrap tabular-nums">
                    {order.pickupRegionId != null
                      ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.pickupRegionId}</span>
                      : <span className="text-gray-400 dark:text-gray-300">—</span>
                    }
                  </td>
                  {/* Adres z */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[200px]">
                    <span className="block truncate" title={order.pickupAddress}>{order.pickupAddress || '—'}</span>
                  </td>
                  {/* Adres do */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 text-gray-700 dark:text-gray-200 max-w-[180px]">
                    <span className="block truncate" title={order.destinationAddress}>{order.destinationAddress || '—'}</span>
                  </td>
                  {/* Taksówka — kod kierowcy */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 whitespace-nowrap">
                    {order.assignedDriver
                      ? <span className="inline-flex items-center justify-center px-2 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none" style={{ backgroundColor: STATE_BG[order.status] ?? undefined }}>{order.assignedDriver.code}</span>
                      : <span className="text-gray-400 dark:text-gray-300">—</span>
                    }
                  </td>
                  {/* Uwagi */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2.5 text-gray-500 dark:text-gray-300 max-w-[160px]">
                    {order.notes
                      ? <span className="block truncate italic" title={order.notes}>{order.notes}</span>
                      : <span className="text-gray-300 dark:text-gray-600">—</span>
                    }
                  </td>
                  {/* Akcje */}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setOrderInfoModal(order)} className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all">
                      <Info size={22} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderOrdersTable = (orders: SubmittedOrder[], showDriver: boolean, emptyLabel: string, expandable = false, showActions = false) => {
    if (orders.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
          {emptyLabel}
        </div>
      );
    }
    const colCount = expandable ? 7 : showDriver ? 11 : 10;
    const handleSort = (key: keyof SubmittedOrder) => {
      if (orderSortKey === key) setOrderSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setOrderSortKey(key); setOrderSortDir('asc'); }
    };
    const SortIcon = ({ col }: { col: keyof SubmittedOrder }) => {
      if (orderSortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
      return orderSortDir === 'asc'
        ? <ChevronUp className="w-3 h-3 text-blue-500" />
        : <ChevronDown className="w-3 h-3 text-blue-500" />;
    };
    const SortTh = ({ col, label, className }: { col: keyof SubmittedOrder; label: string; className?: string }) => (
      <th
        onClick={() => handleSort(col)}
        className={`px-2 py-2.5 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors border-b border-gray-200 dark:border-[#7a7a7a] ${className ?? ''}`}
      >
        <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
      </th>
    );
    const sorted = [...orders].sort((a, b) => {
      if (!orderSortKey) return 0;
      const av = a[orderSortKey] ?? '';
      const bv = b[orderSortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'pl');
      return orderSortDir === 'asc' ? cmp : -cmp;
    });
    return (
      <div className="overflow-auto -mt-4 -mx-4">
      <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
        <thead>
          <tr className="bg-white dark:bg-[#202020]">
            <SortTh col="orderNumber" label="Nr" />
            {!expandable && <SortTh col="customerName" label="Klient" />}
            <SortTh col="customerPhone" label="Telefon" />
            <SortTh col="pickupAddress" label="Odbiór" />
            {!expandable && <SortTh col="destinationAddress" label="Cel" />}
            <SortTh col="pickupRegionId" label="Rejon" />
            <SortTh col="vehicleCategory" label="Kat." />
            {showDriver && <th className="px-2 py-2.5 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Kierowca</th>}
            {!expandable && <SortTh col="paymentMethod" label="Płatność" />}
            <SortTh col="createdAt" label="Czas" />
            <th className="px-2 py-2.5 align-middle text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order, idx) => {
            const isExpanded = expandedOrderId === order.orderId;
            const rowBg = idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
            return (
              <React.Fragment key={order.orderId}>
                <tr
                  onClick={expandable ? () => setExpandedOrderId(isExpanded ? null : order.orderId) : undefined}
                  className={`transition-colors ${expandable ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50 dark:bg-blue-900/10' : `${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40`}`}
                >
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{order.orderNumber}</td>
                  {!expandable && <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap max-w-[140px]">
                    <span className="block truncate" title={order.customerName ?? ''}>{order.customerName || '—'}</span>
                  </td>}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap tabular-nums">{order.customerPhone}</td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[200px]">
                    <span className="block truncate" title={order.pickupAddress}>{order.pickupAddress}</span>
                  </td>
                  {!expandable && <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 font-semibold text-gray-900 dark:text-white max-w-[160px]">
                    <span className="block truncate" title={order.destinationAddress}>{order.destinationAddress || '—'}</span>
                  </td>}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap tabular-nums">
                    {order.pickupRegionId != null ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.pickupRegionId}</span> : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap">{CATEGORY_LABELS[order.vehicleCategory] ?? order.vehicleCategory}</td>
                  {showDriver && (
                    <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2 text-[0.9375rem] whitespace-nowrap">
                      {order.assignedDriver
                        ? <span className="inline-flex items-center justify-center px-2 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{order.assignedDriver.code}</span>
                        : <span className="text-gray-300 dark:text-gray-300">—</span>}
                    </td>
                  )}
                  {!expandable && <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</td>}
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white whitespace-nowrap tabular-nums">{order.createdAt}</td>
                  <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setOrderInfoModal(order)} className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all">
                      <Info size={22} />
                    </button>
                  </td>
                </tr>
                {expandable && (
                  <tr>
                    <td colSpan={colCount} className="p-0 border-0">
                      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 bg-blue-50 dark:bg-blue-900/10 border border-gray-200 dark:border-[#7a7a7a]">
                          {/* Szczegóły kompaktowe */}
                          <div className="flex items-center gap-4 flex-wrap flex-1 text-sm">
                            <span className="text-gray-500 dark:text-gray-300">Klient: <span className="text-gray-900 dark:text-white font-medium">{order.customerName || '—'}</span></span>
                            <span className="text-gray-500 dark:text-gray-300">Płatność: <span className="text-gray-900 dark:text-white font-medium">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span></span>
                            <span className="text-gray-500 dark:text-gray-300">Cel: <span className="text-gray-900 dark:text-white font-medium">{order.destinationAddress || '—'}</span></span>
                            <span className="text-gray-500 dark:text-gray-300">Termin: <span className="text-gray-900 dark:text-white font-medium">{order.scheduledDate} {order.scheduledTime}</span></span>
                          </div>
                          {/* Przyciski akcji */}
                          {showActions && (
                            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                              {dispatchingOrderId === order.orderId ? (
                                <>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={driverCodeInput}
                                    onChange={e => { setDriverCodeInput(e.target.value); setDispatchError(null); }}
                                    onKeyDown={e => { if (e.key === 'Enter') handleDispatch(order.orderId); if (e.key === 'Escape') setDispatchingOrderId(null); }}
                                    placeholder="Nr kierowcy"
                                    className="px-2 py-1 text-xs bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#888888] rounded-md text-black dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
                                  />
                                  <button onClick={() => handleDispatch(order.orderId)} disabled={isDispatching || !driverCodeInput.trim()} className="px-2 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors">
                                    {isDispatching ? '…' : 'Wyślij'}
                                  </button>
                                  <button onClick={() => { setDispatchingOrderId(null); setDispatchError(null); }} className="px-2 py-1 text-xs font-medium bg-gray-400 hover:bg-gray-500 text-white rounded-md transition-colors">
                                    Anuluj
                                  </button>
                                  {dispatchError && <span className="text-xs text-red-500">{dispatchError}</span>}
                                </>
                              ) : (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); setDispatchingOrderId(order.orderId); setDriverCodeInput(''); setDispatchError(null); }} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white rounded-md transition-colors whitespace-nowrap">
                                    <Send size={16} />Ręcznie
                                  </button>
                                  <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors whitespace-nowrap">
                                    <Pencil size={16} />Edytuj
                                  </button>
                                  <button onClick={() => setSubmittedOrders(prev => prev.filter(o => o.orderId !== order.orderId))} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors whitespace-nowrap">
                                    <Trash2 size={16} />Usuń
                                  </button>
                                  <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors whitespace-nowrap">
                                    <Map size={16} />Mapa
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    );
  };

  const tabs = [
    { id: 'new-order',   label: 'Nowe zlecenie' },
    { id: 'new-order-2', label: 'Nowe zlecenie 2' },
    { id: 'orders',      label: 'Lista zlecen' },
    { id: 'taxi',        label: 'Taxi' },
    { id: 'chat',        label: 'Wiadomości' },
    { id: 'zdarzenia',   label: 'Zdarzenia' },
    { id: 'klienci',     label: 'Klienci' },
  ];

  return (
    <>
    <Layout
      title="Panel Dyspozytorni"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => setActiveTab(tabId as TabType)}
      noPadding={activeTab === 'taxi' || activeTab === 'chat'}
    >
      {activeTab === 'taxi' ? (
        <TaxiQueue />
      ) : activeTab === 'new-order' ? (
        <div className="flex flex-col gap-3 h-full">

          {/* ── GÓRNY CONTAINER z zakładkami ── */}
          <div className={`flex flex-col ${topView === 'form' ? 'shrink-0' : 'flex-1 min-h-0'}`}>
            {/* Tab bar */}
            <div className="relative shrink-0 pt-2 px-0">
              {/* Aktualna godzina — za zakładkami w wolnej przestrzeni */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <span className="text-lg font-bold tabular-nums text-white tracking-tight select-none">
                  {clockDisplay}
                </span>
              </div>
              <div className="relative z-10 flex items-end justify-between">
                <div className="flex">
                  {([
                    { id: 'form',      label: 'Formularz'     },
                    { id: 'orders',    label: 'Lista zleceń'  },
                    { id: 'chat',      label: 'Wiadomość'     },
                    { id: 'zdarzenia', label: 'Zdarzenia'     },
                    { id: 'console',   label: 'Konsola'       },
                    { id: 'klienci',   label: 'Klienci'       },
                  ] as { id: 'form' | 'orders' | 'chat' | 'zdarzenia' | 'console' | 'klienci'; label: string }[]).map((t, i) => {
                    const isActive = topView === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTopView(t.id)}
                        className={`${i > 0 ? '-ml-px' : ''} relative px-4 py-2.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-all rounded-t-md flex items-center gap-1.5 border border-b-0 ${
                          isActive
                            ? 'z-10 bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white border-gray-300 dark:border-[#696969]'
                            : 'z-0 bg-[#e4e4e4] dark:bg-[#0e0e0e] text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-gray-300 dark:border-[#696969]'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Restart serwera + User info */}
                <div className="flex items-center gap-2 pb-1">
                  <button
                    onClick={handleRestartServer}
                    disabled={restartState !== 'idle'}
                    title="Restart serwera"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors disabled:cursor-not-allowed
                      ${restartState === 'idle'       ? 'bg-white dark:bg-[#2d2d2d] text-gray-600 dark:text-gray-200 border-gray-300 dark:border-[#7a7a7a] hover:bg-gray-50 dark:hover:bg-[#434343]' : ''}
                      ${restartState === 'restarting' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-400 dark:border-yellow-600' : ''}
                      ${restartState === 'waiting'    ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-400 dark:border-yellow-600' : ''}
                      ${restartState === 'done'       ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-400 dark:border-green-600' : ''}
                    `}
                  >
                    <RotateCcw className={`w-4 h-4 ${restartState === 'restarting' || restartState === 'waiting' ? 'animate-spin [animation-direction:reverse]' : ''}`} />
                    <span>
                      {restartState === 'idle'       && 'Restart serwera'}
                      {restartState === 'restarting' && 'Restartowanie...'}
                      {restartState === 'waiting'    && 'Czekam na serwer...'}
                      {restartState === 'done'       && 'Serwer gotowy ✓'}
                    </span>
                  </button>

                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors bg-white dark:bg-[#2d2d2d] text-gray-600 dark:text-gray-200 border-gray-300 dark:border-[#7a7a7a] hover:bg-gray-50 dark:hover:bg-[#434343]"
                  >
                    <User className="w-4 h-4" />
                    <span>{user?.name}</span>
                    <span className="text-gray-400">({user?.role})</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#696969] rounded-lg shadow-lg z-50">
                      <div className="py-1">
                        <button
                          onClick={() => { setUserMenuOpen(false); window.open('/map', '_blank', 'width=1200,height=800'); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors border-b border-gray-200 dark:border-[#696969]"
                        >
                          <Map className="w-4 h-4" />
                          Otwórz mapę
                        </button>
                        <button
                          onClick={() => { toggleTheme(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors border-b border-gray-200 dark:border-[#696969]"
                        >
                          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          {theme === 'light' ? 'Motyw ciemny' : 'Motyw jasny'}
                        </button>
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Wyloguj
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>{/* koniec flex items-center gap-2 pb-1 */}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-300 dark:bg-[#383838]" />
            </div>

            {/* Content */}
            {topView === 'form' ? (
              <div className="bg-white dark:bg-[#383838] border border-t-0 border-gray-300 dark:border-[#696969] rounded-b-md p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                  <div className="lg:col-span-2 space-y-4">
                    <OrderForm
                      orderData={orderData}
                      setOrderData={setOrderData as React.Dispatch<React.SetStateAction<OrderData>>}
                      onPickupCoordsChange={setPickupCoords}
                      onDestinationCoordsChange={setDestinationCoords}
                      onOrderCreated={(result, od) => { setEditingOrderId(null); handleOrderCreated(result, od); }}
                      onZoneDetected={(zone, coords) => { setDetectedZone(zone); if (coords) setPickupCoords(coords); }}
                      onPreferencesChange={setOrderPrefIds}
                      suggestedDriverCode={formSuggestedDriverCode}
                      typowanyDriverCode={typowanyDriverCode}
                      editingOrderId={editingOrderId}
                      onSaveEdit={() => { setEditingOrderId(null); fetchOrders(); }}
                      onCancelEdit={() => setEditingOrderId(null)}
                    />
                  </div>
                  <div className="relative rounded border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden bg-gray-50 dark:bg-[#2d2d2d] self-stretch">
                    <div className="absolute inset-0 overflow-y-auto">
                      <DriverSuggestion zone={zoneForDriverSuggestion} pickupCoords={pickupCoords} preferenceIds={orderPrefIds} customerPhone={orderData.customerPhone} onForceDispatch={(driver) => setFormSuggestedDriverCode(driver.driverCode)} onTypowanyChange={(d) => setTypowanyDriverCode(d?.driverCode ?? null)} showAllOnNoZone={true} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#2d2d2d] border border-t-0 border-gray-300 dark:border-[#696969] rounded-b-md">

                {topView === 'orders'    && <div className="h-full overflow-hidden"><OrderList /></div>}
                {topView === 'chat'      && <div className="h-full overflow-hidden"><DispatcherChat /></div>}
                {topView === 'zdarzenia' && <div className="h-full overflow-hidden"><DispatcherEvents /></div>}
                {topView === 'console'   && <div className="h-full"><DebugConsole /></div>}
                {topView === 'klienci'   && <div className="h-full overflow-hidden"><KlienciTab /></div>}
              </div>
            )}
          </div>

          {/* ── DOLNY CONTAINER — widoczny tylko gdy Formularz aktywny ── */}
          {topView === 'form' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="relative shrink-0 pt-2 px-0">
                <div className="flex items-end justify-between">
                  {/* Zakładki */}
                  <div className="flex">
                    {[
                      { id: 'pending',   label: 'Oczekujące', count: pendingOrders.length },
                      { id: 'market',    label: 'Giełda',     count: gieldaOrders.length },
                      { id: 'assigned',  label: 'Wydane',     count: assignedOrders.length },
                      { id: 'scheduled', label: 'Terminowe',  count: scheduledOrders.length },
                      { id: 'taxi',      label: 'Taxi',       count: taxiList.length },
                      { id: 'rejony',    label: 'Rejony',     count: 0 },
                      { id: 'mapa',      label: 'Mapa',       count: 0 },
                    ].map((t, i) => {
                      const isActive = activeOrderTab === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setActiveOrderTab(t.id)}
                          className={`${i > 0 ? '-ml-px' : ''} relative px-4 py-2.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-all rounded-t-md flex items-center gap-1.5 border border-b-0 ${
                            isActive
                              ? 'z-10 bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white border-gray-300 dark:border-[#696969]'
                              : 'z-0 bg-[#e4e4e4] dark:bg-[#0e0e0e] text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-gray-300 dark:border-[#696969]'
                          }`}
                        >
                          {t.label}
                          {t.count > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                              isActive ? 'bg-gray-600 dark:bg-[#515151] text-white' : 'bg-gray-400 dark:bg-[#444444] text-white'
                            }`}>
                              {t.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Pole wyszukiwania */}
                  <div className="ml-4 relative self-start">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Szukaj…"
                      value={bottomSearch}
                      onChange={e => setBottomSearch(e.target.value)}
                      className="h-8 pl-8 pr-3 text-sm rounded border border-gray-300 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
                    />
                  </div>

                  {/* Przyciski Zadania + Czat — oddzielone od zakładek */}
                  <div className="ml-2 flex items-center gap-1.5 self-start">
                    <button
                      onClick={() => setActiveOrderTab('zadania')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                        activeOrderTab === 'zadania'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-[#2d2d2d] text-gray-600 dark:text-gray-200 border-gray-300 dark:border-[#7a7a7a] hover:bg-gray-50 dark:hover:bg-[#434343]'
                      }`}
                    >
                      <ClipboardList className="w-4 h-4" />
                      Zadania
                      {tasks.filter(t => t.status === 'new').length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                          {tasks.filter(t => t.status === 'new').length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveOrderTab('czat')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                        activeOrderTab === 'czat'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-[#2d2d2d] text-gray-600 dark:text-gray-200 border-gray-300 dark:border-[#7a7a7a] hover:bg-gray-50 dark:hover:bg-[#434343]'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Czat
                    </button>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-300 dark:bg-[#383838]" />
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-4 bg-white dark:bg-[#202020] rounded-b-md relative">
                {activeOrderTab === 'rejony' && <div className="h-full -m-2"><DispatcherRejonTab /></div>}
                {activeOrderTab === 'mapa' && (
                  <div className="h-full -m-4">
                    <DispatcherMiniMap pickupCoords={pickupCoords} destinationCoords={destinationCoords} />
                  </div>
                )}
                {activeOrderTab === 'czat' && (
                  <div className="absolute inset-0 rounded-b-md overflow-hidden">
                    <DispatcherChat />
                  </div>
                )}
                {activeOrderTab === 'scheduled' && renderScheduledTable(bottomSearch ? scheduledOrders.filter(o => [o.customerPhone, o.customerName, o.pickupAddress, o.destinationAddress, o.orderNumber, o.notes, o.operator, o.clientCode].some(v => v?.toLowerCase().includes(bottomSearch.toLowerCase()))) : scheduledOrders)}
                {activeOrderTab === 'pending'  && renderPendingTable(bottomSearch ? pendingOrders.filter(o => [o.customerPhone, o.customerName, o.pickupAddress, o.destinationAddress, o.orderNumber, o.notes, o.operator, o.clientCode].some(v => v?.toLowerCase().includes(bottomSearch.toLowerCase()))) : pendingOrders)}
                {activeOrderTab === 'market'   && renderGieldaTable(bottomSearch ? gieldaOrders.filter(o => [o.customerPhone, o.customerName, o.pickupAddress, o.destinationAddress, o.orderNumber, o.notes, o.operator, o.clientCode].some(v => v?.toLowerCase().includes(bottomSearch.toLowerCase()))) : gieldaOrders)}
                {activeOrderTab === 'assigned' && renderAssignedTable(bottomSearch ? assignedOrders.filter(o => [o.customerPhone, o.customerName, o.pickupAddress, o.destinationAddress, o.orderNumber, o.notes, o.operator, o.clientCode].some(v => v?.toLowerCase().includes(bottomSearch.toLowerCase()))) : assignedOrders)}
                {activeOrderTab === 'zadania' && (
                  tasksLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm">Ładowanie…</div>
                  ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-300 py-8">
                      <ClipboardList className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Brak zadań</p>
                    </div>
                  ) : (
                    <div className="overflow-auto -mt-4 -mx-4">
                      <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
                        <thead>
                          <tr className="bg-white dark:bg-[#202020]">
                            {(['Czas', 'Status', 'Zadanie', 'Adres', 'Taxi', 'Operator', 'Akcje'] as string[]).map(label => (
                              <th key={label} className={`px-3 py-2.5 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a] ${label === 'Akcje' ? 'text-right pr-4' : ''}`}>
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tasks.map((task, idx) => {
                            const createdAt = new Date(task.created_at);
                            const dateStr = `${String(createdAt.getDate()).padStart(2,'0')}-${String(createdAt.getMonth()+1).padStart(2,'0')}-${createdAt.getFullYear()}  ${String(createdAt.getHours()).padStart(2,'0')}:${String(createdAt.getMinutes()).padStart(2,'0')}`;
                            const isDone = task.status === 'done' || task.status === 'dismissed';
                            const rowBg = isDone
                              ? 'opacity-60 ' + (idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent')
                              : idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent';
                            const statusDot =
                              task.status === 'new'         ? 'bg-red-500' :
                              task.status === 'in_progress' ? 'bg-yellow-400' :
                              task.status === 'done'        ? 'bg-green-500' : 'bg-gray-400';
                            const statusLabel =
                              task.status === 'new'         ? 'Nowe' :
                              task.status === 'in_progress' ? 'W toku' :
                              task.status === 'done'        ? 'Wykonane' : 'Odrzucone';
                            return (
                              <tr key={task.id} className={`${rowBg} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors`}>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                                  {dateStr}
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                                    <span className="text-gray-700 dark:text-gray-200 text-sm">{statusLabel}</span>
                                  </span>
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 text-gray-900 dark:text-white max-w-[400px]">
                                  <span className={`block truncate ${isDone ? 'line-through text-gray-400 dark:text-gray-300' : ''}`} title={task.title}>
                                    {task.order_number
                                      ? task.title.replace(task.order_number, '').replace(/\s{2,}/g, ' ').trim()
                                      : task.title}
                                  </span>
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 text-gray-900 dark:text-white max-w-[260px]">
                                  {task.pickup_address
                                    ? <span className="block truncate" title={task.pickup_address}>{task.pickup_address}</span>
                                    : <span className="text-gray-300 dark:text-gray-300">—</span>}
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 whitespace-nowrap text-gray-900 dark:text-white">
                                  {task.taxi_code || <span className="text-gray-300 dark:text-gray-300">—</span>}
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2.5 whitespace-nowrap text-gray-900 dark:text-white">
                                  {task.operator || <span className="text-gray-300 dark:text-gray-300">—</span>}
                                </td>
                                <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-3 py-2 text-right pr-4 whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    {task.status !== 'done' && (
                                      <button onClick={() => updateTaskStatus(task.id, 'done')} title="Oznacz jako wykonane"
                                        className="inline-flex items-center justify-center w-7 h-6 rounded bg-green-600 hover:bg-green-700 active:scale-95 text-white transition-all">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {task.status !== 'dismissed' && task.status !== 'done' && (
                                      <button onClick={() => updateTaskStatus(task.id, 'dismissed')} title="Odrzuć"
                                        className="inline-flex items-center justify-center w-7 h-6 rounded bg-zinc-500 hover:bg-zinc-600 active:scale-95 text-white transition-all">
                                        <XIcon className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => deleteTask(task.id)} title="Usuń"
                                      className="inline-flex items-center justify-center w-7 h-6 rounded bg-red-600 hover:bg-red-700 active:scale-95 text-white transition-all">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
                {activeOrderTab === 'taxi' && (
                  taxiLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">Ładowanie…</div>
                  ) : taxiList.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">Brak taksówek</div>
                  ) : (
                    <div className="overflow-auto -mt-4 -mx-4">
                      {(() => {
                        const handleSort = (key: keyof TaxiInfo) => {
                          if (taxiSortKey === key) setTaxiSortDir(d => d === 'asc' ? 'desc' : 'asc');
                          else { setTaxiSortKey(key); setTaxiSortDir('asc'); }
                        };
                        const SortIcon = ({ col }: { col: keyof TaxiInfo }) => {
                          if (taxiSortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
                          return taxiSortDir === 'asc'
                            ? <ChevronUp className="w-3 h-3 text-blue-500" />
                            : <ChevronDown className="w-3 h-3 text-blue-500" />;
                        };
                        const SortTh = ({ col, label, className }: { col: keyof TaxiInfo; label: string; className?: string }) => (
                          <th
                            onClick={() => handleSort(col)}
                            className={`px-2 py-2.5 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors border-b border-gray-200 dark:border-[#7a7a7a] ${className ?? ''}`}
                          >
                            <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
                          </th>
                        );
                        const sorted = [...taxiList].sort((a, b) => {
                          if (!taxiSortKey) return 0;
                          const av = a[taxiSortKey] ?? '';
                          const bv = b[taxiSortKey] ?? '';
                          const cmp = typeof av === 'number' && typeof bv === 'number'
                            ? av - bv
                            : String(av).localeCompare(String(bv), 'pl');
                          return taxiSortDir === 'asc' ? cmp : -cmp;
                        });
                        return (
                      <table className="w-full text-sm border-separate border-spacing-x-0 border-spacing-y-0">
                        <thead>
                          <tr className="bg-white dark:bg-[#202020]">
                            <SortTh col="driver_code"          label="Taxi" />
                            <SortTh col="vehicle_brand"        label="Samochód" />
                            <SortTh col="registration_number"  label="Nr rejestracyjny" />
                            <SortTh col="name"                 label="Kierowca" />
                            <SortTh col="active_order_address" label="Zlecenie" />
                            <SortTh col="current_zone"         label="Rejon" />
                            <SortTh col="queue_position"       label="Kolejka" />
                            <th className="p-0 align-middle text-left text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap border-b border-gray-200 dark:border-[#7a7a7a]">
                              <div className="flex justify-end pr-2 py-2.5"><span className="w-[40px]">Akcje</span></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((taxi, idx) => (
                            <tr key={taxi.id} className={`${idx % 2 === 0 ? 'bg-gray-100 dark:bg-[#2d2d2d]/50' : 'bg-white dark:bg-transparent'} hover:bg-blue-50 dark:hover:bg-[#434343]/40 transition-colors`}>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2 text-[0.9375rem] whitespace-nowrap">
                                <span
                                  className="inline-block px-2 py-0.5 rounded text-white text-sm font-bold min-w-[48px] text-center"
                                  style={{ backgroundColor: TAXI_STATE_COLOR[taxi.driver_state ?? ''] ?? '#71717a' }}
                                >
                                  {taxi.driver_code || '—'}
                                </span>
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white text-sm font-semibold whitespace-nowrap">
                                {[taxi.vehicle_brand, taxi.vehicle_model].filter(Boolean).join(' ') || <span className="text-gray-300 dark:text-gray-300">—</span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white text-sm font-semibold whitespace-nowrap tabular-nums">
                                {taxi.registration_number || <span className="text-gray-300 dark:text-gray-300">—</span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white text-sm font-semibold whitespace-nowrap">
                                {taxi.name || <span className="text-gray-300 dark:text-gray-300">—</span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white text-sm font-semibold max-w-[200px]">
                                {taxi.active_order_address
                                  ? <span className="block truncate" title={taxi.active_order_address}>{taxi.active_order_address}</span>
                                  : <span className="text-gray-300 dark:text-gray-300"></span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2 text-[0.9375rem] whitespace-nowrap">
                                {taxi.current_zone != null
                                  ? <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{taxi.current_zone}</span>
                                  : <span className="text-gray-300 dark:text-gray-300">—</span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] first:border-l last:border-r px-2 py-2.5 text-gray-900 dark:text-white text-sm font-semibold whitespace-nowrap tabular-nums text-center">
                                {taxi.queue_position != null ? taxi.queue_position : <span className="text-gray-300 dark:text-gray-300">—</span>}
                              </td>
                              <td className="bg-inherit border-t border-b border-gray-200 dark:border-[#7a7a7a] px-2 py-2 text-[0.9375rem] whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    title="Szczegóły kierowcy"
                                    onClick={() => setDriverModalId(taxi.id)}
                                    className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-600 hover:bg-zinc-700 active:scale-95 text-white transition-all"
                                  >
                                    <Info size={22} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                        );
                      })()}
                    </div>
                  )
                )}
                {activeOrderTab !== 'pending' && activeOrderTab !== 'market' && activeOrderTab !== 'assigned' && activeOrderTab !== 'scheduled' && activeOrderTab !== 'zadania' && activeOrderTab !== 'taxi' && activeOrderTab !== 'rejony' && activeOrderTab !== 'czat' && (
                  <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
                    Brak danych do wyświetlenia
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'new-order-2' ? (
        <div className="flex flex-col gap-3 h-full">
          {/* Górna sekcja: formularz + prawa kolumna */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0 items-stretch">
            <div className="lg:col-span-2">
              <OrderForm2
                orderData={orderData2}
                setOrderData={setOrderData2}
                onPickupCoordsChange={setPickupCoords2}
                onDestinationCoordsChange={setDestinationCoords2}
                onRequestMiniMap={() => setRightPage2('map')}
                onOrderCreated={handleOrderCreated2}
                onZoneDetected={(zone, coords) => {
                  setDetectedZone2(zone);
                  if (coords) setPickupCoords2(coords);
                }}
              />
            </div>

            {/* Prawa kolumna — zakładki Kierowcy / Mapa */}
            <div className="rounded-xl border border-gray-200 dark:border-[#696969] overflow-hidden bg-white dark:bg-[#202020] self-stretch flex flex-col">
              {/* Przełącznik zakładek */}
              <div className="shrink-0 flex border-b border-gray-100 dark:border-[#696969]/60">
                <button
                  onClick={() => setRightPage2('drivers')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                    rightPage2 === 'drivers'
                      ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-[#2d2d2d]'
                      : 'text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-[#202020]'
                  }`}
                >
                  Kierowcy
                </button>
                <div className="w-px bg-gray-100 dark:bg-[#383838]/60" />
                <button
                  onClick={() => setRightPage2('map')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                    rightPage2 === 'map'
                      ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-[#2d2d2d]'
                      : 'text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-[#202020]'
                  }`}
                >
                  Mapa
                </button>
              </div>

              {/* Zawartość */}
              <div className="flex-1 relative overflow-hidden">
                {rightPage2 === 'drivers' && (
                  <div className="absolute inset-0 overflow-y-auto">
                    <DriverSuggestion zone={detectedZone2} pickupCoords={pickupCoords2} />
                  </div>
                )}
                {rightPage2 === 'map' && (
                  <div className="absolute inset-0">
                    <DispatcherMiniMap
                      pickupCoords={pickupCoords2}
                      destinationCoords={destinationCoords2}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dolna sekcja — tabela zleceń */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Tab bar — poza divem treści */}
            <div className="relative shrink-0 pt-2 px-0">
              <div className="flex">
                {[
                  { id: 'pending',   label: 'Oczekujące', count: pendingOrders.length },
                  { id: 'market',    label: 'Giełda',     count: gieldaOrders.length },
                  { id: 'assigned',  label: 'Wydane',     count: assignedOrders.length },
                  { id: 'scheduled', label: 'Terminowe',  count: scheduledOrders.length },
                  { id: 'taxi',      label: 'Taxi',       count: 0 },
                ].map((t, i) => {
                  const isActive = activeOrderTab2 === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveOrderTab2(t.id)}
                      className={`${i > 0 ? '-ml-px' : ''} relative px-4 py-2.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-all rounded-t-md flex items-center gap-1.5 border border-b-0 ${
                        isActive
                          ? 'z-10 bg-white dark:bg-[#202020] text-gray-900 dark:text-white border-gray-200 dark:border-[#696969]'
                          : 'z-0 bg-gray-100 dark:bg-[#1a1a1a] text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-gray-200 dark:border-[#696969]'
                      }`}
                    >
                      {t.label}
                      {t.count > 0 && (
                        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-gray-600 dark:bg-[#515151] text-white' : 'bg-gray-400 dark:bg-[#444444] text-white'
                        }`}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200 dark:bg-[#383838]" />
            </div>
            {/* Content — osobny div poniżej zakładek */}
            <div className="flex-1 min-h-0 overflow-auto p-4 bg-white dark:bg-[#202020] rounded-b-md">
              {activeOrderTab2 === 'scheduled' && renderScheduledTable(scheduledOrders)}
              {activeOrderTab2 === 'pending'  && renderOrdersTable(pendingOrders,  false, 'Brak oczekujących zleceń', true)}
              {activeOrderTab2 === 'market'   && renderGieldaTable(gieldaOrders)}
              {activeOrderTab2 === 'assigned' && renderAssignedTable(assignedOrders)}
              {activeOrderTab2 !== 'scheduled' && activeOrderTab2 !== 'pending' && activeOrderTab2 !== 'market' && activeOrderTab2 !== 'assigned' && (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-300 text-sm py-8">
                  Brak danych do wyświetlenia
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'chat' ? (
        <div className="relative h-full">
          <div className="absolute inset-3 rounded border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
            <DispatcherChat />
          </div>
        </div>
      ) : activeTab === 'orders' ? (
        <div className="h-full overflow-hidden">
          <OrderList />
        </div>
      ) : (
        <div className="h-[calc(100vh-120px)]">
          {activeTab === 'zdarzenia' && <DispatcherEvents />}
          {activeTab === 'console' && <DebugConsole />}
          {activeTab === 'klienci' && <KlienciTab />}
        </div>
      )}
    </Layout>

    {/* ── Modal giełdy — wydanie zlecenia ── */}
    {gieldaModalOrder && (
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={() => { setGieldaModalOrder(null); setGieldaDispatchError(null); setIsGieldaDispatching(false); }}>
        <div
          className="w-[92%] h-[82vh] bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Nagłówek ── */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-300 dark:border-[#7a7a7a]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Send className="w-9 h-9 text-black dark:text-white shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                    Obsługa zlecenia numer: <span className="text-black dark:text-white">{gieldaModalOrder.orderNumber}</span>
                  </h2>
                  <span className="text-sm text-gray-500 dark:text-gray-300 truncate block">
                    {gieldaModalOrder.pickupAddress}{gieldaModalOrder.destinationAddress ? ` → ${gieldaModalOrder.destinationAddress}` : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setGieldaModalOrder(null); setGieldaDispatchError(null); setIsGieldaDispatching(false); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white transition-colors shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── Treść (lewa + prawa) ── */}
          <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Lewa strona ── */}
          <div className="w-1/2 flex flex-col border-r border-gray-200 dark:border-[#696969] min-h-0">

            {/* Górny lewy róg — dane zlecenia */}
            <div className="p-4 border-b border-gray-200 dark:border-[#696969]">
              {(() => {
                const gm = gieldaModalOrder;
                const gd = gm.createdAtISO ? new Date(gm.createdAtISO) : null;
                const gCreatedDate = gd ? `${String(gd.getDate()).padStart(2,'0')}-${String(gd.getMonth()+1).padStart(2,'0')}-${gd.getFullYear()}` : '';
                const gCreatedTime = gd ? `${String(gd.getHours()).padStart(2,'0')}:${String(gd.getMinutes()).padStart(2,'0')}` : '';
                const diffMin = gd ? Math.floor((Date.now() - gd.getTime()) / 60000) : null;
                const marketStr = diffMin != null ? (diffMin < 60 ? `${diffMin} min` : `${Math.floor(diffMin / 60)} h ${diffMin % 60} min`) : '—';
                const gSm = STATUS_MAP[gm.status] ?? { label: gm.status, bg: 'bg-gray-100 dark:bg-[#383838]', text: 'text-gray-700 dark:text-gray-200' };
                return (
                  <div className="bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-lg p-4 space-y-3 shadow-sm">

                    {/* Status + data + na giełdzie */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-sm font-semibold ${gSm.bg} ${gSm.text}`}>{gSm.label}</span>
                      <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white tabular-nums">
                        <span className="font-medium">{gCreatedDate}</span>
                        {gCreatedTime && (<><span className="text-gray-400 dark:text-gray-300">|</span><span className="font-medium">{gCreatedTime}</span></>)}
                        <span className="text-gray-400 dark:text-gray-300">|</span>
                        <span>Przyjął: <span className="font-semibold">{gm.operator || '—'}</span></span>
                        <span className="text-gray-400 dark:text-gray-300">|</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">Na giełdzie: {marketStr}</span>
                      </div>
                    </div>

                    <div className="h-px bg-gray-200 dark:bg-[#444444]" />

                    {/* Adres z + Rejon */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Adres z</div>
                        <div className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{gm.pickupAddress || '—'}</div>
                      </div>
                      {gm.pickupRegionId != null && (
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Rejon</div>
                          <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{gm.pickupRegionId}</span>
                        </div>
                      )}
                    </div>

                    {/* Adres do */}
                    {gm.destinationAddress && (
                      <>
                        <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                        <div>
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Adres do</div>
                          <div className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{gm.destinationAddress}</div>
                        </div>
                      </>
                    )}

                    {/* Uwagi / Hasło */}
                    {gm.notes && (
                      <>
                        <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                        <div>
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Uwagi</div>
                          <div className="text-sm">
                            {gm.notes.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((line, i) => {
                              const trimmed = line.trimStart();
                              return trimmed.startsWith('HASŁO:') || trimmed.startsWith('HASLO:')
                                ? <span key={i} className="text-yellow-500 dark:text-yellow-400 font-semibold block">{line}</span>
                                : <span key={i} className="text-gray-900 dark:text-white block">{line}</span>;
                            })}
                          </div>
                        </div>
                      </>
                    )}

                  </div>
                );
              })()}
            </div>

            {/* Dolny lewy róg — typowanie */}
            <div className="flex-[6] flex flex-col min-h-0">
              {/* Tab bar */}
              <div className="shrink-0 flex border-b border-gray-300 dark:border-[#7a7a7a] px-5">
                {([
                  { id: 'gps',   label: 'Po GPS' },
                  { id: 'rules', label: 'Według Reguł' },
                  { id: 'all',   label: 'Wszystkie' },
                ] as { id: 'gps' | 'rules' | 'all'; label: string }[]).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setGieldaModalTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                      gieldaModalTab === t.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Błąd dispatchu z modalu */}
              {gieldaDispatchError && (
                <div className="mx-4 mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                  {gieldaDispatchError}
                </div>
              )}
              {/* Tab content */}
              <div className="flex-1 overflow-y-auto relative">
                {gieldaModalTab === 'gps' && (
                  <GieldaGpsTab
                    pickupCoords={gieldaMapCoords.pickup}
                    onDriverSelect={setSelectedGpsDriver}
                  />
                )}
                {gieldaModalTab === 'rules' && (
                  <GieldaRulesTab
                    zone={gieldaModalOrder.pickupRegionId}
                    pickupCoords={gieldaMapCoords.pickup}
                    onDriverSelect={setSelectedGpsDriver}
                  />
                )}
                {gieldaModalTab === 'all' && (
                  <GieldaGpsTab
                    pickupCoords={gieldaMapCoords.pickup}
                    onDriverSelect={setSelectedGpsDriver}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Prawa strona — mapa ── */}
          <div className="w-1/2 flex flex-col min-h-0 p-4">
            <div className="flex-1 relative rounded-lg overflow-hidden border border-[#b0b3b8] dark:border-[#7a7a7a]">
              <DispatcherMiniMap
                pickupCoords={gieldaMapCoords.pickup}
                destinationCoords={gieldaMapCoords.dest}
                driverCoords={selectedGpsDriver ? {
                  lat:   selectedGpsDriver.lat,
                  lng:   selectedGpsDriver.lng,
                  code:  selectedGpsDriver.code,
                  dist:  selectedGpsDriver.dist,
                  color: STATE_BG[selectedGpsDriver.state] ?? '#52525b',
                } : null}
              />
            </div>
          </div>

          </div>{/* koniec flex-1 treści */}

          {/* ── Stopka z przyciskami ── */}
          <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-end gap-2">
            <button
              disabled={!selectedGpsDriver || isGieldaDispatching}
              onClick={async () => {
                if (!gieldaModalOrder || !selectedGpsDriver || isGieldaDispatching) return;
                // Sprawdź czy kierowca ma już aktywne zlecenie
                try {
                  const check = await fetch(`/api/drivers/${encodeURIComponent(selectedGpsDriver.code)}/active-orders-count`);
                  const checkData = await check.json();
                  if (checkData.success && (checkData.count ?? 0) >= 1) {
                    // Pokaż potwierdzenie
                    setNextOrderConfirm({ driverCode: selectedGpsDriver.code, driverName: selectedGpsDriver.name ?? selectedGpsDriver.code });
                    return;
                  }
                } catch { /* ignoruj błąd sprawdzenia — kontynuuj wydawanie */ }
                // Brak aktywnego zlecenia — wydaj bezpośrednio
                setIsGieldaDispatching(true);
                setGieldaDispatchError(null);
                const result = await dispatchOrderToDriver(gieldaModalOrder.orderId, selectedGpsDriver.code);
                setIsGieldaDispatching(false);
                if (result.success) {
                  setSubmittedOrders(prev => prev.map(o =>
                    o.orderId !== gieldaModalOrder.orderId ? o : {
                      ...o,
                      status: 'pending_driver' as const,
                      assignedDriver: { id: result.driverId ?? '', name: result.driverName ?? '', code: selectedGpsDriver.code }
                    }
                  ));
                  setGieldaModalOrder(null);
                  setGieldaDispatchError(null);
                  setActiveOrderTab('assigned');
                } else {
                  setGieldaDispatchError(result.error ?? 'Błąd wydawania zlecenia.');
                }
              }}
              className="flex items-center gap-2 px-6 h-9 text-[15px] font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors shadow-sm"
            >
              {isGieldaDispatching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={15} />}
              Wyślij
            </button>
            <button
              onClick={() => { setFinishError(null); setFinishOrderTarget(gieldaModalOrder); setFinishModal(true); }}
              className="flex items-center gap-2 px-6 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors shadow-sm"
            >
              <XIcon size={15} /> Zakończ
            </button>
            <button onClick={() => { setGieldaModalOrder(null); setGieldaDispatchError(null); setIsGieldaDispatching(false); }} className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors">
              <XIcon size={15} /> Anuluj
            </button>
          </div>

        </div>
      </div>
    )}

    {/* ── Modal potwierdzenia następnego kursu ── */}
    {nextOrderConfirm && gieldaModalOrder && (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center">
        <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-2xl border border-gray-200 dark:border-[#7a7a7a] w-full max-w-md mx-4 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Kierowca ma już aktywne zlecenie</h3>
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                Kierowca <span className="font-semibold text-gray-900 dark:text-white">{nextOrderConfirm.driverName}</span> obsługuje już jedno zlecenie. Czy chcesz wydać mu następne zlecenie jako <span className="font-semibold text-blue-600">"Następny kurs"</span>?
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setNextOrderConfirm(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#383838] hover:bg-gray-200 dark:hover:bg-[#585858] rounded-lg transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={async () => {
                const confirm = nextOrderConfirm;
                setNextOrderConfirm(null);
                if (!gieldaModalOrder || !selectedGpsDriver) return;
                setIsGieldaDispatching(true);
                setGieldaDispatchError(null);
                const result = await dispatchOrderToDriver(gieldaModalOrder.orderId, confirm.driverCode);
                setIsGieldaDispatching(false);
                if (result.success) {
                  setSubmittedOrders(prev => prev.map(o =>
                    o.orderId !== gieldaModalOrder.orderId ? o : {
                      ...o,
                      status: 'pending_driver' as const,
                      assignedDriver: { id: result.driverId ?? '', name: result.driverName ?? '', code: confirm.driverCode }
                    }
                  ));
                  setGieldaModalOrder(null);
                  setGieldaDispatchError(null);
                  setActiveOrderTab('assigned');
                } else {
                  setGieldaDispatchError(result.error ?? 'Błąd wydawania zlecenia.');
                }
              }}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Tak, wydaj jako następny kurs
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal podglądu zlecenia ── */}
    {orderInfoModal && (() => {
      const o = orderInfoModal;
      const sm = STATUS_MAP[o.status] ?? { label: o.status, bg: 'bg-gray-500', text: 'text-white' };
      const [createdDate, createdTime] = o.createdAtISO ? (() => {
        const d = new Date(o.createdAtISO);
        const pad = (n: number) => String(n).padStart(2,'0');
        return [
          `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`,
          `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        ];
      })() : [o.createdAt || '—', null];

      return (
      <>
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={() => { setOrderInfoModal(null); setOrderInfoChatOpen(false); }}>
        <div className="w-[92%] h-[82vh] bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

          {/* ── Nagłówek ── */}
          <div className="shrink-0 px-5 pt-4 pb-3 border-b border-gray-200 dark:border-[#696969]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Info className="w-8 h-8 text-black dark:text-white shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                    Podgląd zlecenia numer: <span className="text-black dark:text-white">{o.orderNumber}</span>
                  </h2>
                  <span className="text-sm text-gray-500 dark:text-gray-300 truncate block">
                    {o.pickupAddress}{o.destinationAddress ? ` → ${o.destinationAddress}` : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Zakładki */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-[#7a7a7a]">
                  {([
                    { id: 'dane', label: 'Szczegóły' },
                    { id: 'logi', label: `Logi${orderInfoLogs.length > 0 ? ` (${orderInfoLogs.length})` : ''}` },
                  ] as { id: 'dane' | 'logi'; label: string }[]).map(t => (
                    <button key={t.id} onClick={() => setOrderInfoTab(t.id)}
                      className={`px-5 py-1.5 text-sm font-semibold transition-all whitespace-nowrap ${
                        orderInfoTab === t.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#434343]'
                      }`}
                    >{t.label}</button>
                  ))}
                </div>
                {/* Przycisk czatu */}
                {o.assignedDriver && (
                  <button
                    onClick={() => setOrderInfoChatOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-gray-300 dark:border-[#7a7a7a] rounded-lg text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" /> Czat z kierowcą
                  </button>
                )}
                <button onClick={() => { setOrderInfoModal(null); setOrderInfoChatOpen(false); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Treść ── */}
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* ══ LOGI ══ */}
            {orderInfoTab === 'logi' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4">
                  {orderInfoLogsLoading ? (
                    <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-300 gap-3">
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                      Ładowanie logów...
                    </div>
                  ) : allOrderInfoLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-300 gap-2">
                      <Clock className="w-10 h-10 opacity-40" />
                      <p className="text-sm">Brak logów dla tego zlecenia</p>
                    </div>
                  ) : (
                    <div className="relative px-2">
                      {/* Pionowa linia — 3px, wyśrodkowana na środku kropki (8px padding + 7px = 15px od lewej; 15-1.5=13.5 ≈ 14px) */}
                      <div className="absolute left-[14px] top-4 bottom-4 w-[3px] bg-blue-500 dark:bg-blue-500 rounded-full" />
                      {allOrderInfoLogs.map((log, idx) => {
                        const ld = new Date(log.created_at);
                        const timeStr = `${String(ld.getHours()).padStart(2,'0')}:${String(ld.getMinutes()).padStart(2,'0')}:${String(ld.getSeconds()).padStart(2,'0')}`;
                        const isLast = idx === allOrderInfoLogs.length - 1;
                        return (
                          <React.Fragment key={log.id}>
                            <div className="flex items-center gap-3 py-2.5">
                              {/* Kropka — ciemniejsza, pełna, bez obramowania */}
                              <div className="shrink-0 w-3.5 h-3.5 rounded-full bg-blue-700 dark:bg-blue-400 z-10 relative" />
                              <span className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-300 tabular-nums">{timeStr}</span>
                              <span className="text-sm text-gray-900 dark:text-white leading-snug">{log.message}</span>
                            </div>
                            {!isLast && <div className="ml-[26px] h-px bg-gray-200 dark:bg-[#444444]" />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t border-gray-200 dark:border-[#696969] px-6 py-2.5 flex justify-end">
                  <button onClick={() => { setOrderInfoLogsLoading(true); fetch(`/api/orders/${o.orderId}/logs`).then(r=>r.json()).then(d=>setOrderInfoLogs(d.logs??[])).catch(()=>{}).finally(()=>setOrderInfoLogsLoading(false)); }} className="flex items-center gap-1.5 px-3 h-7 text-xs font-medium text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white border border-gray-300 dark:border-[#7a7a7a] rounded transition-colors">
                    <RotateCcw className="w-3 h-3" /> Odśwież
                  </button>
                </div>
              </div>
            )}

            {/* ══ SZCZEGÓŁY ══ */}
            {orderInfoTab === 'dane' && (
            <div className="flex-1 flex overflow-hidden min-h-0">

            {/* ── Lewa: info o zleceniu (55%) | Prawa: klient + mapa (45%) ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* ── LEWA: Informacje o zleceniu + Kierowca na dole ── */}
              <div className="w-[55%] flex flex-col min-h-0 border-r border-gray-200 dark:border-[#696969]">

                {/* Scrollowalna treść zlecenia */}
                <div className="flex-1 overflow-y-auto min-h-0">
                {(() => {
                  const operatorLabel = o.operator ? (o.operator.startsWith('OP-') ? o.operator : `OP-${o.operator}`) : null;
                  const prefNames = (o.preferenceIds ?? []).map(id => allPreferences.find(p => Number(p.id) === Number(id))?.name).filter(Boolean);
                  return (
                <div className="p-4">
                  <div className="bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-lg p-4 space-y-3 shadow-sm">

                    {/* Status + data + operator */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full text-[15px] font-semibold ${sm.bg} ${sm.text}`}>{sm.label}</span>
                      <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white tabular-nums">
                        {createdDate && <span className="font-medium">{createdDate}</span>}
                        {createdTime && <><span className="text-gray-400 dark:text-gray-300">|</span><span className="font-medium">{createdTime}</span></>}
                        {operatorLabel && <><span className="text-gray-400 dark:text-gray-300">|</span><span>Przyjął: <span className="font-semibold">{operatorLabel}</span></span></>}
                        {o.orderType === 'scheduled' && o.scheduledTime && <><span className="text-gray-400 dark:text-gray-300">|</span><span className="font-semibold">⏰ {o.scheduledTime}</span></>}
                      </div>
                    </div>

                    <div className="h-px bg-gray-200 dark:bg-[#444444]" />

                    {/* Adres odbioru + Rejon */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Adres z</div>
                        <div className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{o.pickupAddress || '—'}</div>
                      </div>
                      {o.pickupRegionId != null && (
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Rejon</div>
                          <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-zinc-700 text-white font-bold text-sm select-none">{o.pickupRegionId}</span>
                        </div>
                      )}
                    </div>

                    {/* Uwagi */}
                    {o.notes && (
                      <>
                        <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                        <div>
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Uwagi</div>
                          <div className="text-sm">
                            {o.notes.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((line, i) => {
                              const trimmed = line.trimStart();
                              return trimmed.startsWith('HASŁO:') || trimmed.startsWith('HASLO:')
                                ? <span key={i} className="text-yellow-800 dark:text-yellow-600 font-semibold block">{line}</span>
                                : <span key={i} className="text-gray-900 dark:text-white block">{line}</span>;
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Adres docelowy */}
                    {o.destinationAddress && (
                      <>
                        <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                        <div>
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">Adres do</div>
                          <div className="text-base font-semibold text-gray-900 dark:text-white leading-snug">{o.destinationAddress}</div>
                        </div>
                      </>
                    )}

                    {/* Szczegóły */}
                    <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Płatność', value: (PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod) || '—' },
                        { label: 'Kategoria', value: (CATEGORY_LABELS[o.vehicleCategory] ?? o.vehicleCategory) || '—' },
                        { label: 'Ilość', value: String(o.taxiCount ?? 1) },
                        { label: 'Rejon', value: o.pickupRegionId != null ? String(o.pickupRegionId) : '—' },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-0.5">{item.label}</div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Preferencje / wycena */}
                    {(prefNames.length > 0 || o.cost != null || o.clientInfo) && (
                      <>
                        <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                          {prefNames.map((name, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-[#444444] text-gray-700 dark:text-gray-200">{name}</span>
                          ))}
                          {o.cost != null && (
                            <span className="text-sm text-gray-500 dark:text-gray-300">Wycena: <span className="font-semibold text-gray-900 dark:text-white">{o.cost} zł</span></span>
                          )}
                          {o.clientInfo && (
                            <span className="text-sm text-gray-500 dark:text-gray-300 truncate">{o.clientInfo}</span>
                          )}
                        </div>
                      </>
                    )}

                  </div>
                </div>
                  );
                })()}
                </div>{/* koniec scrollowalnej treści */}

                {/* ── Kierowca — przypięty na dole lewej kolumny ── */}
                <div className="shrink-0 border-t border-gray-200 dark:border-[#696969] px-4 py-4">
                  <div className="bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-lg px-4 pt-3 pb-4 space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-3 pb-1 border-b border-gray-200 dark:border-[#7a7a7a]">
                      <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">Kierowca</span>
                    </div>

                    {o.assignedDriver ? (
                      <>
                        {/* Kod + dane pojazdu */}
                        <div className="flex items-center gap-3">
                          {/* Kafelek z numerem — zielony jak przycisk Wolna, rozmiar jak na mapie */}
                          <span
                            className="shrink-0 inline-flex items-center justify-center px-2.5 h-7 rounded font-bold text-[14px] select-none text-white"
                            style={{ backgroundColor: '#007a1e' }}
                          >
                            {o.assignedDriver.code}
                          </span>

                          {/* Model, kolor, rejestracja — lekko większa czcionka */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap text-[15px] font-semibold text-gray-900 dark:text-white">
                            {[
                              [o.assignedDriver.vehicleBrand, o.assignedDriver.vehicleModel].filter(Boolean).join(' '),
                              o.assignedDriver.vehicleColor,
                              o.assignedDriver.registrationNumber,
                            ].filter(Boolean).map((val, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-gray-400 dark:text-gray-300 font-normal">|</span>}
                                <span>{val}</span>
                              </span>
                            ))}
                          </div>

                          {/* Info — ikona */}
                          <button
                            onClick={() => setDriverModalId(o.assignedDriver!.id)}
                            title="Informacje o kierowcy"
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-[#383838] dark:hover:bg-[#585858] text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            <Info size={15} />
                          </button>
                          {/* Mapa — ikona */}
                          <button
                            onClick={() => {
                              const addr = o.assignedDriver ? encodeURIComponent(o.assignedDriver.name) : '';
                              window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank');
                            }}
                            title="Pokaż na mapie"
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-[#383838] dark:hover:bg-[#585858] text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            <Map size={15} />
                          </button>
                        </div>

                        {/* Status zlecenia */}
                        {o.status !== 'pending' && o.status !== 'market' && o.status !== 'scheduled' && (
                          <>
                            <div className="h-px bg-gray-200 dark:bg-[#444444]" />
                            <OrderStatusWidget
                              status={o.status}
                              updatedAtISO={o.updatedAtISO}
                              assignedDriverId={o.assignedDriver?.id ?? null}
                              pickupCoords={orderInfoMapCoords.pickup}
                              destCoords={orderInfoMapCoords.dest}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
                        <Car className="w-4 h-4" />
                        <span className="text-sm">Brak przydzielonego kierowcy</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>{/* koniec lewej kolumny */}

              {/* ── PRAWA: Klient (góra) + Mapa (dół) ── */}
              <div className="w-[45%] flex flex-col min-h-0">

                {/* ── Dane klienta ── */}
                {(o.customerName || o.customerPhone) && (
                  <div className="shrink-0 px-4 pt-4 pb-2">
                    <div className="bg-blue-50/50 dark:bg-[#1e2a3a] border border-blue-200 dark:border-[#2e4a6a] border-l-4 border-l-blue-400 dark:border-l-blue-500 rounded-lg px-4 pt-3 pb-3 shadow-md ring-1 ring-black/5 dark:ring-white/5 space-y-2">
                      <div className="flex items-center gap-2 pb-1.5 border-b border-blue-200 dark:border-[#2e4a6a]">
                        <User className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                        <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Klient</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          {o.customerName && (
                            <span className="text-gray-900 dark:text-white font-semibold text-[15px] leading-tight truncate">{o.customerName}</span>
                          )}
                          {o.clientCode && (
                            <span className="shrink-0 text-[11px] font-mono text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 px-1.5 py-0.5 rounded">
                              {o.clientCode}
                            </span>
                          )}
                        </div>
                        {o.customerPhone && (
                          <a
                            href={`tel:${o.customerPhone}`}
                            className="shrink-0 flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-[15px] hover:underline"
                          >
                            <Phone className="w-4 h-4" />
                            {o.customerPhone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mapa */}
                <div className="flex-1 min-h-0 px-4 pb-4">
                  <div className="rounded-lg overflow-hidden border border-[#b0b3b8] dark:border-[#7a7a7a] h-full">
                    <DispatcherMiniMap
                      pickupCoords={orderInfoMapCoords.pickup}
                      destinationCoords={orderInfoMapCoords.dest}
                      driverCoords={null}
                    />
                  </div>
                </div>

              </div>
            </div>

            </div>
            )}

          </div>

          {/* ── Stopka ── */}
          <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-between gap-2">

            {/* LEWA strona — Zablokuj (tylko gdy jest przypisany kierowca) */}
            <div>
              {o.assignedDriver && (
                <button
                  onClick={() => setSuspendModal({ id: o.assignedDriver!.id, name: o.assignedDriver!.name, code: o.assignedDriver!.code })}
                  className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold bg-red-700 hover:bg-red-600 active:bg-red-800 text-white rounded-md transition-colors shadow-sm"
                >
                  <Ban className="w-4 h-4" /> Zablokuj
                </button>
              )}
            </div>

            {/* PRAWA strona — Edytuj / Wyślij / Zakończ / Zamknij */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const rawDate = o.scheduledDate ?? '';
                  const dateOnly = rawDate.length >= 10 ? rawDate.slice(0, 10) : (new Date().toISOString().split('T')[0]);
                  const timeOnly = o.scheduledTime ? o.scheduledTime.slice(0, 5) : new Date().toTimeString().slice(0, 5);
                  const isScheduled = o.status === 'scheduled' || (!!rawDate && rawDate.length >= 8);
                  setOrderData({ customerPhone: o.customerPhone ?? '', customerName: o.customerName ?? '', companyName: '', pickupAddress: o.pickupAddress ?? '', destinationAddress: o.destinationAddress ?? '', taxiCount: o.taxiCount ?? 1, paymentMethod: o.paymentMethod ?? 'cash', vehicleCategory: o.vehicleCategory ?? 'standard', orderType: isScheduled ? 'scheduled' : 'standard', date: dateOnly, time: timeOnly, notes: o.notes ?? '', clientInfo: '', internalInfo: '', discount: '', travelTime: '', quote: '', contract: '', pickupZone: '', destinationZone: '' });
                  setEditingOrderId(o.orderId);
                  setTopView('form');
                  setOrderInfoModal(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors shadow-sm"
              >
                <PenLine size={15} /> Edytuj
              </button>
              <button
                disabled={!orderInfoGpsDriver}
                onClick={async () => {
                  if (!orderInfoGpsDriver) return;
                  setOrderInfoDispatchError(null);
                  const result = await dispatchOrderToDriver(o.orderId, orderInfoGpsDriver.code);
                  if (result.success) {
                    setSubmittedOrders(prev => prev.map(x => x.orderId !== o.orderId ? x : { ...x, status: 'pending_driver' as const, assignedDriver: { id: result.driverId ?? '', name: result.driverName ?? '', code: orderInfoGpsDriver.code } }));
                    setOrderInfoModal(null);
                    setActiveOrderTab('assigned');
                  } else {
                    setOrderInfoDispatchError(result.error ?? 'Błąd wydawania zlecenia.');
                  }
                }}
                className="flex items-center gap-2 px-6 h-9 text-[15px] font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors shadow-sm"
              >
                <Send size={15} /> Wyślij
              </button>
              <button onClick={() => { setFinishError(null); setFinishOrderTarget(o); setFinishModal(true); }} className="flex items-center gap-2 px-6 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors shadow-sm">
                <XIcon size={15} /> Zakończ
              </button>
              <button onClick={() => { setOrderInfoModal(null); setOrderInfoChatOpen(false); }} className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors">
                <XIcon size={15} /> Zamknij
              </button>
            </div>

          </div>

        </div>
      </div>

      {/* ── Modal czatu z kierowcą ── */}
      {orderInfoChatOpen && o.assignedDriver && (
        <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center" onClick={() => setOrderInfoChatOpen(false)}>
          <div className="w-[480px] h-[70vh] bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl flex flex-col overflow-hidden border border-[#b0b3b8] dark:border-[#7a7a7a]" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-[#7a7a7a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Czat — Taxi {o.assignedDriver.code}</span>
              </div>
              <button onClick={() => setOrderInfoChatOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <DispatcherChat initialDriverId={o.assignedDriver.id} initialDriverCode={o.assignedDriver.code} initialDriverName={o.assignedDriver.code} />
            </div>
          </div>
        </div>
      )}
      </>
      );
    })()}

    {/* ── Sub-modal: Zakończ zlecenie ── */}
    {finishModal && finishOrderTarget && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60" onClick={() => !finishLoading && setFinishModal(false)}>
        <div className="bg-white dark:bg-[#2d2d2d] rounded-lg shadow-2xl w-[560px] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Nagłówek */}
          <div className="px-6 pt-6 pb-5 border-b border-gray-200 dark:border-[#7a7a7a] flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"><Ban className="w-5 h-5 text-red-500 shrink-0" /> Zakończ zlecenie <span className="text-blue-600 dark:text-blue-400">{finishOrderTarget.orderNumber}</span></h2>
            <button onClick={() => !finishLoading && setFinishModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          {/* Opcje */}
          <div className="p-6 space-y-3">
            {finishError && (
              <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-base text-red-700 dark:text-red-300">{finishError}</div>
            )}
            {([
              { reason: 'cancelled', label: 'Anulowane przez klienta', desc: 'Kierowca otrzyma powiadomienie: Klient anulował zlecenie', color: 'bg-orange-500 hover:bg-orange-600', disabled: false },
              { reason: 'mina',      label: 'Klient się nie pojawił — Mina', desc: 'Kierowca otrzyma powiadomienie: Klient się nie pojawił', color: 'bg-red-600 hover:bg-red-700', disabled: false },
              { reason: 'no_taxi',   label: 'Brak taksówki', desc: finishOrderTarget.assignedDriver ? 'Niedostępne — zlecenie ma przypisanego kierowcę' : 'Zlecenie zostanie zamknięte bez powiadomienia', color: 'bg-[#656565] hover:bg-[#545454]', disabled: !!finishOrderTarget.assignedDriver },
            ] as { reason: string; label: string; desc: string; color: string; disabled: boolean }[]).map(opt => (
              <button
                key={opt.reason}
                disabled={opt.disabled || finishLoading}
                onClick={async () => {
                  if (opt.disabled || finishLoading) return;
                  setFinishLoading(true);
                  setFinishError(null);
                  try {
                    const r = await fetch(`/api/orders/${finishOrderTarget.orderId}/finish`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ reason: opt.reason }),
                    });
                    const d = await r.json();
                    if (!d.success) { setFinishError(d.error ?? 'Błąd'); return; }
                    // Zaktualizuj stan lokalny
                    setSubmittedOrders(prev => prev.map(o =>
                      o.orderId !== finishOrderTarget.orderId ? o : { ...o, status: opt.reason as any }
                    ));
                    setFinishModal(false);
                    setFinishOrderTarget(null);
                    setGieldaModalOrder(null);
                    setGieldaDispatchError(null);
                    setOrderInfoModal(null);
                  } catch { setFinishError('Błąd połączenia z serwerem'); }
                  finally { setFinishLoading(false); }
                }}
                className={`w-full text-left px-5 py-4 rounded-lg text-white transition-colors ${opt.color} ${opt.disabled || finishLoading ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="font-semibold text-[15px]">{opt.label}</div>
                <div className="text-sm opacity-80 mt-1">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* ── Modal zawieszenia kierowcy ── */}
    {suspendModal && (
      <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center" onClick={() => setSuspendModal(null)}>
        <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="h-1.5 bg-red-600 w-full" />
          <div className="px-6 pt-5 pb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-gray-900 dark:text-white font-bold text-base leading-tight">Zablokuj kierowcę</p>
                <p className="text-gray-500 dark:text-gray-300 text-sm">
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-green-600 text-white font-bold text-xs mr-1">{suspendModal.code}</span>
                  {suspendModal.name}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wide mb-1.5">Czas blokady</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '1 godzina',    value: '1' },
                  { label: '24 godziny',   value: '24' },
                  { label: '7 dni',        value: '168' },
                  { label: 'Bezterminowo', value: '0' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSuspendHours(opt.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      suspendHours === opt.value
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-gray-300 dark:border-[#7a7a7a] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#434343]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSuspendModal(null)}
                className="flex-1 h-10 rounded-lg border border-gray-300 dark:border-[#7a7a7a] text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors"
              >
                Anuluj
              </button>
              <button
                disabled={suspendLoading}
                onClick={async () => {
                  if (!suspendModal) return;
                  setSuspendLoading(true);
                  try {
                    const hours = suspendHours === '0' ? null : Number(suspendHours);
                    await fetch(`/api/drivers/${suspendModal.id}/suspend`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ hours }),
                    });
                    setSuspendModal(null);
                  } finally {
                    setSuspendLoading(false);
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {suspendLoading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Ban className="w-4 h-4" /> Zablokuj</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal szczegółów kierowcy ── */}
    <DriverInfoModal
      driverId={driverModalId}
      apiBase={(dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api'}
      onClose={() => setDriverModalId(null)}
    />

    {/* ── Modal konsoli restartu serwera ── */}
    {restartModalOpen && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999]">
        <div className="bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden">

          {/* Nagłówek */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-300 dark:border-[#7a7a7a]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <RotateCcw className={`w-6 h-6 text-black dark:text-white shrink-0 ${restartState === 'restarting' || restartState === 'waiting' ? 'animate-spin [animation-direction:reverse]' : ''}`} />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">Restart serwera</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">
                    {restartState === 'restarting' && 'Restartowanie...'}
                    {restartState === 'waiting' && 'Oczekiwanie na uruchomienie serwera...'}
                    {restartState === 'done' && 'Serwer gotowy ✓'}
                    {restartState === 'idle' && 'Konsola uruchamiania'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (restartState === 'idle' || restartState === 'done') setRestartModalOpen(false); }}
                disabled={restartState === 'restarting' || restartState === 'waiting'}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Obszar logu — terminal */}
          <div className="p-4 bg-gray-50 dark:bg-[#202020]">
            <pre
              ref={restartLogsRef}
              className="p-3 text-xs font-mono text-green-700 dark:text-green-300 leading-relaxed overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-gray-200 dark:border-[#696969] bg-white dark:bg-[#0d1117]"
              style={{ minHeight: '280px', maxHeight: '420px' }}
            >
              {restartLogs || 'Oczekiwanie na logi...\n'}
            </pre>
          </div>

          {/* Stopka */}
          <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-300">
              MySQL nie jest restartowany — dane są bezpieczne
            </span>
            <button
              onClick={() => { if (restartState === 'idle' || restartState === 'done') setRestartModalOpen(false); }}
              disabled={restartState === 'restarting' || restartState === 'waiting'}
              className="flex items-center gap-2 px-6 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors shadow-sm"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default DispatcherPanel;
