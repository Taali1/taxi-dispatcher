import React, { useState, useEffect } from 'react';
import { MapPin, AlertCircle, CheckCircle } from 'lucide-react';

interface GPSStatus {
  available: boolean;
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  lastUpdate: Date | null;
  error: string | null;
}

export const GPSStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<GPSStatus>({
    available: false,
    position: null,
    accuracy: null,
    lastUpdate: null,
    error: null
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus(prev => ({ ...prev, available: false, error: 'GPS niedostępny' }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setStatus({
          available: true,
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          },
          accuracy: position.coords.accuracy,
          lastUpdate: new Date(),
          error: null
        });
      },
      (error) => {
        setStatus(prev => ({
          ...prev,
          available: false,
          error: error.message
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!status.available) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <div className="text-sm">
          <div className="font-medium text-red-700">GPS nieaktywny</div>
          {status.error && <div className="text-red-600 text-xs">{status.error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      <CheckCircle className="w-5 h-5 text-green-500" />
      <div className="text-sm">
        <div className="font-medium text-green-700 flex items-center gap-2">
          GPS aktywny
          <MapPin className="w-4 h-4" />
        </div>
        {status.position && (
          <div className="text-green-600 text-xs">
            {status.position.lat.toFixed(6)}, {status.position.lng.toFixed(6)}
            {status.accuracy && ` (±${Math.round(status.accuracy)}m)`}
          </div>
        )}
        {status.lastUpdate && (
          <div className="text-green-500 text-xs">
            Aktualizacja: {status.lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
