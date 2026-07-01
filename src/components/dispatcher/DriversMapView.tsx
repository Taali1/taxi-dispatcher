import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RefreshCw, MapPin, Eye, EyeOff } from 'lucide-react';
import { getMarkerColor, getDriverStatusLabel } from '../../constants/driverColors';
import ColorLegend from '../common/ColorLegend';
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
  status: string;
  driverState: string | null;
  currentZone: number | null;
  lat: number;
  lng: number;
  isOnline: boolean;
}

const statusFromState = (driverState: string | null, status: string): string => {
  if (!driverState && status === 'active') return 'home';
  if (driverState === 'free') return 'free';
  if (driverState === 'approaching') return 'pickup';
  if (driverState === 'in_transit') return 'driving';
  if (driverState === 'busy') return 'busy';
  if (status === 'inactive') return 'home';
  return 'home';
};

const DriverMarkers: React.FC<{ drivers: DriverOnMap[]; visible: boolean }> = ({ drivers, visible }) => {
  const map = useMap();
  const markersRef = React.useRef<L.Marker[]>([]);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!visible) return;

    drivers.forEach(driver => {
      const mappedStatus = statusFromState(driver.driverState, driver.status);
      const color = getMarkerColor(mappedStatus as any);
      const statusLabel = getDriverStatusLabel(mappedStatus as any);

      const icon = L.divIcon({
        html: `<div style="
          background:${color};color:white;padding:4px 8px;border-radius:4px;
          font-size:13px;font-weight:bold;border:2px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);text-align:center;
          min-width:40px;white-space:nowrap;">${driver.driverCode}</div>`,
        className: 'driver-map-marker',
        iconSize: [50, 28],
        iconAnchor: [25, 14],
      });

      const marker = L.marker([driver.lat, driver.lng], { icon });

      marker.bindPopup(`
        <div style="min-width:150px;">
          <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${driver.name}</div>
          <div style="font-size:12px;color:#666;margin-bottom:4px;">Kod: ${driver.driverCode}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-size:12px;">${statusLabel}</span>
          </div>
          ${driver.currentZone ? `<div style="font-size:11px;color:#888;">Rejon: ${driver.currentZone}</div>` : ''}
          <div style="font-size:11px;color:#888;">Online: ${driver.isOnline ? 'Tak' : 'Nie'}</div>
        </div>
      `);

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, drivers, visible]);

  return null;
};

const DriversMapView: React.FC = () => {
  const [drivers, setDrivers] = useState<DriverOnMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrivers, setShowDrivers] = useState(true);
  const [mapCenter] = useState<[number, number]>([50.0647, 19.9450]);

  useEffect(() => {
    loadDrivers();
    const interval = setInterval(loadDrivers, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadDrivers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/drivers/map');
      if (!res.ok) throw new Error('Błąd pobierania danych');
      const data = await res.json();
      if (data.success) setDrivers(data.data);
    } catch (error) {
      console.error('Error loading drivers for map:', error);
    } finally {
      setLoading(false);
    }
  };

  const driversWithLocation = drivers.filter(d => d.lat !== 0 && d.lng !== 0);
  const counts = {
    total: drivers.length,
    withLocation: driversWithLocation.length,
    free: driversWithLocation.filter(d => d.driverState === 'free').length,
    driving: driversWithLocation.filter(d => d.driverState === 'in_transit').length,
    pickup: driversWithLocation.filter(d => d.driverState === 'approaching').length,
    busy: driversWithLocation.filter(d => d.driverState === 'busy').length,
    home: driversWithLocation.filter(d => !d.driverState).length,
  };

  return (
    <div className="bg-[#242424] rounded-xl border border-[#3d3d3d] overflow-hidden">
      <div className="p-4 border-b border-[#3d3d3d]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Mapa kierowców</h3>
              <p className="text-sm text-gray-400">
                {counts.withLocation} z {counts.total} kierowców z GPS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDrivers(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                showDrivers
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-[#2e2e2e] hover:bg-[#3a3a3a] text-gray-400'
              }`}
              title={showDrivers ? 'Ukryj kierowców' : 'Pokaż kierowców'}
            >
              {showDrivers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showDrivers ? 'Kierowcy widoczni' : 'Kierowcy ukryci'}</span>
            </button>
            <button
              onClick={loadDrivers}
              disabled={loading}
              className="flex items-center gap-2 bg-[#2e2e2e] hover:bg-[#3a3a3a] text-white px-3 py-2 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm">Odśwież</span>
            </button>
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#00bb2f' }}></span>
            <span className="text-gray-200">Wolna: {counts.free}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0052cc' }}></span>
            <span className="text-gray-200">Kursem: {counts.driving}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#cc0000' }}></span>
            <span className="text-gray-200">Dojazd: {counts.pickup}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#663366' }}></span>
            <span className="text-gray-200">Zajęta: {counts.busy}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#6b7280' }}></span>
            <span className="text-gray-200">Dom: {counts.home}</span>
          </div>
        </div>
      </div>

      <div style={{ height: '600px' }} className="relative">
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DriverMarkers drivers={driversWithLocation} visible={showDrivers} />
        </MapContainer>

        {showDrivers && driversWithLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#242424]/80 z-10">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-400">Brak kierowców z lokalizacją GPS</p>
              <p className="text-gray-500 text-sm mt-1">Kierowcy muszą włączyć GPS w aplikacji</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[#3d3d3d]">
        <ColorLegend compact={true} showHomeStatus={true} />
      </div>
    </div>
  );
};

export default DriversMapView;
