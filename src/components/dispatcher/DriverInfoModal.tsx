import React, { useEffect, useState, useRef } from 'react';
import {
  X, Phone, Mail, Car, MapPin, Star, Hash,
  Clock, Wifi, WifiOff, AlertTriangle, Navigation,
  MessageSquare, History, Lock, RefreshCw, ToggleLeft,
  User, Shield, CalendarClock, Plus, Search, Trash2,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// wymusza przeliczenie rozmiaru po animacji modala
const MapResizer: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

// ── Typy ────────────────────────────────────────────────────────────────────
interface DriverDetail {
  id: string;
  driver_code: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  driver_state: string | null;
  is_online: number;
  status: string | null;
  current_zone: number | null;
  queue_position: number | null;
  zone_entered_at: string | null;
  last_seen: string | null;
  free_since: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  registration_number: string | null;
  side_number: string | null;
  vehicle_categories: string | null;
  emergency_contact: string | null;
  rating: number | null;
  total_rides: number | null;
  license_number: string | null;
  license_expiry: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  preference_ids: string | null;
  // Aktywne zlecenie
  active_order_id: string | null;
  active_order_number: string | null;
  active_pickup_address: string | null;
  active_destination_address: string | null;
  active_customer_name: string | null;
  active_customer_phone: string | null;
  active_order_status: string | null;
}

interface Props {
  driverId: string | null;
  apiBase: string;
  onClose: () => void;
}

// ── Kolory stanów ────────────────────────────────────────────────────────────
const STATE_LABEL: Record<string, string> = {
  wolna:  'Wolna',
  dojazd: 'Dojazd',
  zajeta: 'Zajęta',
  kursem: 'Kursem',
};
const STATE_COLOR: Record<string, string> = {
  wolna:  'bg-green-600',
  dojazd: 'bg-red-700',
  zajeta: 'bg-purple-700',
  kursem: 'bg-blue-700',
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_driver: 'Oczekuje na kierowcę',
  accepted:       'Zaakceptowane',
  at_pickup:      'Przy odbiorze',
  in_progress:    'W trakcie kursu',
};

const LOG_TYPE_LABEL: Record<string, string> = {
  login:             'Login',
  logout:            'Logout',
  state_change:      'Stan',
  suspend:           'Blokada',
  order_accept:      'Przyjął',
  order_accept_next: 'Następny',
  order_reject:      'Odrzucił',
  order_at_pickup:   'Odbiór',
  order_pickup:      'Klient',
  order_complete:    'Koniec',
  order_cancelled:   'Anul.',
  order_timeout:     'Timeout',
  gielda_register:   'Giełda',
  gielda_assigned:   'Przydział',
  zone_enter:        'Rejon +',
  zone_leave:        'Rejon −',
  offline_auto:      'Offline',
};

const LOG_TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  login:             { color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/30'   },
  logout:            { color: 'text-gray-600 dark:text-gray-300',    bg: 'bg-gray-100 dark:bg-[#383838]'       },
  state_change:      { color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/30'     },
  suspend:           { color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/30'       },
  order_accept:      { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  order_accept_next: { color: 'text-teal-700 dark:text-teal-300',     bg: 'bg-teal-100 dark:bg-teal-900/30'     },
  order_reject:      { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  order_at_pickup:   { color: 'text-cyan-700 dark:text-cyan-300',     bg: 'bg-cyan-100 dark:bg-cyan-900/30'     },
  order_pickup:      { color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  order_complete:    { color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/30'   },
  order_cancelled:   { color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/30'       },
  order_timeout:     { color: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-100 dark:bg-amber-900/30'   },
  gielda_register:   { color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  gielda_assigned:   { color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  zone_enter:        { color: 'text-sky-700 dark:text-sky-300',       bg: 'bg-sky-100 dark:bg-sky-900/30'       },
  zone_leave:        { color: 'text-gray-500 dark:text-gray-300',   bg: 'bg-gray-100 dark:bg-[#383838]'      },
  offline_auto:      { color: 'text-gray-600 dark:text-gray-300',    bg: 'bg-gray-100 dark:bg-[#383838]'       },
  _default:          { color: 'text-gray-600 dark:text-gray-300',    bg: 'bg-gray-100 dark:bg-[#383838]'       },
};

interface DriverLog {
  id: number;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Komponent ────────────────────────────────────────────────────────────────
const DriverInfoModal: React.FC<Props> = ({ driverId, apiBase, onClose }) => {
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dane' | 'logi' | 'blokady'>('dane');
  // Blokady
  const [driverBlocks, setDriverBlocks] = useState<any[]>([]);
  const [showAddDriverBlock, setShowAddDriverBlock] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [logs, setLogs] = useState<DriverLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [allPreferences, setAllPreferences] = useState<{ id: number; name: string; color: string }[]>([]);

  useEffect(() => {
    fetch('/api/table/preferences')
      .then(r => r.json())
      .then(j => {
        if (!j.success || !j.data) return;
        // Format columns/rows (zwykły endpoint /api/table/)
        if (j.data.columns && Array.isArray(j.data.rows)) {
          const cols: string[] = j.data.columns;
          setAllPreferences(j.data.rows.map((row: any[]) => {
            const obj: any = {};
            cols.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
          }));
        } else if (Array.isArray(j.data)) {
          setAllPreferences(j.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!driverId) { setDriver(null); return; }
    setLoading(true);
    setError(null);
    setActiveTab('dane');
    fetch(`${apiBase}/drivers/${driverId}/detail`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (d.success) {
          setDriver(d.data);
          fetch(`/api/admin/blocks/driver/${driverId}`).then(r => r.json()).then(b => setDriverBlocks(b.data ?? [])).catch(() => {});
        }
        else setError(d.error ?? 'Błąd pobierania danych');
      })
      .catch(err => setError(`Błąd: ${err.message ?? 'połączenia z serwerem'}`))
      .finally(() => setLoading(false));
  }, [driverId, apiBase]);

  useEffect(() => {
    if (!driverId || activeTab !== 'logi') return;
    setLogsLoading(true);
    fetch(`${apiBase}/drivers/${driverId}/logs?limit=200`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (d.success && Array.isArray(d.data)) setLogs(d.data); else setLogs([]); })
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [driverId, apiBase, activeTab]);

  if (!driverId) return null;

  // ── helpers ─────────────────────────────────────────────────────────────
  const stateBg   = driver ? (STATE_COLOR[driver.driver_state ?? ''] ?? 'bg-zinc-500') : 'bg-zinc-500';
  const stateLabel = driver ? (STATE_LABEL[driver.driver_state ?? ''] ?? driver.driver_state ?? '—') : '—';
  const isOnline  = !!driver?.is_online;

  const freeSinceMin = driver?.free_since
    ? Math.floor((Date.now() - new Date(driver.free_since).getTime()) / 60000)
    : null;

  const lastSeenStr = driver?.last_seen
    ? new Date(driver.last_seen).toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-[92%] h-[82vh] bg-white dark:bg-[#2d2d2d] rounded-md shadow-2xl border border-[#c4c7cc] dark:border-[#7a7a7a] flex flex-col">

        {/* ── Loading / Error ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Ładowanie danych kierowcy…</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-500">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {driver && !loading && (
          <>
            {/* ══ NAGŁÓWEK ══════════════════════════════════════════════════ */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#c4c7cc] dark:border-[#696969]">
              <div className="flex items-center gap-3 min-w-0">
              {/* Prostokąt z kodem */}
              <div className={`shrink-0 px-3 h-8 rounded-md ${stateBg} flex items-center justify-center`}>
                <span className="text-xl font-bold text-white">{driver.driver_code || '?'}</span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    {driver.name}
                  </h2>
                  {isOnline && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Wifi className="w-3 h-3" /> Online
                    </span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold text-white ${stateBg}`}>
                    {stateLabel}
                  </span>
                </div>
                {(driver.rating != null || (driver.total_rides != null && driver.total_rides > 0)) && (
                  <div className="flex items-center gap-3 mt-1">
                    {driver.rating != null && (
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-4 h-4 fill-amber-400" />
                        <span className="font-bold text-gray-900 dark:text-white">{Number(driver.rating).toFixed(1)}</span>
                      </div>
                    )}
                    {driver.total_rides != null && driver.total_rides > 0 && (
                      <div className="text-xs text-gray-400">{driver.total_rides} kursów</div>
                    )}
                  </div>
                )}
              </div>
              </div>

              {/* Zakładki + X — identyczne jak w modalu "info o zleceniu" */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-[#7a7a7a]">
                  {([
                    { id: 'dane',    label: 'Szczegóły' },
                    { id: 'logi',    label: `Logi${logs.length > 0 ? ` (${logs.length})` : ''}` },
                    { id: 'blokady', label: `Blokady${driverBlocks.length > 0 ? ` (${driverBlocks.length})` : ''}` },
                  ] as { id: 'dane' | 'logi' | 'blokady'; label: string }[]).map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                      className={`px-5 py-1.5 text-sm font-semibold transition-all whitespace-nowrap ${
                        activeTab === t.id
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

            {/* ══ TREŚĆ (scrollowalna) ════════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto">

            {/* ══ ZAKŁADKA LOGI ══ */}
            {activeTab === 'logi' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4">
                  {logsLoading ? (
                    <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-300 gap-3">
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                      Ładowanie logów...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-300 gap-2">
                      <History className="w-10 h-10 opacity-40" />
                      <p className="text-sm">Brak logów dla tego kierowcy</p>
                    </div>
                  ) : (
                    <div className="relative px-2">
                      <div className="absolute left-[14px] top-4 bottom-4 w-[3px] bg-blue-500 dark:bg-blue-500 rounded-full" />
                      {logs.map((log, idx) => {
                        const ld = new Date(log.created_at);
                        const timeStr = `${String(ld.getHours()).padStart(2,'0')}:${String(ld.getMinutes()).padStart(2,'0')}:${String(ld.getSeconds()).padStart(2,'0')}`;
                        const dateStr = `${String(ld.getDate()).padStart(2,'0')}.${String(ld.getMonth()+1).padStart(2,'0')}.${ld.getFullYear()}`;
                        const isLast = idx === logs.length - 1;
                        const { color } = LOG_TYPE_STYLE[log.type] ?? LOG_TYPE_STYLE._default;
                        return (
                          <React.Fragment key={log.id}>
                            <div className="flex items-start gap-3 py-2.5">
                              <div className="shrink-0 w-3.5 h-3.5 rounded-full bg-blue-700 dark:bg-blue-400 z-10 relative mt-0.5" />
                              <span className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-300 tabular-nums mt-0.5">{dateStr} {timeStr}</span>
                              <div className="flex-1 min-w-0">
                                <span className={`text-sm font-semibold leading-snug ${color}`}>[{LOG_TYPE_LABEL[log.type] ?? log.type}]</span>
                                {' '}
                                <span className="text-sm text-gray-900 dark:text-white leading-snug">{log.title}</span>
                                {log.description && (
                                  <div className="text-xs text-gray-500 dark:text-gray-300 mt-0.5 leading-relaxed">{log.description}</div>
                                )}
                              </div>
                            </div>
                            {!isLast && <div className="ml-[26px] h-px bg-gray-200 dark:bg-[#444444]" />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t border-gray-200 dark:border-[#696969] px-5 py-2.5 flex justify-end">
                  <button
                    onClick={() => {
                      setLogsLoading(true);
                      fetch(`${apiBase}/drivers/${driverId}/logs?limit=200`)
                        .then(r => r.json())
                        .then(d => setLogs(Array.isArray(d.data) ? d.data : []))
                        .catch(() => setLogs([]))
                        .finally(() => setLogsLoading(false));
                    }}
                    className="flex items-center gap-1.5 px-3 h-7 text-xs font-medium text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white border border-gray-300 dark:border-[#7a7a7a] rounded transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Odśwież
                  </button>
                </div>
              </div>
            )}

            {/* ══ ZAKŁADKA DANE ══ */}
            {activeTab === 'dane' && (<>

            {/* ══ STATS + KARTY (lewa) | MAPA (prawa) ════════════════════════ */}
            <div className="flex items-stretch gap-4 px-5 py-4">

              {/* LEWA kolumna — stats + karty */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">

                {/* Stats */}
                <div className="grid grid-cols-3 divide-x divide-[#c4c7cc] dark:divide-[#4a4a4a] border border-[#c4c7cc] dark:border-[#696969] rounded-md">
                  <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{driver.current_zone ?? '—'}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-300">Rejon</span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{driver.queue_position ?? '—'}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-300">Pozycja w kolejce</span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-3 gap-0.5">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{freeSinceMin != null ? `${freeSinceMin} min` : '—'}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-300">Wolna od</span>
                  </div>
                </div>

                {/* Szczegóły kierowcy + Pojazd obok siebie */}
                <div className="grid grid-cols-2 gap-4">

                  {/* Szczegóły kierowcy */}
                  <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                    {/* Tytuł — bez ikonki, podkreślenie nie na całą szerokość */}
                    <div className="px-3 py-2">
                      <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                        Szczegóły kierowcy
                      </h3>
                    </div>
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      <Row label="Imię i nazwisko" value={driver.name} />
                      <Row label="Telefon"          value={driver.phone_number} />
                      <Row label="Kontakt awaryjny" value={driver.emergency_contact} />
                      <Row label="Ostatnio widziany" value={lastSeenStr} />
                    </div>
                  </div>

                  {/* Pojazd */}
                  <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                    {/* Tytuł — identyczny jak Szczegóły kierowcy */}
                    <div className="px-3 py-2">
                      <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                        Pojazd
                      </h3>
                    </div>
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      <Row label="Marka / Model"    value={[driver.vehicle_brand, driver.vehicle_model].filter(Boolean).join(' ') || null} />
                      <Row label="Nr rejestracyjny" value={driver.registration_number} />
                      <Row label="Numer boczny"     value={driver.side_number} />
                      <Row label="Kolor"            value={driver.vehicle_color} />
                    </div>
                  </div>

                </div>

                {/* Preferencje — osobny div pod siatką */}
                <div className="rounded-md bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] overflow-hidden">
                  <div className="px-3 py-2">
                    <h3 className="text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider pb-2 border-b border-[#c4c7cc] dark:border-[#7a7a7a] inline-block pr-6">
                      Preferencje
                    </h3>
                  </div>
                  <div className="px-3 pb-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {(() => {
                        try {
                          const raw = driver.preference_ids;
                          const ids: number[] = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
                          if (!ids.length) return '—';
                          return ids
                            .map(id => allPreferences.find(p => Number(p.id) === Number(id))?.name)
                            .filter(Boolean)
                            .join(', ') || '—';
                        } catch { return '—'; }
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* PRAWA — mapa */}
              <div className="shrink-0 rounded-md border border-[#c4c7cc] dark:border-[#696969]" style={{ width: '33%', position: 'relative' }}>
                {driver.latitude != null && driver.longitude != null ? (
                  <MapContainer
                    key={`${driver.id}-${driver.latitude}-${driver.longitude}`}
                    center={[driver.latitude, driver.longitude]}
                    zoom={15}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    zoomControl={true}
                    scrollWheelZoom={false}
                    doubleClickZoom={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker
                      position={[driver.latitude, driver.longitude]}
                      icon={L.divIcon({
                        className: 'driver-map-marker',
                        html: `<div style="background:${stateBg.includes('green') ? '#16a34a' : stateBg.includes('red') ? '#b91c1c' : stateBg.includes('purple') ? '#7e22ce' : '#1d4ed8'};color:white;padding:1px 8px;border-radius:4px;font-size:20px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.5);text-align:center;min-width:40px;white-space:nowrap">${driver.driver_code}</div>`,
                        iconSize: [50, 28],
                        iconAnchor: [25, 14],
                      })}
                    />
                    <MapResizer />
                  </MapContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-300 bg-gray-50 dark:bg-[#383838]/30 rounded-md">
                    <MapPin className="w-5 h-5" />
                    <span className="text-xs">Brak pozycji GPS</span>
                  </div>
                )}
              </div>

            </div>{/* /STATS + KARTY + MAPA */}

            {/* ── Aktywne zlecenie ── */}
            <div className="px-5 pb-5 flex flex-col gap-4">
              {driver.active_order_id ? (
                <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden">
                  <div className="px-3 py-2 bg-blue-100 dark:bg-blue-900/40 border-b border-blue-200 dark:border-blue-800">
                    <h3 className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5" />
                      Aktywne zlecenie
                      <span className="ml-auto font-normal normal-case text-blue-500 dark:text-blue-400">
                        {ORDER_STATUS_LABEL[driver.active_order_status ?? ''] ?? driver.active_order_status}
                      </span>
                    </h3>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <Row label="Nr zlecenia" value={driver.active_order_number} />
                    <Row label="Klient" value={driver.active_customer_name} />
                    <Row label="Telefon klienta" value={driver.active_customer_phone} />
                    <Row label="Adres odbioru" value={driver.active_pickup_address} />
                    <Row label="Cel" value={driver.active_destination_address} />
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-[#b0b3b8] dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#2d2d2d] px-4 py-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-300">
                  <CalendarClock className="w-4 h-4 shrink-0" />
                  Brak aktywnego zlecenia
                </div>
              )}

            </div>{/* /aktywne zlecenie */}

            </>)}

            {/* ══ ZAKŁADKA BLOKADY ══ */}
            {activeTab === 'blokady' && (
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-200">Blokady klientów</p>
                  <button
                    onClick={() => { setShowAddDriverBlock(true); setClientSearch(''); setClientResults([]); }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Dodaj blokadę
                  </button>
                </div>
                {driverBlocks.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Brak blokad</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {driverBlocks.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between bg-[#2d2d2d] border border-[#7a7a7a] rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-300 font-mono">{b.client_code}</span>
                          <span className="text-sm text-gray-200">{b.client_name}</span>
                          <span className="text-xs text-gray-400">{b.phone_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.blocked_by === 'driver' ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'}`}>
                            {b.blocked_by === 'driver' ? 'przez kierowcę' : 'przez klienta'}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
                            setDriverBlocks(prev => prev.filter(x => x.id !== b.id));
                          }}
                          className="p-1.5 hover:bg-red-600/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Modal wyszukiwania klienta */}
                {showAddDriverBlock && (
                  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10002] p-4">
                    <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] w-full max-w-md">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
                        <h3 className="text-base font-bold text-white">Zablokuj klienta</h3>
                        <button onClick={() => setShowAddDriverBlock(false)} className="p-1.5 hover:bg-[#272727] rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={clientSearch}
                            onChange={async e => {
                              const q = e.target.value;
                              setClientSearch(q);
                              if (q.length < 2) { setClientResults([]); return; }
                              setClientSearchLoading(true);
                              const res = await fetch(`/api/admin/clients-search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ data: [] }));
                              setClientResults(res.data ?? []);
                              setClientSearchLoading(false);
                            }}
                            placeholder="Szukaj po nazwie, kodzie lub telefonie..."
                            className="w-full pl-9 pr-3 py-2.5 bg-[#272727] border border-[#3d3d3d] rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            autoFocus
                          />
                        </div>
                        {clientSearchLoading && <p className="text-gray-400 text-sm text-center py-2">Szukam...</p>}
                        {clientResults.length > 0 && (
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {clientResults.map((c: any) => (
                              <button key={c.id}
                                onClick={async () => {
                                  if (!driverId) return;
                                  await fetch('/api/admin/blocks', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ driver_id: driverId, client_id: c.id, blocked_by: 'driver' }),
                                  });
                                  const bRes = await fetch(`/api/admin/blocks/driver/${driverId}`).then(r => r.json()).catch(() => ({ data: [] }));
                                  setDriverBlocks(bRes.data ?? []);
                                  setShowAddDriverBlock(false);
                                  setClientSearch('');
                                  setClientResults([]);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a2a2a] rounded-lg text-left transition-colors"
                              >
                                <span className="text-xs font-bold text-gray-400 font-mono w-14 shrink-0">{c.client_code}</span>
                                <span className="text-sm text-white flex-1">{c.client_name}</span>
                                <span className="text-xs text-gray-400">{c.phone_number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {clientSearch.length >= 2 && !clientSearchLoading && clientResults.length === 0 && (
                          <p className="text-gray-400 text-sm text-center py-2">Nie znaleziono klientów</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            </div>{/* /scrollowalna treść */}

            {/* ══ STOPKA — taka sama jak modal zlecenia ══════════════════ */}
            <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-between gap-2">

              {/* LEWA — Zablokuj */}
              <ActionBtn icon={<Lock className="w-4 h-4" />} label="Zablokuj" color="red" onClick={() => {}} />

              {/* PRAWA — pozostałe + Zamknij */}
              <div className="flex items-center gap-2">
                <ActionBtn icon={<Phone className="w-4 h-4" />}            label="Zadzwoń"       color="emerald" onClick={() => {}} />
                <ActionBtn icon={<MessageSquare className="w-4 h-4" />}    label="Wiadomość"     color="sky"     onClick={() => {}} />
                <ActionBtn icon={<ToggleLeft className="w-4 h-4" />}       label="Zmień stan"    color="indigo"  onClick={() => {}} />
                <ActionBtn icon={<RefreshCw className="w-4 h-4" />}        label="Zmień kolejkę" color="violet"  onClick={() => {}} />
                <ActionBtn icon={<History className="w-4 h-4" />}          label="Historia"      color="gray"    onClick={() => {}} />
                <ActionBtn icon={<X className="w-4 h-4" />}                label="Zamknij"       color="gray"    onClick={onClose} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Pomocnicze komponenty ────────────────────────────────────────────────────
const Row: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-2 text-sm">
    <span className="text-gray-400 dark:text-gray-300 shrink-0">{label}</span>
    <span className="text-gray-900 dark:text-white font-semibold text-right break-all">
      {value ?? <span className="text-gray-300 dark:text-gray-300 font-normal">—</span>}
    </span>
  </div>
);

const COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
  sky:     'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white',
  indigo:  'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white',
  violet:  'bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white',
  red:     'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white',
  gray:    'bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white',
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
    {icon}
    {label}
  </button>
);

export default DriverInfoModal;
