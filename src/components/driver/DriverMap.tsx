import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { driverLocationService } from '../../services/driverLocationService';
import { userService } from '../../services/userService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { MapPin, Navigation, Compass } from 'lucide-react';

interface Location {
  lat: number;
  lng: number;
}

interface DriverMapProps {
  location: Location | null;
}

const DriverMap: React.FC<DriverMapProps> = ({ location }) => {
  const { user } = useAuth();
  const [currentZone, setCurrentZone] = React.useState<number | null>(null);
  const [zoneEntryTime, setZoneEntryTime] = React.useState<string | null>(null);
  const [isDetectingZone, setIsDetectingZone] = React.useState(false);
  const [address, setAddress] = React.useState<{street: string, city: string} | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = React.useState(false);

  React.useEffect(() => {
    if (location) {
      detectCurrentZone(location);
      fetchAddress(location);
    }
  }, [location]);

  const fetchAddress = async (location: { lat: number; lng: number }) => {
    setIsLoadingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&zoom=18&addressdetails=1`
      );
      const data = await response.json();

      if (data.address) {
        const street = data.address.road || data.address.street || 'Nieznana ulica';
        const houseNumber = data.address.house_number || '';
        const city = data.address.city || data.address.town || data.address.village || 'Nieznane miasto';

        setAddress({
          street: houseNumber ? `${street} ${houseNumber}` : street,
          city: city
        });
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      setAddress(null);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const detectCurrentZone = (location: { lat: number; lng: number }) => {
    setIsDetectingZone(true);
    try {
      // Load zones from localStorage
      const storedZones = localStorage.getItem('taxi_zones');
      if (storedZones) {
        const zones = JSON.parse(storedZones);
        
        if (zones.length > 0) {
          const zoneDetection = new ZoneDetectionService(zones);
          const detectedZone = zoneDetection.detectZoneFromCoordinates(location.lat, location.lng);
          
          // Check if zone changed
          if (detectedZone !== currentZone) {
            setCurrentZone(detectedZone);
            const entryTime = new Date().toISOString();
            setZoneEntryTime(entryTime);
            
            // Update driver in database
            if (user?.id && detectedZone) {
              userService.updateDriver(user.id, {
                currentZone: detectedZone,
                lastLocationUpdate: entryTime,
                currentLocation: location,
              });
              console.log(`Driver ${user.id} entered zone ${detectedZone} at ${entryTime}`);
            }
          }
        } else {
          console.log('No zones defined in system');
          setCurrentZone(null);
        }
      } else {
        console.log('No zones found in localStorage');
        setCurrentZone(null);
      }
    } catch (error) {
      console.error('Error detecting zone:', error);
      setCurrentZone(null);
    } finally {
      setIsDetectingZone(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (!user?.id) return;
    
    try {
      const newLocation = await driverLocationService.updateLocationNow(user.id);
      if (newLocation) {
        // Location will be updated in the parent component through the existing useEffect
        console.log('Location updated successfully');
      }
    } catch (error) {
      console.error('Error refreshing location:', error);
      alert('Błąd podczas odświeżania lokalizacji');
    }
  };

  return (
    <div className="bg-slate-800 rounded-[10px] p-6 border border-slate-700">
      <h3 className="flex items-center space-x-2 text-lg font-semibold text-white mb-4">
        <Compass className="w-5 h-5 text-blue-400" />
        <span>Lokalizacja GPS</span>
      </h3>

      <div className="bg-slate-700 rounded-lg h-64 flex items-center justify-center mb-4 relative overflow-hidden">
        {location ? (
          <div className="text-center px-4">
            <Navigation className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <div className="text-white font-medium mb-2">Pozycja aktualna</div>
            {isLoadingAddress ? (
              <div className="text-sm text-slate-400 mb-2">Ładowanie adresu...</div>
            ) : address ? (
              <>
                <div className="text-base font-semibold text-white mb-1">
                  {address.street}
                </div>
                <div className="text-sm text-slate-300 mb-2">
                  {address.city}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 mb-2">Brak adresu</div>
            )}
            <div className="text-sm text-slate-300">
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <MapPin className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <div className="text-slate-400">Pobieranie lokalizacji...</div>
          </div>
        )}
        
        {/* Mock map overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-green-900/20 pointer-events-none" />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
          <span className="text-slate-300 text-sm">Dokładność GPS</span>
          <span className="text-green-400 font-medium">±3m</span>
        </div>
        
        <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
          <span className="text-slate-300 text-sm">Ostatnia aktualizacja</span>
          <span className="text-white font-medium">Teraz</span>
        </div>
        
        <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
          <span className="text-slate-300 text-sm">Aktualny rejon</span>
          <span className="text-white font-medium">
            {isDetectingZone ? (
              'Wykrywanie...'
            ) : currentZone ? (
              `Rejon ${currentZone}`
            ) : (
              'Poza rejonami'
            )}
          </span>
        </div>
        
        {currentZone && zoneEntryTime && (
          <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
            <span className="text-slate-300 text-sm">Na rejonie od</span>
            <span className="text-green-400 font-medium text-sm">
              {new Date(zoneEntryTime).toLocaleTimeString('pl-PL', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
        )}

        <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors duration-200 text-sm">
          <span onClick={handleRefreshLocation}>Odśwież lokalizację</span>
        </button>
      </div>
    </div>
  );
};

export default DriverMap;