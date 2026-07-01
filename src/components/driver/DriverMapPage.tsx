import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/userService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { getMarkerColor, getDriverStatusLabel, type DriverStatus } from '../../constants/driverColors';
import ColorLegend from '../common/ColorLegend';
import { Navigation, MapPin, Loader, Eye, EyeOff } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface DriverOnMap {
  id: string;
  name: string;
  driverCode: string;
  driverState: string | null;
  currentZone: number | null;
  lat: number;
  lng: number;
}

const stateToStatus = (driverState: string | null): DriverStatus => {
  if (driverState === 'free') return 'free';
  if (driverState === 'approaching') return 'pickup';
  if (driverState === 'in_transit') return 'driving';
  if (driverState === 'busy') return 'busy';
  return 'home';
};

// ─── Marker własnego kierowcy ─────────────────────────────────────────────────
const MyDriverMarker: React.FC<{ position: [number, number]; driverCode: string; status: DriverStatus }> = ({ position, driverCode, status }) => {
  const map = useMap();
  useEffect(() => {
    const color = getMarkerColor(status);
    const icon = L.divIcon({
      html: `<div style="background:${color};color:white;padding:1px 8px;border-radius:4px;font-size:20px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);text-align:center;min-width:40px;white-space:nowrap;border:3px solid white;">${driverCode}</div>`,
      className: 'my-driver-marker',
      iconSize: [50, 28],
      iconAnchor: [25, 14],
    });
    const marker = L.marker(position, { icon }).addTo(map);
    map.setView(position, map.getZoom());
    return () => { marker.remove(); };
  }, [map, position, driverCode, status]);
  return null;
};

// ─── Markery pozostałych kierowców ───────────────────────────────────────────
const OtherDriversMarkers: React.FC<{ drivers: DriverOnMap[]; currentUserId: string; visible: boolean }> = ({ drivers, currentUserId, visible }) => {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (!visible) return;

    drivers
      .filter(d => d.id !== currentUserId && d.lat !== 0 && d.lng !== 0)
      .forEach(driver => {
        const status = stateToStatus(driver.driverState);
        const color = getMarkerColor(status);
        const statusLabel = getDriverStatusLabel(status);

        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;padding:1px 8px;border-radius:4px;font-size:20px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);text-align:center;min-width:40px;white-space:nowrap;">${driver.driverCode}</div>`,
          className: 'other-driver-marker',
          iconSize: [50, 28],
          iconAnchor: [25, 14],
        });

        const marker = L.marker([driver.lat, driver.lng], { icon });
        marker.bindPopup(`
          <div style="min-width:140px;">
            <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${driver.name}</div>
            <div style="font-size:12px;color:#666;margin-bottom:4px;">Kod: ${driver.driverCode}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
              <span style="font-size:12px;">${statusLabel}</span>
            </div>
            ${driver.currentZone ? `<div style="font-size:11px;color:#888;">Rejon: ${driver.currentZone}</div>` : ''}
          </div>
        `);
        marker.addTo(map);
        markersRef.current.push(marker);
      });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, drivers, currentUserId, visible]);

  return null;
};

