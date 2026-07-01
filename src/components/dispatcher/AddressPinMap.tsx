import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface Coords {
  lat: number;
  lng: number;
}

const createPinIcon = (type: 'pickup' | 'destination') => {
  const isPickup = type === 'pickup';
  const color = isPickup ? '#ef4444' : '#3b82f6';
  const label = isPickup ? 'A' : 'B';

  const html = `
    <div class="address-pin-drop" style="width:30px;height:42px;position:relative;">
      <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.45));">
        <path d="M15 1C7.3 1 1 7.3 1 15c0 9.5 14 24 14 24S29 24.5 29 15C29 7.3 22.7 1 15 1z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="15" cy="15" r="7" fill="white" opacity="0.95"/>
        <text x="15" y="19.5" text-anchor="middle" font-size="10" font-weight="800"
              font-family="-apple-system,sans-serif" fill="${color}">${label}</text>
      </svg>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'address-pin-marker',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -44],
  });
};

// ─── Inner map controller ─────────────────────────────────────────────────────

const MapController: React.FC<{
  pickupCoords: Coords | null;
  destinationCoords: Coords | null;
}> = ({ pickupCoords, destinationCoords }) => {
  const map = useMap();
  const pickupRef = useRef<L.Marker | null>(null);
  const destRef = useRef<L.Marker | null>(null);

  // Pickup marker
  useEffect(() => {
    if (pickupRef.current) {
      pickupRef.current.remove();
      pickupRef.current = null;
    }
    if (pickupCoords) {
      pickupRef.current = L.marker(
        [pickupCoords.lat, pickupCoords.lng],
        { icon: createPinIcon('pickup') }
      )
        .bindPopup('<b style="color:#ef4444">Adres odbioru</b>')
        .addTo(map);
    }
    return () => {
      if (pickupRef.current) {
        pickupRef.current.remove();
        pickupRef.current = null;
      }
    };
  }, [pickupCoords, map]);

  // Destination marker
  useEffect(() => {
    if (destRef.current) {
      destRef.current.remove();
      destRef.current = null;
    }
    if (destinationCoords) {
      destRef.current = L.marker(
        [destinationCoords.lat, destinationCoords.lng],
        { icon: createPinIcon('destination') }
      )
        .bindPopup('<b style="color:#3b82f6">Adres docelowy</b>')
        .addTo(map);
    }
    return () => {
      if (destRef.current) {
        destRef.current.remove();
        destRef.current = null;
      }
    };
  }, [destinationCoords, map]);

  // Fly to location(s)
  useEffect(() => {
    if (pickupCoords && destinationCoords) {
      const bounds = L.latLngBounds(
        [pickupCoords.lat, pickupCoords.lng],
        [destinationCoords.lat, destinationCoords.lng]
      );
      map.flyToBounds(bounds, { padding: [55, 55], duration: 0.9, easeLinearity: 0.4 });
    } else if (pickupCoords) {
      map.flyTo([pickupCoords.lat, pickupCoords.lng], 16, {
        duration: 0.85,
        easeLinearity: 0.4,
      });
    } else if (destinationCoords) {
      map.flyTo([destinationCoords.lat, destinationCoords.lng], 16, {
        duration: 0.85,
        easeLinearity: 0.4,
      });
    }
  }, [pickupCoords, destinationCoords, map]);

  return null;
};

// ─── Public component ─────────────────────────────────────────────────────────

interface AddressPinMapProps {
  pickupCoords: Coords | null;
  destinationCoords: Coords | null;
}

const DEFAULT_CENTER: [number, number] = [50.0647, 19.945];

const AddressPinMap: React.FC<AddressPinMapProps> = ({ pickupCoords, destinationCoords }) => {
  const hasAny = !!(pickupCoords || destinationCoords);

  return (
    <div className="bg-[#f6f6f6] dark:bg-[#2d2d2d] rounded-md border border-gray-300 dark:border-[#696969] overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-300 dark:border-[#696969] flex items-center gap-2">
        <MapPin className="w-4 h-4 text-blue-500 dark:text-blue-400" />
        <span className="text-sm font-medium text-black dark:text-white">Podgląd trasy</span>
        {pickupCoords && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            Odbiór
          </span>
        )}
        {destinationCoords && (
          <span className={`flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 ${!pickupCoords ? 'ml-auto' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
            Cel
          </span>
        )}
      </div>

      <div className="relative" style={{ height: '260px' }}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController pickupCoords={pickupCoords} destinationCoords={destinationCoords} />
        </MapContainer>

        {!hasAny && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-[#2d2d2d]/70 z-10 pointer-events-none">
            <MapPin className="w-8 h-8 text-gray-400 dark:text-gray-300 mb-1.5" />
            <p className="text-gray-400 dark:text-gray-300 text-xs text-center px-4">
              Wpisz adres odbioru, aby zobaczyć lokalizację na mapie
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddressPinMap;
