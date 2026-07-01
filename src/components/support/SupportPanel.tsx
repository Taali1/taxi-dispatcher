import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Layout from '../common/Layout';
import DatabaseManagement from './DatabaseManagement';
import ProjectDocumentation from './ProjectDocumentation';
import AdminAccountManagement from './AdminAccountManagement';
import VirtualDriverSimulator from './VirtualDriverSimulator';
import InstallationGuide from './InstallationGuide';
import { Database, FileText, Shield, Bot, Server } from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';

const SupportPanel: React.FC = () => {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<'database' | 'documentation' | 'admins' | 'simulator' | 'instalacja'>('database');

  useEffect(() => {
    console.log('[SupportPanel] Mounted - forcing config refresh');
    dataSourceService.refreshConfig();
    const debugInfo = dataSourceService.getDebugInfo();
    console.log('[SupportPanel] Current data source:', debugInfo);
  }, []);

  if (!user || user.role !== 'support') {
    return <Navigate to="/login" />;
  }

  const headerActions = (
    <div className="flex space-x-2">
      <button
        onClick={() => setActiveView('database')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
          activeView === 'database'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'
        }`}
      >
        <Database className="w-4 h-4" />
        <span>Bazy Danych</span>
      </button>

      <button
        onClick={() => setActiveView('admins')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
          activeView === 'admins'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'
        }`}
      >
        <Shield className="w-4 h-4" />
        <span>Administratorzy</span>
      </button>

      <button
        onClick={() => setActiveView('simulator')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
          activeView === 'simulator'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'
        }`}
      >
        <Bot className="w-4 h-4" />
        <span>Symulator</span>
      </button>

      <button
        onClick={() => setActiveView('documentation')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
          activeView === 'documentation'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'
        }`}
      >
        <FileText className="w-4 h-4" />
        <span>Dokumentacja</span>
      </button>

      <button
        onClick={() => setActiveView('instalacja')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
          activeView === 'instalacja'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600'
        }`}
      >
        <Server className="w-4 h-4" />
        <span>Instalacja</span>
      </button>
    </div>
  );

  return (
    <Layout title="Panel Wsparcia" headerActions={headerActions} hideTitle={true}>
      {activeView === 'database' && <DatabaseManagement />}
      {activeView === 'admins' && <AdminAccountManagement />}
      {activeView === 'simulator' && <VirtualDriverSimulator />}
      {activeView === 'documentation' && <ProjectDocumentation />}
      {activeView === 'instalacja' && <InstallationGuide />}
    </Layout>
  );
};

export default SupportPanel;