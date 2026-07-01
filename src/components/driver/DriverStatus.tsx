import React from 'react';
import { Car, Home, Navigation, Clock, AlertCircle } from 'lucide-react';
import { driverQueueService } from '../../services/driverQueueService';

interface DriverStatusProps {
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  onStatusChange: (status: 'free' | 'driving' | 'pickup' | 'busy' | 'home') => void;
  zone: number;
  queuePosition: number;
  driverId?: string;
}

const DriverStatus: React.FC<DriverStatusProps> = ({ status, onStatusChange, zone, queuePosition, driverId }) => {
  const handleStatusClick = async (newStatus: 'free' | 'driving' | 'pickup' | 'busy' | 'home') => {
    if (driverId) {
      const result = await driverQueueService.updateDriverStatus(driverId, newStatus);
      if (result) {
        onStatusChange(newStatus);
      }
    } else {
      onStatusChange(newStatus);
    }
  };
  const statusOptions = [
    {
      id: 'free' as const,
      name: 'Wolny',
      icon: Car,
      hexColor: '#007a1e',
      description: 'Oczekuje w kolejce',
    },
    {
      id: 'driving' as const,
      name: 'Kursem',
      icon: Navigation,
      hexColor: '#0052cc',  // Kursem — bez zmian
      description: 'W drodze z pasażerem',
    },
    {
      id: 'pickup' as const,
      name: 'Dojazd',
      icon: Clock,
      hexColor: '#aa0000',
      description: 'Dojeżdża do miejsca',
    },
    {
      id: 'busy' as const,
      name: 'Zajęta',
      icon: AlertCircle,
      hexColor: '#8428bc',
      description: 'Zajęta kursem',
    },
    {
      id: 'home' as const,
      name: 'Dom',
      icon: Home,
      hexColor: '#6b7280',
      description: 'Nie pracuje',
    },
  ];

  return (
    <div className="bg-slate-800 rounded-[10px] p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">Status Kierowcy</h3>
      
      <div className="grid grid-cols-2 gap-3 mb-6">
        {statusOptions.map((option) => {
          const Icon = option.icon;
          const isActive = status === option.id;
          
          return (
            <button
              key={option.id}
              onClick={() => handleStatusClick(option.id)}
              className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                isActive
                  ? 'border-transparent text-white transform scale-105'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
              style={isActive ? { backgroundColor: option.hexColor } : {}}
            >
              <Icon className="w-6 h-6 mx-auto mb-2" />
              <div className="text-sm font-medium">{option.name}</div>
              <div className="text-xs opacity-80">{option.description}</div>
            </button>
          );
        })}
      </div>


      {status === 'driving' && (
        <div className="mt-4 bg-blue-900/50 border border-blue-500 rounded-lg p-4">
          <h4 className="text-blue-200 font-medium mb-3">Wybierz rejon docelowy</h4>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((zoneNum) => (
              <button
                key={zoneNum}
                onClick={() => {
                  if (driverId) {
                    driverQueueService.setDriverTargetZone(driverId, zoneNum);
                  }
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded text-sm font-medium transition-colors duration-200"
              >
                {zoneNum}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverStatus;