import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { Loader } from 'lucide-react';
import { settingsService } from '../../services/settingsService';
import { useAuth } from '../../contexts/AuthContext';
import 'leaflet/dist/leaflet.css';

// ─── Ikony ────────────────────────────────────────────────────────────────────

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Coords { lat: number; lng: number; }
export interface DriverInfo { lat: number; lng: number; code: string; dist: number | null; color?: string; }

const createPin = (type: 'pickup' | 'destination') => {
  const color = type === 'pickup' ? '#1d4ed8' : '#dc2626';
  const html = `
    <div class="bolt-pin-drop" style="width:34px;height:54px;">
      <svg width="34" height="54" viewBox="0 0 34 54" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">
        <path fill="${color}" d="M17 1C9 1 1 9 1 17c0 12 16 36 16 36s16-24 16-36C33 9 25 1 17 1z"/>
        <circle cx="17" cy="17" r="6" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className:   'address-pin-marker',
    iconSize:    [34, 54],
    iconAnchor:  [17, 54],
    popupAnchor: [0, -56],
  });
};

const createDriverPin = (code: string, color: string = '#52525b') => {
  const html = `<div style="display:inline-flex;align-items:center;justify-content:center;min-width:2rem;height:28px;padding:0 8px;border-radius:4px;background:${color};color:white;font-weight:700;font-size:15px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${code}</div>`;
  return L.divIcon({ html, className: '', iconSize: [44, 28], iconAnchor: [22, 14] } as any);
};

// ─── Zarządzanie kursorem mapy ───────────────────────────────────────────────

const CursorManager: React.FC<{ crosshair: boolean }> = ({ crosshair }) => {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = crosshair ? 'crosshair' : '';
  }, [crosshair, map]);
  return null;
};

// ─── Pick mode ────────────────────────────────────────────────────────────────

const PickModeClickHandler: React.FC<{
  pickMode: 'pickup' | 'destination';
  resultKey: string;
  onDone: () => void;
  onGeocoding: (v: boolean) => void;
}> = ({ pickMode, resultKey, onDone, onGeocoding }) => {
  useMapEvents({
    click: async (e) => {
      onGeocoding(true);
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json&addressdetails=1`,
          { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
        );
        const data = await res.json();
        const road     = data.address?.road || '';
        const num      = data.address?.house_number || '';
        const street   = num ? `${road} ${num}` : road;
        const city     = data.address?.city || data.address?.town || data.address?.village || '';
        const postcode = data.address?.postcode || '';
        const location = postcode && city ? `${postcode} ${city}` : city;
        const address  = street && location ? `${street}, ${location}` : street || data.display_name || '';
        localStorage.setItem(resultKey, JSON.stringify({
          type: pickMode, address, lat: e.latlng.lat, lng: e.latlng.lng, ts: Date.now(),
        }));
        onDone();
      } catch { onDone(); } finally { onGeocoding(false); }
    },
  });
  return null;
};

// ─── Pinezki adresów ──────────────────────────────────────────────────────────

const MapPins: React.FC<{ pickup: Coords | null; destination: Coords | null }> = ({ pickup, destination }) => {
  const map = useMap();
  const pickupRef = useRef<L.Marker | null>(null);
  const destRef   = useRef<L.Marker | null>(null);

  useEffect(() => {
    pickupRef.current?.remove();
    pickupRef.current = null;
    if (pickup) {
      pickupRef.current = L.marker([pickup.lat, pickup.lng], { icon: createPin('pickup') })
        .bindPopup('<b style="color:#1d4ed8;font-size:13px;">Adres odbioru</b>').addTo(map);
    }
    return () => { pickupRef.current?.remove(); };
  }, [pickup, map]);

  useEffect(() => {
    destRef.current?.remove();
    destRef.current = null;
    if (destination) {
      destRef.current = L.marker([destination.lat, destination.lng], { icon: createPin('destination') })
        .bindPopup('<b style="color:#dc2626;font-size:13px;">Adres docelowy</b>').addTo(map);
    }
    return () => { destRef.current?.remove(); };
  }, [destination, map]);

  useEffect(() => {
    if (pickup && destination) {
      map.flyToBounds([[pickup.lat, pickup.lng], [destination.lat, destination.lng]] as LatLngBoundsExpression, { padding: [50, 50], duration: 0.8 });
    } else if (pickup) {
      map.flyTo([pickup.lat, pickup.lng], 15, { duration: 0.8 });
    } else if (destination) {
      map.flyTo([destination.lat, destination.lng], 15, { duration: 0.8 });
    }
  }, [pickup, destination, map]);

  return null;
};

// ─── Trasa między punktami zlecenia (OSRM) ───────────────────────────────────

const RouteLayer: React.FC<{ pickup: Coords | null; destination: Coords | null }> = ({ pickup, destination }) => {
  const map = useMap();
  const routeRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    routeRef.current?.remove();
    routeRef.current = null;
    if (!pickup || !destination) return;
    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`,
      { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.routes?.[0]) return;
        const coords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
        routeRef.current = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map);
      }).catch(() => {});
    return () => { cancelled = true; routeRef.current?.remove(); routeRef.current = null; };
  }, [pickup, destination, map]);

  return null;
};

