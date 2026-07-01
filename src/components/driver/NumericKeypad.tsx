import React, { useState, useEffect, useCallback } from 'react';
import { Delete, Clock, Car, Home, MapPin, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { driverQueueService, type DriverState, type QueueStateResult } from '../../services/driverQueueService';
import { DRIVER_STATUS_COLORS } from '../../constants/driverColors';
import { driverAnalyticsService } from '../../services/driverAnalyticsService';
import { DailyDriverStats } from '../../types/driverHistory';

interface NumericKeypadProps {
  onStatusChange?: (status: 'free' | 'driving' | 'pickup' | 'busy' | 'home') => void;
  currentStatus?: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  currentZone?: number | null;
  queuePosition?: number | null;
  driverId?: string;
  driverCode?: string;
  hasActiveOrder?: boolean;
}

// Mapowanie stary stany ↔ nowe driver_state
const NEW_TO_OLD: Record<DriverState, 'free' | 'driving' | 'pickup' | 'busy' | 'home'> = {
  wolna: 'free',
  dojazd: 'pickup',
  zajeta: 'busy',
  kursem: 'driving',
};
const OLD_TO_NEW: Record<string, DriverState> = {
  free: 'wolna',
  pickup: 'dojazd',
  busy: 'zajeta',
  driving: 'kursem',
  home: 'wolna', // fallback
};

// ============================================================================
// Modal potwierdzenia sukces / błąd
// ============================================================================
interface ModalProps {
  type: 'success' | 'error';
  message: string;
  barColor: string; // kolor górnej kreski, np. '#22c55e'
  onClose: () => void;
}

const StateModal: React.FC<ModalProps> = ({ type, message, barColor, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose, type]);

  // Rozdziel pierwszą linię (tytuł bold) od reszty (szczegóły)
  const lines = message.split('\n');
  const title = lines[0];
  const detail = lines.slice(1).join('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#21222D] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="h-1.5 w-full" style={{ backgroundColor: barColor }} />
        <div className="px-5 pt-5 pb-4">
          <p className="text-white text-center font-bold text-3xl mb-1">{title}</p>
          {detail ? <p className="text-[#ACACB9] text-center text-xl mb-5">{detail}</p> : <div className="mb-5" />}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-[10px] text-lg font-bold text-white transition-colors"
            style={{ backgroundColor: barColor }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// NumericKeypad
// ============================================================================
const nowTime = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}`;
};

const NumericKeypad: React.FC<NumericKeypadProps> = ({
  onStatusChange,
  currentStatus = 'home',
  currentZone = null,
  queuePosition = null,
  driverId: driverIdProp,
  driverCode = '',
  hasActiveOrder = false,
}) => {
  const { user } = useAuth();
  // Priorytet: prop driverId (z DriverApp) → fallback na AuthContext user.id
  const effectiveDriverId = driverIdProp || user?.id;

  // Aktywny stan kierowcy (driver_state)
  const [activeMode, setActiveMode] = useState<DriverState | 'home'>('home');
  const [localQueuePosition, setLocalQueuePosition] = useState<number | null>(null);
  const [localZone, setLocalZone] = useState<number | null>(currentZone);
  const [statusDuration, setStatusDuration] = useState<string>('0m');
  const [isUpdating, setIsUpdating] = useState(false);
  const isUpdatingRef = React.useRef(false);
  const [localZoneName, setLocalZoneName] = useState<string | null>(null);
  const [localZoneEnteredAt, setLocalZoneEnteredAt] = useState<string | null>(null);

  // Synchronizuj ref z isUpdating (do użycia w callbackach bez re-tworzenia)
  useEffect(() => { isUpdatingRef.current = isUpdating; }, [isUpdating]);

  // Pole numeryczne (numer rejonu dla Kursem)
  const [input, setInput] = useState('');

  // Modal
  const [modal, setModal] = useState<{ type: 'success' | 'error'; message: string; barColor: string } | null>(null);

  // ── Mini-stats ──────────────────────────────────────────────────────────────
  const [todayStats, setTodayStats] = useState<DailyDriverStats | null>(null);

  useEffect(() => {
    if (!effectiveDriverId) return;
    const load = () => {
      const s = driverAnalyticsService.getTodayStats(effectiveDriverId);
      setTodayStats(s);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [effectiveDriverId]);

  const formatMin = (mins: number): string => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Pobierz aktualny stan kierowcy z bazy co 3s
  const refreshStatus = useCallback(async () => {
    if (!effectiveDriverId || isUpdatingRef.current) return;
    try {
      const status = await driverQueueService.getDriverStatus(effectiveDriverId);
      if (status && !isUpdatingRef.current) {
        // Mapuj stary status na driver_state dla wyświetlania
        const ds = OLD_TO_NEW[status.status] ?? 'home';
        setActiveMode(status.status === 'home' ? 'home' : ds);
        setLocalQueuePosition(status.queuePosition);
        setLocalZone(status.currentZone);
        setLocalZoneName(status.zoneName ?? null);
        setLocalZoneEnteredAt(status.zoneEnteredAt ?? null);
        setStatusDuration(status.statusDuration || '0m');
      }
    } catch {
      // cicho
    }
  }, [effectiveDriverId]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Synchronizuj z propsem przy pierwszym renderze
  useEffect(() => {
    if (currentStatus) {
      setActiveMode(currentStatus === 'home' ? 'home' : OLD_TO_NEW[currentStatus] ?? 'home');
    }
    if (queuePosition != null) setLocalQueuePosition(queuePosition);
    if (currentZone != null) setLocalZone(currentZone);
  }, []);

  // --------------------------------------------------------------------------
  // Obsługa przycisków
  // --------------------------------------------------------------------------
  const handleNumberClick = (num: string) => setInput(prev => prev + num);
  const handleClear = () => setInput('');
  const handleBackspace = () => setInput(prev => prev.slice(0, -1));

  const showModal = (type: 'success' | 'error', message: string, barColor?: string) => {
    const defaultColor = type === 'error' ? '#ef4444' : '#22c55e';
    setModal({ type, message, barColor: barColor ?? defaultColor });
  };

  const STATUS_COLORS: Record<string, string> = {
    wolna:  '#007a1e', // zielony
    dojazd: '#aa0000', // czerwony
    kursem: '#0052cc', // niebieski
    zajeta: '#8428bc', // fioletowy
  };

  const applyResult = (result: QueueStateResult, label: string) => {
    if (result.success) {
      setActiveMode(result.driverState ?? 'home');
      setLocalQueuePosition(result.queuePosition);
      setLocalZone(result.zoneNumber);
      setInput('');
      const zone = result.zoneNumber;
      const pos = result.queuePosition;
      let message: string;
      switch (result.driverState) {
        case 'wolna':
          message = `Status wolna\nRejon ${zone} pozycja ${pos}`;
          break;
        case 'kursem':
          message = `Status kursem\nRejon ${zone} pozycja ${pos}`;
          break;
        case 'zajeta':
          message = `Status zajęta`;
          break;
        case 'dojazd':
          message = `Status dojazd\nRejon ${zone} pozycja ${pos}`;
          break;
        default:
          message = `Stan zmieniony na „${label}".`;
      }
      const barColor = result.driverState ? (STATUS_COLORS[result.driverState] ?? '#22c55e') : '#22c55e';
      showModal('success', message, barColor);
      if (onStatusChange && result.driverState) {
        onStatusChange(NEW_TO_OLD[result.driverState]);
      }
      setTimeout(refreshStatus, 800);
    } else {
      showModal('error', result.error ?? 'Nieznany błąd');
    }
  };

  const handleModeClick = async (mode: DriverState | 'home') => {
    if (!effectiveDriverId || isUpdating) return;

    // Optymistyczna aktualizacja — UI reaguje natychmiast
    const previousMode = activeMode;
    setActiveMode(mode);
    setIsUpdating(true);

    try {
      if (mode === 'home') {
        // Dom → wyjście z kolejki
        const result = await driverQueueService.leaveZone(effectiveDriverId);
        if (result.success) {
          setLocalQueuePosition(null);
          setLocalZone(null);
          setLocalZoneName(null);
          setLocalZoneEnteredAt(null);
          setInput('');
          showModal('success', `Taxi ${driverCode} nie pracuje od ${nowTime()}`, '#6b7280');
          if (onStatusChange) onStatusChange('home');
        } else {
          setActiveMode(previousMode); // cofnij optymistyczny update
          showModal('error', result.error ?? 'Błąd wyjścia z kolejki');
        }
        return;
      }

      if (mode === 'kursem') {
        // Kursem — użyj wpisanego rejonu; jeśli pusty → użyj bieżącego rejonu kierowcy
        const parsed = parseInt(input);
        const zoneNum = (!input || isNaN(parsed) || parsed <= 0) ? localZone : parsed;
        if (!zoneNum || zoneNum <= 0) {
          setActiveMode(previousMode); // cofnij
          showModal('error', 'Wpisz numer rejonu na klawiaturze, a następnie naciśnij „Kursem".');
          return;
        }
        const result = await driverQueueService.enterZone(effectiveDriverId, 'kursem', zoneNum);
        if (!result.success) setActiveMode(previousMode);
        applyResult(result, 'Kursem');
        return;
      }

      // wolna / dojazd / zajeta
      const modeLabel = mode === 'wolna' ? 'Wolna' : mode === 'dojazd' ? 'Dojazd' : 'Zajęta';

      // Jeśli kierowca wpisał numer rejonu przed kliknięciem Wolna — sprawdź zgodność z GPS
      if (mode === 'wolna' && input) {
        const parsed = parseInt(input);
        if (!isNaN(parsed) && parsed > 0 && localZone && parsed !== localZone) {
          setActiveMode(previousMode); // cofnij
          const nameHint = localZoneName ? ` – ${localZoneName}` : '';
          showModal('error', `Jesteś na rejonie ${localZone}${nameHint}, nie na ${parsed}.`);
          return;
        }
      }

      if (!localZone) {
        const result = await driverQueueService.enterZone(effectiveDriverId, mode);
        if (!result.success) setActiveMode(previousMode);
        applyResult(result, modeLabel);
      } else {
        const result = await driverQueueService.changeDriverState(effectiveDriverId, mode);
        if (!result.success && result.error?.includes('GPS poza rejonem')) {
          const enterResult = await driverQueueService.enterZone(effectiveDriverId, mode);
          if (enterResult.success) {
            applyResult(enterResult, modeLabel);
          } else {
            setActiveMode(previousMode); // cofnij
            showModal('error', (result.error ?? 'Nieznany błąd') + '\nKliknij „Dom", aby opuścić kolejkę i dołączyć do nowego rejonu.');
          }
        } else {
          if (!result.success) setActiveMode(previousMode);
          applyResult(result, modeLabel);
        }
      }

    } catch (err: any) {
      setActiveMode(previousMode); // cofnij przy błędzie sieci
      showModal('error', 'Błąd połączenia: ' + (err.message ?? 'Sprawdź sieć'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Etykiety i ikony dla wyświetlania w pasku
  const stateLabel: Record<DriverState | 'home', string> = {
    wolna: 'Wolna',
    dojazd: 'Dojazd',
    zajeta: 'Zajęta',
    kursem: 'Kursem',
    home: 'Dom',
  };

  return (
    <>
      {modal && (
        <StateModal
          type={modal.type}
          message={modal.message}
          barColor={modal.barColor}
          onClose={() => setModal(null)}
        />
      )}

      <div className="flex flex-col" style={{ height: '100%' }}>
      <div
        className="flex-1 bg-[#171821] grid gap-0.5 p-0.5 w-full overflow-hidden"
        style={{
          gridTemplateRows: 'repeat(7, 1fr)',
          gridTemplateColumns: '1fr'
        }}
      >
        {/* ── Pasek stanu ── */}
        <div className="bg-[#21222D] flex items-center justify-between pl-2 pr-4 rounded-lg overflow-hidden">
          <input
            type="text"
            value={input}
            readOnly
            className="flex-1 min-w-0 bg-transparent text-white text-6xl font-normal outline-none text-left placeholder:text-white/30"
            placeholder={activeMode === 'kursem' ? 'nr rejonu' : '0'}
          />

          {/* Wskaźnik aktywnego stanu */}
          {activeMode === 'wolna' && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ color: DRIVER_STATUS_COLORS.free.primary }}>
              <Clock className="w-4 h-4 flex-shrink-0" />
              {localQueuePosition != null && <div className="text-xs font-bold">#{localQueuePosition}</div>}
            </div>
          )}
          {activeMode === 'kursem' && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ color: DRIVER_STATUS_COLORS.driving.primary }}>
              <Car className="w-4 h-4 flex-shrink-0" />
            </div>
          )}
          {activeMode === 'dojazd' && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ color: DRIVER_STATUS_COLORS.pickup.primary }}>
              <MapPin className="w-4 h-4 flex-shrink-0" />
            </div>
          )}
          {activeMode === 'zajeta' && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ color: DRIVER_STATUS_COLORS.busy.primary }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            </div>
          )}
          {activeMode === 'home' && (
            <div className="flex items-center gap-2 text-[#ACACB9] flex-shrink-0">
              <Home className="w-4 h-4" />
              <div className="text-xs font-medium">Dom</div>
            </div>
          )}
        </div>

        {/* ── Przyciski stanów ── */}
        <div className="grid grid-cols-2 gap-0.5">
          {/* Kursem */}
          <button
            onClick={() => handleModeClick('kursem')}
            disabled={isUpdating}
            className="font-medium text-2xl transition-opacity duration-200 text-white disabled:opacity-50 rounded-md"
            style={{ backgroundColor: DRIVER_STATUS_COLORS.driving.primary }}
          >
            Kursem
          </button>
          {/* Wolna */}
          <button
            onClick={() => handleModeClick('wolna')}
            disabled={isUpdating || hasActiveOrder}
            title={hasActiveOrder ? 'Niedostępne podczas obsługi zlecenia' : undefined}
            className="font-medium text-2xl transition-opacity duration-200 text-white disabled:opacity-30 rounded-md"
            style={{ backgroundColor: DRIVER_STATUS_COLORS.free.primary }}
          >
            Wolna
          </button>
        </div>

        <div className="grid grid-cols-3 gap-0.5">
          {/* Dom */}
          <button
            onClick={() => handleModeClick('home')}
            disabled={isUpdating || hasActiveOrder}
            title={hasActiveOrder ? 'Niedostępne podczas obsługi zlecenia' : undefined}
            className="font-medium text-2xl transition-opacity duration-200 bg-[#4D4D59] hover:bg-[#6D6D7A] text-white disabled:opacity-30 rounded-md"
          >
            Dom
          </button>
          {/* Zajęta */}
          <button
            onClick={() => handleModeClick('zajeta')}
            disabled={isUpdating || hasActiveOrder}
            title={hasActiveOrder ? 'Niedostępne podczas obsługi zlecenia' : undefined}
            className="font-medium text-2xl transition-opacity duration-200 text-white disabled:opacity-30 rounded-md"
            style={{ backgroundColor: DRIVER_STATUS_COLORS.busy.primary }}
          >
            Zajęta
          </button>
          {/* Dojazd */}
          <button
            onClick={() => handleModeClick('dojazd')}
            disabled={isUpdating}
            className="font-medium text-2xl transition-opacity duration-200 text-white disabled:opacity-50 rounded-md"
            style={{ backgroundColor: DRIVER_STATUS_COLORS.pickup.primary }}
          >
            Dojazd
          </button>
        </div>

        {/* ── Klawiatura numeryczna ── */}
        <div className="grid grid-cols-3 gap-0.5">
          {['1','2','3'].map(n => (
            <button key={n} onClick={() => handleNumberClick(n)} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">{n}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {['4','5','6'].map(n => (
            <button key={n} onClick={() => handleNumberClick(n)} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">{n}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {['7','8','9'].map(n => (
            <button key={n} onClick={() => handleNumberClick(n)} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">{n}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          <button onClick={handleBackspace} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">F</button>
          <button onClick={() => handleNumberClick('0')} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">0</button>
          <button onClick={handleClear} className="font-normal text-3xl bg-[#2B2B36] hover:bg-[#4D4D59] active:bg-[#6D6D7A] text-white rounded">C</button>
        </div>
      </div>

      </div>
    </>
  );
};

export default NumericKeypad;
