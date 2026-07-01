import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Play, Square, RefreshCw, LogIn, LogOut, Users, Zap, Database, Search, Send } from 'lucide-react';

const API = '/api';

// ── Twarde granice Bydgoszczy (centrum miasta, nie whole zone polygons) ────────
const BDG = { latMin: 53.095, latMax: 53.165, lngMin: 17.990, lngMax: 18.135,
               centLat: 53.123, centLng: 18.008 };

type TripPhase = 'idle' | 'accepted' | 'at_pickup' | 'in_progress';

interface SimZone { number: number; name: string; }

interface SimDriver {
  id: string; code: string; name: string; token: string | null;
  lat: number; lng: number; dir: number;
  zoneNumber: number | null;
  driverState: string;
  tripPhase: TripPhase;
  fakeTrip: boolean;
  activeOrderId: string | null;
  phaseAt: number;
  idleSince: number;
  logMsg: string;
}

interface RawDriver { id: string; name: string; driver_code: string; }

const rand    = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const clamp   = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const randBdg = () => ({ lat: rand(BDG.latMin, BDG.latMax), lng: rand(BDG.lngMin, BDG.lngMax) });

async function apiPost(path: string, body?: object): Promise<any> {
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function apiGet(path: string): Promise<any> {
  try { const r = await fetch(`${API}${path}`); return r.ok ? r.json() : null; }
  catch { return null; }
}
const setSimState = (driverId: string, driverState: string, status?: string) =>
  apiPost('/admin/sim/set-state', { driverId, driverState, ...(status ? { status } : {}) });

const PHASE_DUR: Record<TripPhase, [number, number]> = {
  idle: [20, 45], accepted: [18, 38], at_pickup: [8, 22], in_progress: [30, 65],
};

// ─── Komponent ────────────────────────────────────────────────────────────────
const VirtualDriverSimulator: React.FC = () => {
  const [allDrivers, setAllDrivers] = useState<RawDriver[]>([]);
  const [zones, setZones]           = useState<SimZone[]>([]);
  const [simDrivers, setSimDrivers] = useState<SimDriver[]>([]);
  const [isRunning, setIsRunning]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [seeding, setSeeding]       = useState(false);
  const [log, setLog]               = useState<string[]>([]);
  const [acceptRate, setAcceptRate] = useState(80);
  const [useCount, setUseCount]     = useState(20);

  const driversRef   = useRef<SimDriver[]>([]);
  const acceptRef    = useRef(acceptRate);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { driversRef.current = simDrivers; }, [simDrivers]);
  useEffect(() => { acceptRef.current  = acceptRate;  }, [acceptRate]);

  const addLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString('pl-PL');
    setLog(prev => [`[${t}] ${msg}`, ...prev].slice(0, 120));
  }, []);

  // ── Wczytaj strefy (tylko do wyświetlenia w info) ─────────────────────────
  const loadZones = useCallback(async () => {
    const res = await apiGet('/zones/sim-data');
    if (res?.success) {
      const valid = (res.zones || []).filter((z: any) => z.centLat >= 52.5 && z.centLat <= 53.5);
      setZones(valid.map((z: any) => ({ number: z.number, name: z.name })));
    }
  }, []);

  // ── Wczytaj kierowców 100-199 ─────────────────────────────────────────────
  const loadDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/drivers');
      if (!res?.success) { addLog('❌ Błąd wczytywania kierowców'); return; }
      const test: RawDriver[] = (res.data as RawDriver[]).filter(d => /^1\d{2}$/.test(d.driver_code));
      setAllDrivers(test);
      addLog(test.length > 0 ? `✅ ${test.length} kierowców testowych (100–199)` : '⚠️  Brak — kliknij Seed');
    } finally { setLoading(false); }
  }, [addLog]);

  // ── Seed ──────────────────────────────────────────────────────────────────
  const seedDrivers = useCallback(async () => {
    setSeeding(true);
    addLog('⏳ Seed...');
    try {
      const res = await apiPost('/admin/seed-test-drivers');
      if (!res?.success) { addLog('❌ Błąd seedowania'); return; }
      addLog(`✅ Seed: +${res.added} nowych, ${res.updated} zaktualizowanych`);
      await loadDrivers();
    } finally { setSeeding(false); }
  }, [addLog, loadDrivers]);

  useEffect(() => { loadZones(); loadDrivers(); }, []); // eslint-disable-line

  // ── Login wszystkich ──────────────────────────────────────────────────────
  const loginAll = useCallback(async (): Promise<SimDriver[]> => {
    const toLogin = allDrivers.slice(0, useCount);
    addLog(`🔐 Loguję ${toLogin.length} kierowców (PIN 1234)...`);
    const results: SimDriver[] = [];

    for (let i = 0; i < toLogin.length; i += 10) {
      const batch = toLogin.slice(i, i + 10);
      const settled = await Promise.all(batch.map(async (d) => {
        const res = await apiPost('/auth/driver/login', { driverCode: d.driver_code, pin: '1234', force: true });
        if (!res?.success) {
          addLog(`⚠️  Login fail ${d.driver_code}: ${res?.error ?? 'brak odpowiedzi'}`);
          return null;
        }
        const { lat, lng } = randBdg();
        // Ustaw w DB: active + wolna + pozycja w centrum Bydgoszczy
        await setSimState(d.id, 'wolna', 'active');
        await apiPost(`/admin/sim/location`, { driverId: d.id, lat, lng });

        return {
          id: d.id, code: d.driver_code, name: d.name, token: res.token ?? 'ok',
          lat, lng, dir: Math.random() * Math.PI * 2,
          zoneNumber: null,
          driverState: 'wolna', tripPhase: 'idle' as TripPhase, fakeTrip: false,
          activeOrderId: null,
          phaseAt:   Date.now() - randInt(0, 15) * 1000,
          idleSince: Date.now() - randInt(0, 20) * 1000,
          logMsg: 'Zalogowany',
        } as SimDriver;
      }));
      settled.forEach(d => d && results.push(d));
    }
    addLog(`✅ Zalogowano ${results.length}/${toLogin.length} kierowców`);
    return results;
  }, [allDrivers, useCount, addLog]);

  // ── Tick lokalizacji (co 3s) — TYLKO w granicach Bydgoszczy ──────────────
  const startLocationTick = useCallback(() => {
    tickRef.current = setInterval(() => {
      setSimDrivers(prev => prev.map(d => {
        if (!d.token) return d;
        const STEP = 0.00025;
        let newDir = Math.random() < 0.15 ? d.dir + rand(-0.8, 0.8) : d.dir;
        let newLat = d.lat + Math.cos(newDir) * STEP;
        let newLng = d.lng + Math.sin(newDir) * STEP;

        // Jeśli wyszedł poza Bydgoszcz — zawróć do centrum
        if (newLat < BDG.latMin || newLat > BDG.latMax || newLng < BDG.lngMin || newLng > BDG.lngMax) {
          newDir = Math.atan2(BDG.centLng - d.lng, BDG.centLat - d.lat) + rand(-0.4, 0.4);
          newLat = clamp(d.lat + Math.cos(newDir) * STEP, BDG.latMin, BDG.latMax);
          newLng = clamp(d.lng + Math.sin(newDir) * STEP, BDG.lngMin, BDG.lngMax);
        }

        // Używamy /admin/sim/location zamiast /drivers/:id/location
        // aby NIE resetować current_zone (potrzebne dla dyspozytora!)
        apiPost(`/admin/sim/location`, { driverId: d.id, lat: newLat, lng: newLng });
        return { ...d, lat: newLat, lng: newLng, dir: newDir };
      }));
    }, 3000);
  }, []);

  // ── Ręczny poll — diagnostyka ─────────────────────────────────────────────
  const manualPoll = useCallback(async () => {
    const current = driversRef.current;
    if (current.length === 0) { addLog('❌ Brak kierowców w symulacji'); return; }
    addLog(`🔍 Sprawdzam ${current.length} kierowców...`);
    let found = 0;
    for (const d of current) {
      const res = await apiGet(`/drivers/${d.id}/pending-order`);
      if (res?.order) {
        found++;
        addLog(`📦 ${d.code} (${d.id.slice(0,8)}) → zlecenie ${res.order.order_number}`);
        // Od razu spróbuj przyjąć
        const ok = await apiPost(`/orders/${res.order.id}/accept`, { driverId: d.id });
        if (ok?.success) {
          await setSimState(d.id, 'dojazd');
          setSimDrivers(prev => prev.map(x => x.id === d.id ? { ...x, tripPhase: 'accepted', activeOrderId: res.order.id, phaseAt: Date.now(), driverState: 'dojazd', fakeTrip: false, logMsg: `✅ ${res.order.order_number}` } : x));
          addLog(`✅ PRZYJĘTO ${res.order.order_number} przez ${d.code}`);
        } else {
          addLog(`❌ Accept API fail dla ${d.code} — odpowiedź: ${JSON.stringify(ok)}`);
        }
      }
    }
    if (found === 0) addLog(`ℹ️  Żaden kierowca nie ma pending_driver — wyślij zlecenie przez dyspozytora LUB kliknij "Testowe zlecenie"`);
  }, [addLog]);

  // ── Wyślij testowe zlecenie do losowego kierowcy ──────────────────────────
  const sendTestOrder = useCallback(async () => {
    const current = driversRef.current;
    if (current.length === 0) { addLog('❌ Brak aktywnych kierowców'); return; }
    // Wybierz losowego wolnego kierowcę
    const free = current.filter(d => d.driverState === 'wolna');
    const target = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : current[0];
    addLog(`📤 Wysyłam testowe zlecenie do ${target.code} (${target.id.slice(0,8)})...`);
    const res = await apiPost('/admin/sim/test-order', { driverId: target.id });
    if (res?.success) {
      addLog(`✅ Zlecenie ${res.orderNumber} wysłane → czekam na akceptację...`);
    } else {
      addLog(`❌ Błąd tworzenia zlecenia: ${res?.error}`);
    }
  }, [addLog]);

  // ── Tick zleceń (co 800ms, round-robin 1 driver) ─────────────────────────
  const startOrderTick = useCallback(() => {
    let rrIdx = 0;
    let tickCount = 0;
    orderRef.current = setInterval(async () => {
      const drivers = driversRef.current;
      if (!drivers.length) return;
      tickCount++;

      // Heartbeat co ~40 ticks (~32s) — potwierdza że tick działa
      if (tickCount % 40 === 0) {
        const t = new Date().toLocaleTimeString('pl-PL');
        setLog(l => [`[${t}] 💓 Tick #${tickCount} — sprawdzam ${drivers.length} kierowców...`, ...l].slice(0, 120));
      }

      // Jeden driver na tick — round-robin
      const d = drivers[rrIdx % drivers.length];
      rrIdx++;
      if (!d?.id) return;

      const res = await apiGet(`/drivers/${d.id}/pending-order`);
      if (!res?.order) return;

      const order = res.order;
      const t = new Date().toLocaleTimeString('pl-PL');
      // Zlecenie znalezione — zawsze loguj
      setLog(l => [`[${t}] 📦 ${d.code} → zlecenie ${order.order_number} (${order.pickup_address})`, ...l].slice(0, 120));

      const willAccept = Math.random() * 100 < acceptRef.current;

      if (willAccept) {
        const ok = await apiPost(`/orders/${order.id}/accept`, { driverId: d.id });
        const t2 = new Date().toLocaleTimeString('pl-PL');
        setLog(l => [`[${t2}] ${ok?.success ? '✅ PRZYJĘTO' : '❌ BŁĄD ACCEPT'} ${order.order_number} przez ${d.code} — ${JSON.stringify(ok)}`, ...l].slice(0, 120));
        if (ok?.success === true) {
          await setSimState(d.id, 'dojazd');
          setSimDrivers(prev => prev.map(x => x.id === d.id ? { ...x, tripPhase: 'accepted', activeOrderId: order.id, phaseAt: Date.now(), driverState: 'dojazd', fakeTrip: false, logMsg: `✅ ${order.order_number}` } : x));
        }
      } else {
        const rej = await apiPost(`/orders/${order.id}/reject`, { driverId: d.id });
        await setSimState(d.id, 'wolna', 'active');
        setLog(l => [`[${t}] ❌ ${d.code} ODRZUCIŁ ${order.order_number} — ${JSON.stringify(rej)}`, ...l].slice(0, 120));
      }
    }, 800);
  }, []); // celowo puste — używa tylko refs

  // ── Tick faz (co 5s) ─────────────────────────────────────────────────────
  const startPhaseTick = useCallback((activeZones: { lat: number; lng: number }[]) => {
    const phaseRef = setInterval(async () => {
      const drivers = driversRef.current;
      const now = Date.now();
      const updates: { id: string; upd: Partial<SimDriver> }[] = [];

      for (const d of drivers) {
        if (!d.id) continue;

        // Fake trip start
        if (d.tripPhase === 'idle') {
          const elapsed = (now - d.idleSince) / 1000;
          if (elapsed < randInt(PHASE_DUR.idle[0], PHASE_DUR.idle[1])) continue;
          await setSimState(d.id, 'dojazd');
          updates.push({ id: d.id, upd: { tripPhase: 'accepted', phaseAt: now, driverState: 'dojazd', fakeTrip: true, logMsg: 'Auto-dojazd' }});
          continue;
        }

        const [minS, maxS] = PHASE_DUR[d.tripPhase];
        if ((now - d.phaseAt) / 1000 < randInt(minS, maxS)) continue;

        if (d.tripPhase === 'accepted') {
          if (!d.fakeTrip && d.activeOrderId) await apiPost(`/orders/${d.activeOrderId}/at-pickup`, { driverId: d.id });
          await setSimState(d.id, 'zajeta');
          updates.push({ id: d.id, upd: { tripPhase: 'at_pickup', phaseAt: now, driverState: 'zajeta', logMsg: d.fakeTrip ? 'Auto-zajęta' : 'Pod adresem' }});

        } else if (d.tripPhase === 'at_pickup') {
          if (!d.fakeTrip && d.activeOrderId) await apiPost(`/orders/${d.activeOrderId}/pickup`, { driverId: d.id });
          await setSimState(d.id, 'kursem');
          updates.push({ id: d.id, upd: { tripPhase: 'in_progress', phaseAt: now, driverState: 'kursem', logMsg: d.fakeTrip ? 'Auto-kurs' : 'W trasie' }});

        } else if (d.tripPhase === 'in_progress') {
          if (!d.fakeTrip && d.activeOrderId) {
            await apiPost(`/orders/${d.activeOrderId}/complete`, {});
            setLog(l => { const t = new Date().toLocaleTimeString('pl-PL'); return [`[${t}] 🏁 ${d.code} zakończył kurs`, ...l].slice(0, 120); });
          }
          const { lat, lng } = randBdg();
          await setSimState(d.id, 'wolna', 'active');
          apiPost(`/admin/sim/location`, { driverId: d.id, lat, lng });
          updates.push({ id: d.id, upd: { tripPhase: 'idle', phaseAt: now, idleSince: now, activeOrderId: null, driverState: 'wolna', fakeTrip: false, lat, lng, logMsg: 'Wolny' }});
        }
      }

      if (updates.length > 0)
        setSimDrivers(prev => prev.map(d => { const u = updates.find(x => x.id === d.id); return u ? { ...d, ...u.upd } : d; }));
    }, 5000);
    return phaseRef;
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startSimulation = useCallback(async () => {
    if (allDrivers.length === 0) { addLog('❌ Brak kierowców — kliknij Seed'); return; }
    setLoading(true);
    const logged = await loginAll();
    if (logged.length === 0) { addLog('❌ Żaden login się nie powiódł'); setLoading(false); return; }
    setSimDrivers(logged);
    driversRef.current = logged;
    setIsRunning(true);
    startLocationTick();
    startOrderTick();
    phaseTickRef.current = startPhaseTick([]);
    addLog(`▶ Symulacja: ${logged.length} kierowców | Bydgoszcz (${BDG.latMin}–${BDG.latMax}, ${BDG.lngMin}–${BDG.lngMax})`);
    addLog(`⏱ Order-tick: 800ms round-robin · Phase-tick: 5s · Loc-tick: 3s`);
    setLoading(false);
  }, [allDrivers, loginAll, startLocationTick, startOrderTick, startPhaseTick, addLog]);

  const stopSimulation = useCallback(async () => {
    if (tickRef.current)      { clearInterval(tickRef.current);      tickRef.current      = null; }
    if (orderRef.current)     { clearInterval(orderRef.current);     orderRef.current     = null; }
    if (phaseTickRef.current) { clearInterval(phaseTickRef.current); phaseTickRef.current = null; }
    setIsRunning(false);
    const current = driversRef.current;
    for (let i = 0; i < current.length; i += 10)
      await Promise.all(current.slice(i, i + 10).map(d => apiPost(`/drivers/${d.id}/leave-zone`, {})));
    addLog(`⏹ Zatrzymano (${current.length} kierowców)`);
  }, [addLog]);

  const reset = useCallback(async () => {
    await stopSimulation(); setSimDrivers([]); driversRef.current = []; addLog('🔄 Reset');
  }, [stopSimulation, addLog]);

  useEffect(() => () => {
    if (tickRef.current)      clearInterval(tickRef.current);
    if (orderRef.current)     clearInterval(orderRef.current);
    if (phaseTickRef.current) clearInterval(phaseTickRef.current);
  }, []);

  const stats = {
    wolna:  simDrivers.filter(d => d.driverState === 'wolna').length,
    dojazd: simDrivers.filter(d => d.driverState === 'dojazd').length,
    zajeta: simDrivers.filter(d => d.driverState === 'zajeta').length,
    kursem: simDrivers.filter(d => d.driverState === 'kursem').length,
  };
  const phaseLabel: Record<TripPhase, string> = { idle: 'Wolny', accepted: 'Dojazd', at_pickup: 'Pod adresem', in_progress: 'Kurs' };
  const phaseColor: Record<TripPhase, string> = { idle: 'text-green-400', accepted: 'text-red-400', at_pickup: 'text-yellow-400', in_progress: 'text-blue-400' };

  return (
    <div className="p-4 space-y-4 max-w-6xl">

      {/* Nagłówek */}
      <div className="flex items-center gap-3 flex-wrap">
        <Bot className="w-5 h-5 text-indigo-400 shrink-0" />
        <h2 className="text-lg font-semibold text-white">Symulator Wirtualnych Kierowców</h2>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/40 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Działa
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">
          {allDrivers.length > 0 ? `${allDrivers.length} kierowców (100–199)` : 'Brak kierowców testowych'}
          {zones.length > 0 && ` · ${zones.map(z => `${z.name}(${z.number})`).join(', ')}`}
        </span>
      </div>

      {/* Konfiguracja */}
      <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Konfiguracja</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Aktywni kierowcy</label>
            <input type="number" min={1} max={allDrivers.length || 100} value={useCount}
              onChange={e => setUseCount(Math.max(1, Math.min(allDrivers.length || 100, +e.target.value)))}
              disabled={isRunning}
              className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm border border-zinc-600 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            />
            <p className="text-[10px] text-zinc-500 mt-0.5">dostępnych: {allDrivers.length}</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Wskaźnik przyjęć (%)</label>
            <input type="number" min={0} max={100} value={acceptRate}
              onChange={e => setAcceptRate(Math.max(0, Math.min(100, +e.target.value)))}
              className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm border border-zinc-600 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-zinc-500 mt-0.5">szansa przyjęcia zlecenia</p>
          </div>
        </div>
        <div className="bg-zinc-900/60 rounded-lg px-3 py-2 text-xs text-zinc-400">
          📍 Obszar: Bydgoszcz centrum ({BDG.latMin}–{BDG.latMax} N, {BDG.lngMin}–{BDG.lngMax} E) ·
          Lokalizacja co 3 s · Zlecenia co 3 s (round-robin, {Math.min(6, useCount)} na tick) ·
          Cykl auto: wolna→dojazd→zajęta→kursem→wolna
        </div>
      </div>

      {/* Przyciski */}
      <div className="flex gap-2 flex-wrap">
        {!isRunning ? (
          <button onClick={startSimulation} disabled={loading || allDrivers.length === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Uruchom
          </button>
        ) : (
          <button onClick={stopSimulation}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Square className="w-4 h-4" />Zatrzymaj
          </button>
        )}

        {simDrivers.length > 0 && !isRunning && (
          <button onClick={reset} className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <RefreshCw className="w-4 h-4" />Reset
          </button>
        )}

        {/* DIAGNOSTYKA — sprawdź zlecenia teraz */}
        {isRunning && (
          <button onClick={manualPoll}
            className="flex items-center gap-2 bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Search className="w-4 h-4" />Sprawdź zlecenia
          </button>
        )}

        {/* TESTOWE ZLECENIE — wyślij bezpośrednio do losowego kierowcy */}
        {isRunning && (
          <button onClick={sendTestOrder}
            className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Send className="w-4 h-4" />Testowe zlecenie
          </button>
        )}

        <button onClick={seedDrivers} disabled={seeding || isRunning}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
          {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {seeding ? 'Tworzę...' : 'Seed (100–199)'}
        </button>

        <button onClick={() => { loadZones(); loadDrivers(); }} disabled={loading || isRunning}
          className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium ml-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Odśwież
        </button>
      </div>

      {!loading && allDrivers.length === 0 && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex gap-3">
          <span className="text-amber-400 text-lg">⚠️</span>
          <div>
            <p className="text-amber-300 font-medium text-sm">Brak kierowców testowych</p>
            <p className="text-amber-500 text-xs mt-0.5">Kliknij <strong>Seed (100–199)</strong> aby dodać konta z PIN 1234</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {simDrivers.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {([['Wolna','wolna','text-green-400','bg-green-900/20'],['Dojazd','dojazd','text-red-400','bg-red-900/20'],
             ['Zajęta','zajeta','text-yellow-400','bg-yellow-900/20'],['Kursem','kursem','text-blue-400','bg-blue-900/20']] as const)
            .map(([label, key, color, bg]) => (
            <div key={key} className={`${bg} rounded-xl p-4 text-center`}>
              <div className={`text-3xl font-bold ${color}`}>{stats[key]}</div>
              <div className="text-xs text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela */}
      {simDrivers.length > 0 && (
        <div className="bg-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">Aktywni ({simDrivers.length})</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-700 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-zinc-400 font-medium">Kierowca</th>
                  <th className="text-left px-3 py-2 text-xs text-zinc-400 font-medium">Stan</th>
                  <th className="text-left px-3 py-2 text-xs text-zinc-400 font-medium">Faza</th>
                  <th className="text-left px-3 py-2 text-xs text-zinc-400 font-medium">Pozycja</th>
                  <th className="text-left px-3 py-2 text-xs text-zinc-400 font-medium">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700/50">
                {simDrivers.map(d => (
                  <tr key={d.id} className="hover:bg-zinc-700/30">
                    <td className="px-3 py-2 text-white font-medium">
                      {d.name} <span className="text-zinc-500 text-xs ml-1">({d.code})</span>
                      {d.token ? <LogIn className="w-3 h-3 text-green-400 inline ml-1" /> : <LogOut className="w-3 h-3 text-red-400 inline ml-1" />}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        d.driverState === 'wolna'  ? 'bg-green-900/50 text-green-300'   :
                        d.driverState === 'dojazd' ? 'bg-red-900/50 text-red-300'       :
                        d.driverState === 'zajeta' ? 'bg-yellow-900/50 text-yellow-300' :
                        'bg-blue-900/50 text-blue-300'}`}>{d.driverState}</span>
                    </td>
                    <td className={`px-3 py-2 text-xs ${phaseColor[d.tripPhase]}`}>
                      {phaseLabel[d.tripPhase]}{d.fakeTrip && d.tripPhase !== 'idle' ? ' (auto)' : ''}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500 max-w-[140px] truncate">{d.logMsg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log */}
      <div className="bg-zinc-900 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Log zdarzeń</span>
          </div>
          {log.length > 0 && (
            <button onClick={() => setLog([])} className="text-xs text-zinc-600 hover:text-zinc-400">wyczyść</button>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {log.length === 0
            ? <div className="text-xs text-zinc-600">Brak zdarzeń</div>
            : log.map((e, i) => <div key={i} className="text-xs text-zinc-400 font-mono leading-5">{e}</div>)}
        </div>
      </div>
    </div>
  );
};

export default VirtualDriverSimulator;