// ─── Marker kierowcy ─────────────────────────────────────────────────────────

const DriverMarker: React.FC<{ coords: Coords; code: string; color?: string }> = ({ coords, code, color }) => {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    markerRef.current?.remove();
    markerRef.current = L.marker([coords.lat, coords.lng], { icon: createDriverPin(code, color) }).addTo(map);
    return () => { markerRef.current?.remove(); markerRef.current = null; };
  }, [coords, code, color, map]);

  return null;
};

// ─── Trasa kierowcy → adres odbioru ─────────────────────────────────────────

const DriverRouteLayer: React.FC<{ driverLat: number; driverLng: number; pickupLat: number; pickupLng: number }> = ({ driverLat, driverLng, pickupLat, pickupLng }) => {
  const map = useMap();
  const routeRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    routeRef.current?.remove();
    routeRef.current = null;
    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${pickupLng},${pickupLat}?overview=full&geometries=geojson`,
      { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.routes?.[0]) return;
        const coords = data.routes[0].geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        routeRef.current = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map);
      })
      .catch(() => {});
    return () => { cancelled = true; routeRef.current?.remove(); routeRef.current = null; };
  }, [driverLat, driverLng, pickupLat, pickupLng, map]);

  return null;
};

// ─── Dopasuj widok do kierowcy + odbioru ─────────────────────────────────────

const FitDriverBounds: React.FC<{ driver: Coords; pickup: Coords }> = ({ driver, pickup }) => {
  const map = useMap();
  useEffect(() => {
    map.flyToBounds(
      [[driver.lat, driver.lng], [pickup.lat, pickup.lng]] as LatLngBoundsExpression,
      { padding: [60, 80], duration: 0.8 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.lat, driver.lng, pickup.lat, pickup.lng, map]);
  return null;
};

// ─── Ustawia widok mapy ───────────────────────────────────────────────────────

const SetView: React.FC<{ center: [number, number] | null; hasCoords: boolean }> = ({ center, hasCoords }) => {
  const map = useMap();
  useEffect(() => {
    if (center && !hasCoords) map.setView(center, 13);
  }, [center, map, hasCoords]);
  return null;
};

// ─── Główny komponent ─────────────────────────────────────────────────────────

const DispatcherMiniMap: React.FC<{
  pickupCoords:      Coords | null;
  destinationCoords: Coords | null;
  driverCoords?:     DriverInfo | null;
}> = ({ pickupCoords, destinationCoords, driverCoords }) => {
  const { user } = useAuth();
  const [cityCenter, setCityCenter]   = useState<[number, number] | null>(null);
  const [pickMode, setPickMode]       = useState<'pickup' | 'destination' | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const settings = await settingsService.getSettings();
        if (settings.baseCity) {
          const params = new URLSearchParams({ q: settings.baseCity, format: 'json', limit: '1', countrycodes: 'PL' });
          const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } });
          const data = await res.json();
          if (data.length > 0) setCityCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    const requestKey = `dispatch_pick_request_${user.id}`;
    const handleRequest = (raw: string | null) => {
      if (!raw) return;
      try {
        const req = JSON.parse(raw);
        if (Date.now() - req.ts > 60000) return;
        setPickMode(req.type);
        localStorage.removeItem(requestKey);
      } catch {}
    };
    const onStorage = (e: StorageEvent) => { if (e.key === requestKey) handleRequest(e.newValue); };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => handleRequest(localStorage.getItem(requestKey)), 400);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, [user]);

  const resultKey   = user ? `dispatch_pick_result_${user.id}` : '';
  const driverCoord = driverCoords ? { lat: driverCoords.lat, lng: driverCoords.lng } : null;
  const hasAnyCoords = !!(pickupCoords || destinationCoords || driverCoord);

  // Oblicz dystans i czas z pola dist (tak samo jak w tabeli)
  const distStr = driverCoords?.dist != null
    ? (driverCoords.dist < 1 ? `${Math.round(driverCoords.dist * 1000)} m` : `${driverCoords.dist.toFixed(1)} km`)
    : null;
  const timeMin = driverCoords?.dist != null
    ? Math.round((driverCoords.dist / 30) * 60)
    : null;

  return (
    <div className="relative h-full w-full">
      <MapContainer
          center={[52.2297, 21.0122]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SetView center={cityCenter} hasCoords={hasAnyCoords} />
          <RouteLayer pickup={pickupCoords} destination={destinationCoords} />
          <MapPins   pickup={pickupCoords} destination={destinationCoords} />

          {driverCoord && (
            <DriverMarker coords={driverCoord} code={driverCoords!.code} color={driverCoords!.color} />
          )}
          {driverCoord && pickupCoords && (
            <>
              <DriverRouteLayer
                driverLat={driverCoord.lat} driverLng={driverCoord.lng}
                pickupLat={pickupCoords.lat} pickupLng={pickupCoords.lng}
              />
              <FitDriverBounds driver={driverCoord} pickup={pickupCoords} />
            </>
          )}

          {pickMode && (
            <PickModeClickHandler
              pickMode={pickMode}
              resultKey={resultKey}
              onDone={() => setPickMode(null)}
              onGeocoding={setIsGeocoding}
            />
          )}
          <CursorManager crosshair={!!pickMode} />
        </MapContainer>

      {/* Baner pick mode */}
      {pickMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="flex items-center gap-2 bg-[#181818]/90 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
            {isGeocoding ? <Loader className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3 text-center">✛</span>}
            {isGeocoding ? 'Pobieranie adresu...' : `Kliknij na mapie — ${pickMode === 'pickup' ? 'adres odbioru' : 'adres docelowy'}`}
          </div>
        </div>
      )}

      {/* Okienko info kierowcy — overlay jak kontrolki mapy */}
      {driverCoords && (
        <div className="absolute top-2.5 right-2.5 z-[1000] pointer-events-none">
          <div className="bg-white dark:bg-[#2d2d2d] border border-gray-300 dark:border-[#7a7a7a] rounded shadow-md overflow-hidden text-center" style={{ minWidth: 80 }}>
            <div className="px-3 py-1.5 border-b border-gray-200 dark:border-[#7a7a7a]">
              <div className="text-[10px] text-gray-500 dark:text-gray-300 uppercase tracking-wide leading-none mb-0.5">Dystans</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{distStr ?? '—'}</div>
            </div>
            <div className="px-3 py-1.5">
              <div className="text-[10px] text-gray-500 dark:text-gray-300 uppercase tracking-wide leading-none mb-0.5">Dojazd</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                {timeMin != null ? (timeMin < 1 ? '< 1 min' : `~${timeMin} min`) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatcherMiniMap;
