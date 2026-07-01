import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard } from 'lucide-react';

const FinancialSummary: React.FC = () => {
  const financialData = {
    todayRevenue: 3240.50,
    monthRevenue: 87420.25,
    outstandingInvoices: 12540.75,
    paidInvoices: 74879.50,
    cashPayments: 45230.25,
    cardPayments: 42190.00,
  };

  const revenueStats = [
    {
      title: 'Przychody dzisiaj',
      value: `${financialData.todayRevenue.toFixed(2)} zł`,
      change: '+12.5%',
      changeType: 'positive',
      icon: DollarSign,
    },
    {
      title: 'Przychody w miesiącu',
      value: `${financialData.monthRevenue.toFixed(2)} zł`,
      change: '+8.3%',
      changeType: 'positive',
      icon: TrendingUp,
    },
    {
      title: 'Nieopłacone faktury',
      value: `${financialData.outstandingInvoices.toFixed(2)} zł`,
      change: '-5.2%',
      changeType: 'negative',
      icon: TrendingDown,
    },
    {
      title: 'Opłacone faktury',
      value: `${financialData.paidInvoices.toFixed(2)} zł`,
      change: '+15.7%',
      changeType: 'positive',
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Podsumowanie Finansowe</h2>
        <p className="text-slate-400">Przegląd przychodów i rozliczeń</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {revenueStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-slate-700 p-3 rounded-lg">
                  <Icon className="w-6 h-6 text-blue-400" />
                </div>
                <div className={`text-sm font-medium ${
                  stat.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stat.change}
                </div>
              </div>
              <div className="text-slate-300 text-sm mb-1">{stat.title}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Rozpad Płatności</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <span className="text-slate-300">Gotówka</span>
              <span className="text-white font-bold">{financialData.cashPayments.toFixed(2)} zł</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <span className="text-slate-300">Karta</span>
              <span className="text-white font-bold">{financialData.cardPayments.toFixed(2)} zł</span>
            </div>
            
            <div className="pt-3 border-t border-slate-600">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Łącznie</span>
                <span className="text-green-400 font-bold text-lg">
                  {(financialData.cashPayments + financialData.cardPayments).toFixed(2)} zł
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Status Faktur</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-green-900/30 border border-green-600 rounded-lg">
              <span className="text-green-200">Opłacone</span>
              <span className="text-green-400 font-bold">{financialData.paidInvoices.toFixed(2)} zł</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-red-900/30 border border-red-600 rounded-lg">
              <span className="text-red-200">Oczekujące</span>
              <span className="text-red-400 font-bold">{financialData.outstandingInvoices.toFixed(2)} zł</span>
            </div>
            
            <div className="pt-3 border-t border-slate-600">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Łącznie wystawione</span>
                <span className="text-blue-400 font-bold text-lg">
                  {(financialData.paidInvoices + financialData.outstandingInvoices).toFixed(2)} zł
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Ostatnie Transakcje</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-3 text-slate-300 font-medium">Data</th>
                <th className="pb-3 text-slate-300 font-medium">Zlecenie</th>
                <th className="pb-3 text-slate-300 font-medium">Kierowca</th>
                <th className="pb-3 text-slate-300 font-medium">Płatność</th>
                <th className="pb-3 text-slate-300 font-medium">Kwota</th>
                <th className="pb-3 text-slate-300 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-slate-700 last:border-b-0">
                  <td className="py-3 text-slate-300">16/01/2025 14:30</td>
                  <td className="py-3 text-white">ORD{(index + 100).toString().padStart(3, '0')}</td>
                  <td className="py-3 text-slate-300">D00{index + 1}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      index % 2 === 0 ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                    }`}>
                      {index % 2 === 0 ? 'Karta' : 'Gotówka'}
                    </span>
                  </td>
                  <td className="py-3 text-white font-medium">
                    {(Math.random() * 50 + 15).toFixed(2)} zł
                  </td>
                  <td className="py-3">
                    <span className="bg-green-600 text-white px-2 py-1 rounded-full text-xs">
                      Opłacone
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinancialSummary;