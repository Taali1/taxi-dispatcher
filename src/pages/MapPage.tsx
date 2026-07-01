import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import { Search, Eye, EyeOff, Layers, Loader, X } from 'lucide-react';
import { type DriverWithLocation } from '../services/driverQueueService';
import { settingsService } from '../services/settingsService';
import { zoneService, type Zone } from '../services/zoneService';
import { getMarkerColor, getDriverStatusLabel } from '../constants/driverColors';
import { useAuth } from '../contexts/AuthContext';
import 'leaflet/dist/leaflet.css';

const API_BASE = '/api';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Markery kierowców ────────────────────────────────────────────────────────

const DriverMarkers: React.FC<{ drivers: DriverWithLocation[] }> = ({ drivers }) => {
  const map = useMap();
  const markersRef = React.useRef<L.Marker[]>([]);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    drivers.forEach(driver => {
      if (!driver.location || driver.location.lat === 0 || driver.location.lng === 0) return;

      const color = getMarkerColor(driver.status);
      const statusLabel = getDriverStatusLabel(driver.status);

      const icon = L.divIcon({
        html: `<div style="
          background: ${color};
          color: white;
          padding: 1px 8px;
          border-radius: 4px;
          font-size: 20px;
          font-weight: bold;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          text-align: center;
          min-width: 40px;
          white-space: nowrap;
        ">${driver.driverCode}</div>`,
        className: 'driver-map-marker',
        iconSize: [50, 28],
        iconAnchor: [25, 14],
      });

      const marker = L.marker([driver.location.lat, driver.location.lng], { icon });
      marker.bindPopup(`
        <div style="min-width: 140px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${driver.name}</div>
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Kod: ${driver.driverCode}</div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
            <span style="font-size: 12px;">${statusLabel}</span>
          </div>
          ${driver.currentZone ? `<div style="font-size: 11px; color: #888;">Rejon: ${driver.currentZone}</div>` : ''}
        </div>
      `);
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, drivers]);

  return null;
};

// ─── Strefy na mapie ─────────────────────────────────────────────────────────

const ZonePolygons: React.FC<{ zones: Zone[] }> = ({ zones }) => {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    zones.forEach(zone => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;

      const latlngs = zone.coordinates.map(c => [c.lat, c.lng] as L.LatLngTuple);
      const color = zone.color || '#3b82f6';

      const polygon = L.polygon(latlngs, {
        color,
        fillOpacity: 0,
        weight: 3,
        opacity: 0.9,
      }).addTo(map);

      const center = polygon.getBounds().getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          html: `<div style="color:${color};font-size:32px;font-weight:900;white-space:nowrap;letter-spacing:0.5px;font-family:'SF Pro Display','Segoe UI',system-ui,sans-serif;filter:drop-shadow(0 1px 4px rgba(255,255,255,0.9));">${zone.number}</div>`,
          className: 'zone-label-marker',
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map);

      layersRef.current.push(polygon, label);
    });

    return () => {
      layersRef.current.forEach(l => l.remove());
      layersRef.current = [];
    };
  }, [map, zones]);

  return null;
};

// ─── Pinezki adresów z dyspozytorni ──────────────────────────────────────────

interface AddrCoords { lat: number; lng: number; }

