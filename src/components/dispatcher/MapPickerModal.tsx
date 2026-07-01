import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, Loader, MapPin, Check } from 'lucide-react';
import { settingsService } from '../../services/settingsService';
import 'leaflet/dist/leaflet.css';

// ─── Pin na mapie ─────────────────────────────────────────────────────────────

const createPickerPin = () => {
  const html = `
    <div style="width:34px;height:54px;">
      <svg width="34" height="54" viewBox="0 0 34 54" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">
        <path fill="#2563eb" d="M17 1C9 1 1 9 1 17c0 12 16 36 16 36s16-24 16-36C33 9 25 1 17 1z"/>
        <circle cx="17" cy="17" r="6" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: 'address-pin-marker',
    iconSize:   [34, 54],
    iconAnchor: [17, 54],
  });
};

// ─── Wewnętrzne komponenty Leaflet ────────────────────────────────────────────

const MapClickHandler: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
};

const MarkerLayer: React.FC<{ coords: [number, number] | null }> = ({ coords }) => {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    if (coords) {
      markerRef.current = L.marker(coords, { icon: createPickerPin() }).addTo(map);
      map.flyTo(coords, Math.max(map.getZoom(), 16), { duration: 0.5 });
    }
    return () => { markerRef.current?.remove(); };
  }, [coords, map]);

  return null;
};

const CenterMap: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  const applied = useRef(false);
  useEffect(() => {
    if (!applied.current) { map.setView(center, 13); applied.current = true; }
  }, [map, center]);
  return null;
};

// ─── Reverse geocoding ────────────────────────────────────────────────────────

const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  const res  = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
  );
  const data = await res.json();
  const road     = data.address?.road || '';
  const num      = data.address?.house_number || '';
  const street   = num ? `${road} ${num}` : road;
  const city     = data.address?.city || data.address?.town || data.address?.village || '';
  const postcode = data.address?.postcode || '';
  const location = postcode && city ? `${postcode} ${city}` : city;
  return street && location ? `${street}, ${location}` : street || data.display_name || '';
};

// ─── Komponent główny ─────────────────────────────────────────────────────────

interface MapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, lat: number, lng: number) => void;
  title: string;
  /** Opcjonalne współrzędne startowe (np. już wybrany adres) */
  initialCoords?: { lat: number; lng: number } | null;
}

const MapPickerModal: React.FC<MapPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  initialCoords,
}) => {
  const [center, setCenter]   = useState<[number, number]>([52.2297, 21.0122]);
  const [picked, setPicked]   = useState<[number, number] | null>(null);
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Wycentruj na mieście bazowym z ustawień (lub na przekazanych coords)
  useEffect(() => {
    if (!isOpen) return;
    setPicked(null);
    setAddress('');

    if (initialCoords) {
      setCenter([initialCoords.lat, initialCoords.lng]);
      return;
    }

    (async () => {
      try {
        const s = await settingsService.getSettings();
        if (s.baseCity) {
          const params = new URLSearchParams({ q: s.baseCity, format: 'json', limit: '1', countrycodes: 'PL' });
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?${params}`,
            { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
          );
          const data = await res.json();
          if (data.length > 0) setCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        }
      } catch { /* zostaje domyślne centrum */ }
    })();
  }, [isOpen, initialCoords]);

  const handlePick = async (lat: number, lng: number) => {
    setPicked([lat, lng]);
    setLoading(true);
    setAddress('');
    try {
      const addr = await reverseGeocode(lat, lng);
      setAddress(addr);
    } catch {
      setAddress('');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (picked && address) {
      onConfirm(address, picked[0], picked[1]);
      handleClose();
    }
  };

  const handleClose = () => {
    setPicked(null);
    setAddress('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center">
      {/* Tło */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Okno modalu */}
      <div className="relative z-10 bg-white dark:bg-[#2d2d2d] rounded-xl shadow-2xl flex flex-col overflow-hidden"
           style={{ width: '700px', maxWidth: '95vw', height: '520px', maxHeight: '90vh' }}>

        {/* Nagłówek */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#7a7a7a] shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm text-black dark:text-white">{title}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#434343] transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-300" />
          </button>
        </div>

        {/* Mapa */}
        <div className="flex-1 relative" style={{ cursor: 'crosshair' }}>
          <MapContainer
            center={center}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CenterMap center={center} />
            <MapClickHandler onPick={handlePick} />
            <MarkerLayer coords={picked} />
          </MapContainer>

          {/* Instrukcja */}
          {!picked && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] bg-black/65 text-white text-xs px-3 py-2 rounded-full pointer-events-none whitespace-nowrap">
              Kliknij na mapie aby zaznaczyć lokalizację
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-[#7a7a7a] shrink-0 flex items-center gap-3">
          {/* Status / adres */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                <Loader className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Wykrywanie adresu...</span>
              </div>
            ) : address ? (
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-sm text-black dark:text-white truncate">{address}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400 dark:text-gray-300">
                Brak wybranej lokalizacji
              </span>
            )}
          </div>

          {/* Przyciski */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-[#383838] hover:bg-gray-200 dark:hover:bg-[#585858] text-gray-700 dark:text-gray-200 rounded-md transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleConfirm}
              disabled={!picked || !address || loading}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Wybierz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapPickerModal;
