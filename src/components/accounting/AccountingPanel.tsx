import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Layout from '../common/Layout';
import FinancialSummary from './FinancialSummary';
import InvoiceManagement from './InvoiceManagement';
import PaymentReports from './PaymentReports';
import { Calculator, FileText, TrendingUp } from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';

const AccountingPanel: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    console.log('[AccountingPanel] Mounted - forcing config refresh');
    dataSourceService.refreshConfig();
    const debugInfo = dataSourceService.getDebugInfo();
    console.log('[AccountingPanel] Current data source:', debugInfo);
  }, []);

  if (!user || user.role !== 'accounting') {
    return <Navigate to="/login" />;
  }

  const tabs = [
    { id: 'summary', name: 'Podsumowanie', icon: Calculator },
    { id: 'invoices', name: 'Faktury', icon: FileText },
    { id: 'reports', name: 'Raporty', icon: TrendingUp },
  ];

  const headerActions = (
    <div className="flex space-x-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.name}</span>
          </button>
        );
      })}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'summary':
        return <FinancialSummary />;
      case 'invoices':
        return <InvoiceManagement />;
      case 'reports':
        return <PaymentReports />;
      default:
        return <FinancialSummary />;
    }
  };

  return (
    <Layout title="Panel Księgowy" headerActions={headerActions}>
      {renderContent()}
    </Layout>
  );
};

export default AccountingPanel;