const createAddressPinIcon = (type: 'pickup' | 'destination') => {
  const color = type === 'pickup' ? '#1d4ed8' : '#dc2626';
  const html = `
    <div class="bolt-pin-drop" style="width:34px;height:54px;">
      <svg width="34" height="54" viewBox="0 0 34 54" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">
        <path fill="${color}"
          d="M17 1C9 1 1 9 1 17c0 12 16 36 16 36s16-24 16-36C33 9 25 1 17 1z"/>
        <circle cx="17" cy="17" r="6" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: 'address-pin-marker', iconSize: [34, 54], iconAnchor: [17, 54], popupAnchor: [0, -56] });
};

const AddressMarkers: React.FC<{
  pickup: AddrCoords | null;
  destination: AddrCoords | null;
}> = ({ pickup, destination }) => {
  const map = useMap();
  const pickupRef = useRef<L.Marker | null>(null);
  const destRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (pickupRef.current) { pickupRef.current.remove(); pickupRef.current = null; }
    if (pickup) {
      pickupRef.current = L.marker([pickup.lat, pickup.lng], { icon: createAddressPinIcon('pickup') })
        .bindPopup('<b style="color:#b91c1c;font-size:13px;">Adres odbioru</b>')
        .addTo(map);
    }
    return () => { if (pickupRef.current) { pickupRef.current.remove(); pickupRef.current = null; } };
  }, [pickup, map]);

  useEffect(() => {
    if (destRef.current) { destRef.current.remove(); destRef.current = null; }
    if (destination) {
      destRef.current = L.marker([destination.lat, destination.lng], { icon: createAddressPinIcon('destination') })
        .bindPopup('<b style="color:#7f1d1d;font-size:13px;">Adres docelowy</b>')
        .addTo(map);
    }
    return () => { if (destRef.current) { destRef.current.remove(); destRef.current = null; } };
  }, [destination, map]);

  useEffect(() => {
    if (pickup && destination) {
      const bounds: LatLngBoundsExpression = [[pickup.lat, pickup.lng], [destination.lat, destination.lng]];
      map.flyToBounds(bounds, { padding: [80, 80], duration: 0.9, easeLinearity: 0.4 });
    } else if (pickup) {
      map.flyTo([pickup.lat, pickup.lng], 16, { duration: 0.85, easeLinearity: 0.4 });
    } else if (destination) {
      map.flyTo([destination.lat, destination.lng], 16, { duration: 0.85, easeLinearity: 0.4 });
    }
  }, [pickup, destination, map]);

  return null;
};

// ─── Trasa między punktami (OSRM) ────────────────────────────────────────────

const RouteLayer: React.FC<{ pickup: AddrCoords | null; destination: AddrCoords | null }> = ({ pickup, destination }) => {
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
        const coords = data.routes[0].geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        routeRef.current = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      routeRef.current?.remove();
      routeRef.current = null;
    };
  }, [pickup, destination, map]);

  return null;
};

// ─── SetCenter — jednorazowe wycentrowanie mapy ───────────────────────────────

const SetCenter: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (center && !applied) {
      map.setView(center, 13);
      setApplied(true);
    }
  }, [map, center, applied]);

  return null;
};

// ─── FlyTo — lot do wybranego kierowcy ───────────────────────────────────────

const FlyTo: React.FC<{ coords: [number, number] | null }> = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    if (coords) {
      map.flyTo(coords, 16, { duration: 1 });
    }
  }, [map, coords]);

  return null;
};

// ─── Pick mode — kliknięcie na mapie w celu wybrania adresu ─────────────────

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
          type: pickMode,
          address,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          ts:  Date.now(),
        }));
        onDone();
      } catch {
        onDone();
      } finally {
        onGeocoding(false);
      }
    },
  });
  return null;
};

// ─── MapPage ──────────────────────────────────────────────────────────────────

const MapPage: React.FC = () => {
  const { user } = useAuth();
  const pinKey = user ? `dispatch_address_pin_${user.id}` : null;

  const [drivers, setDrivers] = useState<DriverWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapCenter] = useState<[number, number]>([52.2297, 21.0122]);
  const [showZones, setShowZones] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  /** Tryb wyboru adresu kliknięciem: null = wyłączony */
  const [pickMode, setPickMode] = useState<'pickup' | 'destination' | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  useEffect(() => {
    zoneService.getZones().then(setZones).catch(() => setZones([]));
  }, []);

  // Heartbeat — informuje inne zakładki że mapa jest otwarta
  useEffect(() => {
    if (!user) return;
    const key = `map_alive_${user.id}`;
    const tick = () => localStorage.setItem(key, String(Date.now()));
    tick();
    const interval = setInterval(tick, 2000);
    const onUnload = () => localStorage.removeItem(key);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      localStorage.removeItem(key);
    };
  }, [user?.id]);

  // Pinezki adresów z dyspozytorni (cross-tab via localStorage, per-user key)
  const [addressPins, setAddressPins] = useState<{ pickup: AddrCoords | null; destination: AddrCoords | null }>(() => {
    if (!pinKey) return { pickup: null, destination: null };
    try {
      const stored = localStorage.getItem(pinKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { pickup: parsed.pickup ?? null, destination: parsed.destination ?? null };
      }
    } catch { /* ignore */ }
    return { pickup: null, destination: null };
  });

  // Zamknij okno mapy gdy dyspozytor wyloguje się z panelu (cross-tab)
  useEffect(() => {
    let wasLoggedIn = !!localStorage.getItem('taxi_user');

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'taxi_user') {
        if (!e.newValue && wasLoggedIn) {
          window.close();
          setTimeout(() => { window.location.href = '/login/dispatcher'; }, 150);
        }
        if (e.newValue) wasLoggedIn = true;
      }
    };
    window.addEventListener('storage', onStorage);

    // Fallback polling — obsługuje przypadek gdy okna działają w tym samym procesie
    const poll = setInterval(() => {
      const hasUser = !!localStorage.getItem('taxi_user');
      if (!hasUser && wasLoggedIn) {
        window.close();
        window.location.href = '/login/dispatcher';
      }
      if (hasUser) wasLoggedIn = true;
    }, 1000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  // Nasłuchuj na żądania trybu pick mode z dyspozytorni
  useEffect(() => {
    if (!user) return;
    const requestKey = `dispatch_pick_request_${user.id}`;

    const handleRequest = (raw: string | null) => {
      if (!raw) return;
      try {
        const req = JSON.parse(raw);
        if (Date.now() - req.ts > 60000) return; // ignoruj stare żądania
        setPickMode(req.type);
        localStorage.removeItem(requestKey);
      } catch { /* ignore */ }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === requestKey) handleRequest(e.newValue);
    };
    window.addEventListener('storage', onStorage);

    // Fallback polling — ten sam proces (ta sama zakładka przeglądarki)
    const poll = setInterval(() => {
      handleRequest(localStorage.getItem(requestKey));
    }, 400);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, [user]);

  // Gdy user załaduje się asynchronicznie (AuthContext ładuje z localStorage w useEffect),
  // pinKey zmienia się z null → wartość. Odczytaj wtedy aktualny stan z localStorage.
  useEffect(() => {
    if (!pinKey) return;
    try {
      const stored = localStorage.getItem(pinKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAddressPins({ pickup: parsed.pickup ?? null, destination: parsed.destination ?? null });
      }
    } catch { /* ignore */ }
  }, [pinKey]);

  // Nasłuchuj na zmiany z zakładki dyspozytora (storage event = zmiana w innej zakładce)
  useEffect(() => {
    if (!pinKey) return;
    const handler = (e: StorageEvent) => {
      if (e.key === pinKey) {
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : { pickup: null, destination: null };
          setAddressPins({ pickup: parsed.pickup ?? null, destination: parsed.destination ?? null });
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);

    // Fallback polling co 800ms — storage event nie działa w tej samej zakładce
    // ani gdy okna są w tym samym procesie przeglądarki (np. Chromium single process)
    const poll = setInterval(() => {
      try {
        const stored = localStorage.getItem(pinKey);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        setAddressPins(prev => {
          const newPickup = parsed.pickup ?? null;
          const newDest = parsed.destination ?? null;
          // Aktualizuj tylko gdy coś się zmieniło (porównanie JSON)
          if (
            JSON.stringify(prev.pickup) === JSON.stringify(newPickup) &&
            JSON.stringify(prev.destination) === JSON.stringify(newDest)
          ) return prev;
          return { pickup: newPickup, destination: newDest };
        });
      } catch { /* ignore */ }
    }, 800);

    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(poll);
    };
  }, [pinKey]);
  const [baseCityCenter, setBaseCityCenter] = useState<[number, number] | null>(null);
  const [showDrivers, setShowDrivers] = useState(true);

  // Wyszukiwanie
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [showSearch]);

  const searchResults = searchQuery.trim().length > 0
    ? drivers.filter(d =>
        d.location && d.location.lat !== 0 && d.location.lng !== 0 &&
        (
          d.driverCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  const handleSelectDriver = (driver: DriverWithLocation) => {
    setFlyToCoords([driver.location.lat, driver.location.lng]);
    setShowSearch(false);
    setSearchQuery('');
  };

  // Wycentruj na mieście bazowym z ustawień
  useEffect(() => {
    (async () => {
      try {
        const settings = await settingsService.getSettings();
        if (settings.baseCity) {
          const params = new URLSearchParams({
            q: settings.baseCity,
            format: 'json',
            limit: '1',
            countrycodes: 'PL',
          });
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?${params}`,
            { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
          );
          const data = await res.json();
          if (data.length > 0) {
            setBaseCityCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
          }
        }
      } catch {
        // fallback — zostaje domyślne centrum
      }
    })();
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/drivers/locations`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      if (!result.success || !result.data) {
        console.error('[MapPage] Błąd pobierania kierowców:', result.error);
        return;
      }

      const mapped: DriverWithLocation[] = result.data.map((d: {
        id: string | number;
        name: string;
        driver_code: string;
        latitude: number | string;
        longitude: number | string;
        status: string;
        current_zone: number | null;
      }) => ({
        id: String(d.id),
        name: d.name,
        driverCode: d.driver_code,
        status: d.status as DriverWithLocation['status'],
        currentZone: d.current_zone,
        location: {
          lat: typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude as string),
          lng: typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude as string),
        },
        statusDuration: '',
      }));

      setDrivers(mapped);
    } catch (err) {
      console.error('[MapPage] Error loading drivers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const driversWithLocation = drivers.filter(
    d => d.location && d.location.lat !== 0 && d.location.lng !== 0
  );

  const controlStyle: React.CSSProperties = {
    position: 'absolute',
    left: '10px',
    zIndex: 1000,
    backgroundColor: '#fff',
    border: '2px solid rgba(0,0,0,0.2)',
    borderRadius: '4px',
    boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
  };

  const controlBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#333',
  };

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      {/* Mapa — pełny ekran */}
      <div style={{ height: '100%', width: '100%' }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SetCenter center={baseCityCenter} />
          <FlyTo coords={flyToCoords} />
          <ZonePolygons zones={showZones ? zones : []} />
          <DriverMarkers drivers={showDrivers ? driversWithLocation : []} />
          <RouteLayer pickup={addressPins.pickup} destination={addressPins.destination} />
          <AddressMarkers pickup={addressPins.pickup} destination={addressPins.destination} />
          {pickMode && user && (
            <PickModeClickHandler
              pickMode={pickMode}
              resultKey={`dispatch_pick_result_${user.id}`}
              onDone={() => setPickMode(null)}
              onGeocoding={setIsReverseGeocoding}
            />
          )}
        </MapContainer>

        {/* Tryb wyboru adresu — overlay z instrukcją */}
        {pickMode && (
          <>
            <style>{'.leaflet-container { cursor: crosshair !important; }'}</style>
            <div className="absolute inset-0 pointer-events-none z-[500]">
              {/* Instrukcja na dole */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="bg-black/70 text-white text-sm px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg whitespace-nowrap">
                  {isReverseGeocoding ? (
                    <><Loader className="w-4 h-4 animate-spin" /><span>Wykrywanie adresu...</span></>
                  ) : (
                    <span>
                      Kliknij na mapie — {pickMode === 'pickup' ? 'adres odbioru' : 'adres docelowy'}
                    </span>
                  )}
                </div>
              </div>
              {/* Anuluj — pointer-events-auto */}
              <button
                className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto bg-white dark:bg-slate-800 text-gray-700 dark:text-white text-sm px-4 py-1.5 rounded-full border border-gray-300 dark:border-slate-600 shadow-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                onClick={() => setPickMode(null)}
              >
                <X className="w-3.5 h-3.5" />
                Anuluj
              </button>
            </div>
          </>
        )}

        {/* Brak kierowców z GPS */}
        {!loading && driversWithLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/70 z-10 pointer-events-none">
            <div className="text-center">
              <p className="text-slate-300 text-lg font-medium">Brak kierowców z lokalizacją GPS</p>
              <p className="text-slate-500 text-sm mt-1">Kierowcy muszą włączyć GPS w aplikacji</p>
            </div>
          </div>
        )}
      </div>

      {/* Ukryj/Pokaż kierowców */}
      <div style={{ ...controlStyle, top: '80px' }}>
        <button
          onClick={() => setShowDrivers(prev => !prev)}
          style={controlBtnStyle}
          title={showDrivers ? 'Ukryj kierowców' : 'Pokaż kierowców'}
        >
          {showDrivers ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      {/* Pokaż/Ukryj strefy */}
      <div style={{ ...controlStyle, top: '120px' }}>
        <button
          onClick={() => setShowZones(prev => !prev)}
          style={{ ...controlBtnStyle, color: showZones ? '#3b82f6' : '#333' }}
          title={showZones ? 'Ukryj strefy' : 'Pokaż strefy'}
        >
          <Layers size={16} />
        </button>
      </div>

      {/* Przycisk wyszukiwania kierowcy */}
      <div style={{ ...controlStyle, top: '160px' }}>
        <button
          onClick={() => setShowSearch(prev => !prev)}
          style={controlBtnStyle}
          title="Szukaj kierowcy"
        >
          <Search size={16} />
        </button>
      </div>

      {/* Panel wyszukiwania */}
      {showSearch && (
        <div style={{
          position: 'absolute',
          top: '160px',
          left: '48px',
          zIndex: 1000,
          backgroundColor: '#fff',
          border: '2px solid rgba(0,0,0,0.2)',
          borderRadius: '4px',
          boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
          width: '220px',
        }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Kod lub nazwa kierowcy..."
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              fontSize: '13px',
              border: 'none',
              outline: 'none',
              borderRadius: '2px',
              boxSizing: 'border-box',
              color: '#333',
              backgroundColor: '#fff',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{ borderTop: '1px solid #eee', maxHeight: '200px', overflowY: 'auto' }}>
              {searchResults.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => handleSelectDriver(driver)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    color: '#333',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{
                    background: getMarkerColor(driver.status),
                    color: '#fff',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}>
                    {driver.driverCode}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {driver.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: '12px', color: '#999' }}>
              Brak wyników
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MapPage;
