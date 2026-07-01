import React, { useEffect, useState, useCallback } from 'react';
import { Save, Loader, Store, Clock, Pencil, X, ToggleLeft, ToggleRight, Timer, MapPin, Navigation2, ChevronUp, ChevronDown } from 'lucide-react';

interface Zone {
  id: string;
  number: number;
  name: string;
}

const STATE_LABELS: Record<string, string> = {
  wolna:   'Wolna',
  kursem:  'Kursem',
  dojazd:  'Dojazd',
  zajeta:  'Zajęta',
};

const DEFAULT_PRIORITY = ['wolna', 'kursem', 'dojazd', 'zajeta'];

const GieldaSettings: React.FC = () => {
  // ── Sekcja 1: ustawienia globalne ──────────────────────────────────────────
  const [gieldaEnabled, setGieldaEnabled]     = useState<boolean>(true);
  const [regSeconds, setRegSeconds]           = useState<number>(15);
  const [editRegSeconds, setEditRegSeconds]   = useState('');
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [savingGlobal, setSavingGlobal]       = useState(false);
  const [globalStatus, setGlobalStatus]       = useState<'idle' | 'ok' | 'error'>('idle');
  const [globalError, setGlobalError]         = useState('');

  // ── Godziny pracy giełdy ───────────────────────────────────────────────────
  const [hoursEnabled, setHoursEnabled]       = useState<boolean>(false);
  const [hoursFrom, setHoursFrom]             = useState<string>('08:00');
  const [hoursTo, setHoursTo]                 = useState<string>('22:00');
  const [savingHours, setSavingHours]         = useState<boolean>(false);
  const [hoursStatus, setHoursStatus]         = useState<'idle' | 'ok' | 'error'>('idle');
  const [hoursError, setHoursError]           = useState<string>('');

  // ── Reguły przydziału — kolejność priorytetów ──────────────────────────────
  const [priorityOrder, setPriorityOrder]     = useState<string[]>(DEFAULT_PRIORITY);
  const [savingPriority, setSavingPriority]   = useState<boolean>(false);
  const [priorityStatus, setPriorityStatus]   = useState<'idle' | 'ok' | 'error'>('idle');
  const [priorityError, setPriorityError]     = useState<string>('');

  // ── Sekcja 2: max odległość per rejon ──────────────────────────────────────
  const [zones, setZones]                         = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone]           = useState<number | null>(null);
  const [maxDistValue, setMaxDistValue]           = useState('');
  const [loadingZoneData, setLoadingZoneData]     = useState(false);
  const [savingZone, setSavingZone]               = useState(false);
  const [zoneStatus, setZoneStatus]               = useState<'idle' | 'ok' | 'error'>('idle');
  const [zoneError, setZoneError]                 = useState('');
  const [zoneDataCache, setZoneDataCache]         = useState<Record<number, any>>({});

  // ── Auto-dispatch z giełdy ─────────────────────────────────────────────────
  const [autoDispatchWolna,  setAutoDispatchWolna]  = useState<boolean>(false);
  const [autoDispatchDojazd, setAutoDispatchDojazd] = useState<boolean>(false);
  const [savingAutoDispatch, setSavingAutoDispatch] = useState<boolean>(false);
  const [autoDispatchStatus, setAutoDispatchStatus] = useState<'idle'|'ok'|'error'>('idle');

  // ── Sekcja 3: timeout giełdy ───────────────────────────────────────────────
  const [timeoutMin, setTimeoutMin]               = useState<number>(3);
  const [editTimeoutValue, setEditTimeoutValue]   = useState('');
  const [isEditingTimeout, setIsEditingTimeout]   = useState(false);
  const [savingTimeout, setSavingTimeout]         = useState(false);
  const [timeoutStatus, setTimeoutStatus]         = useState<'idle' | 'ok' | 'error'>('idle');
  const [timeoutError, setTimeoutError]           = useState('');

  const [isLoading, setIsLoading] = useState(true);

  const apiBase = '/api';

  // ── Załaduj ustawienia globalne ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${apiBase}/settings/gielda`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setGieldaEnabled(!!data.data.gielda_enabled);
          setRegSeconds(data.data.gielda_registration_seconds ?? 15);
          setTimeoutMin(data.data.gielda_timeout_minutes ?? 3);
          setHoursEnabled(!!data.data.gielda_hours_enabled);
          setHoursFrom(data.data.gielda_hours_from ?? '08:00');
          setHoursTo(data.data.gielda_hours_to ?? '22:00');
          const raw = data.data.gielda_priority_order ?? 'wolna,kursem,dojazd,zajeta';
          setPriorityOrder(raw.split(',').map((s: string) => s.trim()).filter(Boolean));
          setAutoDispatchWolna(!!data.data.gielda_auto_dispatch_wolna);
          setAutoDispatchDojazd(!!data.data.gielda_auto_dispatch_dojazd);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // ── Załaduj listę stref ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${apiBase}/zones`)
      .then(r => r.json())
      .then(data => {
        const list: Zone[] = (data.zones ?? [])
          .map((z: any) => ({ id: z.id, number: Number(z.number), name: z.name ?? String(z.number) }))
          .sort((a: Zone, b: Zone) => a.number - b.number);
        setZones(list);
        if (list.length > 0) setSelectedZone(list[0].number);
      })
      .catch(() => {});
  }, []);

  // ── Załaduj dane dla wybranej strefy ──────────────────────────────────────
  const fetchZoneData = useCallback(async (zone: number) => {
    if (zoneDataCache[zone] !== undefined) {
      const cached = zoneDataCache[zone];
      setMaxDistValue(cached.gieldaMaxDistanceKm != null ? String(cached.gieldaMaxDistanceKm) : '');
      return;
    }
    setLoadingZoneData(true);
    try {
      const res  = await fetch(`${apiBase}/admin/zone-rules/${zone}`);
      const data = await res.json();
      const entry = {
        fallbackStatus:       data.fallbackStatus ?? 'pending',
        gieldaMaxDistanceKm:  data.gieldaMaxDistanceKm ?? null,
        steps:                data.data ?? [],
      };
      setZoneDataCache(prev => ({ ...prev, [zone]: entry }));
      setMaxDistValue(entry.gieldaMaxDistanceKm != null ? String(entry.gieldaMaxDistanceKm) : '');
    } catch {
      setMaxDistValue('');
    } finally {
      setLoadingZoneData(false);
    }
  }, [zoneDataCache]);

  useEffect(() => {
    if (selectedZone !== null) {
      setZoneStatus('idle');
      fetchZoneData(selectedZone);
    }
  }, [selectedZone]);

  // ── Zapisz toggle + czas rejestracji ──────────────────────────────────────
  const handleSaveGlobal = async () => {
    const regVal = parseInt(editRegSeconds);
    if (isNaN(regVal) || regVal < 0) return;
    setSavingGlobal(true);
    try {
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gielda_enabled: gieldaEnabled ? 1 : 0,
          gielda_registration_seconds: regVal,
          gielda_timeout_minutes: timeoutMin,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setRegSeconds(regVal);
        setIsEditingGlobal(false);
        setGlobalStatus('ok');
        setGlobalError('');
        setTimeout(() => setGlobalStatus('idle'), 4000);
      } else {
        setGlobalError(data.error || 'Nieznany błąd');
        setGlobalStatus('error');
      }
    } catch (e: any) {
      setGlobalError(e?.message || 'Brak połączenia z serwerem');
      setGlobalStatus('error');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setGieldaEnabled(enabled);
    setGlobalStatus('idle');
    setGlobalError('');
    try {
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gielda_enabled: enabled ? 1 : 0,
          gielda_registration_seconds: regSeconds,
          gielda_timeout_minutes: timeoutMin,
        }),
      });
      const data = await r.json();
      if (!data.success) {
        setGieldaEnabled(!enabled);
        setGlobalError(data.error || 'Błąd zapisu');
        setGlobalStatus('error');
      }
    } catch {
      setGieldaEnabled(!enabled);
      setGlobalError('Brak połączenia z serwerem');
      setGlobalStatus('error');
    }
  };

  // ── Toggle auto-dispatch (instant save) ───────────────────────────────────
  const handleToggleAutoDispatch = async (field: 'wolna' | 'dojazd', value: boolean) => {
    if (field === 'wolna') setAutoDispatchWolna(value);
    else setAutoDispatchDojazd(value);
    setAutoDispatchStatus('idle');
    setSavingAutoDispatch(true);
    try {
      const body: Record<string, number> = field === 'wolna'
        ? { gielda_auto_dispatch_wolna: value ? 1 : 0 }
        : { gielda_auto_dispatch_dojazd: value ? 1 : 0 };
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.success) {
        setAutoDispatchStatus('ok');
        setTimeout(() => setAutoDispatchStatus('idle'), 3000);
      } else {
        if (field === 'wolna') setAutoDispatchWolna(!value);
        else setAutoDispatchDojazd(!value);
        setAutoDispatchStatus('error');
      }
    } catch {
      if (field === 'wolna') setAutoDispatchWolna(!value);
      else setAutoDispatchDojazd(!value);
      setAutoDispatchStatus('error');
    } finally {
      setSavingAutoDispatch(false);
    }
  };

  // ── Zapisz godziny pracy ───────────────────────────────────────────────────
  const handleSaveHours = async () => {
    setSavingHours(true);
    setHoursStatus('idle');
    try {
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gielda_hours_enabled: hoursEnabled ? 1 : 0,
          gielda_hours_from: hoursFrom,
          gielda_hours_to: hoursTo,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setHoursStatus('ok');
        setHoursError('');
        setTimeout(() => setHoursStatus('idle'), 4000);
      } else {
        setHoursError(data.error || 'Nieznany błąd');
        setHoursStatus('error');
      }
    } catch (e: any) {
      setHoursError(e?.message || 'Brak połączenia z serwerem');
      setHoursStatus('error');
    } finally {
      setSavingHours(false);
    }
  };

  // ── Przesuń status w kolejności priorytetów ────────────────────────────────
  const handleMovePriority = (idx: number, dir: -1 | 1) => {
    const newOrder = [...priorityOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]];
    setPriorityOrder(newOrder);
    setPriorityStatus('idle');
  };

  // ── Zapisz kolejność priorytetów ───────────────────────────────────────────
  const handleSavePriority = async () => {
    setSavingPriority(true);
    setPriorityStatus('idle');
    try {
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gielda_priority_order: priorityOrder.join(',') }),
      });
      const data = await r.json();
      if (data.success) {
        setPriorityStatus('ok');
        setPriorityError('');
        setTimeout(() => setPriorityStatus('idle'), 4000);
      } else {
        setPriorityError(data.error || 'Nieznany błąd');
        setPriorityStatus('error');
      }
    } catch (e: any) {
      setPriorityError(e?.message || 'Brak połączenia z serwerem');
      setPriorityStatus('error');
    } finally {
      setSavingPriority(false);
    }
  };

  // ── Zapisz max odległość per rejon ─────────────────────────────────────────
  const handleSaveZone = async () => {
    if (selectedZone === null) return;
    const distVal = maxDistValue.trim() === '' ? null : parseFloat(maxDistValue);
    if (distVal !== null && (isNaN(distVal) || distVal < 0)) return;
    setSavingZone(true);
    setZoneStatus('idle');
    try {
      const cached = zoneDataCache[selectedZone];
      const r = await fetch(`${apiBase}/admin/zone-rules/${selectedZone}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps:               cached?.steps ?? [],
          fallbackStatus:      cached?.fallbackStatus ?? 'pending',
          gieldaMaxDistanceKm: distVal,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setZoneDataCache(prev => ({
          ...prev,
          [selectedZone]: { ...(prev[selectedZone] ?? {}), gieldaMaxDistanceKm: distVal },
        }));
        setZoneStatus('ok');
        setZoneError('');
        setTimeout(() => setZoneStatus('idle'), 4000);
      } else {
        setZoneError(data.error || 'Nieznany błąd');
        setZoneStatus('error');
      }
    } catch (e: any) {
      setZoneError(e?.message || 'Brak połączenia z serwerem');
      setZoneStatus('error');
    } finally {
      setSavingZone(false);
    }
  };

  // ── Zapisz timeout giełdy ──────────────────────────────────────────────────
  const handleSaveTimeout = async () => {
    const val = parseInt(editTimeoutValue);
    if (isNaN(val) || val < 1) return;
    setSavingTimeout(true);
    try {
      const r = await fetch(`${apiBase}/settings/gielda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gielda_timeout_minutes: val }),
      });
      const data = await r.json();
      if (data.success) {
        setTimeoutMin(val);
        setIsEditingTimeout(false);
        setTimeoutStatus('ok');
        setTimeoutError('');
        setTimeout(() => setTimeoutStatus('idle'), 4000);
      } else {
        setTimeoutError(data.error || 'Nieznany błąd');
        setTimeoutStatus('error');
      }
    } catch (e: any) {
      setTimeoutError(e?.message || 'Brak połączenia z serwerem');
      setTimeoutStatus('error');
    } finally {
      setSavingTimeout(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-300">
        <Loader className="w-4 h-4 animate-spin" />
        <span className="text-sm">Ładowanie...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500/20 rounded-md flex items-center justify-center">
          <Store className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Ustawienia giełdy</h1>
          <p className="text-sm text-gray-300">Konfiguracja giełdy zleceń</p>
        </div>
      </div>

      {/* ── Sekcja 1: Dostępność giełdy ──────────────────────────────────────── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-amber-500/20 rounded-md flex items-center justify-center">
            <ToggleRight className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Dostępność giełdy</h2>
            <p className="text-xs text-gray-300">Włączanie/wyłączanie giełdy oraz czas na zgłoszenie</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Toggle giełda enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Giełda widoczna dla kierowców</p>
              <p className="text-xs text-gray-500 mt-0.5">Gdy wyłączone, kierowcy nie mogą przeglądać ani przyjmować zleceń z giełdy</p>
            </div>
            <button
              onClick={() => handleToggleEnabled(!gieldaEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                gieldaEnabled
                  ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                  : 'bg-[#272727] text-gray-300 border border-[#4a4a4a] hover:bg-[#2a2a2a]'
              }`}
            >
              {gieldaEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {gieldaEnabled ? 'Włączona' : 'Wyłączona'}
            </button>
          </div>
          {globalStatus === 'error' && (
            <p className="text-sm text-red-500">Błąd: {globalError}</p>
          )}

          {/* Czas rejestracji */}
          <div className="pt-4 border-t border-[#363636]">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-medium text-white">Czas na zgłoszenie się kierowców</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Kierowcy zgłaszają się do zlecenia, po upłynięciu tego czasu system wybiera najbliższego.
              Wpisz <strong>0</strong> aby natychmiast przypisać pierwszego zgłoszonego.
            </p>

            {!isEditingGlobal ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 uppercase tracking-wide">Aktualny czas:</span>
                  <span className="text-white font-semibold text-lg">{regSeconds} sek</span>
                  {regSeconds === 0 && <span className="text-xs text-blue-500 italic">(tryb bezpośredni)</span>}
                </div>
                <button
                  onClick={() => { setEditRegSeconds(String(regSeconds)); setIsEditingGlobal(true); setGlobalStatus('idle'); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-white text-sm font-medium rounded-md transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edytuj
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={editRegSeconds}
                    onChange={e => { setEditRegSeconds(e.target.value); setGlobalStatus('idle'); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveGlobal(); if (e.key === 'Escape') setIsEditingGlobal(false); }}
                    autoFocus
                    min="0"
                    max="3600"
                    placeholder="np. 15"
                    className="w-24 px-3 py-2.5 bg-[#272727] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-lg font-semibold"
                  />
                  <span className="text-gray-300 text-sm">sekund</span>
                  <div className="flex-1" />
                  <button
                    onClick={handleSaveGlobal}
                    disabled={savingGlobal || editRegSeconds.trim() === '' || parseInt(editRegSeconds) < 0}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {savingGlobal ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Zapisz
                  </button>
                  <button
                    onClick={() => setIsEditingGlobal(false)}
                    disabled={savingGlobal}
                    className="flex items-center gap-1 px-4 py-2.5 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-gray-300 text-sm rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Anuluj
                  </button>
                </div>
                {globalStatus === 'error' && (
                  <p className="text-sm text-red-500">Błąd: {globalError}</p>
                )}
              </div>
            )}
            {!isEditingGlobal && globalStatus === 'ok' && (
              <p className="text-sm text-green-500 mt-2">✓ Ustawienia zostały zapisane</p>
            )}
          </div>

          {/* Godziny pracy giełdy */}
          <div className="pt-4 border-t border-[#363636]">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-medium text-white">Godziny pracy giełdy</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Gdy włączone, kierowcy mogą zgłaszać się tylko w podanych godzinach. Poza godzinami zobaczą komunikat.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="hoursEnabled"
                  checked={hoursEnabled}
                  onChange={e => setHoursEnabled(e.target.checked)}
                  className="w-4 h-4 accent-amber-600"
                />
                <label htmlFor="hoursEnabled" className="text-sm text-white cursor-pointer">
                  Ogranicz godzinami pracy
                </label>
              </div>
              {hoursEnabled && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-300">od</span>
                  <input
                    type="time"
                    value={hoursFrom}
                    onChange={e => { setHoursFrom(e.target.value); setHoursStatus('idle'); }}
                    className="px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-300">do</span>
                  <input
                    type="time"
                    value={hoursTo}
                    onChange={e => { setHoursTo(e.target.value); setHoursStatus('idle'); }}
                    className="px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveHours}
                  disabled={savingHours}
                  className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                >
                  {savingHours ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Zapisz godziny
                </button>
                {hoursStatus === 'ok' && <span className="text-sm text-green-500">✓ Zapisano</span>}
                {hoursStatus === 'error' && <span className="text-sm text-red-500">Błąd: {hoursError}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sekcja 1b: Reguły przydziału — priorytet statusów ────────────────── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-amber-500/20 rounded-md flex items-center justify-center">
            <Navigation2 className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Reguły przydziału</h2>
            <p className="text-xs text-gray-300">Kolejność statusów przy wyborze zwycięzcy spośród zgłoszonych kierowców</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Gdy kilku kierowców zgłosi się do tego samego zlecenia, wygrywa ten z wyższym priorytetem statusu.
            Remis → bliższy GPS.
          </p>

          {/* Lista priorytetów */}
          <div className="space-y-1.5">
            {priorityOrder.map((state, idx) => (
              <div
                key={state}
                className="flex items-center gap-3 px-4 py-3 bg-[#141414] border border-[#3d3d3d] rounded-md"
              >
                {/* Numer pozycji */}
                <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-700 text-xs font-bold rounded-full shrink-0">
                  {idx + 1}
                </span>
                {/* Etykieta statusu */}
                <span className="flex-1 text-sm font-medium text-white">
                  {STATE_LABELS[state] ?? state}
                </span>
                {/* Przyciski ↑↓ */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleMovePriority(idx, -1)}
                    disabled={idx === 0}
                    title="Wyżej"
                    className="p-1 rounded hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={() => handleMovePriority(idx, 1)}
                    disabled={idx === priorityOrder.length - 1}
                    title="Niżej"
                    className="p-1 rounded hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Przycisk Zapisz */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSavePriority}
              disabled={savingPriority}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {savingPriority ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Zapisz kolejność
            </button>
            {priorityStatus === 'ok' && <span className="text-sm text-green-500">✓ Kolejność zapisana</span>}
            {priorityStatus === 'error' && <span className="text-sm text-red-500">Błąd: {priorityError}</span>}
          </div>
        </div>
      </div>

      {/* ── Sekcja 2: Maksymalna odległość per rejon ──────────────────────────── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-amber-500/20 rounded-md flex items-center justify-center">
            <MapPin className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Maksymalna odległość kierowcy per rejon</h2>
            <p className="text-xs text-gray-300">Kierowca nie może wziąć zlecenia z giełdy jeśli jest zbyt daleko od punktu odbioru</p>
          </div>
        </div>

        <div className="px-6 py-5">
          {zones.length === 0 ? (
            <p className="text-sm text-gray-500">Brak zdefiniowanych rejonów</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {zones.map(z => (
                  <button
                    key={z.id}
                    onClick={() => setSelectedZone(z.number)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedZone === z.number
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#272727] text-gray-300 hover:bg-[#2a2a2a] border border-[#3d3d3d]'
                    }`}
                  >
                    {z.number}{z.name && z.name !== String(z.number) ? ` — ${z.name}` : ''}
                  </button>
                ))}
              </div>

              {selectedZone !== null && (
                <div className="pt-4 border-t border-[#363636]">
                  <p className="text-sm font-medium text-white mb-1">
                    Rejon {selectedZone} — maksymalna odległość
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    Zostaw puste jeśli brak limitu odległości dla tego rejonu.
                  </p>
                  {loadingZoneData ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Ładowanie...</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={maxDistValue}
                          onChange={e => { setMaxDistValue(e.target.value); setZoneStatus('idle'); }}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveZone(); }}
                          min="0"
                          step="0.1"
                          placeholder="bez limitu"
                          className="w-32 px-3 py-2.5 bg-[#272727] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-lg font-semibold"
                        />
                        <span className="text-gray-300 text-sm">km</span>
                        <div className="flex-1" />
                        <button
                          onClick={handleSaveZone}
                          disabled={savingZone}
                          className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                        >
                          {savingZone ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Zapisz
                        </button>
                      </div>
                      {zoneStatus === 'ok' && (
                        <p className="text-sm text-green-500">✓ Odległość dla rejonu {selectedZone} zapisana</p>
                      )}
                      {zoneStatus === 'error' && (
                        <p className="text-sm text-red-500">Błąd: {zoneError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Sekcja: Auto-dispatch z giełdy ──────────────────────────────────────── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-blue-500/20 rounded-md flex items-center justify-center">
            <Navigation2 className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Automatyczne wydawanie z giełdy</h2>
            <p className="text-xs text-gray-500">System co 30s sprawdza czy w rejonie zlecenia pojawił się kierowca i automatycznie wydaje zlecenie</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">

          {/* Auto-dispatch — wolna */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Wydaj gdy kierowca ma status <span className="font-semibold text-green-600">Wolna</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Gdy w rejonie zlecenia pojawi się kierowca ze statusem „Wolna" — zlecenie zostaje mu automatycznie przypisane</p>
            </div>
            <button
              onClick={() => handleToggleAutoDispatch('wolna', !autoDispatchWolna)}
              disabled={savingAutoDispatch}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                autoDispatchWolna
                  ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                  : 'bg-[#272727] text-gray-300 border border-[#4a4a4a] hover:bg-[#2a2a2a]'
              }`}
            >
              {autoDispatchWolna ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {autoDispatchWolna ? 'Włączone' : 'Wyłączone'}
            </button>
          </div>

          {/* Auto-dispatch — dojazd */}
          <div className="flex items-center justify-between pt-4 border-t border-[#363636]">
            <div>
              <p className="text-sm font-medium text-white">Wydaj gdy kierowca ma status <span className="font-semibold text-blue-600">Dojazd</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Gdy w rejonie zlecenia pojawi się kierowca ze statusem „Dojazd" — zlecenie zostaje mu automatycznie przypisane</p>
            </div>
            <button
              onClick={() => handleToggleAutoDispatch('dojazd', !autoDispatchDojazd)}
              disabled={savingAutoDispatch}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                autoDispatchDojazd
                  ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                  : 'bg-[#272727] text-gray-300 border border-[#4a4a4a] hover:bg-[#2a2a2a]'
              }`}
            >
              {autoDispatchDojazd ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {autoDispatchDojazd ? 'Włączone' : 'Wyłączone'}
            </button>
          </div>

          {autoDispatchStatus === 'ok' && (
            <p className="text-sm text-green-500">✓ Ustawienie zapisane</p>
          )}
          {autoDispatchStatus === 'error' && (
            <p className="text-sm text-red-500">Błąd zapisu — sprawdź połączenie z serwerem</p>
          )}
        </div>
      </div>

      {/* ── Sekcja 3: Jak długo zlecenie na giełdzie (timeout) ─────────────────── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-amber-500/20 rounded-md flex items-center justify-center">
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Jak długo zlecenie ma być na giełdzie</h2>
            <p className="text-xs text-gray-300">
              Po przekroczeniu tego czasu system automatycznie utworzy zadanie dla dyspozytora
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="space-y-4">
            {!isEditingTimeout && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 uppercase tracking-wide">Aktualny czas:</span>
                  <span className="text-white font-semibold text-lg">{timeoutMin} min</span>
                </div>
                <button
                  onClick={() => { setEditTimeoutValue(String(timeoutMin)); setIsEditingTimeout(true); setTimeoutStatus('idle'); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-white text-sm font-medium rounded-md transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edytuj
                </button>
              </div>
            )}

            {!isEditingTimeout && timeoutStatus === 'ok' && (
              <p className="text-sm text-green-500">✓ Czas giełdy został zaktualizowany</p>
            )}

            {isEditingTimeout && (
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={editTimeoutValue}
                    onChange={e => { setEditTimeoutValue(e.target.value); setTimeoutStatus('idle'); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveTimeout(); if (e.key === 'Escape') setIsEditingTimeout(false); }}
                    autoFocus
                    min="1"
                    max="999"
                    placeholder="np. 3"
                    className="w-24 px-3 py-2.5 bg-[#272727] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-lg font-semibold"
                  />
                  <span className="text-gray-300 text-sm">minut</span>
                  <div className="flex-1" />
                  <button
                    onClick={handleSaveTimeout}
                    disabled={savingTimeout || !editTimeoutValue.trim() || parseInt(editTimeoutValue) < 1}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {savingTimeout ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Zapisz
                  </button>
                  <button
                    onClick={() => setIsEditingTimeout(false)}
                    disabled={savingTimeout}
                    className="flex items-center gap-1 px-4 py-2.5 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-gray-300 text-sm rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Anuluj
                  </button>
                </div>
                {timeoutStatus === 'error' && (
                  <p className="text-sm text-red-500">Błąd zapisu: {timeoutError || 'sprawdź połączenie z bazą danych'}</p>
                )}
              </div>
            )}

            <div className="bg-[#272727] border border-[#3d3d3d] rounded-md p-3 text-xs text-gray-300 space-y-1 mt-2">
              <p className="font-medium text-gray-300">Jak działa timeout giełdy?</p>
              <p>• Gdy zlecenie trafia na giełdę (brak przypisanego kierowcy), system zaczyna odliczać czas.</p>
              <p>• Jeśli żaden kierowca nie zgłosi się w podanym czasie, system automatycznie tworzy zadanie.</p>
              <p>• Zadanie pojawia się w zakładce <span className="font-mono text-white">Zadania</span> w panelu dyspozytora.</p>
              <p>• Dyspozytor widzi przypomnienie, że zlecenie czeka za długo na giełdzie.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GieldaSettings;
