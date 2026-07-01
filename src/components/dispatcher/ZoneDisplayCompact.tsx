import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getMarkerColor, isDriverActive, type DriverStatus } from '../../constants/driverColors';
import { dispatcherZoneService } from '../../services/dispatcherZoneService';
import { zoneService } from '../../services/zoneService';
import { dataSourceService } from '../../services/dataSourceService';

interface ZoneData {
  id: string;
  name: string;
  number: number;
}

interface DriverData {
  id: string;
  name: string;
  driverCode: string;
  currentZone?: number;
  status: DriverStatus;
}

const ZoneDisplayCompact: React.FC = () => {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      if (dataSourceService.isUsingExternalDatabase()) {
        const dbZones = await zoneService.getZones();
        setZones(dbZones.map(z => ({ id: z.id, name: z.name, number: z.number }))
          .sort((a, b) => a.number - b.number));

        // Backend teraz automatycznie wykrywa strefy - tylko pobieramy dane
        const dbDrivers = await dispatcherZoneService.getAllDriversWithZones();
        const activeDrivers = dbDrivers
          .filter(d => {
            const s = (d.status || 'home') as DriverStatus;
            return isDriverActive(s) && d.currentZone;
          })
          .map(d => ({
            id: d.id,
            name: d.name,
            driverCode: d.driverCode,
            currentZone: d.currentZone ?? undefined,
            status: (d.status || 'home') as DriverStatus,
          }));
        setDrivers(activeDrivers);
      } else {
        const zonesData = localStorage.getItem('taxi_zones');
        if (zonesData) {
          const parsedZones = JSON.parse(zonesData);
          setZones(parsedZones.sort((a: ZoneData, b: ZoneData) => a.number - b.number));
        }

        const usersData = localStorage.getItem('taxi_users_data');
        if (usersData) {
          const parsedUsers = JSON.parse(usersData);
          if (parsedUsers.drivers) {
            const activeDrivers = parsedUsers.drivers.filter(
              (driver: DriverData) => {
                const driverStatus = driver.status || 'home';
                return isDriverActive(driverStatus) && driver.currentZone;
              }
            );
            setDrivers(activeDrivers);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDriversInZone = (zoneNumber: number): DriverData[] => {
    return drivers.filter(driver => driver.currentZone === zoneNumber);
  };

  const getTotalDrivers = () => {
    return drivers.length;
  };

  if (loading && zones.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-300">Ladowanie rejonow...</p>
        </div>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="bg-[#2e2e2e] rounded-lg p-4 border border-[#4c4c4c]">
        <div className="text-center py-4 text-gray-400 text-sm">
          Brak rejonow. Administrator musi najpierw utworzyc rejony.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Wszystkich rejonow: <span className="font-semibold text-white">{zones.length}</span>
          {' | '}
          Zalogowanych kierowcow: <span className="font-semibold text-green-400">{getTotalDrivers()}</span>
        </div>
        <button
          onClick={loadData}
          className="flex items-center space-x-1 text-sm bg-[#2e2e2e] hover:bg-[#3a3a3a] text-white px-3 py-1 rounded transition-colors duration-200"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Odswiez</span>
        </button>
      </div>

      <div className="bg-[#2e2e2e] rounded-lg p-4 border border-[#4c4c4c]">
        <div className="space-y-3">
          {zones.map((zone) => {
            const zoneDrivers = getDriversInZone(zone.number);

            return (
              <div key={zone.id} className="flex items-center space-x-2 flex-wrap">
                <div
                  className="bg-[#242424] border-2 border-blue-500 rounded-lg px-4 py-3 min-w-[70px] flex items-center justify-center"
                  title={zone.name}
                >
                  <span className="text-white font-bold text-lg">{zone.number}</span>
                </div>

                {zoneDrivers.length > 0 ? (
                  <div className="flex items-center space-x-2 flex-wrap">
                    {zoneDrivers.map((driver) => {
                      const bgColor = getMarkerColor(driver.status);
                      return (
                        <div
                          key={driver.id}
                          className="hover:opacity-80 rounded-lg px-3 py-2 min-w-[60px] flex items-center justify-center cursor-pointer transition-all duration-200"
                          style={{ backgroundColor: bgColor }}
                          title={`${driver.name} - Kod: ${driver.driverCode} - Status: ${driver.status}`}
                        >
                          <span className="text-white font-medium text-sm">{driver.driverCode}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-gray-400 text-xs italic">
                    Brak kierowcow
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ZoneDisplayCompact;
