import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, User, CreditCard, Car, Loader, Hash, Plus, AlertCircle, X, Check, Crosshair, Clock, Calendar, Info, Tag, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Trash2, Send, PenLine, Hourglass, Percent, Banknote, FileSignature, Building2 } from 'lucide-react';
import { preferencesService, Preference } from '../../services/preferencesService';
import AddressAutocomplete, { CustomPin, LocalAddress } from './AddressAutocomplete';
import ClientPreviewModal, { type ClientPreviewData } from './ClientPreviewModal';
import { zoneService } from '../../services/zoneService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { createOrder, CreateOrderResult, dispatchOrderToDriver } from '../../services/orderService';
import { settingsService } from '../../services/settingsService';
import { dataSourceService } from '../../services/dataSourceService';
import { useAuth } from '../../contexts/AuthContext';

export interface OrderData {
  customerPhone: string;
  customerName: string;
  companyName: string;
  pickupAddress: string;
  destinationAddress: string;
  taxiCount: number;
  paymentMethod: string;
  vehicleCategory: string;
  orderType: string;
  date: string;
  time: string;
  notes: string;
  clientInfo: string;
  internalInfo: string;
  discount: string;
  travelTime: string;
  quote: string;
  contract: string;
  pickupZone: string;
  destinationZone: string;
}

interface Coords { lat: number; lng: number; }

interface OrderFormProps {
  orderData: OrderData;
  setOrderData: React.Dispatch<React.SetStateAction<OrderData>>;
  onPickupCoordsChange?: (coords: Coords | null) => void;
  onDestinationCoordsChange?: (coords: Coords | null) => void;
  onRequestMiniMap?: () => void;
  onOrderCreated?: (result: CreateOrderResult, orderData: OrderData) => void;
  onZoneDetected?: (zone: number | null, coords: Coords | null) => void;
  onPreferencesChange?: (ids: number[]) => void;
  /** Gdy ustawiony, automatycznie wypełnia pole kodu kierowcy i włącza tryb Ręcznie */
  suggestedDriverCode?: string;
  /** Kierowca wytypowany przez DriverSuggestion — "Wyślij" wyśle do niego bezpośrednio */
  typowanyDriverCode?: string | null;
  /** ID edytowanego zlecenia — gdy ustawione, formularz jest w trybie edycji */
  editingOrderId?: string | null;
  /** Callback po zapisaniu edycji */
  onSaveEdit?: () => void;
  /** Callback po anulowaniu edycji */
  onCancelEdit?: () => void;
}

const INITIAL_ORDER: OrderData = {
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
};

