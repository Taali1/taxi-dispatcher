import React, { useState, useEffect } from 'react';
import { Clock, Car, Home, MapPin, AlertCircle, CheckCircle, AlertOctagon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { driverQueueService } from '../../services/driverQueueService';

export function DriverStatusDisplay() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'free' | 'driving' | 'pickup' | 'busy' | 'home' | null>(null);
  const [statusDuration, setStatusDuration] = useState<string>('0m');
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [currentZone, setCurrentZone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      console.error('[DriverStatusDisplay] Brak user.id');
      setLoading(false);
      return;
    }

    const updateStatus = async () => {
      try {
        const driverStatus = await driverQueueService.getDriverStatus(user.id);

        if (driverStatus) {
          setStatus(driverStatus.status);
          setStatusDuration(driverStatus.statusDuration || '0m');
          setQueuePosition(driverStatus.queuePosition);
          setCurrentZone(driverStatus.currentZone);
        } else {
          setStatus(null);
        }
        setLoading(false);
      } catch (error) {
        console.error('[DriverStatusDisplay] Błąd pobierania statusu:', error);
        setStatus(null);
        setLoading(false);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 2000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const getStatusConfig = () => {
    switch (status) {
      case 'free':
        return {
          icon: CheckCircle,
          label: 'WOLNA',
          color: 'text-[#00bb2f]',
          bgColor: 'bg-[#00bb2f]/10',
          borderColor: 'border-[#00bb2f]',
          description: queuePosition
            ? `Pozycja w kolejce: #${queuePosition}`
            : 'Oczekujesz na zlecenie'
        };
      case 'driving':
        return {
          icon: Car,
          label: 'KURSEM',
          color: 'text-[#0052cc]',
          bgColor: 'bg-[#0052cc]/10',
          borderColor: 'border-[#0052cc]',
          description: 'Realizujesz kurs'
        };
      case 'pickup':
        return {
          icon: MapPin,
          label: 'DOJAZD',
          color: 'text-[#cc0000]',
          bgColor: 'bg-[#cc0000]/10',
          borderColor: 'border-[#cc0000]',
          description: 'Jadę po klienta'
        };
      case 'busy':
        return {
          icon: AlertOctagon,
          label: 'ZAJĘTA',
          color: 'text-[#663366]',
          bgColor: 'bg-[#663366]/10',
          borderColor: 'border-[#663366]',
          description: 'Zajęta kursem'
        };
      case 'home':
        return {
          icon: Home,
          label: 'W DOMU',
          color: 'text-slate-400',
          bgColor: 'bg-slate-800/50',
          borderColor: 'border-slate-600',
          description: 'Nieaktywny'
        };
      default:
        return {
          icon: AlertCircle,
          label: 'BRAK STATUSU',
          color: 'text-red-400',
          bgColor: 'bg-red-900/30',
          borderColor: 'border-red-500',
          description: 'Status nie został ustawiony'
        };
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-6 mb-4">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-slate-400">Ładowanie statusu...</span>
        </div>
      </div>
    );
  }

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <div className={`${config.bgColor} border-2 ${config.borderColor} rounded-lg p-6 mb-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-8 h-8 ${config.color}`} />
          <div>
            <h2 className={`text-2xl font-bold ${config.color}`}>
              {config.label}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {config.description}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Clock className="w-4 h-4" />
            <span>Czas trwania</span>
          </div>
          <div className={`text-3xl font-bold ${config.color}`}>
            {statusDuration}
          </div>
        </div>
      </div>

      {currentZone && (
        <div className="flex items-center gap-2 text-slate-400 text-sm pt-3 border-t border-slate-700">
          <MapPin className="w-4 h-4" />
          <span>Aktualny rejon: <span className="font-semibold text-white">Rejon {currentZone}</span></span>
        </div>
      )}

      {!status && (
        <div className="mt-4 p-4 bg-red-900/20 border border-red-700 rounded">
          <p className="text-red-400 text-sm">
            ⚠️ Twój status nie jest ustawiony. Kliknij jeden z przycisków poniżej, aby ustawić status.
          </p>
        </div>
      )}
    </div>
  );
}
