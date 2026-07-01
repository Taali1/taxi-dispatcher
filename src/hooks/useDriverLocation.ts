import { useState, useEffect } from 'react';

interface Location {
  lat: number;
  lng: number;
}

export const useDriverLocation = () => {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolokalizacja nie jest dostępna w tej przeglądarce');
      setIsLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setError(null);
        setIsLoading(false);
      },
      (err) => {
        setError('Nie można pobrać lokalizacji: ' + err.message);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, error, isLoading };
};