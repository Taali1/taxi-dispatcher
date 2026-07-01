import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Minimize2, ChevronUp } from 'lucide-react';

interface Tariff { id: number; name: string; per_km_rate: number; }
interface Surcharge { id: number; name: string; amount: number; }
interface GlobalSettings { initial_fee: number; waiting_rate: number; pulse_amount: number; min_speed_kmh: number; }
interface TaximeterConfig { tariffs: Tariff[]; surcharges: Surcharge[]; settings: GlobalSettings; }
interface TaximeterProps { onClose: () => void; }

const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const tariffNum = (name: string, idx: number): string => {
  const m = name.match(/\d+/);
  return m ? m[0] : String(idx + 1);
};

const RABAT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50];
const HOLD_MS = 900;

const card: React.CSSProperties = { background: '#1c1f26', borderRadius: 14, border: '1px solid #3a4050' };
const labelSt: React.CSSProperties = { fontSize: 11, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 3 };
const bigLabelSt: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 };
const inputSt: React.CSSProperties = { width: '100%', padding: '14px 16px', background: '#252830', border: '1px solid #3a4050', borderRadius: 12, color: '#e6eaf0', fontSize: 20, fontWeight: 600, outline: 'none', boxSizing: 'border-box' };

const Taximeter: React.FC<TaximeterProps> = ({ onClose }) => {
  const [config, setConfig] = useState<TaximeterConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTariffId, setActiveTariffId] = useState<number | null>(null);
  const [doplata, setDoplata] = useState('');
  const [umowa, setUmowa] = useState('');
  const [rabat, setRabat] = useState(0);
  const [fare, setFare] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [gpsAlert, setGpsAlert] = useState<string | null>(null);
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState<'doplata' | 'umowa' | 'rabat' | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [pillTop, setPillTop] = useState<number>(typeof window !== 'undefined' ? window.innerHeight - 140 : 600);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const distSincePulseRef = useRef(0);
  const timeSincePulseRef = useRef(0);
  const speedKmhRef = useRef(0);
  const fareRef = useRef(0);
  const totalDistMRef = useRef(0);
  const elapsedSecRef = useRef(0);
  const suspiciousCountRef = useRef(0);
  const lastReportedSpeedRef = useRef<number | null>(null);
  const configRef = useRef<TaximeterConfig | null>(null);
  const activeTariffIdRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const pillDragRef = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  const restoredAtRef = useRef<number>(0); // timestamp ostatniego powrotu z minimalizacji

  useEffect(() => {
    fetch('/api/taximeter/config')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const cfg: TaximeterConfig = {
            tariffs: (data.data.tariffs || []).map((t: any) => ({ id: t.id, name: t.name, per_km_rate: parseFloat(t.per_km_rate) })),
            surcharges: (data.data.surcharges || []).map((s: any) => ({ id: s.id, name: s.name, amount: parseFloat(s.amount) })),
            settings: {
              initial_fee: parseFloat(data.data.settings?.initial_fee ?? 8),
              waiting_rate: parseFloat(data.data.settings?.waiting_rate ?? 40),
              pulse_amount: parseFloat(data.data.settings?.pulse_amount ?? 0.85),
              min_speed_kmh: parseInt(data.data.settings?.min_speed_kmh ?? 20),
            },
          };
          setConfig(cfg);
          configRef.current = cfg;
          if (cfg.tariffs.length > 0) {
            setActiveTariffId(cfg.tariffs[0].id);
            activeTariffIdRef.current = cfg.tariffs[0].id;
          }
        }
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  const triggerPulse = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg) return;
    fareRef.current += cfg.settings.pulse_amount;
    setFare(fareRef.current);
    setPulsing(true);
    setTimeout(() => setPulsing(false), 350);
  }, []);

  const startTaximeter = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg) return;
    setIsStopped(false);
    fareRef.current = cfg.settings.initial_fee;
    setFare(cfg.settings.initial_fee);
    distSincePulseRef.current = 0;
    timeSincePulseRef.current = 0;
    speedKmhRef.current = 0;
    lastPosRef.current = null;
    totalDistMRef.current = 0;
    elapsedSecRef.current = 0;
    suspiciousCountRef.current = 0;
    lastReportedSpeedRef.current = null;
    setDistanceM(0);
    setElapsedSec(0);
    setGpsAlert(null);
    isRunningRef.current = true;
    setIsRunning(true);

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          if (!isRunningRef.current) return;
          const { latitude: lat, longitude: lng, speed: gpsSpeed } = pos.coords;
          const now = Date.now();

          // ── 1. Zawsze aktualizuj prędkość z GPS (główne źródło) ──────────
          // To jest kluczowe — bez tego timer myśli że stoisz gdy GPS jitteruje
          if (gpsSpeed !== null && gpsSpeed !== undefined && gpsSpeed >= 0) {
            speedKmhRef.current = gpsSpeed * 3.6;
          }

          // ── 2. Anti-spoofing ─────────────────────────────────────────────
          let suspicious = false;
          let reason = '';
          if (gpsSpeed !== null && gpsSpeed !== undefined && gpsSpeed * 3.6 > 250) {
            suspicious = true; reason = 'Nierealna prędkość GPS';
          }
          if (gpsSpeed !== null && gpsSpeed !== undefined && lastReportedSpeedRef.current !== null) {
            if (Math.abs(gpsSpeed * 3.6 - lastReportedSpeedRef.current) > 30) {
              suspicious = true; reason = 'Niemożliwe przyspieszenie';
            }
          }
          if (gpsSpeed !== null && gpsSpeed !== undefined)
            lastReportedSpeedRef.current = gpsSpeed * 3.6;

          if (lastPosRef.current) {
            const dm = haversineM(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
            const dt = (now - lastPosRef.current.time) / 1000;

            if (dm > 400 && dt < 3) { suspicious = true; reason = 'Teleportacja pozycji GPS'; }
            if (dt > 0.5 && dm > 10 && gpsSpeed !== null && gpsSpeed !== undefined) {
              if (Math.abs((dm / dt) * 3.6 - gpsSpeed * 3.6) > 40) { suspicious = true; reason = 'Rozbieżność prędkości GPS'; }
            }

            if (suspicious) {
              suspiciousCountRef.current += 1;
              if (suspiciousCountRef.current >= 2) setGpsAlert(`⚠ Wykryto fałszywy GPS: ${reason}`);
            } else {
              suspiciousCountRef.current = Math.max(0, suspiciousCountRef.current - 1);
              if (suspiciousCountRef.current === 0) setGpsAlert(null);
            }
            // Po wykryciu spoofera — aktualizuj pozycję ale nie naliczaj
            lastPosRef.current = { lat, lng, time: now };
            if (suspiciousCountRef.current >= 2) return;

            // ── 3. Naliczanie dystansu (próg 5 m filtruje GPS jitter) ───────
            if (dm >= 5) {
              // Fallback prędkości z pozycji gdy GPS nie daje speed
              if ((gpsSpeed === null || gpsSpeed === undefined) && dt > 0) {
                speedKmhRef.current = (dm / dt) * 3.6;
              }

              totalDistMRef.current += dm;
              setDistanceM(totalDistMRef.current);

              const cfg = configRef.current!;
              // Puls dystansowy TYLKO gdy prędkość >= progu
              if (speedKmhRef.current >= cfg.settings.min_speed_kmh) {
                const tariff = cfg.tariffs.find(t => t.id === activeTariffIdRef.current) ?? cfg.tariffs[0];
                if (tariff && tariff.per_km_rate > 0) {
                  const mpp = (cfg.settings.pulse_amount / tariff.per_km_rate) * 1000;
                  distSincePulseRef.current += dm;
                  while (distSincePulseRef.current >= mpp) {
                    distSincePulseRef.current -= mpp;
                    triggerPulse();
                  }
                }
              } else {
                // Poniżej progu prędkości — resetuj licznik dystansu żeby nie ckumulował
                distSincePulseRef.current = 0;
              }
            }
          } else {
            // Pierwsza pozycja
            lastPosRef.current = { lat, lng, time: now };
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }

    timerRef.current = setInterval(() => {
      if (!isRunningRef.current) return;
      const cfg = configRef.current;
      if (!cfg) return;
      // Czas i opłata za postój naliczane TYLKO gdy prędkość < progu z panelu admina
      // Powyżej progu: licznik stoi, ale nie resetuje się (jitter GPS nie wyzeruje skumulowanego czasu)
      if (speedKmhRef.current < cfg.settings.min_speed_kmh) {
        elapsedSecRef.current += 1;
        setElapsedSec(elapsedSecRef.current);
        const spp = (3600 * cfg.settings.pulse_amount) / cfg.settings.waiting_rate;
        timeSincePulseRef.current += 1;
        if (timeSincePulseRef.current >= spp) { timeSincePulseRef.current -= spp; triggerPulse(); }
      }
    }, 1000);
  }, [triggerPulse]);

  const stopTaximeter = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    setIsStopped(true);
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => { stopTaximeter(); }, [stopTaximeter]);

  const handleTariffChange = (id: number) => {
    setActiveTariffId(id);
    activeTariffIdRef.current = id;
    distSincePulseRef.current = 0;
    timeSincePulseRef.current = 0;
  };

  // ── Hold-to-confirm ──────────────────────────────────────────────────────
  const stopHold = useCallback(() => {
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    setHoldProgress(0);
  }, []);

  const startHold = useCallback((action: () => void) => {
    if (holdIntervalRef.current) return;
    const startTime = Date.now();
    holdIntervalRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - startTime) / HOLD_MS) * 100);
      setHoldProgress(p);
      if (p >= 100) {
        if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
        setHoldProgress(0);
        action();
      }
    }, 16);
  }, []);

  // ── Draggable pill ───────────────────────────────────────────────────────
  const onPillPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pillDragRef.current = { startY: e.clientY, startTop: pillTop, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPillPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pillDragRef.current) return;
    const dy = e.clientY - pillDragRef.current.startY;
    if (Math.abs(dy) > 8) pillDragRef.current.moved = true;
    const maxTop = window.innerHeight - 100;
    setPillTop(Math.max(16, Math.min(maxTop, pillDragRef.current.startTop + dy)));
  };
  const onPillPointerUp = () => {
    if (!pillDragRef.current) return;
    const moved = pillDragRef.current.moved;
    pillDragRef.current = null;
    if (!moved) {
      restoredAtRef.current = Date.now(); // zapamiętaj moment powrotu
      setIsMinimized(false);
    }
  };

  const getTotalFare = (): number => {
    const umowaVal = parseFloat(umowa);
    if (umowaVal > 0) return umowaVal;
    const dopl = parseFloat(doplata) || 0;
    return (fare + dopl) * (1 - rabat / 100);
  };

  const fareStr = getTotalFare().toFixed(2);
  const hasConfig = configLoaded && config !== null && config.tariffs.length > 0;
  const activeTariff = config?.tariffs.find(t => t.id === activeTariffId) ?? config?.tariffs[0];
  const activeTariffIndex = config?.tariffs.findIndex(t => t.id === activeTariffId) ?? 0;

  /* ════════ ZMINIMALIZOWANY ════════ */
  if (isMinimized) {
    return (
      <>
        <div
          style={{ position: 'fixed', top: pillTop, left: 12, right: 12, zIndex: 1000, touchAction: 'none', cursor: pillDragRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPillPointerDown}
          onPointerMove={onPillPointerMove}
          onPointerUp={onPillPointerUp}
          onPointerCancel={() => { pillDragRef.current = null; }}
        >
          <div style={{ background: '#0d0f12', borderRadius: 20, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 40px rgba(0,0,0,.95)', border: '1px solid #3a4050' }}>
            {/* Uchwyt do przeciągania */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, padding: '2px 4px' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 20, height: 3, borderRadius: 2, background: '#3a404e' }} />)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#7a8494', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Taksometr</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#e6eaf0', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
                {fareStr} <span style={{ fontSize: 18, fontWeight: 500, color: '#7a8494' }}>zł</span>
              </div>
            </div>
            {isRunning && <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#4ade80', flexShrink: 0, animation: 'txDot 1.2s ease-in-out infinite' }} />}
            <ChevronUp style={{ width: 22, height: 22, color: '#555', flexShrink: 0 }} />
          </div>
        </div>
        <style>{`@keyframes txDot{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
      </>
    );
  }

  /* ════════ PEŁNY EKRAN ════════ */
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#000', display: 'flex', flexDirection: 'column', animation: 'txFadeIn .18s ease' }}>

      {/* Treść przewijalna */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 7 }}>

        {/* Alert GPS */}
        {gpsAlert && (
          <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{gpsAlert}</div>
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>Naliczanie zostało wstrzymane</div>
            </div>
          </div>
        )}

        {/* Opłata */}
        <div style={{ ...card, padding: '24px 20px 20px', textAlign: 'center', border: `2px solid ${pulsing ? '#4ade80' : '#2e333f'}`, transition: 'border-color .2s' }}>
          <div style={bigLabelSt}>Opłata</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color: '#e6eaf0', fontVariantNumeric: 'tabular-nums' }}>{fareStr}</span>
            <span style={{ fontSize: 28, fontWeight: 500, color: '#7a8494', paddingBottom: 10 }}>zł</span>
          </div>
          {parseFloat(umowa) > 0 && <div style={{ fontSize: 12, color: '#7a8494', marginTop: 6 }}>cena umowna</div>}
        </div>

        {/* Wszystko poza opłatą — szare po KASIE */}
        <div style={{ opacity: isStopped ? 0.35 : 1, pointerEvents: isStopped ? 'none' : 'auto', transition: 'opacity .3s', display: 'flex', flexDirection: 'column', gap: 7 }}>

        {/* Dystans / Czas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ ...card, padding: '10px 14px', textAlign: 'center' }}>
            <div style={labelSt}>Dystans</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e6eaf0', fontVariantNumeric: 'tabular-nums' }}>
              {distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km` : `${Math.round(distanceM)} m`}
            </div>
          </div>
          <div style={{ ...card, padding: '10px 14px', textAlign: 'center' }}>
            <div style={labelSt}>Czas</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e6eaf0', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(elapsedSec)}</div>
          </div>
        </div>

        {/* Taryfa — kliknij żeby zmienić */}
        {config && config.tariffs.length > 0 && activeTariff && (
          <div
            onClick={() => { if (Date.now() - restoredAtRef.current > 400) setShowTariffModal(true); }}
            style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div>
              <div style={labelSt}>Taryfa</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#e6eaf0' }}>{activeTariff.name}</div>
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, color: '#e6eaf0', lineHeight: 1, paddingRight: 4, fontVariantNumeric: 'tabular-nums' }}>
              {tariffNum(activeTariff.name, activeTariffIndex)}
            </div>
          </div>
        )}

        {/* Dopłata / Umowa / Rabat — 3 kafelki */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div onClick={() => { if (Date.now() - restoredAtRef.current > 400) setShowExtrasModal('doplata'); }} style={{ ...card, padding: '10px 10px', cursor: 'pointer', textAlign: 'center' }}>
            <div style={labelSt}>Dopłata</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: parseFloat(doplata) > 0 ? '#fbbf24' : '#e6eaf0', fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(doplata) > 0 ? `${parseFloat(doplata).toFixed(2)}` : '—'}
            </div>
          </div>
          <div onClick={() => { if (Date.now() - restoredAtRef.current > 400) setShowExtrasModal('umowa'); }} style={{ ...card, padding: '10px 10px', cursor: 'pointer', textAlign: 'center' }}>
            <div style={labelSt}>Umowa</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: parseFloat(umowa) > 0 ? '#60a5fa' : '#e6eaf0', fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(umowa) > 0 ? `${parseFloat(umowa).toFixed(2)}` : '—'}
            </div>
          </div>
          <div onClick={() => { if (Date.now() - restoredAtRef.current > 400) setShowExtrasModal('rabat'); }} style={{ ...card, padding: '10px 10px', cursor: 'pointer', textAlign: 'center' }}>
            <div style={labelSt}>Rabat</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: rabat > 0 ? '#f59e0b' : '#e6eaf0' }}>
              {rabat > 0 ? `${rabat}%` : '—'}
            </div>
          </div>
        </div>

        {configLoaded && !hasConfig && (
          <div style={{ textAlign: 'center', color: '#f59e0b', fontSize: 13, padding: '12px 16px', background: '#2a1a00', borderRadius: 12, border: '1px solid #78350f' }}>
            Brak skonfigurowanych taryf — skontaktuj się z administratorem
          </div>
        )}

        </div>{/* koniec szarego wrappera */}
      </div>

      {/* Dolny pasek */}
      <div style={{ padding: '10px 8px 28px', borderTop: '1px solid #2e333f', display: 'flex', gap: 10, background: '#000', flexShrink: 0 }}>
        {/* Minimize — zwykły klik */}
        <button
          onClick={() => setIsMinimized(true)}
          style={{ padding: '0 22px', minHeight: 64, borderRadius: 16, background: '#1c1f26', border: '1px solid #3a4050', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Minimize2 style={{ width: 26, height: 26, color: '#9aa4b2' }} />
        </button>

        {isStopped ? (
          /* Zakończ — zwykły klik, zamyka taksometr */
          <button
            onClick={onClose}
            style={{ flex: 1, minHeight: 64, borderRadius: 16, border: 'none', cursor: 'pointer', background: '#374151', color: '#d1d5db', fontSize: 28, fontWeight: 900, letterSpacing: '0.1em' }}
          >
            Zakończ
          </button>
        ) : (
          /* Start / KASA — przytrzymaj */
          <button
            onPointerDown={e => {
              if (!hasConfig && !isRunning) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              startHold(isRunning ? stopTaximeter : startTaximeter);
            }}
            onPointerUp={stopHold}
            onPointerCancel={stopHold}
            disabled={!hasConfig && !isRunning}
            style={{
              flex: 1, minHeight: 64, borderRadius: 16, border: 'none',
              cursor: hasConfig || isRunning ? 'pointer' : 'default',
              background: isRunning ? '#7f1d1d' : '#14532d',
              color: isRunning ? '#fca5a5' : '#86efac',
              fontSize: 28, fontWeight: 900,
              letterSpacing: isRunning ? '0.16em' : '0.06em',
              opacity: !hasConfig && !isRunning ? 0.4 : 1,
              transition: 'background .2s, color .2s',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {isRunning ? 'KASA' : 'Start'}
            {holdProgress > 0 && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, background: 'rgba(255,255,255,0.4)', width: `${holdProgress}%`, transition: 'none', borderRadius: 2 }} />
            )}
          </button>
        )}
      </div>

      {/* ── Modal: wybór taryfy ── */}
      {showTariffModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 20, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowTariffModal(false)}>
          <div style={{ background: '#0d0f12', borderRadius: '22px 22px 0 0', width: '100%', padding: '24px 16px 40px', border: '1px solid #2e333f', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7a8494', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16, textAlign: 'center' }}>Wybierz taryfę</div>
            {config?.tariffs.map((t, i) => (
              <div
                key={t.id}
                onClick={() => { handleTariffChange(t.id); setShowTariffModal(false); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderRadius: 16, marginBottom: 10, background: activeTariffId === t.id ? '#1e3a6e' : '#232730', border: `1px solid ${activeTariffId === t.id ? '#3b82f6' : '#2e333f'}`, cursor: 'pointer' }}
              >
                <div>
                  <div style={{ fontSize: 11, color: activeTariffId === t.id ? '#93c5fd' : '#7a8494', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Taryfa</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: activeTariffId === t.id ? '#93c5fd' : '#e6eaf0', marginTop: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#7a8494', marginTop: 2 }}>{t.per_km_rate.toFixed(2)} zł/km</div>
                </div>
                <div style={{ fontSize: 52, fontWeight: 900, color: activeTariffId === t.id ? '#93c5fd' : '#e6eaf0', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {tariffNum(t.name, i)}
                </div>
              </div>
            ))}
            <button onClick={() => setShowTariffModal(false)} style={{ width: '100%', padding: '16px', borderRadius: 14, background: '#232730', border: '1px solid #2e333f', color: '#9aa4b2', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: dopłata / umowa / rabat ── */}
      {showExtrasModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 20, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowExtrasModal(null)}>
          <div style={{ background: '#0d0f12', borderRadius: '22px 22px 0 0', width: '100%', padding: '24px 16px 40px', border: '1px solid #2e333f', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7a8494', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20, textAlign: 'center' }}>
              {showExtrasModal === 'doplata' ? 'Dopłata' : showExtrasModal === 'umowa' ? 'Umowa' : 'Rabat'}
            </div>

            {showExtrasModal === 'doplata' && (
              <>
                <input
                  type="number" min="0" step="0.01"
                  value={doplata}
                  onChange={e => setDoplata(e.target.value)}
                  placeholder="0.00 zł"
                  autoFocus
                  style={{ ...inputSt, fontSize: 26, padding: '18px 20px', marginBottom: 14, textAlign: 'center' }}
                />
                {parseFloat(doplata) > 0 && (
                  <button onClick={() => setDoplata('')} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#3f2020', border: '1px solid #7f1d1d', color: '#fca5a5', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                    Usuń dopłatę
                  </button>
                )}
              </>
            )}

            {showExtrasModal === 'umowa' && (
              <>
                <input
                  type="number" min="0" step="0.01"
                  value={umowa}
                  onChange={e => setUmowa(e.target.value)}
                  placeholder="— zł"
                  autoFocus
                  style={{ ...inputSt, fontSize: 26, padding: '18px 20px', marginBottom: 14, textAlign: 'center' }}
                />
                {parseFloat(umowa) > 0 && (
                  <button onClick={() => setUmowa('')} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#3f2020', border: '1px solid #7f1d1d', color: '#fca5a5', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                    Usuń cenę umowną
                  </button>
                )}
              </>
            )}

            {showExtrasModal === 'rabat' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                {RABAT_OPTIONS.map(v => (
                  <button
                    key={v}
                    onClick={() => setRabat(v)}
                    style={{ padding: '18px 8px', borderRadius: 14, border: `2px solid ${rabat === v ? '#3b82f6' : '#2e333f'}`, background: rabat === v ? '#1e3a6e' : '#232730', color: rabat === v ? '#93c5fd' : '#e6eaf0', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}
                  >
                    {v === 0 ? '—' : `${v}%`}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowExtrasModal(null)}
              style={{ width: '100%', padding: '16px', borderRadius: 14, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}
            >
              Zatwierdź
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes txFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes txDot    { 0%,100%{opacity:1} 50%{opacity:.2} }
      `}</style>
    </div>
  );
};

export default Taximeter;
