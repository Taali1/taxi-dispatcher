import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Layout from '../common/Layout';
import AdminDashboard from './AdminDashboard';
import AdminSidebar from './AdminSidebar';
import UserManagement from './UserManagement';
import ZoneManagement from './ZoneManagement';
import PricingManagement from './PricingManagement';
import AssignmentRules from './AssignmentRules';
import MapManagement from './MapManagement';
import ReportsStats from './ReportsStats';
import SystemSettings from './SystemSettings';
import GieldaSettings from './GieldaSettings';
import PreferencesManagement from './PreferencesManagement';
import AsteriskManagement from './AsteriskManagement';
import SystemLogs from './SystemLogs';
import LocalAddresses from './LocalAddresses';

const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" />;
  }

  const getTitle = () => {
    if (location.pathname.includes('/users')) return 'Zarządzanie Użytkownikami';
    if (location.pathname.includes('/map')) return 'Adresy';
    return 'Panel Administracyjny';
  };

  const headerActions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setSidebarOpen(o => !o)}
        className="p-1.5 hover:bg-[#2a2a2a] rounded-md transition-colors text-white shrink-0"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      <h1 className="text-2xl font-bold text-white">{getTitle()}</h1>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#1e1e1e]">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <Layout title="" hideTitle headerActions={headerActions} forceLight>
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/users/*" element={<UserManagement />} />
            <Route path="/zones" element={<ZoneManagement />} />
            <Route path="/pricing" element={<PricingManagement />} />
            <Route path="/map" element={<MapManagement />} />
            <Route path="/rules" element={<AssignmentRules />} />
            <Route path="/gielda" element={<GieldaSettings />} />
            <Route path="/reports" element={<ReportsStats />} />
            <Route path="/preferences" element={<PreferencesManagement />} />
            <Route path="/settings" element={<SystemSettings />} />
            <Route path="/asterisk" element={<AsteriskManagement />} />
            <Route path="/logs" element={<SystemLogs />} />
            <Route path="/local-addresses" element={<LocalAddresses />} />
          </Routes>
        </Layout>
      </div>
    </div>
  );
};

export default AdminPanel;