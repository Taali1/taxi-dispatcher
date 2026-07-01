import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair, Loader, AlertCircle, X, ChevronDown, Check } from 'lucide-react';
import AddressAutocomplete, { LocalAddress } from './AddressAutocomplete';
import { zoneService } from '../../services/zoneService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { createOrder, CreateOrderResult, dispatchOrderToDriver } from '../../services/orderService';
import { settingsService } from '../../services/settingsService';
import { dataSourceService } from '../../services/dataSourceService';
import { useAuth } from '../../contexts/AuthContext';

// ── Typy ────────────────────────────────────────────────────────────────────

export interface OrderData3 {
  customerPhone: string;
  customerName: string;
  pickupAddress: string;
  destinationAddress: string;
  taxiCount: number;
  paymentMethod: string;
  vehicleCategory: string;
  date: string;
  time: string;
  notes: string;
}

interface Coords { lat: number; lng: number }

interface OrderForm3Props {
  orderData: OrderData3;
  setOrderData: React.Dispatch<React.SetStateAction<OrderData3>>;
  onPickupCoordsChange?: (coords: Coords | null) => void;
  onDestinationCoordsChange?: (coords: Coords | null) => void;
  onRequestMiniMap?: () => void;
  onOrderCreated?: (result: CreateOrderResult, orderData: OrderData3) => void;
  onZoneDetected?: (zone: number | null, coords: Coords | null) => void;
}

const INITIAL: OrderData3 = {
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
};

const PREFERENCES_LIST = [
  'Niepalący',
  'Fotelik dziecięcy',
  'Klimatyzacja',
  'Duży bagażnik',
  'Zwierzęta OK',
  'Pomoc z bagażem',
  'Cisza',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const phoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? `order_notes_${digits.slice(-9)}` : null;
};

const inputCls = (err = false) =>
  `w-full h-9 px-3 text-sm rounded-md border transition-colors
   bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white
   placeholder-gray-400 dark:placeholder-gray-400
   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
   ${err ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-[#7a7a7a]'}`;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-300 uppercase tracking-widest mb-1.5 select-none">
    {children}
  </p>
);

// ── Pill (payment-aware) ────────────────────────────────────────────────────

const PayPill: React.FC<{
  active: boolean;
  onClick: () => void;
  variant: 'default' | 'yellow' | 'green';
  children: React.ReactNode;
}> = ({ active, onClick, variant, children }) => {
  let cls = '';
  if (active) {
    if (variant === 'yellow')
      cls = 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-300 shadow-sm';
    else if (variant === 'green')
      cls = 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300 shadow-sm';
    else
      cls = 'bg-[#242424] dark:bg-white border-[#2a2a2a] dark:border-white text-white dark:text-gray-900 shadow-sm';
  } else {
    cls = 'bg-gray-50 dark:bg-[#383838] border-gray-200 dark:border-[#7a7a7a] text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#585858]';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-9 rounded-md text-xs font-semibold border transition-all duration-150 ${cls}`}
    >
      {children}
    </button>
  );
};

const Pill: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 px-3 rounded-md text-xs font-semibold transition-all duration-150 border ${
      active
        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
        : 'bg-gray-50 dark:bg-[#383838] border-gray-200 dark:border-[#7a7a7a] text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#585858]'
    }`}
  >
    {children}
  </button>
);

// ── Komponent ───────────────────────────────────────────────────────────────

const OrderForm3: React.FC<OrderForm3Props> = ({
  orderData, setOrderData,
  onPickupCoordsChange, onDestinationCoordsChange,
  onRequestMiniMap, onOrderCreated, onZoneDetected,
}) => {
  const { user } = useAuth();

  // Stan formularza
  const [detectedZone, setDetectedZone] = useState<number | null>(null);
  const [isDetectingZone, setIsDetectingZone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baseCity, setBaseCity] = useState('');
  const [localAddresses, setLocalAddresses] = useState<LocalAddress[]>([]);
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(null);
  const [clientCode, setClientCode] = useState<string | null>(null);
  const [isLookingUpClient, setIsLookingUpClient] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationFields, setValidationFields] = useState({ phone: false, pickup: false });
  const [manualMode, setManualMode] = useState(false);
  const [manualDriverCode, setManualDriverCode] = useState('');

  // Nowe pola
  const [orderType, setOrderType] = useState<'zwykle' | 'terminowe' | 'cykliczne'>('zwykle');
  const [addressNotes, setAddressNotes] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [preferences, setPreferences] = useState<string[]>([]);
  const [prefOpen, setPrefOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [discount, setDiscount] = useState('');
  const [minutesFromNow, setMinutesFromNow] = useState('');

  const [toast, setToast] = useState<{
    open: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    content: React.ReactNode;
  }>({ open: false, type: 'success', title: '', content: null });

  const prefRef = useRef<HTMLDivElement>(null);

  // ── Persystencja uwag per telefon ──────────────────────────────────────

  const notesLoadedForRef = useRef<string | null>(null);

  // Auto-load uwag
  useEffect(() => {
    const key = phoneKey(orderData.customerPhone);
    if (!key) { notesLoadedForRef.current = null; return; }
    if (notesLoadedForRef.current === key) return; // już załadowane
    notesLoadedForRef.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        setAddressNotes(saved.addressNotes ?? '');
        setClientNotes(saved.clientNotes ?? '');
        setInternalNotes(saved.internalNotes ?? '');
      }
    } catch { /* ignore */ }
  }, [orderData.customerPhone]);

  // Auto-save uwag (debounced)
  useEffect(() => {
    const key = phoneKey(orderData.customerPhone);
    if (!key) return;
    const timer = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ addressNotes, clientNotes, internalNotes }));
    }, 500);
    return () => clearTimeout(timer);
  }, [addressNotes, clientNotes, internalNotes, orderData.customerPhone]);

  // ── Za ile minut → auto-ustaw czas ────────────────────────────────────

  useEffect(() => {
    const mins = parseInt(minutesFromNow);
    if (!mins || mins <= 0) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + mins);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setOrderData(p => ({ ...p, time: `${hh}:${mm}` }));
  }, [minutesFromNow]);

  // ── Standardowe hooki (identyczne z OrderForm2) ────────────────────────

  const pickResultHandlerRef = useRef<((raw: string | null) => void) | null>(null);
  pickResultHandlerRef.current = (raw) => {
    if (!raw || !user) return;
    try {
      const result = JSON.parse(raw);
      if (Date.now() - result.ts > 60000) return;
      const coords = { lat: result.lat, lng: result.lng };
      if (result.type === 'pickup') {
        updateField('pickupAddress', result.address);
        setPickupCoords(coords); onPickupCoordsChange?.(coords);
        if (validationFields.pickup) setValidationFields(p => ({ ...p, pickup: false }));
      } else if (result.type === 'destination') {
        updateField('destinationAddress', result.address);
        setDestinationCoords(coords); onDestinationCoordsChange?.(coords);
      }
      localStorage.removeItem(`dispatch_pick_result_${user.id}`);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    const key = `dispatch_pick_result_${user.id}`;
    const onStorage = (e: StorageEvent) => { if (e.key === key) pickResultHandlerRef.current?.(e.newValue); };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => pickResultHandlerRef.current?.(localStorage.getItem(key)), 400);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, [user?.id]);

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(() => setToast(p => ({ ...p, open: false })), 8000);
    return () => clearTimeout(t);
  }, [toast.open, toast.title]);

  useEffect(() => {
    if (!validationError) return;
    const t = setTimeout(() => setValidationError(null), 4000);
    return () => clearTimeout(t);
  }, [validationError]);

  useEffect(() => {
    settingsService.getSettings().then(s => { if (s.baseCity) setBaseCity(s.baseCity); });
    fetch('/api/local-addresses/all')
      .then(r => r.json())
      .then(json => { if (Array.isArray(json.results)) setLocalAddresses(json.results); })
      .catch(() => {});
  }, []);

  // Lookup klienta
  useEffect(() => {
    const phone = orderData.customerPhone.trim();
    if (phone.replace(/\D/g, '').length < 9) { setClientCode(null); return; }
    setIsLookingUpClient(true);
    const timer = setTimeout(async () => {
      try {
        const r = await dataSourceService.query<{ clientCode: string; clientName: string }>(
          'SELECT client_code, client_name FROM clients WHERE phone_number = ?', [phone]
        );
        if (r.success && r.data?.length) {
          setClientCode(r.data[0].clientCode);
          if (r.data[0].clientName) setOrderData(p => ({ ...p, customerName: r.data[0].clientName }));
        } else {
          setClientCode('');
        }
      } catch { setClientCode(''); }
      finally { setIsLookingUpClient(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [orderData.customerPhone]);

  // Wykrywanie rejonu
  useEffect(() => {
    if (!orderData.pickupAddress) { setDetectedZone(null); return; }
    setIsDetectingZone(true);
    zoneService.getZones().then(zones => {
      const pts = zones.map(z => ({ id: z.number, name: z.name, coordinates: z.coordinates }));
      const zds = new ZoneDetectionService(pts);
      if (pickupCoords) {
        const coordZone = zds.detectZoneFromCoordinates(pickupCoords.lat, pickupCoords.lng);
        setDetectedZone(coordZone ?? zds.detectZoneFromAddress(orderData.pickupAddress));
      } else {
        setDetectedZone(zds.detectZoneFromAddress(orderData.pickupAddress));
      }
      setIsDetectingZone(false);
    }).catch(() => { setDetectedZone(null); setIsDetectingZone(false); });
  }, [orderData.pickupAddress, pickupCoords]);

  useEffect(() => { onZoneDetected?.(detectedZone, pickupCoords); }, [detectedZone, pickupCoords]);

  // Zamknij dropdown preferencji po kliknięciu poza
  useEffect(() => {
    if (!prefOpen) return;
    const handler = (e: MouseEvent) => {
      if (prefRef.current && !prefRef.current.contains(e.target as Node)) setPrefOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prefOpen]);

  // ── Akcje ─────────────────────────────────────────────────────────────────

  const updateField = (field: keyof OrderData3, value: string | number) =>
    setOrderData(p => ({ ...p, [field]: value }));

  const isMapOpen = () => {
    if (!user) return false;
    return Date.now() - parseInt(localStorage.getItem(`map_alive_${user.id}`) || '0', 10) < 4000;
  };

  const buildNotes = (): string => {
    const parts: string[] = [];
    if (orderData.notes.trim()) parts.push(orderData.notes.trim());
    if (addressNotes.trim()) parts.push(`[Adres] ${addressNotes.trim()}`);
    if (clientNotes.trim()) parts.push(`[Klient] ${clientNotes.trim()}`);
    if (internalNotes.trim()) parts.push(`[Wewn.] ${internalNotes.trim()}`);
    if (companyName.trim()) parts.push(`Firma: ${companyName.trim()}`);
    if (discount.trim()) parts.push(`Rabat: ${discount.trim()}%`);
    if (preferences.length) parts.push(`Pref: ${preferences.join(', ')}`);
    if (orderType !== 'zwykle') parts.push(`Typ: ${orderType}`);
    return parts.join(' | ');
  };

  const handleClear = () => {
    setOrderData({ ...INITIAL });
    setDetectedZone(null); setPickupCoords(null); setDestinationCoords(null);
    setClientCode(null);
    onPickupCoordsChange?.(null); onDestinationCoordsChange?.(null);
    setOrderType('zwykle');
    setAddressNotes(''); setClientNotes(''); setInternalNotes('');
    setPreferences([]);
    setCompanyName(''); setDiscount(''); setMinutesFromNow('');
    setManualMode(false); setManualDriverCode('');
  };

  const validate = (): boolean => {
    const missing: string[] = [];
    const inv = { phone: false, pickup: false };
    if (!orderData.customerPhone.trim()) { missing.push('Numer telefonu'); inv.phone = true; }
    if (!orderData.pickupAddress.trim()) { missing.push('Adres odbioru'); inv.pickup = true; }
    if (missing.length) {
      setValidationFields(inv);
      setValidationError(missing.length === 1 ? `${missing[0]} jest wymagany.` : `${missing.join(' i ')} są wymagane.`);
      return false;
    }
    setValidationFields({ phone: false, pickup: false });
    return true;
  };

  const handleSuccess = (result: CreateOrderResult, driverLabel?: string) => {
    onOrderCreated?.(result, { ...orderData });
    const driverCode = result.assignedDriver?.code ?? driverLabel?.split('—')[0]?.trim() ?? null;
    const hasDriver = !!(result.assignedDriver || driverLabel);
    setToast({
      open: true, type: hasDriver ? 'success' : 'warning',
      title: hasDriver ? 'Zlecenie wydane' : 'Zlecenie oczekujące',
      content: (
        <div className="space-y-1">
          <div>{orderData.pickupAddress}</div>
          <div>
            {result.pickupRegionId != null && <>Rejon: <strong>{result.pickupRegionId}</strong></>}
            {result.pickupRegionId != null && driverCode && <span className="mx-2">|</span>}
            {driverCode && <>Kierowca: <strong>{driverCode}</strong></>}
          </div>
        </div>
      ),
    });
    handleClear();
  };

  const handleError = (error?: string) => setToast({
    open: true, type: 'error', title: 'Błąd zapisu zlecenia',
    content: error || 'Nieznany błąd. Sprawdź połączenie z bazą danych.',
  });

  const payloadWithNotes = () => ({
    ...orderData,
    notes: buildNotes(),
    pickupRegionId: detectedZone,
  });

  const handleWydaj = async () => {
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({ ...payloadWithNotes(), taxiCount: 1 });
      if (r.success) results.push(r);
    }
    setIsSubmitting(false);
    if (results.length === 0) { handleError('Nie udało się utworzyć zlecenia'); return; }
    results.forEach(r => onOrderCreated?.(r, { ...orderData }));
    const last = results[results.length - 1];
    const hasDriver = !!last.assignedDriver;
    const driverCodes = results.map(r => r.assignedDriver?.code).filter(Boolean);
    setToast({
      open: true,
      type: hasDriver ? 'success' : 'warning',
      title: count > 1
        ? (hasDriver ? `Wydano ${results.length} zleceń` : `Dodano ${results.length} zleceń do kolejki`)
        : (hasDriver ? 'Zlecenie wydane' : 'Zlecenie oczekujące'),
      content: (
        <div className="space-y-1">
          <div>{orderData.pickupAddress}</div>
          <div>
            {last.pickupRegionId != null && <>Rejon: <strong>{last.pickupRegionId}</strong></>}
            {driverCodes.length > 0 && <>{last.pickupRegionId != null && <span className="mx-2">|</span>}Kierowca{driverCodes.length > 1 ? 'y' : ''}: <strong>{driverCodes.join(', ')}</strong></>}
          </div>
        </div>
      ),
    });
    handleClear();
  };

  const handleOczekujace = async () => {
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({ ...payloadWithNotes(), taxiCount: 1, skipAutoAssign: true });
      if (r.success) results.push(r);
    }
    setIsSubmitting(false);
    if (results.length === 0) { handleError('Nie udało się utworzyć zlecenia'); return; }
    results.forEach(r => onOrderCreated?.(r, { ...orderData }));
    const last = results[results.length - 1];
    setToast({
      open: true, type: 'warning',
      title: count > 1 ? `Dodano ${results.length} zleceń do kolejki` : 'Zlecenie oczekujące',
      content: (
        <div className="space-y-1">
          <div>{orderData.pickupAddress}</div>
          {last.pickupRegionId != null && <div>Rejon: <strong>{last.pickupRegionId}</strong></div>}
        </div>
      ),
    });
    handleClear();
  };

  const handleRecznie = async () => {
    const code = manualDriverCode.trim().toUpperCase();
    if (!code) { setValidationError('Wpisz numer kierowcy.'); return; }
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const dispatched: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({ ...payloadWithNotes(), taxiCount: 1, skipAutoAssign: true });
      if (!r.success || !r.orderId) continue;
      const d = await dispatchOrderToDriver(r.orderId, code);
      onOrderCreated?.(r, { ...orderData });
      if (d.success) dispatched.push(r.orderNumber ?? '');
    }
    setIsSubmitting(false);
    if (dispatched.length === 0) {
      setToast({ open: true, type: 'error', title: 'Błąd wydania', content: 'Nie udało się przydzielić kierowcy.' });
    } else {
      setToast({
        open: true, type: 'success',
        title: count > 1 ? `Wydano ${dispatched.length} z ${count} zleceń → ${code}` : `Zlecenie wydane → ${code}`,
        content: <div>{orderData.pickupAddress}</div>,
      });
    }
    handleClear();
  };

  const togglePref = (p: string) =>
    setPreferences(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const mapBtn = (type: 'pickup' | 'destination') => (
    <button
      type="button"
      title={type === 'pickup' ? 'Zaznacz odbiór na mapie' : 'Zaznacz cel na mapie'}
      onClick={() => {
        if (!user) return;
        localStorage.setItem(`dispatch_pick_request_${user.id}`, JSON.stringify({ type, ts: Date.now() }));
        if (!isMapOpen()) onRequestMiniMap?.();
      }}
      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-gray-200 dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#383838] hover:bg-gray-100 dark:hover:bg-[#585858] transition-colors"
    >
      <Crosshair className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white dark:bg-[#202020] rounded-xl shadow-sm border border-gray-200 dark:border-[#696969] overflow-hidden flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#242424] dark:bg-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-sm font-bold text-white uppercase tracking-widest">Nowe Zlecenie</span>
        </div>
        <div className="flex items-center gap-2">
          {isDetectingZone && <Loader className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
          {!isDetectingZone && detectedZone !== null && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded-md">
              Rejon {detectedZone}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-4 overflow-y-auto">

        {/* ROW 1: Klient + Trasa */}
        <div className="grid grid-cols-5 gap-4">
          {/* Klient — 2 kolumny */}
          <div className="col-span-2">
            <Label>Klient</Label>
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  type="tel"
                  value={orderData.customerPhone}
                  onChange={e => {
                    updateField('customerPhone', e.target.value);
                    if (validationFields.phone) setValidationFields(p => ({ ...p, phone: false }));
                  }}
                  placeholder="Telefon"
                  className={inputCls(validationFields.phone)}
                  style={{ flex: '0 0 45%' }}
                />
                <input
                  type="text"
                  value={orderData.customerName}
                  onChange={e => updateField('customerName', e.target.value)}
                  placeholder="Nazwa / firma"
                  className={inputCls()}
                />
              </div>
              <div className={`flex items-center h-8 px-3 rounded-md border text-xs ${
                clientCode && clientCode !== ''
                  ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-gray-200 dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#2d2d2d] text-gray-400 dark:text-gray-300'
              }`}>
                {isLookingUpClient
                  ? <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  : clientCode === null
                    ? 'Kod klienta'
                    : clientCode === ''
                      ? <span className="text-amber-500 dark:text-amber-400 font-semibold">Nowy klient</span>
                      : clientCode
                }
              </div>
            </div>
          </div>

          {/* Trasa — 3 kolumny */}
          <div className="col-span-3">
            <Label>Trasa</Label>
            <div className="space-y-1">
              <div className="flex gap-1.5 items-center">
                <span className="text-emerald-500 text-sm leading-none select-none shrink-0 w-4 text-center">●</span>
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    value={orderData.pickupAddress}
                    onChange={v => {
                      updateField('pickupAddress', v);
                      setPickupCoords(null); onPickupCoordsChange?.(null);
                      if (validationFields.pickup) setValidationFields(p => ({ ...p, pickup: false }));
                    }}
                    onCoordinateSelect={(lat, lng) => {
                      const c = { lat, lng };
                      setPickupCoords(c); onPickupCoordsChange?.(c);
                    }}
                    baseCity={baseCity}
                    placeholder="Adres odbioru"
                    className={inputCls(validationFields.pickup)}
                    zoneBadge={detectedZone ? `R-${detectedZone}` : null}
                    isDetectingZone={isDetectingZone}
                    localAddresses={localAddresses}
                  />
                </div>
                {mapBtn('pickup')}
              </div>
              <div className="pl-[7px]"><div className="w-px h-3 bg-gray-300 dark:bg-[#444444] ml-[1px]" /></div>
              <div className="flex gap-1.5 items-center">
                <span className="text-rose-500 text-sm leading-none select-none shrink-0 w-4 text-center">■</span>
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    value={orderData.destinationAddress}
                    onChange={v => {
                      updateField('destinationAddress', v);
                      setDestinationCoords(null); onDestinationCoordsChange?.(null);
                    }}
                    onCoordinateSelect={(lat, lng) => {
                      const c = { lat, lng };
                      setDestinationCoords(c); onDestinationCoordsChange?.(c);
                    }}
                    baseCity={baseCity}
                    placeholder="Adres docelowy"
                    className={inputCls()}
                    localAddresses={localAddresses}
                  />
                </div>
                {mapBtn('destination')}
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: Płatność + Rodzaj zlecenia */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Płatność</Label>
            <div className="flex gap-1.5">
              <PayPill active={orderData.paymentMethod === 'cash'}     variant="default" onClick={() => updateField('paymentMethod', 'cash')}>Gotówka</PayPill>
              <PayPill active={orderData.paymentMethod === 'card'}     variant="yellow"  onClick={() => updateField('paymentMethod', 'card')}>Karta</PayPill>
              <PayPill active={orderData.paymentMethod === 'cashless'} variant="green"   onClick={() => updateField('paymentMethod', 'cashless')}>Bezgotówka</PayPill>
            </div>
          </div>
          <div>
            <Label>Rodzaj zlecenia</Label>
            <div className="flex gap-1.5">
              <Pill active={orderType === 'zwykle'}    onClick={() => setOrderType('zwykle')}>Zwykłe</Pill>
              <Pill active={orderType === 'terminowe'} onClick={() => setOrderType('terminowe')}>Terminowe</Pill>
              <Pill active={orderType === 'cykliczne'} onClick={() => setOrderType('cykliczne')}>Cykliczne</Pill>
            </div>
          </div>
        </div>

        {/* ROW 3: Pojazd+Taxi + Termin */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Pojazd / Taxi</Label>
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {(['standard','comfort','premium','van'] as const).map(v => (
                  <Pill key={v} active={orderData.vehicleCategory === v} onClick={() => updateField('vehicleCategory', v)}>
                    {v === 'standard' ? 'Std' : v === 'comfort' ? 'Comf' : v === 'premium' ? 'Prem' : 'Van'}
                  </Pill>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 dark:text-gray-300 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">L. taxi</span>
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <Pill key={n} active={orderData.taxiCount === n} onClick={() => updateField('taxiCount', n)}>{n}</Pill>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <Label>Termin</Label>
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={orderData.date}
                  onChange={e => updateField('date', e.target.value)}
                  className={inputCls()}
                />
                <input
                  type="time"
                  value={orderData.time}
                  onChange={e => { updateField('time', e.target.value); setMinutesFromNow(''); }}
                  className={inputCls()}
                  style={{ maxWidth: 110 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 dark:text-gray-300 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">Za</span>
                <input
                  type="number"
                  min={1}
                  value={minutesFromNow}
                  onChange={e => setMinutesFromNow(e.target.value)}
                  placeholder="—"
                  className={`${inputCls()} w-20`}
                />
                <span className="text-xs text-gray-400 dark:text-gray-300 shrink-0">min</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 4: Firma/Rabat + Preferencje */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Firma / Rabat</Label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Nazwa firmy"
                className={inputCls()}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="Rabat %"
                className={`${inputCls()} w-24 shrink-0`}
              />
            </div>
          </div>
          <div ref={prefRef} className="relative">
            <Label>Preferencje</Label>
            <button
              type="button"
              onClick={() => setPrefOpen(o => !o)}
              className={`w-full h-9 px-3 rounded-md border text-sm text-left flex items-center justify-between transition-colors
                border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d]
                ${preferences.length ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-300'}
                hover:bg-gray-50 dark:hover:bg-[#434343]`}
            >
              <span className="truncate">
                {preferences.length ? preferences.join(', ') : 'Wybierz preferencje...'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 ml-2 transition-transform ${prefOpen ? 'rotate-180' : ''}`} />
            </button>
            {prefOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#7a7a7a] rounded-lg shadow-lg py-1 max-h-48 overflow-auto">
                {PREFERENCES_LIST.map(p => {
                  const active = preferences.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePref(p)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#434343] transition-colors ${
                        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        active ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-[#888888]'
                      }`}>
                        {active && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ROW 5: Uwagi (3 pola) */}
        <div>
          <Label>Uwagi</Label>
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="text"
              value={addressNotes}
              onChange={e => setAddressNotes(e.target.value)}
              placeholder="Uwagi do adresu"
              className={inputCls()}
            />
            <input
              type="text"
              value={clientNotes}
              onChange={e => setClientNotes(e.target.value)}
              placeholder="Uwagi do klienta"
              className={inputCls()}
            />
            <input
              type="text"
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="Uwagi wewnętrzne"
              className={inputCls()}
            />
          </div>
          {phoneKey(orderData.customerPhone) && (
            <p className="text-[9px] text-gray-400 dark:text-gray-300 mt-1 ml-0.5">
              Uwagi zapamiętywane automatycznie dla tego numeru telefonu
            </p>
          )}
        </div>

      </div>

      {/* ── Pasek akcji ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-[#2d2d2d]/40 border-t border-gray-100 dark:border-[#696969] flex items-center gap-2 shrink-0">
        {isSubmitting ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Loader className="w-4 h-4 animate-spin" /> Zapisywanie...
          </div>
        ) : manualMode ? (
          <>
            <input
              autoFocus
              type="text"
              value={manualDriverCode}
              onChange={e => setManualDriverCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleRecznie(); }
                if (e.key === 'Escape') { setManualMode(false); setManualDriverCode(''); }
              }}
              placeholder="Kod kierowcy (np. K001)"
              className={`flex-1 ${inputCls()}`}
            />
            <button type="button" onClick={handleRecznie} disabled={!manualDriverCode.trim()}
              className="px-5 h-9 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors">
              Wyślij
            </button>
            <button type="button" onClick={() => { setManualMode(false); setManualDriverCode(''); }}
              className="px-4 h-9 text-sm font-medium bg-white dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#585858] rounded-md transition-colors">
              Anuluj
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={handleClear}
              className="px-3 h-9 text-xs font-medium text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              Wyczyść
            </button>
            <div className="flex-1" />
            <button type="button" onClick={handleOczekujace}
              className="px-4 h-9 text-sm font-medium bg-white dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#585858] rounded-md transition-colors">
              Oczekujące
            </button>
            <button type="button" onClick={() => setManualMode(true)}
              className="px-4 h-9 text-sm font-medium bg-white dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#585858] rounded-md transition-colors">
              Ręcznie
            </button>
            <button type="button" onClick={handleWydaj}
              className="px-6 h-9 text-sm font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md transition-colors shadow-sm">
              Wydaj
            </button>
          </>
        )}
      </div>

      {/* ── Toasty ───────────────────────────────────────────────────────────── */}
      {toast.open && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-4 duration-300">
          <div className={`flex items-start gap-3.5 text-white px-6 py-5 rounded-xl shadow-2xl min-w-[340px] max-w-md ${
            toast.type === 'success' ? 'bg-green-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-red-600'
          }`}>
            <AlertCircle className="w-7 h-7 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-lg">{toast.title}</p>
              <div className={`text-base mt-1 ${
                toast.type === 'success' ? 'text-green-100' : toast.type === 'warning' ? 'text-amber-100' : 'text-red-100'
              }`}>{toast.content}</div>
            </div>
            <button onClick={() => setToast(p => ({ ...p, open: false }))} className="shrink-0 opacity-80 hover:opacity-100">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {validationError && !toast.open && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-start gap-3 bg-red-600 text-white px-5 py-4 rounded-xl shadow-2xl min-w-[300px] max-w-sm">
            <AlertCircle className="w-6 h-6 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-base">Brakujące dane</p>
              <p className="text-sm text-red-100 mt-0.5">{validationError}</p>
            </div>
            <button onClick={() => setValidationError(null)} className="shrink-0 opacity-80 hover:opacity-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderForm3;
