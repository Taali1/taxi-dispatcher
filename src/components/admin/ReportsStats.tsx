import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, MapPin, Clock, DollarSign } from 'lucide-react';

const ReportsStats: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    from: '2025-01-01',
    to: '2025-01-16',
  });

  const stats = {
    totalOrders: 1247,
    completedOrders: 1189,
    cancelledOrders: 58,
    totalRevenue: 87420.25,
    activeDrivers: 24,
    averageWaitTime: 4.2,
    customerSatisfaction: 4.7,
    peakHours: '16:00-18:00',
  };

  const hourlyData = [
    { hour: '06:00', orders: 12 },
    { hour: '08:00', orders: 45 },
    { hour: '10:00', orders: 78 },
    { hour: '12:00', orders: 95 },
    { hour: '14:00', orders: 110 },
    { hour: '16:00', orders: 145 },
    { hour: '18:00', orders: 132 },
    { hour: '20:00', orders: 89 },
    { hour: '22:00', orders: 34 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Statystyki i Raporty</h2>
          <p className="text-gray-300">Analiza wydajności i przegląd danych</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-300">-</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-4">
            <BarChart3 className="w-8 h-8 text-blue-400" />
            <div className="text-green-400 text-sm font-medium">+12%</div>
          </div>
          <div className="text-gray-300 text-sm">Łączne zlecenia</div>
          <div className="text-2xl font-bold text-white">{stats.totalOrders}</div>
        </div>
        
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-8 h-8 text-green-400" />
            <div className="text-green-400 text-sm font-medium">+8%</div>
          </div>
          <div className="text-gray-300 text-sm">Łączne przychody</div>
          <div className="text-2xl font-bold text-white">{stats.totalRevenue.toFixed(0)} zł</div>
        </div>
        
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 text-purple-400" />
            <div className="text-green-400 text-sm font-medium">+2</div>
          </div>
          <div className="text-gray-300 text-sm">Aktywni kierowcy</div>
          <div className="text-2xl font-bold text-white">{stats.activeDrivers}</div>
        </div>
        
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-orange-400" />
            <div className="text-green-400 text-sm font-medium">-0.8min</div>
          </div>
          <div className="text-gray-300 text-sm">Średni czas oczekiwania</div>
          <div className="text-2xl font-bold text-white">{stats.averageWaitTime} min</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">Zlecenia w ciągu dnia</h3>
          
          <div className="space-y-2">
            {hourlyData.map((data) => (
              <div key={data.hour} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm w-12">{data.hour}</span>
                <div className="flex-1 mx-4">
                  <div className="bg-[#272727] h-6 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${(data.orders / 145) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-white font-medium w-8 text-right">{data.orders}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">Wydajność Rejonów</h3>
          
          <div className="space-y-4">
            {stats.topZones?.map((zone, index) => (
              <div key={zone.zone} className="flex items-center justify-between p-3 bg-[#272727] rounded-md">
                <div className="flex items-center space-x-3">
                  <div className="bg-[#2a2a2a] w-8 h-8 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{zone.zone}</span>
                  </div>
                  <div>
                    <div className="text-white font-medium">{zone.name}</div>
                    <div className="text-gray-300 text-sm">{zone.orders} zleceń</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold">{zone.revenue.toFixed(0)} zł</div>
                  <div className="text-gray-300 text-xs">
                    {((zone.revenue / stats.totalRevenue) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            )) || []}
          </div>
        </div>
      </div>

      <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
        <h3 className="text-lg font-semibold text-white mb-4">Kluczowe Wskaźniki</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-[#272727] rounded-md">
            <div className="text-2xl font-bold text-green-400 mb-1">
              {((stats.completedOrders / stats.totalOrders) * 100).toFixed(1)}%
            </div>
            <div className="text-gray-300 text-sm">Skuteczność realizacji</div>
          </div>
          
          <div className="text-center p-4 bg-[#272727] rounded-md">
            <div className="text-2xl font-bold text-blue-400 mb-1">{stats.customerSatisfaction}</div>
            <div className="text-gray-300 text-sm">Ocena klientów</div>
          </div>
          
          <div className="text-center p-4 bg-[#272727] rounded-md">
            <div className="text-2xl font-bold text-purple-400 mb-1">{stats.peakHours}</div>
            <div className="text-gray-300 text-sm">Godziny szczytu</div>
          </div>
          
          <div className="text-center p-4 bg-[#272727] rounded-md">
            <div className="text-2xl font-bold text-orange-400 mb-1">
              {(stats.totalRevenue / stats.completedOrders).toFixed(2)} zł
            </div>
            <div className="text-gray-300 text-sm">Średnia wartość kursu</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsStats;