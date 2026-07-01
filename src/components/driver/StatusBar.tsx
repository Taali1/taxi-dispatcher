import React, { useState, useEffect, useRef } from 'react';
import { Battery, BatteryCharging, BatteryLow, BatteryMedium, Signal } from 'lucide-react';
import { DRIVER_STATUS_COLORS } from '../../constants/driverColors';
import { soundService } from '../../services/soundService';

interface StatusBarProps {
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  statusLabel: string;
  colorEnabled?: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, statusLabel, colorEnabled = true }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [batteryLevel, setBatteryLevel] = useState<number | null>(100);
  const [isCharging, setIsCharging] = useState(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasGPS, setHasGPS] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const gpsWatchRef = useRef<number | null>(null);

  const isConnected = isOnline && isDbConnected;

  // ── Dźwięk rozłączenia (pętla) ────────────────────────────────────────────
  const isLost = !isConnected || !hasGPS;
  const prevLostRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevLostRef.current === false && isLost) {
      soundService.startDisconnectedLoop();
    } else if (prevLostRef.current === true && !isLost) {
      soundService.stopDisconnectedLoop();
    }
    prevLostRef.current = isLost;
    return () => { soundService.stopDisconnectedLoop(); };
  }, [isLost]);

  useEffect(() => {
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 30000);

    // Internet
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // GPS
    if (navigator.geolocation) {
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        () => setHasGPS(true),
        () => setHasGPS(false),
        { timeout: 8000, maximumAge: 30000, enableHighAccuracy: false }
      );
    }

    // Baza danych – ping co 10s
    const checkDb = async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch('/api', { signal: controller.signal });
        setIsDbConnected(res.status < 500);
      } catch {
        setIsDbConnected(false);
      } finally {
        clearTimeout(t);
      }
    };
    checkDb();
    const dbInterval = setInterval(checkDb, 10000);

    // Bateria
    const updateBattery = async () => {
      if ('getBattery' in navigator) {
        try {
          const battery: any = await (navigator as any).getBattery();
          setBatteryLevel(Math.round(battery.level * 100));
          setIsCharging(battery.charging);
          battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
          battery.addEventListener('chargingchange', () => setIsCharging(battery.charging));
        } catch {
          // Battery API not supported
        }
      }
    };
    updateBattery();

    return () => {
      clearInterval(timeInterval);
      clearInterval(dbInterval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
    };
  }, []);

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'free':    return '#007a1e';
      case 'driving': return '#0052cc';
      case 'pickup':  return '#aa0000';
      case 'busy':    return '#8428bc';
      case 'home':    return '#6b7280';
      default:        return '#6b7280';
    }
  };

  const getBatteryIcon = () => {
    if (isCharging) return <BatteryCharging className="w-5 h-5" />;
    if (batteryLevel === null) return <Battery className="w-5 h-5" />;
    if (batteryLevel <= 20) return <BatteryLow className="w-4 h-4 text-red-400" />;
    if (batteryLevel <= 50) return <BatteryMedium className="w-5 h-5" />;
    return <Battery className="w-5 h-5" />;
  };

  const getBatteryColor = () => {
    if (isCharging) return 'text-green-400';
    if (batteryLevel === null) return 'text-[#ACACB9]';
    if (batteryLevel <= 20) return 'text-red-400';
    if (batteryLevel <= 50) return 'text-yellow-400';
    return 'text-[#ACACB9]';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTooltipLines = () => {
    const lines: string[] = [];
    if (!isOnline) lines.push('Brak internetu');
    if (!isDbConnected) lines.push('Brak połączenia z bazą');
    if (!hasGPS) lines.push('Brak sygnału GPS');
    if (lines.length === 0) lines.push('Połączenie aktywne');
    return lines;
  };

  const bgColor = (colorEnabled && status !== 'home') ? DRIVER_STATUS_COLORS[status].primary : '#2B2B36';

  return (
    <div
      className="px-3 py-1.5 border-b shrink-0"
      style={{ backgroundColor: bgColor, borderBottomColor: '#2C2D33' }}
    >
      <div className="flex items-center justify-between">
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Signal
            className={`w-5 h-5 ${
              isConnected
                ? 'text-emerald-500'
                : 'text-red-500 animate-signal-blink'
            }`}
            strokeWidth={2.5}
          />
          <span className="text-white font-semibold text-lg">{statusLabel}</span>
          {showTooltip && (
            <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-[#2B2B36] border border-[#4D4D59] text-white text-xs rounded-[10px] whitespace-nowrap z-50">
              {getTooltipLines().map((line, i) => (
                <div key={i} className={getTooltipLines().length === 1 && isConnected ? 'text-emerald-400' : 'text-red-400'}>
                  {line}
                </div>
              ))}
              <div className="mt-1 pt-1 border-t border-[#4D4D59] text-[#ACACB9] space-y-0.5">
                <div>Internet: {isOnline ? '✓' : '✗'}</div>
                <div>Baza: {isDbConnected ? '✓' : '✗'}</div>
                <div>GPS: {hasGPS ? '✓' : '✗'}</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[#ACACB9] text-base">
          <div className={`flex items-center gap-1 ${getBatteryColor()}`}>
            {getBatteryIcon()}
            <span>{batteryLevel !== null ? `${batteryLevel}%` : '-'}</span>
          </div>
          <span className="text-white">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
