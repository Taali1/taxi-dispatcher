import React, { useEffect, useRef, useState } from 'react';
import { Car, MapPin, Clock, ChevronUp, ChevronDown, ChevronsUpDown, Send } from 'lucide-react';


type SortCol = 'taxi' | 'rejon' | 'czas' | 'odleglosc';
type SortDir = 'asc' | 'desc';

const SortIcon: React.FC<{ col: SortCol; active: SortCol | null; dir: SortDir }> = ({ col, active, dir }) => {
  if (active !== col) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-300 shrink-0" />;
  return dir === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 shrink-0" />
    : <ChevronDown className="w-3.5 h-3.5 shrink-0" />;
};

interface Coords { lat: number; lng: number; }

export interface QueueDriver {
  id: string;
  name: string;
  driverCode: string;
  queuePosition: number;
  driverState: 'wolna' | 'dojazd' | 'zajeta' | 'kursem' | null;
  latitude?: number;
  longitude?: number;
  fromZone: number;
  preferenceIds: number[];
}

interface Preference { id: number; name: string; color: string; }

interface AssignmentRule {
  searchZone: number | null;
  driverState: string;
  stepType?: string;
  radiusKm?: number | null;
}

interface DriverSuggestionProps {
  zone: number | null;
  pickupCoords: Coords | null;
  onForceDispatch?: (driver: QueueDriver) => void;
  /** Wywoływane gdy zmienia się wytypowany kierowca — umożliwia podłączenie go do "Wyślij" */
  onTypowanyChange?: (driver: QueueDriver | null) => void;
  preferenceIds?: number[];
  /** Gdy true i zone===null — pobierz wszystkich kierowców ze wszystkich stref (tryb Giełda "Wszyscy").
   *  Gdy false (domyślnie) i zone===null — pokaż puste ramki (tryb formularza, brak wykrytej strefy). */
  showAllOnNoZone?: boolean;
  /** Telefon klienta — służy do filtrowania zablokowanych kierowców z sugestii */
  customerPhone?: string;
}

/** Haversine — dystans w km między dwoma punktami GPS */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATE_COLOR: Record<string, string> = {
  wolna:  '#007a1e',
  dojazd: '#991100',
  zajeta: '#4d2260',
  kursem: '#003d99',
};

/** Etykieta statusu z rejonem, wg formatu: Wolny na 3 / Dojazd do 3 / Kursem do 3 */
function stateWithZone(driverState: string | null, fromZone: number): string {
  switch (driverState) {
    case 'wolna':  return `Wolny na ${fromZone}`;
    case 'dojazd': return `Dojazd do ${fromZone}`;
    case 'kursem': return `Kursem do ${fromZone}`;
    case 'zajeta': return `Zajęty na ${fromZone}`;
    default:       return `Rejon ${fromZone}`;
  }
}

function parseDrivers(raw: any[], fromZone: number): QueueDriver[] {
  return raw.map((d: any) => {
    let preferenceIds: number[] = [];
    try {
      const raw = d.preferenceIds ?? d.preference_ids;
      preferenceIds = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { preferenceIds = []; }
    return {
      id:            d.driverId ?? d.id,
      name:          d.name,
      driverCode:    d.driverCode ?? d.driver_code ?? '',
      queuePosition: d.queuePosition ?? 0,
      driverState:   d.driverState ?? d.driver_state ?? null,
      latitude:      d.latitude,
      longitude:     d.longitude,
      fromZone,
      preferenceIds,
    };
  });
}

const DriverSuggestion: React.FC<DriverSuggestionProps> = ({ zone, pickupCoords, onForceDispatch, onTypowanyChange, preferenceIds = [], showAllOnNoZone = false, customerPhone = '' }) => {
  const [drivers, setDrivers] = useState<QueueDriver[]>([]);
  const [typowanyDriver, setTypowanyDriver] = useState<QueueDriver | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, Coords>>({});
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [zoneFallbackStatus, setZoneFallbackStatus] = useState<'pending' | 'market'>('pending');
  const [zoneDriversMap, setZoneDriversMap] = useState<Record<number, QueueDriver[]>>({});
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [allPreferences, setAllPreferences] = useState<Preference[]>([]);
  const [blockedDriverIds, setBlockedDriverIds] = useState<Set<string>>(new Set());
  const blockedDriverIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/table/preferences')
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) setAllPreferences(json.data);
      })
      .catch(() => {});
  }, []);

  // Informuj rodzica gdy zmienia się wytypowany kierowca
  useEffect(() => {
    onTypowanyChange?.(typowanyDriver);
  }, [typowanyDriver]);

  const handleSort = (col: SortCol) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir('asc'); return col;
    });
  };

  // Ref zawsze trzyma aktualną wartość preferenceIds — chroni interwał przed stale closure
  const preferenceIdsRef = useRef<number[]>(preferenceIds);
  useEffect(() => { preferenceIdsRef.current = preferenceIds; });

  // Ref dla pickupCoords — chroni interwał przed stale closure
  const pickupCoordsRef = useRef<Coords | null>(pickupCoords);
  useEffect(() => { pickupCoordsRef.current = pickupCoords; });

  /** Wyznacz typowanego kierowcę z już pobranych danych — bez requestów sieciowych */
  const recalcTypowany = (
    map: Record<number, QueueDriver[]>,
    rulesList: AssignmentRule[],
    currentZone: number,
    prefs: number[],
    coords?: Coords | null,
    locMap?: Record<string, Coords>,
    blockedIds?: Set<string>,
  ) => {
    const blocked = blockedIds ?? blockedDriverIdsRef.current;
    const steps: AssignmentRule[] = rulesList.length > 0
      ? rulesList
      : [{ searchZone: currentZone, driverState: 'wolna', stepType: 'zone' }];

    let found: QueueDriver | null = null;
    for (const step of steps) {
      if ((step.stepType ?? 'zone') === 'radius') {
        // Szukaj wg odległości GPS (Haversine)
        if (!coords) continue; // brak GPS adresu odbioru → pomiń krok
        const km = step.radiusKm ?? 1;
        const allDrivers = Object.values(map).flat();
        const match = allDrivers.find(d => {
          if (blocked.has(d.id)) return false; // pomiń zablokowanego
          if (d.driverState !== step.driverState) return false;
          // GPS kierowcy: locMap ma pełne dane z /drivers/locations (nawet gdy queue/all nie zwraca lat/lng)
          const loc = (locMap ?? {})[d.id] ?? (d.latitude && d.longitude ? { lat: d.latitude, lng: d.longitude } : null);
          if (!loc) return false;
          if (haversineKm(coords.lat, coords.lng, loc.lat, loc.lng) > km) return false;
          if (prefs.length === 0) return true;
          return prefs.every(id => d.preferenceIds.includes(id));
        });
        if (match) { found = match; break; }
      } else {
        const zoneList = map[step.searchZone!] ?? [];
        const match = zoneList.find(d => {
          if (blocked.has(d.id)) return false; // pomiń zablokowanego
          if (d.driverState !== step.driverState) return false;
          if (prefs.length === 0) return true;
          return prefs.every(id => d.preferenceIds.includes(id));
        });
        if (match) { found = match; break; }
      }
    }
    setTypowanyDriver(found);
  };

  const fetchData = async (currentZone: number, showLoading: boolean) => {
    if (showLoading) { setLoading(true); setFetchError(null); }
    console.log(`[DS] fetchData zone=${currentZone} showLoading=${showLoading}`);
    try {
      const [rulesData, locData] = await Promise.all([
        fetch(`/api/admin/zone-rules/${currentZone}`).then(r => r.json()),
        fetch('/api/drivers/locations').then(r => r.json()),
      ]);

      const locMap: Record<string, Coords> = {};
      const locs: any[] = locData.data ?? locData.drivers ?? [];
      locs.forEach((d: any) => {
        if (d.latitude && d.longitude) locMap[d.id] = { lat: d.latitude, lng: d.longitude };
      });
      setDriverLocations(locMap);

      const rulesList: AssignmentRule[] = (rulesData.data ?? []).map((r: any) => ({
        searchZone:  r.searchZone  ?? r.search_zone  ?? null,
        driverState: r.driverState ?? r.driver_state,
        stepType:    r.stepType    ?? r.step_type    ?? 'zone',
        radiusKm:    r.radiusKm    ?? r.radius_km    ?? null,
      }));
      setRules(rulesList);
      setZoneFallbackStatus(rulesData.fallbackStatus === 'market' ? 'market' : 'pending');

      const allZones = new Set<number>([currentZone]);
      rulesList.forEach(r => {
        if ((r.stepType ?? 'zone') !== 'radius' && r.searchZone != null) {
          allZones.add(r.searchZone);
        }
      });

      const newMap: Record<number, QueueDriver[]> = {};
      await Promise.all(
        Array.from(allZones).map(z =>
          fetch(`/api/queue/zone/${z}`)
            .then(r => r.json())
            .then(data => {
              const raw: any[] = data.drivers ?? data.queue ?? [];
              newMap[z] = parseDrivers(raw, z);
              console.log(`[DS] zone/${z} → ${raw.length} kierowców`);
            })
            .catch((e) => { console.error(`[DS] zone/${z} fetch error:`, e); newMap[z] = []; })
        )
      );

      // Jeśli reguły mają kroki radius — potrzebujemy WSZYSTKICH kierowców (ze wszystkich stref)
      const hasRadiusSteps = rulesList.some(r => (r.stepType ?? 'zone') === 'radius');
      if (hasRadiusSteps) {
        try {
          const allData = await fetch('/api/queue/all').then(r => r.json());
          for (const [zKey, zDrivers] of Object.entries(allData.queues ?? {} as Record<string, any[]>)) {
            const z = parseInt(zKey);
            if (!newMap[z] || newMap[z].length === 0) newMap[z] = parseDrivers(zDrivers as any[], z);
          }
        } catch (e) { console.error('[DS] queue/all for radius error:', e); }
      }

      setZoneDriversMap(newMap);
      const zoneDrivers = (newMap[currentZone] ?? []).slice(0, 6);
      console.log(`[DS] fetchData zakończony: rejon=${currentZone} kierowcy=${zoneDrivers.length}`);

      if (zoneDrivers.length === 0) {
        // Fallback: strefa wykryta ale kolejka pusta (kierowca w innym rejonie lub brak w tej strefie)
        // Pokaż WSZYSTKICH dostępnych kierowców z globalnej kolejki
        console.log(`[DS] fallback: rejon=${currentZone} pusty — pobieram /api/queue/all`);
        try {
          const allData = await fetch('/api/queue/all').then(r => r.json());
          const allQueues: Record<string, any[]> = allData.queues ?? {};
          const fallbackMap: Record<number, QueueDriver[]> = { ...newMap };
          for (const [zKey, zDrivers] of Object.entries(allQueues)) {
            const z = parseInt(zKey);
            if (!fallbackMap[z] || fallbackMap[z].length === 0) {
              fallbackMap[z] = parseDrivers(zDrivers as any[], z);
            }
          }
          const allDrivers = Object.values(fallbackMap).flat().slice(0, 6);
          console.log(`[DS] fallback: łącznie kierowców=${allDrivers.length}`);
          setZoneDriversMap(fallbackMap);
          setDrivers(allDrivers);
          recalcTypowany(fallbackMap, rulesList, currentZone, preferenceIdsRef.current, pickupCoordsRef.current, locMap);
        } catch (fe: any) {
          console.error('[DS] fallback error:', fe?.message);
          setDrivers([]);
          recalcTypowany(newMap, rulesList, currentZone, preferenceIdsRef.current, pickupCoordsRef.current, locMap);
        }
      } else {
        setDrivers(zoneDrivers);
        recalcTypowany(newMap, rulesList, currentZone, preferenceIdsRef.current, pickupCoordsRef.current, locMap);
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`[DS] fetchData BŁĄD zone=${currentZone}:`, msg);
      if (showLoading) { setFetchError(msg); setDrivers([]); setRules([]); setTypowanyDriver(null); }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Odśwież dane gdy zmieni się rejon
  useEffect(() => {
    console.log(`[DS] useEffect: zone=${zone} showAllOnNoZone=${showAllOnNoZone}`);
    if (zone === null) {
      if (!showAllOnNoZone) {
        // Tryb formularza — brak strefy = czyść stan, nic nie pokazuj
        setDrivers([]); setRules([]); setTypowanyDriver(null); setZoneDriversMap({});
        return;
      }
      // Tryb "wszystkie strefy" (Giełda zakładka "Wszyscy") — pokaż wszystkich bez typowania
      setRules([]); setTypowanyDriver(null); setFetchError(null);
      const fetchAll = async () => {
        console.log('[DS] fetchAll start');
        try {
          const [locData, allData] = await Promise.all([
            fetch('/api/drivers/locations').then(r => r.json()),
            fetch('/api/queue/all').then(r => r.json()),
          ]);
          const locMap: Record<string, Coords> = {};
          (locData.data ?? locData.drivers ?? []).forEach((d: any) => {
            if (d.latitude && d.longitude) locMap[d.id] = { lat: d.latitude, lng: d.longitude };
          });
          setDriverLocations(locMap);
          const allQueues: Record<string, any[]> = allData.queues ?? {};
          console.log('[DS] fetchAll queues:', JSON.stringify(Object.keys(allQueues)));
          const newMap: Record<number, QueueDriver[]> = {};
          for (const [zKey, zDrivers] of Object.entries(allQueues)) {
            const z = parseInt(zKey);
            newMap[z] = parseDrivers(zDrivers as any[], z);
          }
          setZoneDriversMap(newMap);
          const allDrivers = Object.values(newMap).flat().slice(0, 6);
          console.log(`[DS] fetchAll zakończony: łącznie kierowców=${allDrivers.length}`);
          setDrivers(allDrivers);
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          console.error('[DS] fetchAll BŁĄD:', msg);
          setFetchError(msg);
        }
      };
      fetchAll();
      const interval = setInterval(fetchAll, 5000);
      return () => clearInterval(interval);
    }
    fetchData(zone, true);
    const interval = setInterval(() => fetchData(zone, false), 5000);
    return () => clearInterval(interval);
  }, [zone, showAllOnNoZone]);

  // Przelicz typowanego natychmiast gdy zmienią się preferencje (bez re-fetcha)
  useEffect(() => {
    if (!zone) return;
    recalcTypowany(zoneDriversMap, rules, zone, preferenceIds, pickupCoords, driverLocations);
  }, [preferenceIds]);

  // Przelicz typowanego gdy zmienią się coords adresu odbioru (krok radius zależy od GPS)
  useEffect(() => {
    if (!zone) return;
    recalcTypowany(zoneDriversMap, rules, zone, preferenceIds, pickupCoords, driverLocations);
  }, [pickupCoords]);

  // Pobierz zablokowane ID kierowców gdy zmieni się telefon klienta, potem od razu przelicz typowanego
  useEffect(() => {
    if (!customerPhone) {
      const empty = new Set<string>();
      setBlockedDriverIds(empty);
      blockedDriverIdsRef.current = empty;
      if (zone) recalcTypowany(zoneDriversMap, rules, zone, preferenceIdsRef.current, pickupCoordsRef.current, driverLocations, empty);
      return;
    }
    fetch(`/api/driver-client-blocks/by-phone/${encodeURIComponent(customerPhone)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const ids = new Set<string>(data.data ?? []);
          setBlockedDriverIds(ids);
          blockedDriverIdsRef.current = ids;
          if (zone) recalcTypowany(zoneDriversMap, rules, zone, preferenceIdsRef.current, pickupCoordsRef.current, driverLocations, ids);
        }
      })
      .catch(() => {});
  }, [customerPhone]);

  const getKm = (driver: QueueDriver): number | null => {
    const loc = driverLocations[driver.id] ?? (driver.latitude && driver.longitude ? { lat: driver.latitude, lng: driver.longitude } : null);
    if (!loc || !pickupCoords) return null;
    return haversineKm(loc.lat, loc.lng, pickupCoords.lat, pickupCoords.lng);
  };

  const getDistance = (driver: QueueDriver): string => {
    const km = getKm(driver);
    if (km === null) return '';
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  };

  const getTime = (driver: QueueDriver): string => {
    const km = getKm(driver);
    if (km === null) return '';
    const minutes = Math.round((km / 30) * 60);
    return minutes < 1 ? '< 1 min' : `${minutes} min`;
  };

  const typowanyFromOtherZone = typowanyDriver && typowanyDriver.fromZone !== zone;

  /* ── Wiersz kierowcy ──────────────────────────────────────────── */
  const renderRow = (driver: QueueDriver, isTypowany: boolean) => {
    const dist = getDistance(driver);
    const time = getTime(driver);
    const statusLabel = stateWithZone(driver.driverState, driver.fromZone);

    const driverPrefBadges = driver.preferenceIds
      .map(id => allPreferences.find(p => Number(p.id) === Number(id)))
      .filter(Boolean) as Preference[];

    const inner = (
      <div className="flex items-center justify-between gap-3">
        {/* Lewa: kafelek z kodem + status + preferencje */}
        <div className="flex flex-col items-start gap-1.5 min-w-0">
          <span
            className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 rounded font-bold text-white leading-none tracking-wide text-base"
            style={{ backgroundColor: STATE_COLOR[driver.driverState ?? ''] ?? '#3f3f46' }}
          >
            {driver.driverCode || driver.name}
          </span>
          <span className="text-sm text-black dark:text-white leading-none pl-0.5">
            {statusLabel}
          </span>
          {driverPrefBadges.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-0.5">
              {driverPrefBadges.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none"
                  style={{ backgroundColor: p.color || '#6b7280' }}
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Prawa: dystans + czas */}
        {(dist || time) && (
          <div className="shrink-0 flex items-center gap-2.5">
            {dist && (
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="text-base font-semibold">{dist}</span>
              </div>
            )}
            {dist && time && (
              <span className="text-gray-300 dark:text-gray-300 text-[0.9375rem] select-none">·</span>
            )}
            {time && (
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="text-base font-semibold">{time}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );

    return (
      <div key={driver.id} className="border-b border-gray-200 dark:border-[#696969]">
        {isTypowany ? (
          <div className="m-4 border border-[#b0b3b8] dark:border-[#7a7a7a] rounded bg-white dark:bg-[#383838] px-3 py-2.5">
            {inner}
          </div>
        ) : (
          <div className="px-3 py-2 bg-white dark:bg-[#2d2d2d] hover:bg-gray-50 dark:hover:bg-[#434343]/50">
            {inner}
          </div>
        )}
      </div>
    );
  };

  /* ── Główny render ────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 dark:text-gray-300">
          Ładowanie…
        </div>
      )}

      {!loading && (
        <>

          {/* Alert — brak typowanego */}
          {!typowanyDriver && (drivers.length > 0 || rules.length > 0) && (
            <div className="shrink-0 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 flex items-center gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-400"></span>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Brak kandydata wg reguł – trafi do {zoneFallbackStatus === 'market' ? 'Giełdy' : 'Oczekujących'}
              </p>
            </div>
          )}

          {/* Kandydat — zawsze widoczna ramka */}
          <div className="shrink-0 mx-4 mt-4 mb-2 border border-[#b0b3b8] dark:border-[#7a7a7a] rounded bg-white dark:bg-[#383838] px-3 py-2.5 min-h-[52px] flex items-center">
            {!typowanyDriver && (
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex flex-col items-start gap-1.5 min-w-0">
                  <span className="inline-flex items-center justify-center px-3 py-1.5 rounded font-bold text-gray-300 dark:text-gray-300 leading-none tracking-wide text-base bg-gray-100 dark:bg-[#444444]">
                    —
                  </span>
                  <span className="text-sm text-gray-300 dark:text-gray-300 leading-none pl-0.5">—</span>
                </div>
                <div className="shrink-0 flex items-center gap-2.5 text-gray-300 dark:text-gray-300">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="text-base font-semibold">—</span>
                  </div>
                  <span className="text-[0.9375rem] select-none">·</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="text-base font-semibold">—</span>
                  </div>
                </div>
              </div>
            )}
            {typowanyDriver && (
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex flex-col items-start gap-1.5 min-w-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 rounded font-bold text-white leading-none tracking-wide text-base"
                    style={{ backgroundColor: STATE_COLOR[typowanyDriver.driverState ?? ''] ?? '#3f3f46' }}
                  >
                    {typowanyDriver.driverCode || typowanyDriver.name}
                  </span>
                  <span className="text-sm text-black dark:text-white leading-none pl-0.5">
                    {stateWithZone(typowanyDriver.driverState, typowanyDriver.fromZone)}
                  </span>
                  {typowanyDriver.preferenceIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-0.5">
                      {typowanyDriver.preferenceIds
                        .map(id => allPreferences.find(p => Number(p.id) === Number(id)))
                        .filter(Boolean)
                        .map(p => p && (
                          <span key={p.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none" style={{ backgroundColor: p.color || '#6b7280' }}>
                            {p.name}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2.5">
                  {getDistance(typowanyDriver) && (
                    <div className="flex items-center gap-1.5 text-black dark:text-white">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="text-base font-semibold">{getDistance(typowanyDriver)}</span>
                    </div>
                  )}
                  {getDistance(typowanyDriver) && getTime(typowanyDriver) && (
                    <span className="text-gray-300 dark:text-gray-300 text-[0.9375rem] select-none">·</span>
                  )}
                  {getTime(typowanyDriver) && (
                    <div className="flex items-center gap-1.5 text-black dark:text-white">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="text-base font-semibold">{getTime(typowanyDriver)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Błąd fetch */}
          {fetchError && (
            <div className="mx-3 mb-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded break-all">
              <span className="font-bold">Błąd API:</span> {fetchError}
            </div>
          )}

          {/* Debug: aktualna strefa */}
          <div className="mx-3 mb-1 px-2 py-1 text-[10px] text-gray-400 dark:text-gray-300 bg-gray-50 dark:bg-[#2d2d2d] rounded border border-gray-200 dark:border-[#696969]">
            Rejon: {zone ?? '—'} · Kierowcy: {drivers.length} · Reguły: {rules.length} · {showAllOnNoZone ? 'tryb:wszystkie' : 'tryb:strefa'}
          </div>

          {/* Komunikat diagnostyczny — strefa ustawiona ale kolejka pusta */}
          {zone !== null && !fetchError && drivers.length === 0 && (
            <div className="mx-3 mb-2 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
              Brak kierowców w kolejce rejonu {zone}
            </div>
          )}

          {/* Tabela kolejnych kandydatów — zawsze 5 wierszy */}
          <div className="mx-4 mb-4 border border-[#b0b3b8] dark:border-[#7a7a7a] rounded overflow-hidden bg-white dark:bg-[#383838]">
            {/* Nagłówek */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_2rem] items-center px-3 py-2 bg-white dark:bg-[#383838] border-b border-[#b0b3b8] dark:border-[#7a7a7a] gap-2">
              {(['taxi', 'rejon', 'czas', 'odleglosc'] as SortCol[]).map((col, idx) => (
                <button
                  key={col}
                  onClick={() => handleSort(col)}
                  className="flex items-center gap-1 text-sm font-semibold text-black dark:text-white hover:opacity-70 transition-opacity text-left"
                >
                  {['Taxi', 'Rejon', 'Czas', 'Odległość'][idx]}
                  <SortIcon col={col} active={sortCol} dir={sortDir} />
                </button>
              ))}
              <span />
            </div>
            {/* Zawsze 5 wierszy */}
            {(() => {
              const sorted = [...drivers].filter(d => !blockedDriverIds.has(d.id)).sort((a, b) => {
                if (!sortCol) return 0;
                let av: number | string = 0, bv: number | string = 0;
                if (sortCol === 'taxi') { av = a.driverCode || a.name; bv = b.driverCode || b.name; }
                else if (sortCol === 'rejon') { av = a.fromZone; bv = b.fromZone; }
                else if (sortCol === 'czas' || sortCol === 'odleglosc') { av = getKm(a) ?? Infinity; bv = getKm(b) ?? Infinity; }
                if (av < bv) return sortDir === 'asc' ? -1 : 1;
                if (av > bv) return sortDir === 'asc' ? 1 : -1;
                return 0;
              });
              return Array.from({ length: 5 }).map((_, i) => {
              const driver = sorted[i] ?? null;
              const dist = driver ? getDistance(driver) : null;
              const time = driver ? getTime(driver) : null;
              const isCandidate = !!driver && typowanyDriver?.id === driver.id;
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_1fr_1fr_1fr_2rem] items-center px-3 py-2.5 border-b border-[#b0b3b8] dark:border-[#7a7a7a] last:border-b-0 gap-2 ${
                    isCandidate
                      ? 'bg-green-50 dark:bg-green-900/15'
                      : ''
                  }`}
                >
                  <span>
                    {driver ? (
                      <span
                        className="inline-flex items-center justify-center px-2 py-1 rounded font-bold text-white leading-none text-sm"
                        style={{ backgroundColor: STATE_COLOR[driver.driverState ?? ''] ?? '#3f3f46' }}
                      >
                        {driver.driverCode || driver.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-300 dark:text-gray-300">—</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-black dark:text-white">
                    {driver ? driver.fromZone : <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </span>
                  <span className="text-sm font-semibold text-black dark:text-white">
                    {time || <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </span>
                  <span className="text-sm font-semibold text-black dark:text-white">
                    {dist || <span className="text-gray-300 dark:text-gray-300">—</span>}
                  </span>
                  <div className="flex items-center justify-center">
                    {driver && (
                      <>
                        <button
                          onClick={() => onForceDispatch?.(driver)}
                          title="Wydaj zlecenie temu kierowcy"
                          className="inline-flex items-center justify-center px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all"
                        >
                          <Send size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            });
            })()}
          </div>

        </>
      )}
    </div>
  );
};

export default DriverSuggestion;
