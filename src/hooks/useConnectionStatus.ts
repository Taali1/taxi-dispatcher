import { useState, useEffect } from 'react';

interface ConnectionStatus {
  isOnline: boolean;
  hasGPS: boolean;
  isConnected: boolean;
}

export const useConnectionStatus = () => {
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    hasGPS: false,
    isConnected: false,
  });

  useEffect(() => {
    const updateOnlineStatus = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: navigator.onLine,
        isConnected: navigator.onLine && prev.hasGPS,
      }));
    };

    const checkGPSStatus = () => {
      if (!navigator.geolocation) {
        setStatus((prev) => ({
          ...prev,
          hasGPS: false,
          isConnected: prev.isOnline && false,
        }));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        () => {
          setStatus((prev) => ({
            ...prev,
            hasGPS: true,
            isConnected: prev.isOnline && true,
          }));
        },
        () => {
          setStatus((prev) => ({
            ...prev,
            hasGPS: false,
            isConnected: prev.isOnline && false,
          }));
        },
        { timeout: 5000, maximumAge: 10000 }
      );
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    checkGPSStatus();
    const gpsInterval = setInterval(checkGPSStatus, 30000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(gpsInterval);
    };
  }, []);

  return status;
};
