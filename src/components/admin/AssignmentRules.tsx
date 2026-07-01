import React, { useEffect, useState, useCallback } from 'react';
import {
  SlidersHorizontal, Plus, Trash2, ChevronUp, ChevronDown,
  Save, CheckCircle, AlertCircle, Loader2, Info, RefreshCw,
} from 'lucide-react';

// ─── Typy ─────────────────────────────────────────────────────────────────────

interface Zone {
  id: string;
  number: number;
  name: string;
}

type DriverState = 'wolna' | 'dojazd' | 'zajeta' | 'kursem';
type StepType    = 'zone' | 'radius';

interface Step {
  type:        StepType;
  searchZone?: number;    // tylko dla type='zone'
  driverState: DriverState;
  radiusKm?:   number;    // tylko dla type='radius', np. 0.5
}

// ─── Stałe ────────────────────────────────────────────────────────────────────

const STATE_OPTIONS: { value: DriverState; label: string; color: string }[] = [
  { value: 'wolna',  label: 'Wolny',   color: 'text-emerald-400' },
  { value: 'dojazd', label: 'Dojazd',  color: 'text-yellow-400'  },
  { value: 'zajeta', label: 'Zajęty',  color: 'text-orange-400'  },
  { value: 'kursem', label: 'Kursem',  color: 'text-red-400'     },
];

const STATE_BADGE: Record<DriverState, string> = {
  wolna:  'bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-700',
  dojazd: 'bg-yellow-900/40 text-yellow-400 ring-1 ring-yellow-700',
  zajeta: 'bg-orange-900/40 text-orange-400 ring-1 ring-orange-700',
  kursem: 'bg-red-900/40 text-red-400 ring-1 ring-red-700',
};

const API = '';

// ─── Komponent ────────────────────────────────────────────────────────────────

