import React, { useState } from 'react';
import { Calendar, Download, BarChart3, PieChart } from 'lucide-react';

const PaymentReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    from: '2025-01-01',
    to: '2025-01-16',
  });

  const reportData = {
    totalOrders: 1247,
    totalRevenue: 87420.25,
    averageOrderValue: 70.15,
    topDrivers: [
      { name: 'Jan Kowalski (D001)', revenue: 12540.50, orders: 187 },
      { name: 'Anna Nowak (D003)', revenue: 11230.75, orders: 165 },
      { name: 'Marek Wiśniewski (D007)', revenue: 10985.25, orders: 158 },
    ],
    topZones: [
      { zone: 12, name: 'Stare Miasto', revenue: 18750.25, orders: 245 },
      { zone: 8, name: 'Kazimierz', revenue: 15420.50, orders: 198 },
      { zone: 15, name: 'Nowa Huta', revenue: 12890.75, orders: 167 },
    ],
  };

  const generateReport = (type: string) => {
    console.log(`Generating ${type} report for period:`, dateRange);
    // Generate and download report
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Raporty Płatności</h2>
          <p className="text-slate-400">Analiza przychodów i statystyki</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Liczba zleceń</div>
          <div className="text-2xl font-bold text-white mt-1">{reportData.totalOrders}</div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Łączne przychody</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{reportData.totalRevenue.toFixed(2)} zł</div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Średnia wartość zlecenia</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{reportData.averageOrderValue.toFixed(2)} zł</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Najlepsi Kierowcy</h3>
          
          <div className="space-y-4">
            {reportData.topDrivers.map((driver, index) => (
              <div key={driver.name} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="bg-slate-600 w-8 h-8 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{index + 1}</span>
                  </div>
                  <div>
                    <div className="text-white font-medium">{driver.name}</div>
                    <div className="text-slate-400 text-sm">{driver.orders} zleceń</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold">{driver.revenue.toFixed(2)} zł</div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => generateReport('drivers')}
            className="w-full mt-4 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors duration-200"
          >
            <Download className="w-4 h-4" />
            <span>Pobierz raport kierowców</span>
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Najlepsze Rejony</h3>
          
          <div className="space-y-4">
            {reportData.topZones.map((zone, index) => (
              <div key={zone.zone} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="bg-slate-600 w-8 h-8 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{zone.zone}</span>
                  </div>
                  <div>
                    <div className="text-white font-medium">{zone.name}</div>
                    <div className="text-slate-400 text-sm">{zone.orders} zleceń</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold">{zone.revenue.toFixed(2)} zł</div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => generateReport('zones')}
            className="w-full mt-4 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors duration-200"
          >
            <Download className="w-4 h-4" />
            <span>Pobierz raport rejonów</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="flex items-center space-x-2 text-lg font-semibold text-white mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <span>Raporty do Pobrania</span>
          </h3>
          
          <div className="space-y-3">
            {['Raport dzienny', 'Raport miesięczny', 'Zestawienie kierowców', 'Analiza rejonów'].map((reportName) => (
              <button
                key={reportName}
                onClick={() => generateReport(reportName.toLowerCase())}
                className="w-full flex items-center justify-between p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors duration-200"
              >
                <span className="text-white">{reportName}</span>
                <Download className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="flex items-center space-x-2 text-lg font-semibold text-white mb-4">
            <PieChart className="w-5 h-5 text-green-400" />
            <span>Metody Płatności</span>
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <span className="text-slate-300">Gotówka</span>
              <div className="text-right">
                <div className="text-white font-medium">52%</div>
                <div className="text-slate-400 text-xs">45,230 zł</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <span className="text-slate-300">Karta</span>
              <div className="text-right">
                <div className="text-white font-medium">38%</div>
                <div className="text-slate-400 text-xs">33,190 zł</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <span className="text-slate-300">Przelew</span>
              <div className="text-right">
                <div className="text-white font-medium">10%</div>
                <div className="text-slate-400 text-xs">8,742 zł</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentReports;