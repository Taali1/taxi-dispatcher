import React, { useState, useEffect } from 'react';
import { MapPin, Hash, CheckCircle, XCircle, Clock, User, Circle } from 'lucide-react';
import { Region, TaxiCode } from '../../types';
import { Driver } from '../../types/users';
import { regionService } from '../../services/regionService';
import { userService } from '../../services/userService';
import ZoneDisplayCompact from './ZoneDisplayCompact';

const TaxiTab: React.FC = () => {
  const [regionsWithCodes, setRegionsWithCodes] = useState<(Region & { taxiCodes: TaxiCode[]; drivers: Driver[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const regionsData = await regionService.getRegionsWithTaxiCodes();
      const driversData = userService.getUsersByRole<Driver>('driver');

      setAllDrivers(driversData);

      const regionsWithDrivers = regionsData.map(region => {
        const regionDrivers = driversData.filter(
          driver => driver.currentZone === region.number && driver.status === 'active'
        );
        return {
          ...region,
          drivers: regionDrivers
        };
      });

      setRegionsWithCodes(regionsWithDrivers);
    } catch (err) {
      console.error('Error loading regions and taxi codes:', err);
      setError('Nie udało się załadować danych. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      available: { bg: 'bg-green-600', text: 'Dostępny', icon: CheckCircle },
      assigned: { bg: 'bg-blue-600', text: 'Przydzielony', icon: Clock },
      inactive: { bg: 'bg-gray-600', text: 'Nieaktywny', icon: XCircle },
    };
    return badges[status as keyof typeof badges] || badges.inactive;
  };

  const getDriverStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; dotColor: string; text: string }> = {
      free:    { color: '#00bb2f', dotColor: '#00bb2f', text: 'Wolna' },
      driving: { color: '#0052cc', dotColor: '#0052cc', text: 'Kursem' },
      pickup:  { color: '#cc0000', dotColor: '#cc0000', text: 'Dojazd' },
      busy:    { color: '#663366', dotColor: '#663366', text: 'Zajęta' },
      home:    { color: '#6b7280', dotColor: '#6b7280', text: 'Dom' },
    };
    return badges[status] ?? badges.home;
  };

  const getTotalDrivers = () => {
    return regionsWithCodes.reduce((sum, region) => sum + region.drivers.length, 0);
  };

  const getTotalCodes = () => {
    return regionsWithCodes.reduce((sum, region) => sum + region.taxiCodes.length, 0);
  };

  const getDriverName = (driverId?: string) => {
    if (!driverId) return null;
    const drivers = userService.getUsersByRole('driver');
    const driver = drivers.find(d => d.id === driverId);
    return driver?.name || driverId;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Ładowanie danych...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  if (regionsWithCodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-gray-400 dark:text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 mb-2">Brak rejonów</p>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Administrator musi najpierw utworzyć rejony i kody taxi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ZoneDisplayCompact />

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Wszystkich rejonów: <span className="font-semibold text-black dark:text-white">{regionsWithCodes.length}</span>
          {' | '}
          Zalogowanych kierowców: <span className="font-semibold text-black dark:text-white">{getTotalDrivers()}</span>
          {' | '}
          Wszystkich kodów: <span className="font-semibold text-black dark:text-white">{getTotalCodes()}</span>
        </div>
        <button
          onClick={loadData}
          className="text-sm bg-[#2e2e2e] hover:bg-[#3a3a3a] text-white px-3 py-1 rounded transition-colors duration-200"
        >
          Odśwież
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {regionsWithCodes.map((region) => (
          <div
            key={region.id}
            className="bg-gray-200 dark:bg-[#383838] rounded-lg p-4 border border-gray-300 dark:border-[#7a7a7a]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">
                  {region.number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">
                    {region.name}
                  </h3>
                  {region.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {region.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex space-x-6">
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Kierowcy
                  </div>
                  <div className="text-2xl font-bold text-green-500">
                    {region.drivers.length}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Kody taxi
                  </div>
                  <div className="text-2xl font-bold text-black dark:text-white">
                    {region.taxiCodes.length}
                  </div>
                </div>
              </div>
            </div>

            {region.drivers.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-300 text-sm">
                Brak zalogowanych kierowców w tym rejonie
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {region.drivers.map((driver) => {
                  const statusBadge = getDriverStatusBadge(driver.status || 'free');

                  return (
                    <div
                      key={driver.id}
                      className="bg-gray-100 dark:bg-[#2d2d2d] rounded p-3 border border-gray-200 dark:border-[#7a7a7a]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <User className="w-8 h-8 text-blue-400" />
                            <Circle className="w-3 h-3 absolute -top-1 -right-1 fill-current" style={{ color: statusBadge.dotColor }} />
                          </div>
                          <div>
                            <div className="font-semibold text-black dark:text-white">
                              {driver.name}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              Kod: <span className="font-mono">{driver.driverCode}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-1 text-white px-2 py-1 rounded text-xs mb-1" style={{ backgroundColor: statusBadge.color }}>
                            <span>{statusBadge.text}</span>
                          </div>
                          {driver.rating && (
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              ⭐ {driver.rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </div>
                      {driver.lastLocationUpdate && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                          Aktualizacja: {new Date(driver.lastLocationUpdate).toLocaleTimeString('pl-PL')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaxiTab;
