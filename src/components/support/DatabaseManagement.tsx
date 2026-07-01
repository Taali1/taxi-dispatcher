import React, { useState } from 'react';
import { Database, Server, History, FileCode } from 'lucide-react';
import TableViewer from './TableViewer';
import Modal from './Modal';
import DriverHistoryViewer from './DriverHistoryViewer';
import DatabaseStatus from './DatabaseStatus';
import SqlUpload from './SqlUpload';

const DatabaseManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'tables' | 'driver_history' | 'sql_upload'>('status');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'info' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const tabs = [
    { id: 'status' as const, name: 'Status MySQL', icon: Database },
    { id: 'tables' as const, name: 'Tabele', icon: Server },
    { id: 'driver_history' as const, name: 'Historia Kierowców', icon: History },
    { id: 'sql_upload' as const, name: 'Wgraj SQL', icon: FileCode },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-700 p-1 rounded-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Status Tab */}
        {activeTab === 'status' && (
          <DatabaseStatus />
        )}

        {/* Tables Tab - Simple Version for MySQL */}
        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Tabele w Bazie Danych MySQL</h3>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
              <p className="text-gray-300">
                System MySQL jest automatycznie konfigurowany na podstawie zmiennych w pliku <code className="bg-gray-700 px-2 py-1 rounded">.env</code>.
                Aby zobaczyć zawartość tabel, wybierz tabelę z listy poniżej.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['administrators', 'drivers', 'dispatchers', 'support_agents', 'accounting_users', 'zones', 'regions', 'taxi_codes', 'orders', 'pricing_rules', 'driver_queue'].map((tableName) => (
                <button
                  key={tableName}
                  onClick={() => setSelectedTable(tableName)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 px-4 py-3 rounded-lg transition-colors text-left"
                >
                  <div className="font-medium text-sm">{tableName}</div>
                  <div className="text-xs text-gray-500 mt-1">Podgląd</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Table Viewer Modal */}
        {selectedTable && (
          <TableViewer
            tableName={selectedTable}
            onClose={() => setSelectedTable(null)}
          />
        )}

        {/* Driver History Tab */}
        {activeTab === 'driver_history' && (
          <DriverHistoryViewer />
        )}

        {/* SQL Upload Tab */}
        {activeTab === 'sql_upload' && (
          <SqlUpload />
        )}
      </div>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
        confirmText={modal.type === 'confirm' ? 'Usuń' : 'OK'}
      />
    </>
  );
};

export default DatabaseManagement;
