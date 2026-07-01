import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader, AlertCircle, X } from 'lucide-react';
import AddressAutocomplete, { LocalAddress } from './AddressAutocomplete';
import { zoneService } from '../../services/zoneService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { createOrder, CreateOrderResult, dispatchOrderToDriver } from '../../services/orderService';
import { settingsService } from '../../services/settingsService';
import { dataSourceService } from '../../services/dataSourceService';
import { useAuth } from '../../contexts/AuthContext';

export interface OrderData2 {
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

interface Coords { lat: number; lng: number; }

interface OrderForm2Props {
  orderData: OrderData2;
  setOrderData: React.Dispatch<React.SetStateAction<OrderData2>>;
  onPickupCoordsChange?: (coords: Coords | null) => void;
  onDestinationCoordsChange?: (coords: Coords | null) => void;
  onRequestMiniMap?: () => void;
  onOrderCreated?: (result: CreateOrderResult, orderData: OrderData2) => void;
  onZoneDetected?: (zone: number | null, coords: Coords | null) => void;
}

const INITIAL: OrderData2 = {
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

// ── Pill button ─────────────────────────────────────────────────────────────
const Pill: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: 'default' | 'blue';
}> = ({ active, onClick, children, color = 'default' }) => {
  const activeClass =
    color === 'blue'
      ? 'bg-blue-600 text-white shadow-sm'
      : 'bg-[#242424] dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm';
  const inactiveClass =
    'bg-gray-100 dark:bg-[#383838] text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#585858]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 h-8 rounded-md text-xs font-semibold transition-all duration-150 ${active ? activeClass : inactiveClass}`}
    >
      {children}
    </button>
  );
};

// ── Field label ──────────────────────────────────────────────────────────────
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-300 uppercase tracking-widest mb-2 select-none">
    {children}
  </p>
);

// ── Section ──────────────────────────────────────────────────────────────────
const Section: React.FC<{
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}> = ({ label, extra, children, last }) => (
  <div className={`px-5 py-4 ${!last ? 'border-b border-gray-100 dark:border-[#696969]/60' : ''}`}>
    <div className="flex items-center justify-between mb-3">
      <FieldLabel>{label}</FieldLabel>
      {extra}
    </div>
    {children}
  </div>
);

// ── Base input class ─────────────────────────────────────────────────────────
const inputCls = (error = false) =>
  `w-full px-3 py-2 text-sm rounded-lg border transition-colors
   bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white
   placeholder-gray-400 dark:placeholder-gray-400
   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
   ${error
     ? 'border-red-400 dark:border-red-500'
     : 'border-gray-200 dark:border-[#7a7a7a]'}`;

// ─────────────────────────────────────────────────────────────────────────────

const OrderForm2: React.FC<OrderForm2Props> = ({
  orderData,
  setOrderData,
  onPickupCoordsChange,
  onDestinationCoordsChange,
  onRequestMiniMap,
  onOrderCreated,
  onZoneDetected,
}) => {
  const { user } = useAuth();

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
  const [toast, setToast] = useState<{
    open: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    content: React.ReactNode;
  }>({ open: false, type: 'success', title: '', content: null });

  const pickResultHandlerRef = useRef<((raw: string | null) => void) | null>(null);
  pickResultHandlerRef.current = (raw) => {
    if (!raw || !user) return;
    try {
      const result = JSON.parse(raw);
      if (Date.now() - result.ts > 60000) return;
      const coords = { lat: result.lat, lng: result.lng };
      if (result.type === 'pickup') {
        updateField('pickupAddress', result.address);
        setPickupCoords(coords);
        onPickupCoordsChange?.(coords);
        if (validationFields.pickup) setValidationFields(p => ({ ...p, pickup: false }));
      } else if (result.type === 'destination') {
        updateField('destinationAddress', result.address);
        setDestinationCoords(coords);
        onDestinationCoordsChange?.(coords);
      }
      localStorage.removeItem(`dispatch_pick_result_${user.id}`);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    const key = `dispatch_pick_result_${user.id}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) pickResultHandlerRef.current?.(e.newValue);
    };
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

  const updateField = (field: keyof OrderData2, value: string | number) =>
    setOrderData(p => ({ ...p, [field]: value }));

  const isMapOpen = () => {
    if (!user) return false;
    return Date.now() - parseInt(localStorage.getItem(`map_alive_${user.id}`) || '0', 10) < 4000;
  };

  const handleClear = () => {
    setOrderData({ ...INITIAL });
    setDetectedZone(null); setPickupCoords(null); setDestinationCoords(null);
    setClientCode(null);
    onPickupCoordsChange?.(null); onDestinationCoordsChange?.(null);
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
      open: true,
      type: hasDriver ? 'success' : 'warning',
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
    setOrderData({ ...INITIAL });
    setDetectedZone(null); setPickupCoords(null); setDestinationCoords(null);
    onPickupCoordsChange?.(null); onDestinationCoordsChange?.(null);
    setManualMode(false); setManualDriverCode('');
  };

  const handleError = (error?: string) => setToast({
    open: true, type: 'error', title: 'Błąd zapisu zlecenia',
    content: error || 'Nieznany błąd. Sprawdź połączenie z bazą danych.',
  });

  // Pomocnik: reset formularza po submit
  const resetAfterSubmit = () => {
    setOrderData({ ...INITIAL });
    setDetectedZone(null); setPickupCoords(null); setDestinationCoords(null);
    onPickupCoordsChange?.(null); onDestinationCoordsChange?.(null);
    setManualMode(false); setManualDriverCode('');
  };

  const handleWydaj = async () => {
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({
        ...orderData,
        taxiCount: 1,
        pickupRegionId: detectedZone,
        operator: user?.employeeId ?? user?.name ?? null,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        destinationLat: destinationCoords?.lat ?? null,
        destinationLng: destinationCoords?.lng ?? null,
      });
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
    resetAfterSubmit();
  };

  const handleOczekujace = async () => {
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({
        ...orderData,
        taxiCount: 1,
        skipAutoAssign: true,
        pickupRegionId: detectedZone,
        operator: user?.employeeId ?? user?.name ?? null,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        destinationLat: destinationCoords?.lat ?? null,
        destinationLng: destinationCoords?.lng ?? null,
      });
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
    resetAfterSubmit();
  };

  const handleRecznie = async () => {
    const code = manualDriverCode.trim().toUpperCase();
    if (!code) { setValidationError('Wpisz numer kierowcy.'); return; }
    if (!validate()) return;
    const count = orderData.taxiCount;
    setIsSubmitting(true);
    const dispatched: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({
        ...orderData,
        taxiCount: 1,
        skipAutoAssign: true,
        pickupRegionId: detectedZone,
        operator: user?.employeeId ?? user?.name ?? null,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        destinationLat: destinationCoords?.lat ?? null,
        destinationLng: destinationCoords?.lng ?? null,
      });
      if (!r.success || !r.orderId) continue;
      const d = await dispatchOrderToDriver(r.orderId, code);
      onOrderCreated?.(r, { ...orderData });
      if (d.success) dispatched.push(r.orderNumber ?? '');
    }
    setIsSubmitting(false);
    if (dispatched.length === 0 && count > 0) {
      setToast({ open: true, type: 'error', title: 'Błąd wydania', content: 'Nie udało się przydzielić kierowcy.' });
    } else {
      setToast({
        open: true, type: 'success',
        title: count > 1 ? `Wydano ${dispatched.length} z ${count} zleceń → ${code}` : `Zlecenie wydane → ${code}`,
        content: <div>{orderData.pickupAddress}</div>,
      });
    }
    resetAfterSubmit();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const mapBtn = (type: 'pickup' | 'destination') => (
    <button
      type="button"
      title={type === 'pickup' ? 'Zaznacz odbiór na mapie' : 'Zaznacz cel na mapie'}
      onClick={() => {
        if (!user) return;
        localStorage.setItem(`dispatch_pick_request_${user.id}`, JSON.stringify({ type, ts: Date.now() }));
        if (!isMapOpen()) onRequestMiniMap?.();
      }}
      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#383838] hover:bg-gray-100 dark:hover:bg-[#585858] transition-colors"
    >
      <Crosshair className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
    </button>
  );

  return (
    <div className="bg-white dark:bg-[#202020] rounded-xl shadow-sm border border-gray-200 dark:border-[#696969] overflow-hidden flex flex-col">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#242424] dark:bg-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-sm font-bold text-white uppercase tracking-widest">
            Nowe Zlecenie
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDetectingZone && (
            <Loader className="w-3.5 h-3.5 text-gray-400 animate-spin" />
          )}
          {!isDetectingZone && detectedZone !== null && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded-md">
              Rejon {detectedZone}
            </span>
          )}
        </div>
      </div>

      {/* ── Dane klienta ─────────────────────────────────────────────────────── */}
      <Section label="Dane klienta">
        <div className="grid grid-cols-3 gap-3">
          {/* Telefon */}
          <input
            type="tel"
            value={orderData.customerPhone}
            onChange={e => {
              updateField('customerPhone', e.target.value);
              if (validationFields.phone) setValidationFields(p => ({ ...p, phone: false }));
            }}
            placeholder="Numer telefonu"
            className={inputCls(validationFields.phone)}
          />
          {/* Nazwa */}
          <input
            type="text"
            value={orderData.customerName}
            onChange={e => updateField('customerName', e.target.value)}
            placeholder="Nazwa / firma"
            className={inputCls()}
          />
          {/* Kod klienta */}
          <div className={`flex items-center px-3 py-2 rounded-lg border text-sm ${
            clientCode && clientCode !== ''
              ? 'border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white'
              : 'border-gray-200 dark:border-[#7a7a7a] bg-gray-50 dark:bg-[#2d2d2d]'
          }`}>
            {isLookingUpClient
              ? <Loader className="w-4 h-4 animate-spin text-gray-400" />
              : clientCode === null
                ? <span className="text-gray-400 dark:text-gray-300 text-xs">Kod klienta</span>
                : clientCode === ''
                  ? <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold">Nowy klient</span>
                  : <span className="font-semibold text-blue-600 dark:text-blue-400">{clientCode}</span>
            }
          </div>
        </div>
      </Section>

      {/* ── Trasa ────────────────────────────────────────────────────────────── */}
      <Section label="Trasa">
        <div className="space-y-2.5">
          {/* Odbiór */}
          <div className="flex gap-2 items-stretch">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-emerald-500 text-lg leading-none select-none shrink-0">●</span>
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
            </div>
            {mapBtn('pickup')}
          </div>

          {/* Pionowa linia */}
          <div className="flex items-center gap-2 pl-1.5">
            <div className="w-px h-4 bg-gray-300 dark:bg-[#444444] ml-1" />
          </div>

          {/* Cel */}
          <div className="flex gap-2 items-stretch">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-rose-500 text-base leading-none select-none shrink-0">■</span>
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
                  placeholder="Adres docelowy (opcjonalnie)"
                  className={inputCls()}
                  localAddresses={localAddresses}
                />
              </div>
            </div>
            {mapBtn('destination')}
          </div>
        </div>
      </Section>

      {/* ── Opcje zlecenia ───────────────────────────────────────────────────── */}
      <Section label="Opcje zlecenia">
        <div className="space-y-2.5">

          {/* Taxi + Płatność */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2.5">
            {/* Liczba taxi */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-300 shrink-0 whitespace-nowrap font-semibold">L. taxi</span>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <Pill key={n} active={orderData.taxiCount === n} onClick={() => updateField('taxiCount', n)}>
                    {n}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Płatność */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-300 w-16 shrink-0">Płatność</span>
              <div className="flex gap-1 flex-wrap">
                {([['cash','Gotówka'],['card','Karta'],['transfer','Przelew'],['corporate','Firmowe']] as const).map(([val, label]) => (
                  <Pill key={val} active={orderData.paymentMethod === val} color="blue" onClick={() => updateField('paymentMethod', val)}>
                    {label}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          {/* Kategoria + Termin */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2.5">
            {/* Kategoria */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-300 w-16 shrink-0">Pojazd</span>
              <div className="flex gap-1 flex-wrap">
                {([['standard','Standard'],['comfort','Comfort'],['premium','Premium'],['van','Bus/Van']] as const).map(([val, label]) => (
                  <Pill key={val} active={orderData.vehicleCategory === val} onClick={() => updateField('vehicleCategory', val)}>
                    {label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Termin */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-300 w-12 shrink-0">Termin</span>
              <input
                type="date"
                value={orderData.date}
                onChange={e => updateField('date', e.target.value)}
                className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="time"
                value={orderData.time}
                onChange={e => updateField('time', e.target.value)}
                className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Uwagi ────────────────────────────────────────────────────────────── */}
      <Section label="Uwagi">
        <textarea
          value={orderData.notes}
          onChange={e => updateField('notes', e.target.value)}
          rows={2}
          placeholder="Dodatkowe informacje dla kierowcy..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </Section>

      {/* ── Pasek akcji ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 bg-gray-50 dark:bg-[#2d2d2d]/40 border-t border-gray-100 dark:border-[#696969] flex items-center gap-2 shrink-0">
        {isSubmitting ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Loader className="w-4 h-4 animate-spin" />
            Zapisywanie...
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
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#7a7a7a] bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleRecznie}
              disabled={!manualDriverCode.trim()}
              className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              Wyślij
            </button>
            <button
              type="button"
              onClick={() => { setManualMode(false); setManualDriverCode(''); }}
              className="px-4 py-2 text-sm font-medium bg-white dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#585858] rounded-lg transition-colors"
            >
              Anuluj
            </button>
          </>
        ) : (
          <>
            {/* Wyczyść — lewo */}
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition-colors"
            >
              Wyczyść
            </button>

            <div className="flex-1" />

            {/* Oczekujące */}
            <button
              type="button"
              onClick={handleOczekujace}
              className="px-4 py-2 text-sm font-medium bg-white dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#585858] rounded-lg transition-colors"
            >
              Oczekujące
            </button>

            {/* Ręcznie */}
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="px-4 py-2 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white rounded-lg transition-colors"
            >
              Ręcznie
            </button>

            {/* Wydaj — primary */}
            <button
              type="button"
              onClick={handleWydaj}
              className="px-6 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors shadow-sm"
            >
              Wydaj
            </button>
          </>
        )}
      </div>

      {/* ── Toast sukces/błąd ────────────────────────────────────────────────── */}
      {toast.open && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-4 duration-300">
          <div className={`flex items-start gap-3.5 text-white px-6 py-5 rounded-xl shadow-2xl min-w-[340px] max-w-md ${
            toast.type === 'success' ? 'bg-green-600' :
            toast.type === 'warning' ? 'bg-amber-600' : 'bg-red-600'
          }`}>
            <AlertCircle className="w-7 h-7 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-lg">{toast.title}</p>
              <div className={`text-base mt-1 ${
                toast.type === 'success' ? 'text-green-100' :
                toast.type === 'warning' ? 'text-amber-100' : 'text-red-100'
              }`}>{toast.content}</div>
            </div>
            <button onClick={() => setToast(p => ({ ...p, open: false }))} className="shrink-0 opacity-80 hover:opacity-100">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* ── Toast walidacji ──────────────────────────────────────────────────── */}
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

export default OrderForm2;