const OrderForm: React.FC<OrderFormProps> = ({ orderData, setOrderData, onPickupCoordsChange, onDestinationCoordsChange, onRequestMiniMap, onOrderCreated, onZoneDetected, onPreferencesChange, suggestedDriverCode, typowanyDriverCode, editingOrderId, onSaveEdit, onCancelEdit }) => {
  const [detectedZone, setDetectedZone] = useState<number | null>(null);
  const [isDetectingZone, setIsDetectingZone] = useState(false);
  const [detectedDestZone, setDetectedDestZone] = useState<number | null>(null);
  const [isDetectingDestZone, setIsDetectingDestZone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baseCity, setBaseCity] = useState('');
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(null);
  /** null = brak wpisanego telefonu, '' = nowy klient, string = kod istniejącego klienta */
  const [clientCode, setClientCode] = useState<string | null>(null);
  const [isLookingUpClient, setIsLookingUpClient] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationFields, setValidationFields] = useState<{ phone: boolean; pickup: boolean }>({ phone: false, pickup: false });
  const [manualMode, setManualMode] = useState(false);
  const [manualDriverCode, setManualDriverCode] = useState('');
  const [taxiDropdownOpen, setTaxiDropdownOpen] = useState(false);
  const taxiDropdownRef = useRef<HTMLDivElement>(null);
  const [schedWarning, setSchedWarning] = useState<null | 'wydaj' | 'oczekujace' | 'recznie'>(null);
  const skipSchedWarningRef = useRef(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const clockBtnRef = useRef<HTMLButtonElement>(null);
  const timePickerRef = useRef<HTMLDivElement>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const calBtnRef = useRef<HTMLButtonElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [calView, setCalView] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [prefModalOpen, setPrefModalOpen] = useState(false);
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [clientPreviewData, setClientPreviewData] = useState<ClientPreviewData | null>(null);
  const [nowTime, setNowTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const timeManuallyEditedRef = useRef(false);

  useEffect(() => {
    let lastMinute = new Date().toTimeString().slice(0, 5);
    const id = setInterval(() => {
      const t = new Date().toTimeString().slice(0, 5);
      setNowTime(t);
      // Aktualizuj czas formularza tylko gdy: zlecenie standardowe + nie edytowano ręcznie + minuta się zmieniła
      if (!timeManuallyEditedRef.current && t !== lastMinute) {
        lastMinute = t;
        setOrderData(prev => prev.orderType === 'standard' ? { ...prev, time: t } : prev);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const [availablePreferences, setAvailablePreferences] = useState<Preference[]>([]);
  const [selectedPrefIds, setSelectedPrefIds] = useState<number[]>([]);
  const [starredPrefIds, setStarredPrefIds] = useState<number[]>([]);
  const [addressPins, setAddressPins] = useState<CustomPin[]>([]);
  const [localAddresses, setLocalAddresses] = useState<LocalAddress[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    preferencesService.getAll().then(setAvailablePreferences);
  }, []);

  useEffect(() => {
    if (!taxiDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (taxiDropdownRef.current && !taxiDropdownRef.current.contains(e.target as Node)) {
        setTaxiDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [taxiDropdownOpen]);

  useEffect(() => {
    if (!showTimePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (
        timePickerRef.current && !timePickerRef.current.contains(e.target as Node) &&
        clockBtnRef.current && !clockBtnRef.current.contains(e.target as Node)
      ) {
        setShowTimePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTimePicker]);

  useEffect(() => {
    if (!showDatePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (
        datePickerRef.current && !datePickerRef.current.contains(e.target as Node) &&
        calBtnRef.current && !calBtnRef.current.contains(e.target as Node)
      ) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDatePicker]);

  const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  const DAYS_PL = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

  const adjustTime = (type: 'h' | 'm', delta: number) => {
    timeManuallyEditedRef.current = true;
    const [h, m] = orderData.time.split(':').map(Number);
    if (type === 'h') {
      const newH = (h + delta + 24) % 24;
      updateField('time', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    } else {
      const newM = (m + delta + 60) % 60;
      updateField('time', `${String(h).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
    }
  };

  // Ładuj niestandardowe adresy (pinezki) z bazy danych
  useEffect(() => {
    fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT id, name, lat, lng, preference_ids FROM address_pins ORDER BY name ASC' }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          setAddressPins(json.data.map((r: any): CustomPin => {
            const lat = typeof r.lat === 'number' ? r.lat : parseFloat(r.lat);
            const lng = typeof r.lng === 'number' ? r.lng : parseFloat(r.lng);
            const raw = r.preference_ids;
            let preference_ids: number[] = [];
            try {
              preference_ids = Array.isArray(raw) ? raw.map(Number) : JSON.parse(raw || '[]');
            } catch { preference_ids = []; }
            return { id: r.id, name: r.name ?? '', lat, lng, preference_ids };
          }).filter((p: CustomPin) => isFinite(p.lat) && isFinite(p.lng)));
        }
      })
      .catch(() => {});
  }, []);

  // Ładuj lokalną bazę adresów
  useEffect(() => {
    fetch('/api/local-addresses/all')
      .then(r => r.json())
      .then(json => { if (Array.isArray(json.results)) setLocalAddresses(json.results); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    onPreferencesChange?.(selectedPrefIds);
  }, [selectedPrefIds]);

  // Helper: sprawdza czy okno mapy jest otwarte (heartbeat < 4s temu)
  const isMapOpen = () => {
    if (!user) return false;
    const ts = parseInt(localStorage.getItem(`map_alive_${user.id}`) || '0', 10);
    return Date.now() - ts < 4000;
  };

  // ─── Pick mode — komunikacja z mapą przez localStorage ─────────────────────

  // Ref zawsze ma najnowsze callbacks (bez problemów z closures w useEffect)
  const pickResultHandlerRef = useRef<((raw: string | null) => void) | null>(null);
  pickResultHandlerRef.current = (raw) => {
    if (!raw || !user) return;
    try {
      const result = JSON.parse(raw);
      if (Date.now() - result.ts > 60000) return; // ignoruj wyniki starsze niż 60s
      const coords = { lat: result.lat, lng: result.lng };
      if (result.type === 'pickup') {
        updateField('pickupAddress', result.address);
        setPickupCoords(coords);
        onPickupCoordsChange?.(coords);
        if (validationFields.pickup) setValidationFields(prev => ({ ...prev, pickup: false }));
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
    const resultKey = `dispatch_pick_result_${user.id}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === resultKey) pickResultHandlerRef.current?.(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    // Fallback polling — ta sama zakładka
    const poll = setInterval(() => {
      pickResultHandlerRef.current?.(localStorage.getItem(resultKey));
    }, 400);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, [user?.id]);

  // Auto-dismiss toast walidacji po 4s
  useEffect(() => {
    if (!validationError) return;
    const t = setTimeout(() => setValidationError(null), 4000);
    return () => clearTimeout(t);
  }, [validationError]);

  // Toast — powiadomienie po akcji (auto-dismiss po 5s)
  const [toast, setToast] = useState<{
    open: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    content: React.ReactNode;
  }>({ open: false, type: 'success', title: '', content: null });

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(() => setToast(prev => ({ ...prev, open: false })), 8000);
    return () => clearTimeout(t);
  }, [toast.open, toast.title]);

  // Ładowanie miasta bazowego z ustawień systemowych
  useEffect(() => {
    settingsService.getSettings().then(s => {
      if (s.baseCity) {
        setBaseCity(s.baseCity);
        // Miasto bazowe służy tylko do priorytetyzacji podpowiedzi Nominatim — nie pre-fillujemy inputa
      }
    });
  }, []);

  // Helper: konwertuje nieznaną wartość z DB zawsze na string
  const toDbStr = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return ''; // tablica/obiekt (auto-parse przez dataSourceService) → ignoruj
  };

  // Auto-lookup klienta po numerze telefonu
  // Ładuje: client_code, client_name, client_info, internal_info w jednym zapytaniu
  useEffect(() => {
    const phone = orderData.customerPhone.trim();
    const digits = phone.replace(/\D/g, '');

    if (digits.length < 9) {
      setClientCode(null);
      setStarredPrefIds([]);
      return;
    }

    setIsLookingUpClient(true);
    const timer = setTimeout(async () => {
      try {
        // Główne zapytanie — klient + hasło + info wewnętrzne
        const result = await dataSourceService.query<{
          clientCode: string; clientName: string;
          clientInfo: unknown; internalInfo: unknown;
        }>(
          'SELECT client_code, client_name, client_info, internal_info FROM clients WHERE phone_number = ?',
          [phone]
        );
        if (result.success && result.data && result.data.length > 0) {
          const found = result.data[0];
          setClientCode(found.clientCode);
          setOrderData(prev => ({
            ...prev,
            customerName: found.clientName || prev.customerName,
            clientInfo:   toDbStr(found.clientInfo),
            internalInfo: toDbStr(found.internalInfo),
          }));

          // Oddzielne zapytanie: permanent_preference_ids (JSON — może nie istnieć na starszej bazie)
          dataSourceService.query<{ permanentPreferenceIds: unknown }>(
            'SELECT permanent_preference_ids FROM clients WHERE client_code = ?',
            [found.clientCode]
          ).then(r => {
            if (r.success && r.data && r.data.length > 0) {
              const raw = r.data![0].permanentPreferenceIds;
              let starred: number[] = [];
              if (Array.isArray(raw)) {
                starred = (raw as unknown[]).map(Number).filter(n => !isNaN(n));
              } else if (raw && typeof raw === 'string') {
                try {
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) starred = parsed.map(Number).filter(n => !isNaN(n));
                } catch {}
              }
              setStarredPrefIds(starred);
              setSelectedPrefIds(prev => Array.from(new Set([...prev, ...starred])));
            }
          }).catch(() => {});
        } else {
          setClientCode(''); // nowy klient
        }
      } catch {
        // Jeśli kolumny client_info/internal_info nie istnieją — fallback bez nich
        try {
          const r2 = await dataSourceService.query<{ clientCode: string; clientName: string }>(
            'SELECT client_code, client_name FROM clients WHERE phone_number = ?',
            [phone]
          );
          if (r2.success && r2.data && r2.data.length > 0) {
            const f = r2.data[0];
            setClientCode(f.clientCode);
            if (f.clientName) setOrderData(prev => ({ ...prev, customerName: f.clientName }));
          } else {
            setClientCode('');
          }
        } catch {
          setClientCode('');
        }
      } finally {
        setIsLookingUpClient(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [orderData.customerPhone]);

  // Auto-wykrywanie rejonu — używa współrzędnych (punkt w polygonie) gdy dostępne,
  // w przeciwnym razie text-matching po nazwie strefy
  useEffect(() => {
    if (!orderData.pickupAddress) {
      setDetectedZone(null);
      return;
    }
    setIsDetectingZone(true);
    zoneService.getZones().then(zones => {
      const points = zones.map(z => ({ id: z.number, name: z.name, coordinates: z.coordinates }));
      const zds = new ZoneDetectionService(points);
      if (pickupCoords) {
        // Dokładne wykrywanie — punkt w polygonie (gdy użytkownik wybrał podpowiedź)
        const coordZone = zds.detectZoneFromCoordinates(pickupCoords.lat, pickupCoords.lng);
        // Fallback na detekcję tekstową jeśli polygon nie dał wyniku (brak koordynatów stref)
        setDetectedZone(coordZone ?? zds.detectZoneFromAddress(orderData.pickupAddress));
      } else {
        // Dopasowanie po nazwie strefy / słowach kluczowych
        setDetectedZone(zds.detectZoneFromAddress(orderData.pickupAddress));
      }
      setIsDetectingZone(false);
    }).catch(() => {
      setDetectedZone(null);
      setIsDetectingZone(false);
    });
  }, [orderData.pickupAddress, pickupCoords]);

  useEffect(() => {
    onZoneDetected?.(detectedZone, pickupCoords);
    setOrderData(prev => ({ ...prev, pickupZone: detectedZone ? `R-${detectedZone}` : '' }));
  }, [detectedZone]);

  // Gdy DispatcherPanel podpowie kod kierowcy (kliknięcie w DriverSuggestion) — włącz tryb Ręcznie
  useEffect(() => {
    if (suggestedDriverCode) {
      setManualDriverCode(suggestedDriverCode);
      setManualMode(true);
    }
  }, [suggestedDriverCode]);

  useEffect(() => {
    if (!orderData.destinationAddress) {
      setDetectedDestZone(null);
      return;
    }
    setIsDetectingDestZone(true);
    zoneService.getZones().then(zones => {
      const points = zones.map(z => ({ id: z.number, name: z.name, coordinates: z.coordinates }));
      const zds = new ZoneDetectionService(points);
      if (destinationCoords) {
        setDetectedDestZone(zds.detectZoneFromCoordinates(destinationCoords.lat, destinationCoords.lng));
      } else {
        setDetectedDestZone(zds.detectZoneFromAddress(orderData.destinationAddress));
      }
      setIsDetectingDestZone(false);
    }).catch(() => {
      setDetectedDestZone(null);
      setIsDetectingDestZone(false);
    });
  }, [orderData.destinationAddress, destinationCoords]);

  useEffect(() => {
    setOrderData(prev => ({ ...prev, destinationZone: detectedDestZone ? `R-${detectedDestZone}` : '' }));
  }, [detectedDestZone]);

  // Auto-wycena: wywołuje serwer który liczy cenę na podstawie cennika i odległości
  useEffect(() => {
    if (!pickupCoords || !destinationCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/pricing/estimate?pickupLat=${pickupCoords.lat}&pickupLng=${pickupCoords.lng}&destLat=${destinationCoords.lat}&destLng=${destinationCoords.lng}`;
        const res = await fetch(url);
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data?.price != null) {
          setOrderData(prev => ({ ...prev, quote: data.data.price.toFixed(2) }));
        }
      } catch {
        // ignoruj błędy sieciowe
      }
    })();
    return () => { cancelled = true; };
  }, [pickupCoords, destinationCoords]);

  const updateField = (field: keyof OrderData, value: string | number) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
  };

  /** Natychmiastowy zapis notatek klienta do DB (używany przed reset formularza) */
  const saveClientNotesNow = (code: string | null, info: string, internal: string) => {
    if (!code) return;
    dataSourceService.query(
      'UPDATE clients SET client_info = ?, internal_info = ?, updated_at = NOW() WHERE client_code = ?',
      [info || null, internal || null, code]
    );
  };

  const handleClear = () => {
    timeManuallyEditedRef.current = false;
    saveClientNotesNow(clientCode, orderData.clientInfo, orderData.internalInfo);
    setOrderData({ ...INITIAL_ORDER });
    setDetectedZone(null);
    setPickupCoords(null);
    setDestinationCoords(null);
    setClientCode(null);
    setSelectedPrefIds([]);
    setStarredPrefIds([]);
    onPickupCoordsChange?.(null);
    onDestinationCoordsChange?.(null);
  };

  /** Walidacja formularza — zwraca true jeśli OK */
  const validateForm = (): boolean => {
    const missing: string[] = [];
    const invalidFields = { phone: false, pickup: false };

    if (!orderData.customerPhone.trim()) {
      missing.push('Numer telefonu');
      invalidFields.phone = true;
    }
    if (!orderData.pickupAddress.trim()) {
      missing.push('Adres odbioru');
      invalidFields.pickup = true;
    }

    if (missing.length > 0) {
      setValidationFields(invalidFields);
      setValidationError(
        missing.length === 1
          ? `${missing[0]} jest wymagany.`
          : `${missing.join(' i ')} są wymagane.`
      );
      return false;
    }
    setValidationFields({ phone: false, pickup: false });
    return true;
  };

  /** Wyświetl toast sukcesu i zresetuj formularz */
  const handleOrderSuccess = (result: CreateOrderResult, driverLabel?: string) => {
    onOrderCreated?.(result, { ...orderData });

    const hasDriver = !!(result.assignedDriver || driverLabel);
    const driverCode = result.assignedDriver
      ? result.assignedDriver.code
      : driverLabel?.split('—')[0]?.trim() || null;

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

    saveClientNotesNow(clientCode, orderData.clientInfo, orderData.internalInfo);
    setOrderData({ ...INITIAL_ORDER });
    setDetectedZone(null);
    setPickupCoords(null);
    setDestinationCoords(null);
    setSelectedPrefIds([]);
    setStarredPrefIds([]);
    onPickupCoordsChange?.(null);
    onDestinationCoordsChange?.(null);
    setManualMode(false);
    setManualDriverCode('');
  };

  const handleOrderError = (error?: string) => {
    setToast({
      open: true,
      type: 'error',
      title: 'Błąd zapisu zlecenia',
      content: error || 'Nieznany błąd. Sprawdź połączenie z bazą danych.',
    });
  };

  /** Efektywna strefa: GPS/text albo ręcznie wpisany numer z pola Rejon */
  const effectiveZone: number | null = detectedZone ?? (() => {
    const m = (orderData.pickupZone ?? '').match(/\d+/);
    return m ? parseInt(m[0]) : null;
  })();

  // Pomocnik: reset formularza po każdym submit (bez toastu)
  const resetOrderForm = () => {
    timeManuallyEditedRef.current = false;
    saveClientNotesNow(clientCode, orderData.clientInfo, orderData.internalInfo);
    setOrderData({ ...INITIAL_ORDER });
    setDetectedZone(null);
    setPickupCoords(null);
    setDestinationCoords(null);
    setSelectedPrefIds([]);
    setStarredPrefIds([]);
    onPickupCoordsChange?.(null);
    onDestinationCoordsChange?.(null);
    setManualMode(false);
    setManualDriverCode('');
  };

  const hasFutureDateTime = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    return orderData.date > todayStr ||
      (orderData.date === todayStr && orderData.time > nowTime);
  };

  /** Wydaj — jeśli DriverSuggestion wytypował kierowcę, wyślij bezpośrednio do niego.
   *  W przeciwnym razie auto-przydziel wg reguł stref. */
  const handleWydaj = async () => {
    if (!validateForm()) return;
    if (!skipSchedWarningRef.current && orderData.orderType !== 'scheduled' && hasFutureDateTime()) {
      setSchedWarning('wydaj');
      return;
    }
    skipSchedWarningRef.current = false;
    const count = orderData.taxiCount;
    const notesWithPassword = orderData.clientInfo
      ? `HASŁO: ${orderData.clientInfo}${orderData.notes ? '\n' + orderData.notes : ''}`
      : orderData.notes;
    const basePayload = {
      ...orderData,
      taxiCount: 1,
      notes: notesWithPassword,
      pickupRegionId: effectiveZone,
      preferenceIds: selectedPrefIds,
      operator: user?.employeeId ?? user?.name ?? null,
      pickupLat: pickupCoords?.lat ?? null,
      pickupLng: pickupCoords?.lng ?? null,
      destinationLat: destinationCoords?.lat ?? null,
      destinationLng: destinationCoords?.lng ?? null,
    };

    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    const excludeDriverIds: string[] = [];

    if (typowanyDriverCode) {
      // Pierwsze zlecenie → wytypowany kierowca
      const r0 = await createOrder({ ...basePayload, skipAutoAssign: true });
      if (r0.success && r0.orderId) {
        const d = await dispatchOrderToDriver(r0.orderId, typowanyDriverCode);
        if (d.success) {
          results.push(r0);
          if (d.driverId) excludeDriverIds.push(d.driverId);
        } else {
          results.push({ ...r0, assignedDriver: null });
        }
        onOrderCreated?.(r0, { ...orderData });
      }
      // Kolejne zlecenia → auto-assign, pomijając wytypowanego kierowcę
      for (let i = 1; i < count; i++) {
        const r = await createOrder({ ...basePayload, excludeDriverIds: [...excludeDriverIds] });
        if (r.success) {
          if (r.assignedDriver?.id) excludeDriverIds.push(r.assignedDriver.id);
          results.push(r);
          onOrderCreated?.(r, { ...orderData });
        }
      }
    } else {
      // Standardowa logika auto-assign — każde kolejne zlecenie pomija już przydzielonych
      for (let i = 0; i < count; i++) {
        const r = await createOrder({ ...basePayload, excludeDriverIds: [...excludeDriverIds] });
        if (r.success) {
          if (r.assignedDriver?.id) excludeDriverIds.push(r.assignedDriver.id);
          results.push(r);
          onOrderCreated?.(r, { ...orderData });
        }
      }
    }

    setIsSubmitting(false);
    if (results.length === 0) { handleOrderError('Nie udało się utworzyć zlecenia'); return; }
    const last = results[results.length - 1];
    const hasDriver = !!last.assignedDriver || !!typowanyDriverCode;
    const driverCodes = typowanyDriverCode
      ? [typowanyDriverCode]
      : results.map(r => r.assignedDriver?.code).filter(Boolean) as string[];
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
    resetOrderForm();
  };

  /** Oczekujące — zapisz bez przydziału kierowcy */
  const handleOczekujace = async () => {
    if (!validateForm()) return;
    if (!skipSchedWarningRef.current && orderData.orderType !== 'scheduled' && hasFutureDateTime()) {
      setSchedWarning('oczekujace');
      return;
    }
    skipSchedWarningRef.current = false;
    const count = orderData.taxiCount;
    const notesWithPassword = orderData.clientInfo
      ? `HASŁO: ${orderData.clientInfo}${orderData.notes ? '\n' + orderData.notes : ''}`
      : orderData.notes;
    setIsSubmitting(true);
    const results: CreateOrderResult[] = [];
    for (let i = 0; i < count; i++) {
      const r = await createOrder({
        ...orderData,
        taxiCount: 1,
        notes: notesWithPassword,
        skipAutoAssign: true,
        pickupRegionId: effectiveZone,
        preferenceIds: selectedPrefIds,
        operator: user?.employeeId ?? user?.name ?? null,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        destinationLat: destinationCoords?.lat ?? null,
        destinationLng: destinationCoords?.lng ?? null,
      });
      if (r.success) { results.push(r); onOrderCreated?.(r, { ...orderData }); }
    }
    setIsSubmitting(false);
    if (results.length === 0) { handleOrderError('Nie udało się utworzyć zlecenia'); return; }
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
    resetOrderForm();
  };

  /** Ręcznie — utwórz N zleceń + przydziel każde do wpisanego kierowcy */
  const handleRecznie = async () => {
    const code = manualDriverCode.trim().toUpperCase();
    if (!code) { setValidationError('Wpisz numer kierowcy.'); return; }
    if (!validateForm()) return;
    if (!skipSchedWarningRef.current && orderData.orderType !== 'scheduled' && hasFutureDateTime()) {
      setSchedWarning('recznie');
      return;
    }
    skipSchedWarningRef.current = false;
    const count = orderData.taxiCount;
    const notesWithPassword = orderData.clientInfo
      ? `HASŁO: ${orderData.clientInfo}${orderData.notes ? '\n' + orderData.notes : ''}`
      : orderData.notes;
    setIsSubmitting(true);
    const dispatched: string[] = [];
    for (let i = 0; i < count; i++) {
      const result = await createOrder({
        ...orderData,
        taxiCount: 1,
        notes: notesWithPassword,
        skipAutoAssign: true,
        pickupRegionId: effectiveZone,
        preferenceIds: selectedPrefIds,
        operator: user?.employeeId ?? user?.name ?? null,
        pickupLat: pickupCoords?.lat ?? null,
        pickupLng: pickupCoords?.lng ?? null,
        destinationLat: destinationCoords?.lat ?? null,
        destinationLng: destinationCoords?.lng ?? null,
      });
      if (!result.success || !result.orderId) continue;
      const dispatch = await dispatchOrderToDriver(result.orderId, code);
      onOrderCreated?.(result, { ...orderData });
      if (dispatch.success) dispatched.push(result.orderNumber ?? '');
    }
    setIsSubmitting(false);
    if (dispatched.length === 0) {
      handleOrderError('Nie udało się przydzielić kierowcy.');
    } else {
      setToast({
        open: true, type: 'success',
        title: count > 1 ? `Wydano ${dispatched.length} z ${count} zleceń → ${code}` : `Zlecenie wydane → ${code}`,
        content: <div className="space-y-1"><div>{orderData.pickupAddress}</div></div>,
      });
      resetOrderForm();
    }
  };

  /** Obsługa wyboru niestandardowego adresu z pinezki — merge preferencji */
  const handleCustomPinSelect = (pin: CustomPin) => {
    if (!pin.preference_ids.length) return;
    setSelectedPrefIds(prev => {
      const merged = [...prev];
      pin.preference_ids.forEach(id => {
        if (!merged.includes(id)) merged.push(id);
      });
      return merged;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className={`bg-gray-50 dark:bg-[#2d2d2d] rounded p-4 border transition-colors ${editingOrderId ? 'border-red-500 dark:border-red-400 ring-4 ring-red-500/50' : 'border-[#b0b3b8] dark:border-[#7a7a7a]'}`}>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          {/* Telefon + Nazwa klienta — razem zajmują dostępne miejsce */}
          <div className="flex gap-2 flex-1 min-w-0">
            <div className="flex w-36 shrink-0">
              <input
                type="tel"
                value={orderData.customerPhone}
                onChange={(e) => {
                  updateField('customerPhone', e.target.value);
                  if (validationFields.phone) setValidationFields(prev => ({ ...prev, phone: false }));
                }}
                className={`flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-r-0 ${validationFields.phone ? 'border-red-500' : 'border-[#b0b3b8] dark:border-[#7a7a7a]'} rounded-l text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Telefon"
              />
              <div className={`bg-gray-300 dark:bg-[#444444] border ${validationFields.phone ? 'border-red-500' : 'border-[#b0b3b8] dark:border-[#7a7a7a]'} rounded-r px-2 py-1.5 flex items-center`}>
                <Phone className={`w-4 h-4 ${validationFields.phone ? 'text-red-500' : 'text-black dark:text-gray-200'}`} strokeWidth={2.5} />
              </div>
            </div>

            <div className="flex flex-1 min-w-0">
              <input
                type="text"
                value={orderData.customerName}
                onChange={(e) => updateField('customerName', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa klienta"
              />
            </div>

            <div className="flex flex-1 min-w-0">
              <input
                type="text"
                value={orderData.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa firmy"
              />
            </div>
          </div>

          <input
            type="text"
            readOnly
            value={isLookingUpClient ? '' : clientCode === null ? '' : clientCode === '' ? 'Nowy klient' : clientCode}
            placeholder={isLookingUpClient ? 'Szukam...' : 'Nr klienta'}
            className={`w-24 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-gray-100 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none cursor-default ${clientCode === '' ? 'text-red-500 dark:text-red-400' : 'text-black dark:text-white'}`}
          />

          <button
            type="button"
            onClick={async () => {
              const digits = orderData.customerPhone.trim().replace(/\D/g, '');
              if (digits.length < 7) return;
              const res = await dataSourceService.query<ClientPreviewData>(
                `SELECT id, client_code, client_name, phone_number, created_at,
                        internal_info, permanent_preference_ids, email,
                        company_name, street, city, postal_code, nip,
                        0 AS order_count
                 FROM clients WHERE phone_number = ? LIMIT 1`,
                [orderData.customerPhone.trim()],
              );
              if (res.success && res.data?.[0]) {
                setClientPreviewData(res.data[0]);
              } else {
                setClientPreviewData({
                  clientCode: clientCode ?? '',
                  clientName: orderData.customerName,
                  phoneNumber: orderData.customerPhone.trim(),
                  createdAt: '',
                  internalInfo: null,
                  permanentPreferenceIds: null,
                  orderCount: 0,
                  email: null, companyName: null, street: null,
                  city: null, postalCode: null, nip: null,
                });
              }
              setClientInfoOpen(true);
            }}
            disabled={orderData.customerPhone.trim().replace(/\D/g, '').length < 7}
            className="shrink-0 px-3 bg-gray-300 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded flex items-center justify-center hover:bg-gray-400 dark:hover:bg-[#5a5a5a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Więcej informacji o kliencie"
          >
            <Info className="w-4 h-4 text-black dark:text-gray-200" strokeWidth={2.5} />
          </button>

          <input
            type="text"
            value={orderData.clientInfo}
            onChange={(e) => updateField('clientInfo', e.target.value)}
            onBlur={() => saveClientNotesNow(clientCode, orderData.clientInfo, orderData.internalInfo)}
            className="w-64 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Hasło"
          />
        </div>

        <div className="border-t border-b border-[#b0b3b8] dark:border-[#7a7a7a] py-2 flex gap-2">
          {/* Lewa kolumna: adresy */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Odbiór */}
            <div className="flex gap-2 items-stretch">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-emerald-600 text-xl leading-none select-none shrink-0 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.15))]">●</span>
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    value={orderData.pickupAddress}
                    onChange={(value) => {
                      updateField('pickupAddress', value);
                      setPickupCoords(null);
                      onPickupCoordsChange?.(null);
                      if (validationFields.pickup) setValidationFields(prev => ({ ...prev, pickup: false }));
                    }}
                    onCoordinateSelect={(lat, lng) => {
                      const coords = { lat, lng };
                      setPickupCoords(coords);
                      onPickupCoordsChange?.(coords);
                    }}
                    baseCity={baseCity}
                    placeholder="Adres odbioru"
                    className={`flex-1 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border rounded ${validationFields.pickup ? 'border-red-500' : 'border-[#b0b3b8] dark:border-[#7a7a7a]'} text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    isDetectingZone={isDetectingZone}
                    customPins={addressPins}
                    onCustomPinSelect={handleCustomPinSelect}
                    localAddresses={localAddresses}
                  />
                </div>
              </div>
              <input
                type="text"
                value={orderData.pickupZone}
                onChange={(e) => updateField('pickupZone', e.target.value)}
                className="w-24 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Rejon"
              />
              <button
                type="button"
                onClick={() => {
                  if (!user) return;
                  localStorage.setItem(`dispatch_pick_request_${user.id}`, JSON.stringify({ type: 'pickup', ts: Date.now() }));
                  if (!isMapOpen()) { onRequestMiniMap?.(); return; }
                }}
                className="shrink-0 px-3 bg-gray-300 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded flex items-center justify-center hover:bg-gray-400 dark:hover:bg-[#5a5a5a] transition-colors"
                title="Zaznacz adres odbioru na mapie"
              >
                <Crosshair className="w-4 h-4 text-black dark:text-gray-200" strokeWidth={2.5} />
              </button>
            </div>

            {/* Pionowa kreska */}
            <div className="flex items-center gap-2 pl-1.5">
              <div className="w-px h-4 bg-[#b0b3b8] dark:bg-[#444444] ml-1" />
            </div>

            {/* Cel */}
            <div className="flex gap-2 items-stretch">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-rose-600 text-xl leading-none select-none shrink-0 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.15))]">●</span>
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    value={orderData.destinationAddress}
                    onChange={(value) => {
                      updateField('destinationAddress', value);
                      setDestinationCoords(null);
                      onDestinationCoordsChange?.(null);
                    }}
                    onCoordinateSelect={(lat, lng) => {
                      const coords = { lat, lng };
                      setDestinationCoords(coords);
                      onDestinationCoordsChange?.(coords);
                    }}
                    baseCity={baseCity}
                    placeholder="Adres docelowy"
                    className="flex-1 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border rounded border-[#b0b3b8] dark:border-[#7a7a7a] text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    customPins={addressPins}
                    onCustomPinSelect={handleCustomPinSelect}
                    localAddresses={localAddresses}
                  />
                </div>
              </div>
              <input
                type="text"
                value={orderData.destinationZone}
                onChange={(e) => updateField('destinationZone', e.target.value)}
                className="w-24 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Rejon"
              />
              <button
                type="button"
                onClick={() => {
                  if (!user) return;
                  localStorage.setItem(`dispatch_pick_request_${user.id}`, JSON.stringify({ type: 'destination', ts: Date.now() }));
                  if (!isMapOpen()) { onRequestMiniMap?.(); return; }
                }}
                className="shrink-0 px-3 bg-gray-300 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded flex items-center justify-center hover:bg-gray-400 dark:hover:bg-[#5a5a5a] transition-colors"
                title="Zaznacz adres docelowy na mapie"
              >
                <Crosshair className="w-4 h-4 text-black dark:text-gray-200" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Prawa kolumna: informacje wewnętrzne */}
          <textarea
            value={orderData.internalInfo}
            onChange={(e) => updateField('internalInfo', e.target.value)}
            onBlur={() => saveClientNotesNow(clientCode, orderData.clientInfo, orderData.internalInfo)}
            className="w-64 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Informacje wewnętrzne..."
          />
        </div>

        <div className="flex gap-2 items-center">

          {/* LEWA CZĘŚĆ: taxi, preferencje, rodzaj zlecenia */}
          <div className="flex-1 min-w-0 flex gap-2 items-center">
            {/* Liczba taksówek */}
            <div ref={taxiDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setTaxiDropdownOpen(o => !o)}
                className="px-2 py-1.5 bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded font-semibold text-black dark:text-white text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
              >
                L. taxi - {orderData.taxiCount}
              </button>
              {taxiDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded shadow-lg">
                  {Array.from({ length: 5 }, (_, i) => i + 1).map(n => (
                    <div
                      key={n}
                      onMouseDown={() => { updateField('taxiCount', n); setTaxiDropdownOpen(false); }}
                      className={`px-4 py-1.5 cursor-pointer text-[0.9375rem] font-semibold text-black dark:text-white hover:bg-blue-500 hover:text-white ${orderData.taxiCount === n ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
                    >
                      {n}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Czas dojazdu */}
            <input
              type="number"
              min={0}
              value={orderData.travelTime}
              onChange={(e) => updateField('travelTime', e.target.value)}
              className="w-36 shrink-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="dojazd"
            />

            {/* Data */}
            <div className="flex-1 min-w-0 flex relative">
              {showDatePicker && createPortal(
                <div
                  ref={datePickerRef}
                  style={{
                    position: 'fixed',
                    top: (calBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                    left: calBtnRef.current?.getBoundingClientRect().left ?? 0,
                    zIndex: 9999,
                  }}
                  className="bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#7a7a7a] rounded-xl shadow-2xl p-4 select-none w-72"
                >
                  {/* Nagłówek — miesiąc/rok + nawigacja */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setCalView(v => {
                        const d = new Date(v.year, v.month - 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-600 dark:text-gray-200 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {MONTHS_PL[calView.month]} {calView.year}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalView(v => {
                        const d = new Date(v.year, v.month + 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-600 dark:text-gray-200 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Nazwy dni */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_PL.map(d => (
                      <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-gray-300 py-1">{d}</div>
                    ))}
                  </div>
                  {/* Siatka dni */}
                  {(() => {
                    const firstDow = new Date(calView.year, calView.month, 1).getDay();
                    const offset = (firstDow + 6) % 7; // poniedziałek = 0
                    const daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();
                    const today = new Date();
                    const selParts = orderData.date.split('-').map(Number);
                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} />);
                    for (let day = 1; day <= daysInMonth; day++) {
                      const isSelected = selParts[0] === calView.year && selParts[1] === calView.month + 1 && selParts[2] === day;
                      const isToday = today.getFullYear() === calView.year && today.getMonth() === calView.month && today.getDate() === day;
                      cells.push(
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const nd = new Date(calView.year, calView.month, day);
                            updateField('date', nd.toISOString().split('T')[0]);
                            setShowDatePicker(false);
                          }}
                          className={`h-9 w-full flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                            ${isSelected ? 'bg-blue-600 text-white font-bold' : isToday ? 'border-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#434343]'}
                          `}
                        >
                          {day}
                        </button>
                      );
                    }
                    return <div className="grid grid-cols-7 gap-0.5">{cells}</div>;
                  })()}
                  {/* Przycisk Dziś */}
                  <button
                    type="button"
                    onClick={() => {
                      const nd = new Date();
                      updateField('date', nd.toISOString().split('T')[0]);
                      setCalView({ year: nd.getFullYear(), month: nd.getMonth() });
                      setShowDatePicker(false);
                    }}
                    className="mt-3 w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-[#383838] text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#585858] transition-colors"
                  >
                    Dziś
                  </button>
                </div>,
                document.body
              )}
              <input
                type="date"
                value={orderData.date}
                onChange={(e) => updateField('date', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-r-0 border-[#b0b3b8] dark:border-[#7a7a7a] rounded-l text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
              <button
                ref={calBtnRef}
                type="button"
                onClick={() => {
                  const d = new Date(orderData.date + 'T00:00:00');
                  setCalView({ year: d.getFullYear(), month: d.getMonth() });
                  setShowDatePicker(v => !v);
                }}
                className="bg-gray-300 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-r px-2 py-1.5 flex items-center hover:bg-gray-400 dark:hover:bg-[#5a5a5a] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-black dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            </div>
          </div>

          {/* PRAWA CZĘŚĆ: godzina, data, preferencje */}
          <div className="shrink-0 flex gap-2 items-center">
            {/* Godzina */}
            <div className="flex relative">
              {showTimePicker && createPortal(
                <div
                  ref={timePickerRef}
                  style={{
                    position: 'fixed',
                    top: (clockBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                    left: clockBtnRef.current?.getBoundingClientRect().left ?? 0,
                    zIndex: 9999,
                  }}
                  className="bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#7a7a7a] rounded-xl shadow-2xl p-4 select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <button type="button" onClick={() => adjustTime('h', 1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors text-gray-700 dark:text-gray-100">
                        <ChevronUp className="w-6 h-6" strokeWidth={2.5} />
                      </button>
                      <span className="text-4xl font-bold w-16 text-center tabular-nums text-gray-900 dark:text-white leading-none py-1">
                        {orderData.time.split(':')[0]}
                      </span>
                      <button type="button" onClick={() => adjustTime('h', -1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors text-gray-700 dark:text-gray-100">
                        <ChevronDown className="w-6 h-6" strokeWidth={2.5} />
                      </button>
                    </div>
                    <span className="text-4xl font-bold text-gray-900 dark:text-white pb-0.5">:</span>
                    <div className="flex flex-col items-center gap-1">
                      <button type="button" onClick={() => adjustTime('m', 1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors text-gray-700 dark:text-gray-100">
                        <ChevronUp className="w-6 h-6" strokeWidth={2.5} />
                      </button>
                      <span className="text-4xl font-bold w-16 text-center tabular-nums text-gray-900 dark:text-white leading-none py-1">
                        {orderData.time.split(':')[1]}
                      </span>
                      <button type="button" onClick={() => adjustTime('m', -1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors text-gray-700 dark:text-gray-100">
                        <ChevronDown className="w-6 h-6" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
              <input
                type="time"
                value={orderData.time}
                onChange={(e) => updateField('time', e.target.value)}
                className="w-20 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-r-0 border-[#b0b3b8] dark:border-[#7a7a7a] rounded-l text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
              <button
                ref={clockBtnRef}
                type="button"
                onClick={() => setShowTimePicker(v => !v)}
                className="bg-gray-300 dark:bg-[#444444] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-r px-2 py-1.5 flex items-center hover:bg-gray-400 dark:hover:bg-[#5a5a5a] transition-colors"
              >
                <Clock className="w-4 h-4 text-black dark:text-gray-200" strokeWidth={2.5} />
              </button>
            </div>

            {/* Rodzaj zlecenia */}
            <select
              value={orderData.orderType}
              onChange={(e) => updateField('orderType', e.target.value)}
              className="w-[146px] shrink-0 px-2 py-1.5 bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded font-semibold text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="standard">Zwykłe</option>
              <option value="scheduled">Terminowe</option>
              <option value="recurring">Cykliczne</option>
            </select>

            {/* Preferencje */}
            <button
              type="button"
              onClick={() => setPrefModalOpen(true)}
              className={`w-64 shrink-0 px-3 py-1.5 text-[0.9375rem] font-semibold border rounded transition-colors flex items-center gap-2 ${
                selectedPrefIds.length > 0
                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 dark:bg-[#444444] border-[#b0b3b8] dark:border-[#7a7a7a] text-black dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-[#5a5a5a]'
              }`}
            >
              <span>Preferencje</span>
              {selectedPrefIds.length > 0 && (
                <span className="bg-white/25 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                  {selectedPrefIds.length}
                </span>
              )}
            </button>

          </div>

        </div>

        {/* Wiersz: dojazd + notatki + rabat/gotówka/wycena/umowa */}
        <div className="flex gap-2 items-stretch">
          {/* Notatki */}
          <textarea
            value={orderData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-[0.9375rem] font-semibold rounded border border-[#b0b3b8] dark:border-[#7a7a7a] bg-white dark:bg-[#383838] text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Dodatkowe informacje dla kierowcy..."
          />

          {/* Kolumna: Rabat+Gotówka / Wycena+Umowa — w-64 */}
          <div className="w-64 shrink-0 flex flex-col gap-2">
            <div className="flex gap-1">
              <select
                value={orderData.discount}
                onChange={(e) => updateField('discount', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded font-semibold text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Brak rabatu</option>
                <option value="5">5%</option>
                <option value="10">10%</option>
                <option value="15">15%</option>
                <option value="20">20%</option>
                <option value="25">25%</option>
                <option value="30">30%</option>
              </select>
              <select
                value={orderData.paymentMethod}
                onChange={(e) => updateField('paymentMethod', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded font-semibold text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="cash">Gotówka</option>
                <option value="card">Karta</option>
                <option value="cashless">Bezgotówka</option>
              </select>
            </div>
            <div className="flex gap-1">
              <input
                type="number"
                min={0}
                value={orderData.quote}
                onChange={(e) => updateField('quote', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="wycena"
              />
              <input
                type="text"
                value={orderData.contract}
                onChange={(e) => updateField('contract', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-[0.9375rem] font-semibold bg-white dark:bg-[#383838] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="umowa"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#b0b3b8] dark:border-[#7a7a7a] mt-1">
          {isSubmitting ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader className="w-4 h-4 animate-spin" />
              Zapisywanie...
            </div>
          ) : editingOrderId ? (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded transition-colors shadow-sm"
              >
                <X size={15} /> Anuluj
              </button>
              <button
                type="button"
                onClick={async () => {
                  const url = `/api/orders/${editingOrderId}/update`;
                  console.log('[Zapisz] Wysyłam do:', url);
                  try {
                    const res = await fetch(url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customerPhone:      orderData.customerPhone,
                        customerName:       orderData.customerName,
                        pickupAddress:      orderData.pickupAddress,
                        destinationAddress: orderData.destinationAddress,
                        taxiCount:          orderData.taxiCount,
                        paymentMethod:      orderData.paymentMethod,
                        vehicleCategory:    orderData.vehicleCategory,
                        scheduledDate:      orderData.orderType === 'scheduled' ? orderData.date : null,
                        scheduledTime:      orderData.orderType === 'scheduled' ? orderData.time : null,
                        notes:              orderData.notes,
                      }),
                    });
                    const text = await res.text();
                    console.log('[Zapisz] Status:', res.status, '| Odpowiedź:', text);
                    let json: any = {};
                    try { json = JSON.parse(text); } catch {}
                    if (res.ok && json.success !== false) {
                      onSaveEdit?.();
                    } else {
                      alert(`Błąd zapisu (${res.status}): ${text.slice(0, 200)}`);
                    }
                  } catch (e: any) {
                    console.error('[Zapisz] Wyjątek:', e);
                    alert(`Błąd sieci: ${e?.message}`);
                  }
                }}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded transition-colors shadow-sm"
              >
                <Check size={15} /> Zapisz
              </button>
            </>
          ) : manualMode ? (
            <>
              <input
                autoFocus
                type="text"
                value={manualDriverCode}
                onChange={e => setManualDriverCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRecznie(); } if (e.key === 'Escape') { setManualMode(false); setManualDriverCode(''); } }}
                placeholder="Kod kierowcy (np. K001)"
                className="flex-1 px-2 py-1.5 text-sm rounded border border-[#b0b3b8] dark:border-[#7a7a7a] bg-white dark:bg-[#383838] text-black dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleRecznie}
                disabled={!manualDriverCode.trim()}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded transition-colors shadow-sm"
              >
                <Send size={15} /> Wyślij
              </button>
              <button
                type="button"
                onClick={() => { setManualMode(false); setManualDriverCode(''); }}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded transition-colors"
              >
                <X size={15} /> Anuluj
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition-colors shadow-sm"
              >
                <Trash2 size={15} /> Wyczyść
              </button>

              <button
                type="button"
                onClick={handleOczekujace}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded transition-colors shadow-sm"
              >
                <Hourglass size={15} /> Oczekujące
              </button>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white rounded transition-colors shadow-sm"
              >
                <Send size={15} /> Ręcznie
              </button>
              <button
                type="button"
                onClick={handleWydaj}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded transition-colors shadow-sm"
              >
                <Send size={15} /> Wyślij
              </button>
            </>
          )}
        </div>
      </form>

      {/* Toast — wynik akcji */}
      {toast.open && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-4 duration-300">
          <div className={`flex items-start gap-3.5 text-white px-6 py-5 rounded-xl shadow-2xl min-w-[340px] max-w-md ${
            toast.type === 'success' ? 'bg-green-600' :
            toast.type === 'warning' ? 'bg-amber-600' :
            'bg-red-600'
          }`}>
            <AlertCircle className="w-7 h-7 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-lg">{toast.title}</p>
              <div className={`text-base mt-1 ${
                toast.type === 'success' ? 'text-green-100' :
                toast.type === 'warning' ? 'text-amber-100' :
                'text-red-100'
              }`}>{toast.content}</div>
            </div>
            <button
              onClick={() => setToast(prev => ({ ...prev, open: false }))}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Toast walidacji — prawa strona ekranu */}
      {validationError && !toast.open && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-start gap-3 bg-red-600 text-white px-5 py-4 rounded-xl shadow-2xl min-w-[300px] max-w-sm">
            <AlertCircle className="w-6 h-6 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-base">Brakujące dane</p>
              <p className="text-sm text-red-100 mt-0.5">{validationError}</p>
            </div>
            <button
              onClick={() => setValidationError(null)}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal informacji o kliencie */}
      {clientInfoOpen && clientPreviewData && (
        <ClientPreviewModal
          client={clientPreviewData}
          preferences={availablePreferences}
          onClose={() => { setClientInfoOpen(false); setClientPreviewData(null); }}
        />
      )}

      {/* Modal preferencji */}
      {prefModalOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]"
          onClick={(e) => { if (e.target === e.currentTarget) setPrefModalOpen(false); }}
        >
          <div className="bg-white dark:bg-[#2d2d2d] rounded shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

            {/* Nagłówek */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-300 dark:border-[#7a7a7a]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Tag className="w-6 h-6 text-black dark:text-white shrink-0" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">Preferencje</h2>
                </div>
                <button
                  onClick={() => setPrefModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lista preferencji */}
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {availablePreferences.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-300 text-sm text-center py-4">Brak dostępnych preferencji</p>
              ) : availablePreferences.map((pref) => {
                const isChecked = selectedPrefIds.includes(pref.id);
                const isStarred = starredPrefIds.includes(pref.id);
                const toggleStar = () => {
                  const newStarred = isStarred
                    ? starredPrefIds.filter(id => id !== pref.id)
                    : [...starredPrefIds, pref.id];
                  setStarredPrefIds(newStarred);
                  // Gwiazdka zaznacza też preferencję
                  if (!isStarred) setSelectedPrefIds(prev => prev.includes(pref.id) ? prev : [...prev, pref.id]);
                  // Zapis do DB
                  if (clientCode) {
                    dataSourceService.query(
                      'UPDATE clients SET permanent_preference_ids = ?, updated_at = NOW() WHERE client_code = ?',
                      [JSON.stringify(newStarred), clientCode]
                    );
                  }
                };
                return (
                  <div key={pref.id} className="flex items-center gap-2">
                    <label className={`flex items-center gap-3 flex-1 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-blue-50 dark:bg-blue-600/20 border border-blue-300 dark:border-blue-500/40'
                        : 'bg-gray-50 dark:bg-[#383838] border border-gray-200 dark:border-[#7a7a7a] hover:border-gray-300 dark:hover:border-[#585858]'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setSelectedPrefIds(prev =>
                          isChecked ? prev.filter(id => id !== pref.id) : [...prev, pref.id]
                        )}
                        className="w-4 h-4 rounded border-gray-300 dark:border-[#888888] text-blue-600 focus:ring-blue-500 bg-white dark:bg-[#444444]"
                      />
                      <span className="text-sm text-gray-800 dark:text-white font-medium">{pref.name}</span>
                    </label>
                    <button
                      type="button"
                      onClick={toggleStar}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-[#585858] transition-colors"
                      title={isStarred ? 'Usuń stałą preferencję' : 'Zapisz jako stałą preferencję klienta'}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 transition-all duration-200"
                        style={{ fill: isStarred ? (pref.color || '#3b82f6') : 'transparent', stroke: isStarred ? (pref.color || '#3b82f6') : '#9ca3af', strokeWidth: 1.5 }}
                      >
                        <path strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Stopka */}
            <div className="shrink-0 px-5 py-3 border-t border-gray-300 dark:border-[#7a7a7a] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedPrefIds([])}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition-colors shadow-sm"
              >
                Wyczyść
              </button>
              <button
                type="button"
                onClick={() => setPrefModalOpen(false)}
                className="flex items-center gap-2 px-4 h-8 text-[0.9375rem] font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded transition-colors shadow-sm"
              >
                Zatwierdź ({selectedPrefIds.length})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal — ostrzeżenie o zleceniu z przyszłą datą/godziną bez trybu Terminowe */}
      {schedWarning && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-[#2d2d2d] rounded-xl shadow-2xl p-6 w-[420px] max-w-[95vw] border border-[#b0b3b8] dark:border-[#555]">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Zlecenie nie jest terminowe</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Ustawiona data lub godzina jest inna niż aktualna, ale zlecenie nie jest oznaczone jako <strong>Terminowe</strong>.
              <br /><br />
              Wydać zlecenie kierowcy <strong>teraz</strong>?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  skipSchedWarningRef.current = true;
                  const action = schedWarning;
                  setSchedWarning(null);
                  if (action === 'wydaj') handleWydaj();
                  else if (action === 'oczekujace') handleOczekujace();
                  else if (action === 'recznie') handleRecznie();
                }}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Tak, wydaj teraz
              </button>
              <button
                type="button"
                onClick={() => {
                  updateField('orderType', 'scheduled');
                  setSchedWarning(null);
                }}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors"
              >
                Zmień na terminowe
              </button>
              <button
                type="button"
                onClick={() => setSchedWarning(null)}
                className="w-full px-4 py-2 bg-gray-200 dark:bg-[#444] hover:bg-gray-300 dark:hover:bg-[#555] text-gray-800 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default OrderForm;