const AssignmentRules: React.FC = () => {
  const [zones, setZones]               = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [steps, setSteps]               = useState<Step[]>([]);
  const [fallbackStatus, setFallbackStatus] = useState<'pending' | 'market'>('pending');
  const [saving, setSaving]             = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [dirty, setDirty]               = useState(false);

  // ── Pobierz listę stref z API ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/zones`)
      .then(r => r.json())
      .then(data => {
        const list: Zone[] = (data.zones ?? [])
          .map((z: any) => ({ id: z.id, number: Number(z.number), name: z.name ?? String(z.number) }))
          .sort((a: Zone, b: Zone) => a.number - b.number);
        setZones(list);
        if (list.length > 0 && selectedZone === null) {
          setSelectedZone(list[0].number);
        }
      })
      .catch(() => setError('Nie można pobrać listy stref'));
  }, []);

  // ── Pobierz reguły dla wybranej strefy ────────────────────────────────────
  const fetchRules = useCallback(async (zone: number) => {
    setLoadingRules(true);
    setError(null);
    try {
      const res  = await fetch(`${API}/api/admin/zone-rules/${zone}`);
      const data = await res.json();
      setSteps(
        (data.data ?? []).map((r: any) => ({
          type:        (r.stepType === 'radius' ? 'radius' : 'zone') as StepType,
          searchZone:  r.searchZone ?? undefined,
          driverState: r.driverState as DriverState,
          radiusKm:    r.radiusKm != null ? Number(r.radiusKm) : 0.5,
        }))
      );
      setFallbackStatus(data.fallbackStatus === 'market' ? 'market' : 'pending');
      setDirty(false);
    } catch {
      setError('Nie można pobrać reguł dla strefy');
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (selectedZone !== null) fetchRules(selectedZone);
  }, [selectedZone, fetchRules]);

  // ── Operacje na krokach ───────────────────────────────────────────────────

  const addStep = () => {
    setSteps(prev => [
      ...prev,
      { type: 'zone', searchZone: selectedZone ?? zones[0]?.number ?? 1, driverState: 'wolna' },
    ]);
    setDirty(true);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setSteps(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setDirty(true);
  };

  const moveDown = (idx: number) => {
    setSteps(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const updateStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
    setDirty(true);
  };

  // ── Zapis ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (selectedZone === null) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const stepsBody = steps.map(step => ({
        stepType:   step.type,
        searchZone: step.type === 'zone' ? (step.searchZone ?? null) : null,
        driverState: step.driverState,
        radiusKm:   step.type === 'radius' ? (step.radiusKm ?? 0.5) : null,
      }));
      const res = await fetch(`${API}/api/admin/zone-rules/${selectedZone}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ steps: stepsBody, fallbackStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setDirty(false);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(data.error ?? 'Błąd zapisu');
      }
    } catch {
      setError('Błąd połączenia z serwerem');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedZoneObj = zones.find(z => z.number === selectedZone);

  return (
    <div className="space-y-6 w-full">

      {/* 🏷 Nagłówek */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-purple-400" />
          Reguły przydziału
        </h2>
        <p className="text-gray-300 text-sm">
          Określ, w jakiej kolejności system szuka dostępnego kierowcy dla każdego rejonu.
        </p>
      </div>

      {/* 🌍 Wybór rejonu */}
      <div className="bg-[#1e1e1e] rounded-lg border border-[#3d3d3d] p-5">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Rejon źródłowy (skąd pochodzi zlecenie)
        </label>
        {zones.length === 0 ? (
          <p className="text-gray-100 text-sm">Brak zdefiniowanych stref. Dodaj strefy w Zarządzaniu rejonami.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map(z => (
              <button
                key={z.id}
                onClick={() => {
                  if (dirty && !window.confirm('Masz niezapisane zmiany. Przejść do innego rejonu?')) return;
                  setSelectedZone(z.number);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                  selectedZone === z.number
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-[#272727] border-[#4a4a4a] text-gray-300 hover:bg-[#2a2a2a]'
                }`}
              >
                R-{z.number}
                {z.name && z.name !== String(z.number) && (
                  <span className="ml-1 opacity-60 text-xs">{z.name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 📋 Panel reguł */}
      {selectedZone !== null && (
        <div className="bg-[#1e1e1e] rounded-lg border border-[#3d3d3d] overflow-hidden">

          {/* Pasek tytułu */}
          <div className="px-5 py-4 border-b border-[#3d3d3d] flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Kolejność wyszukiwania dla rejonu {selectedZone}
                {selectedZoneObj?.name && selectedZoneObj.name !== String(selectedZone)
                  ? ` — ${selectedZoneObj.name}`
                  : ''}
              </h3>
              <p className="text-xs text-gray-300 mt-0.5">
                System próbuje każdy krok po kolei — przydziela pierwszego znalezionego kierowcę.
              </p>
            </div>
            {loadingRules && <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />}
          </div>

          {/* Lista kroków */}
          <div className="p-5 space-y-3 min-h-[80px]">
            {!loadingRules && steps.length === 0 && (
              <div className="flex items-start gap-3 p-3 bg-[#272727] rounded-md border border-[#4a4a4a]/60 text-sm text-gray-300">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                <span>
                  Brak reguł — system użyje domyślnego zachowania:<br />
                  szukaj kierowcy <strong className="text-gray-300">wolnego</strong> w rejonie <strong className="text-gray-300">{selectedZone}</strong>.
                </span>
              </div>
            )}

            {steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 bg-[#272727] border border-[#4a4a4a]/80 rounded-lg px-4 py-3"
              >
                {/* Numer kroku */}
                <div className="w-7 h-7 shrink-0 rounded-full bg-purple-700/60 border border-purple-500/50 flex items-center justify-center text-xs font-bold text-purple-200">
                  {idx + 1}
                </div>

                {/* Treść */}
                <div className="flex-1 flex items-center gap-2 flex-wrap text-sm text-gray-300">

                  {/* Select: typ kroku */}
                  <select
                    value={step.type}
                    onChange={e => {
                      const newType = e.target.value as StepType;
                      updateStep(idx, {
                        type: newType,
                        searchZone: newType === 'zone' ? (step.searchZone ?? zones[0]?.number ?? 1) : undefined,
                        radiusKm:   newType === 'radius' ? (step.radiusKm ?? 0.5) : undefined,
                      });
                    }}
                    className="px-2 py-1 bg-[#2a2a2a] border border-[#4a4a4a] rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="zone">Rejon</option>
                    <option value="radius">Odległość (km)</option>
                  </select>

                  {/* Warunkowo: select strefy lub input km */}
                  {step.type === 'zone' ? (
                    <>
                      <select
                        value={step.searchZone ?? zones[0]?.number}
                        onChange={e => updateStep(idx, { searchZone: parseInt(e.target.value) })}
                        className="px-2 py-1 bg-[#2a2a2a] border border-[#4a4a4a] rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                      >
                        {zones.map(z => (
                          <option key={z.id} value={z.number}>
                            R-{z.number}{z.name && z.name !== String(z.number) ? ` (${z.name})` : ''}
                          </option>
                        ))}
                      </select>
                      <span className="text-gray-100">→</span>
                      <span className="text-gray-300">kierowca ze statusem</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={0.1}
                        max={50}
                        step={0.5}
                        value={step.radiusKm ?? 0.5}
                        onChange={e => updateStep(idx, { radiusKm: parseFloat(e.target.value) || 0.5 })}
                        className="w-20 px-2 py-1 bg-[#2a2a2a] border border-[#4a4a4a] rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-gray-300 text-sm">km od adresu</span>
                      <span className="text-gray-100">→</span>
                      <span className="text-gray-300">kierowca ze statusem</span>
                    </>
                  )}

                  {/* Select: status */}
                  <select
                    value={step.driverState}
                    onChange={e => updateStep(idx, { driverState: e.target.value as DriverState })}
                    className="px-2 py-1 bg-[#2a2a2a] border border-[#4a4a4a] rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {STATE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  {/* Badge podglądu */}
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATE_BADGE[step.driverState]}`}>
                    {STATE_OPTIONS.find(o => o.value === step.driverState)?.label}
                  </span>
                </div>

                {/* Przyciski akcji */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-1.5 rounded hover:bg-[#2a2a2a] text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-default transition-colors"
                    title="Przesuń wyżej"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === steps.length - 1}
                    className="p-1.5 rounded hover:bg-[#2a2a2a] text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-default transition-colors"
                    title="Przesuń niżej"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeStep(idx)}
                    className="p-1.5 rounded hover:bg-red-900/50 text-gray-100 hover:text-red-400 transition-colors"
                    title="Usuń krok"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Dodaj krok */}
          <div className="px-5 pb-4">
            <button
              onClick={addStep}
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-[#4a4a4a] text-gray-300 hover:text-white hover:border-gray-400 text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Dodaj krok
            </button>
          </div>

          {/* Toggle fallback — Oczekujące / Giełda */}
          <div className="mx-5 mb-4 flex items-center gap-3 p-3 bg-[#272727] rounded-md border border-[#3d3d3d]">
            <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />
            <span className="text-xs text-gray-300 shrink-0">Gdy brak kierowcy:</span>
            <button
              onClick={() => { setFallbackStatus('pending'); setDirty(true); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                fallbackStatus === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#272727] border border-[#4a4a4a] text-gray-300 hover:bg-[#2a2a2a]'
              }`}
            >
              Oczekujące
            </button>
            <button
              onClick={() => { setFallbackStatus('market'); setDirty(true); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                fallbackStatus === 'market'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#272727] border border-[#4a4a4a] text-gray-300 hover:bg-[#2a2a2a]'
              }`}
            >
              Giełda
            </button>
          </div>

          {/* Pasek zapisu */}
          <div className="px-5 py-4 border-t border-[#3d3d3d] bg-[#1e1e1e] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {saved && (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  Zapisano pomyślnie
                </span>
              )}
              {error && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </span>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
                dirty
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-[#272727] text-gray-300 hover:bg-[#2a2a2a] hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />
              }
              {saving ? 'Zapisywanie…' : `Zapisz reguły dla rejonu ${selectedZone}`}
            </button>
          </div>
        </div>
      )}

      {/* 📊 Podgląd wszystkich reguł (kompaktowy) */}
      <AllRulesPreview zones={zones} refreshKey={saved ? Date.now() : 0} />
    </div>
  );
};

// ─── Podgląd wszystkich zdefiniowanych reguł ──────────────────────────────────

const AllRulesPreview: React.FC<{ zones: Zone[]; refreshKey?: number }> = ({ zones, refreshKey }) => {
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  const loadRules = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/zone-rules`)
      .then(r => r.json())
      .then(data => setGrouped(data.data ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRules(); }, [loadRules, refreshKey]);

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanMsg(null);
    try {
      const res  = await fetch(`${API}/api/admin/zone-rules/cleanup`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCleanMsg(`Usunięto ${data.deleted} nieaktualnych reguł.`);
        loadRules();
      } else {
        setCleanMsg('Błąd czyszczenia reguł.');
      }
    } catch {
      setCleanMsg('Błąd połączenia z serwerem.');
    } finally {
      setCleaning(false);
      setTimeout(() => setCleanMsg(null), 4000);
    }
  };

  const keys = Object.keys(grouped).filter(k => grouped[k].length > 0).sort((a, b) => +a - +b);
  if (keys.length === 0) return null;

  return (
    <div className="bg-[#1e1e1e] rounded-lg border border-[#3d3d3d] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
          Skonfigurowane reguły — przegląd
        </h3>
        <div className="flex items-center gap-2">
          {cleanMsg && (
            <span className="text-xs text-emerald-400">{cleanMsg}</span>
          )}
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            title="Usuń reguły dla rejonów które już nie istnieją"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#272727] border border-[#4a4a4a] text-gray-300 hover:text-white hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {cleaning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Wyczyść nieaktualne
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {keys.map(zone => (
          <div key={zone} className="flex gap-3 items-start text-sm">
            <span className="shrink-0 px-2 py-0.5 bg-[#272727] rounded text-gray-300 font-mono text-xs font-bold">
              R-{zone}
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {grouped[zone].map((r: any, i: number) => {
                const stateLabel = STATE_OPTIONS.find(o => o.value === r.driverState)?.label ?? r.driverState;
                const stateColor = STATE_BADGE[r.driverState as DriverState]?.split(' ')[1] ?? '';
                const isRadius   = r.stepType === 'radius';
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-slate-600 text-xs">→</span>}
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-[#272727] rounded text-xs text-gray-300">
                      {isRadius
                        ? <span className="text-blue-400 font-semibold">~{r.radiusKm ?? '?'}km</span>
                        : <span>R-{r.searchZone}</span>
                      }
                      <span className={`font-semibold ${stateColor}`}>
                        {stateLabel}
                      </span>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AssignmentRules;