// ─── Główny komponent ─────────────────────────────────────────────────────────
const DriverMapPage: React.FC = () => {
  const { user } = useAuth();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverCode, setDriverCode] = useState<string>('');
  const [driverStatus, setDriverStatus] = useState<DriverStatus>('free');
  const [detectedZoneInfo, setDetectedZoneInfo] = useState<{ id: string; number: number; name: string } | null>(null);
  const [zoneEntryTime, setZoneEntryTime] = useState<string | null>(null);
  const [isDetectingZone, setIsDetectingZone] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [allDrivers, setAllDrivers] = useState<DriverOnMap[]>([]);
  const [showOtherDrivers, setShowOtherDrivers] = useState(true);
  const currentZoneRef = useRef<string | null>(null);

  // Ładuj lokalizację i dane kierowcy raz
  useEffect(() => {
    loadDriverData();
    getCurrentLocation();
  }, []);

  // Pobieraj innych kierowców co 5 sekund
  useEffect(() => {
    fetchOtherDrivers();
    const interval = setInterval(fetchOtherDrivers, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchOtherDrivers = async () => {
    try {
      const res = await fetch('/api/drivers/map');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAllDrivers(data.data);
      }
    } catch {
      // sieć niedostępna — ignoruj
    }
  };

  useEffect(() => {
    if (location) detectCurrentZone(location);
  }, [location]);

  const detectCurrentZone = (loc: { lat: number; lng: number }) => {
    setIsDetectingZone(true);
    try {
      const storedZones = localStorage.getItem('taxi_zones');
      if (!storedZones) { setDetectedZoneInfo(null); return; }
      const zones = JSON.parse(storedZones);
      if (!zones.length) { setDetectedZoneInfo(null); return; }

      const zoneDetection = new ZoneDetectionService(zones);
      const detectedZoneId = zoneDetection.detectZoneFromCoordinates(loc.lat, loc.lng);
      if (detectedZoneId) {
        const zoneData = zones.find((z: any) => z.id === detectedZoneId);
        if (zoneData && currentZoneRef.current !== zoneData.id) {
          currentZoneRef.current = zoneData.id;
          const info = { id: zoneData.id, number: zoneData.number, name: zoneData.name };
          setDetectedZoneInfo(info);
          setZoneEntryTime(new Date().toISOString());
          if (user?.id) {
            userService.updateDriver(user.id, { currentZone: zoneData.number, currentLocation: loc });
          }
        }
      } else {
        currentZoneRef.current = null;
        setDetectedZoneInfo(null);
        setZoneEntryTime(null);
      }
    } catch { setDetectedZoneInfo(null); }
    finally { setIsDetectingZone(false); }
  };

  const loadDriverData = () => {
    if (!user?.id) return;
    const driver = userService.getUserById(user.id);
    if (driver && 'driverCode' in driver) {
      setDriverCode(driver.driverCode);
      if ('status' in driver) setDriverStatus(driver.status as DriverStatus);
    } else {
      setDriverCode('???');
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setIsLoadingLocation(false);
      setMapError('Geolokalizacja nie jest dostępna');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLoadingLocation(false);
      },
      (err) => {
        setIsLoadingLocation(false);
        setMapError('Nie można pobrać lokalizacji GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  const otherDriversCount = allDrivers.filter(d => d.id !== (user?.id || '') && d.lat !== 0 && d.lng !== 0).length;

  if (isLoadingLocation) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
          <div className="text-white font-medium">Pobieranie lokalizacji GPS...</div>
        </div>
      </div>
    );
  }

  if (mapError || !location) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-8 text-center max-w-md">
          <MapPin className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <div className="text-red-200 font-medium mb-2">{mapError || 'Nie można pobrać lokalizacji GPS'}</div>
          <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-slate-900">
      <div className="w-full h-full absolute inset-0">
        <MapContainer center={[location.lat, location.lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <OtherDriversMarkers drivers={allDrivers} currentUserId={user?.id || ''} visible={showOtherDrivers} />
          <MyDriverMarker position={[location.lat, location.lng]} driverCode={driverCode} status={driverStatus} />
        </MapContainer>
      </div>

      {/* Rejon – lewy górny */}
      <div className="absolute top-4 left-14 bg-slate-800/90 backdrop-blur-sm rounded-lg px-4 py-3 border border-slate-700 z-[9999]">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${detectedZoneInfo ? 'bg-green-600' : 'bg-slate-600'}`}>
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            {isDetectingZone ? (
              <div className="text-slate-300 text-sm">Wykrywanie rejonu...</div>
            ) : detectedZoneInfo ? (
              <>
                <div className="text-white font-semibold">Rejon {detectedZoneInfo.number} - {detectedZoneInfo.name}</div>
                {zoneEntryTime && (
                  <div className="text-green-400 text-sm">Od {new Date(zoneEntryTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </>
            ) : (
              <div className="text-slate-400 font-medium">Poza rejonami</div>
            )}
          </div>
        </div>
      </div>

      {/* Panel kierowcy – prawy górny */}
      <div className="absolute top-4 right-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700 z-[1000]">
        <div className="flex items-center space-x-3 mb-3">
          <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center">
            <Navigation className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-medium">Kierowca {driverCode}</div>
            <div className="text-blue-400 text-sm font-medium">
              {detectedZoneInfo ? `Rejon ${detectedZoneInfo.number}` : 'Poza rejonami'}
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm mb-3">
          <div className="flex justify-between">
            <span className="text-slate-400">Szerokość:</span>
            <span className="text-white font-mono">{location.lat.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Długość:</span>
            <span className="text-white font-mono">{location.lng.toFixed(6)}</span>
          </div>
        </div>

        {/* Przycisk toggle innych kierowców */}
        <button
          onClick={() => setShowOtherDrivers(v => !v)}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showOtherDrivers ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
          }`}
        >
          {showOtherDrivers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showOtherDrivers ? `Kierowcy (${otherDriversCount})` : 'Kierowcy ukryci'}
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-[1000]">
        <ColorLegend compact={false} showHomeStatus={false} />
      </div>
    </div>
  );
};

export default DriverMapPage;
