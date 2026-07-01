import React from 'react';
import { MapPin, Clock, DollarSign, Phone } from 'lucide-react';

const OrdersList: React.FC = () => {
  const mockAssignedOrders = [
    {
      id: 'ORD004',
      customer: 'Tomasz Nowak',
      phone: '+48 123 456 789',
      pickup: 'ul. Karmelicka 20, Kraków',
      destination: 'Galeria Krakowska',
      time: '15:00',
      status: 'assigned',
      estimatedDuration: '15 min',
      cost: '22.50 zł',
    },
    {
      id: 'ORD005',
      customer: 'Ewa Kowalska',
      phone: '+48 987 654 321',
      pickup: 'Dworzec Główny',
      destination: 'ul. Długa 5, Kraków',
      time: '15:30',
      status: 'scheduled',
      estimatedDuration: '10 min',
      cost: '16.00 zł',
    },
  ];

  const getStatusBadge = (status: string) => {
    if (status === 'assigned') {
      return 'bg-green-600 text-white';
    }
    return 'bg-purple-600 text-white';
  };

  const getStatusText = (status: string) => {
    if (status === 'assigned') return 'Przydzielone';
    return 'Terminowe';
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Twoje Zlecenia</h3>

      <div className="space-y-4">
        {mockAssignedOrders.map((order) => (
          <div key={order.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-white font-medium">#{order.id}</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(order.status)}`}>
                    {getStatusText(order.status)}
                  </span>
                </div>
                <div className="text-sm text-slate-300">{order.customer}</div>
              </div>

              <div className="text-right">
                <div className="flex items-center space-x-1 text-sm text-slate-300">
                  <Clock className="w-4 h-4" />
                  <span>{order.time}</span>
                </div>
                <div className="text-green-400 font-bold">{order.cost}</div>
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-green-400 mt-0.5" />
                <div>
                  <span className="text-slate-300">Z: </span>
                  <span className="text-white">{order.pickup}</span>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-red-400 mt-0.5" />
                <div>
                  <span className="text-slate-300">Do: </span>
                  <span className="text-white">{order.destination}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-600">
              <div className="flex items-center space-x-2 text-sm text-slate-300">
                <Clock className="w-4 h-4" />
                <span>{order.estimatedDuration}</span>
              </div>

              <div className="flex space-x-2">
                <button className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200">
                  <Phone className="w-3 h-3" />
                  <span>Zadzwoń</span>
                </button>

                {order.status === 'assigned' && (
                  <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200">
                    Start
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {mockAssignedOrders.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            Brak przydzielonych zleceń
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersList;