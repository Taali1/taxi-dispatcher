import React, { useState } from 'react';
import { Clock, User, AlertCircle, CheckCircle, MessageSquare } from 'lucide-react';

interface Ticket {
  id: string;
  customerName: string;
  email: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'new' | 'open' | 'pending' | 'resolved';
  createdAt: string;
  lastUpdate: string;
}

const TicketList: React.FC = () => {
  const [tickets] = useState<Ticket[]>([
    {
      id: 'T001',
      customerName: 'Anna Kowalska',
      email: 'anna@example.com',
      subject: 'Problem z naliczeniem kosztu kursu',
      priority: 'high',
      status: 'new',
      createdAt: '2025-01-16 14:30',
      lastUpdate: '2025-01-16 14:30',
    },
    {
      id: 'T002',
      customerName: 'Marek Nowak',
      email: 'marek@example.com',
      subject: 'Kierowca spóźnił się 20 minut',
      priority: 'medium',
      status: 'open',
      createdAt: '2025-01-16 13:15',
      lastUpdate: '2025-01-16 14:20',
    },
    {
      id: 'T003',
      customerName: 'Ewa Wiśniewska',
      email: 'ewa@example.com',
      subject: 'Prośba o fakturę VAT',
      priority: 'low',
      status: 'resolved',
      createdAt: '2025-01-16 10:45',
      lastUpdate: '2025-01-16 12:30',
    },
  ]);

  const getPriorityBadge = (priority: string) => {
    const badges = {
      low: 'bg-green-600 text-white',
      medium: 'bg-yellow-600 text-white',
      high: 'bg-orange-600 text-white',
      urgent: 'bg-red-600 text-white',
    };
    return badges[priority as keyof typeof badges];
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      new: 'bg-blue-600 text-white',
      open: 'bg-purple-600 text-white',
      pending: 'bg-yellow-600 text-white',
      resolved: 'bg-green-600 text-white',
    };
    return badges[status as keyof typeof badges];
  };

  const getStatusText = (status: string) => {
    const statusText = {
      new: 'Nowe',
      open: 'W trakcie',
      pending: 'Oczekuje',
      resolved: 'Rozwiązane',
    };
    return statusText[status as keyof typeof statusText];
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Nowe zgłoszenia</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {tickets.filter(t => t.status === 'new').length}
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">W trakcie</div>
          <div className="text-2xl font-bold text-purple-400 mt-1">
            {tickets.filter(t => t.status === 'open').length}
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Wysoki priorytet</div>
          <div className="text-2xl font-bold text-red-400 mt-1">
            {tickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length}
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-slate-300 text-sm">Rozwiązane dzisiaj</div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {tickets.filter(t => t.status === 'resolved').length}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Zgłoszenia Klientów</h3>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors duration-200">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-white font-medium">#{ticket.id}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${getPriorityBadge(ticket.priority)}`}>
                        {ticket.priority.toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(ticket.status)}`}>
                        {getStatusText(ticket.status)}
                      </span>
                    </div>
                    <h4 className="text-white font-medium">{ticket.subject}</h4>
                  </div>
                  
                  <div className="text-right text-sm">
                    <div className="text-slate-300">{ticket.createdAt}</div>
                    <div className="text-slate-400 text-xs">Aktualizacja: {ticket.lastUpdate}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 text-sm text-slate-300 mb-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4" />
                    <span>{ticket.customerName}</span>
                  </div>
                  <div>{ticket.email}</div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-600">
                  <div className="flex space-x-2">
                    {ticket.status === 'new' && (
                      <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200">
                        Przyjmij
                      </button>
                    )}
                    {ticket.status === 'open' && (
                      <>
                        <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200">
                          Rozwiąż
                        </button>
                        <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors duration-200">
                          Oczekuje
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm">
                    <MessageSquare className="w-4 h-4" />
                    <span>Odpowiedz</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketList;