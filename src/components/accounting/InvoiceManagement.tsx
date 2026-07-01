import React, { useState } from 'react';
import { Plus, Download, Eye, FileText } from 'lucide-react';

interface Invoice {
  id: string;
  number: string;
  customerName: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issueDate: string;
  dueDate: string;
}

const InvoiceManagement: React.FC = () => {
  const [invoices] = useState<Invoice[]>([
    {
      id: '1',
      number: 'FV/2025/001',
      customerName: 'ABC Transport Sp. z o.o.',
      amount: 1250.00,
      status: 'paid',
      issueDate: '2025-01-15',
      dueDate: '2025-01-29',
    },
    {
      id: '2',
      number: 'FV/2025/002',
      customerName: 'Hotel Kraków Plaza',
      amount: 850.50,
      status: 'sent',
      issueDate: '2025-01-16',
      dueDate: '2025-01-30',
    },
    {
      id: '3',
      number: 'FV/2025/003',
      customerName: 'Firma Logistyczna XYZ',
      amount: 2100.75,
      status: 'overdue',
      issueDate: '2025-01-10',
      dueDate: '2025-01-24',
    },
  ]);

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: 'bg-slate-600 text-white',
      sent: 'bg-blue-600 text-white',
      paid: 'bg-green-600 text-white',
      overdue: 'bg-red-600 text-white',
    };
    return badges[status as keyof typeof badges];
  };

  const getStatusText = (status: string) => {
    const statusText = {
      draft: 'Szkic',
      sent: 'Wysłana',
      paid: 'Opłacona',
      overdue: 'Przeterminowana',
    };
    return statusText[status as keyof typeof statusText];
  };

  const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const paidAmount = invoices.filter(inv => inv.status === 'paid').reduce((sum, invoice) => sum + invoice.amount, 0);
  const overdueAmount = invoices.filter(inv => inv.status === 'overdue').reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Fakturami</h2>
          <p className="text-slate-400">Twórz i zarządzaj fakturami dla klientów firmowych</p>
        </div>
        
        <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200">
          <Plus className="w-4 h-4" />
          <span>Nowa faktura</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Łączna wartość</div>
          <div className="text-2xl font-bold text-white mt-1">
            {totalAmount.toFixed(2)} zł
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Opłacone</div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {paidAmount.toFixed(2)} zł
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Przeterminowane</div>
          <div className="text-2xl font-bold text-red-400 mt-1">
            {overdueAmount.toFixed(2)} zł
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Liczba faktur</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {invoices.length}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Lista Faktur</h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="pb-3 text-slate-300 font-medium">Numer</th>
                  <th className="pb-3 text-slate-300 font-medium">Klient</th>
                  <th className="pb-3 text-slate-300 font-medium">Kwota</th>
                  <th className="pb-3 text-slate-300 font-medium">Status</th>
                  <th className="pb-3 text-slate-300 font-medium">Data wystawienia</th>
                  <th className="pb-3 text-slate-300 font-medium">Termin płatności</th>
                  <th className="pb-3 text-slate-300 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-slate-700 last:border-b-0">
                    <td className="py-4">
                      <span className="text-white font-medium">{invoice.number}</span>
                    </td>
                    <td className="py-4 text-slate-300">{invoice.customerName}</td>
                    <td className="py-4 text-white font-bold">
                      {invoice.amount.toFixed(2)} zł
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(invoice.status)}`}>
                        {getStatusText(invoice.status)}
                      </span>
                    </td>
                    <td className="py-4 text-slate-300">{invoice.issueDate}</td>
                    <td className="py-4 text-slate-300">{invoice.dueDate}</td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        <button className="text-blue-400 hover:text-blue-300">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="text-green-400 hover:text-green-300">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceManagement;