import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import HomePage from './pages/HomePage';
import LoginPageByRole from './pages/LoginPageByRole';
import AdminPanel from './components/admin/AdminPanel';
import DispatcherPanel from './components/dispatcher/DispatcherPanel';
import DriverApp from './components/driver/DriverApp';
import SupportPanel from './components/support/SupportPanel';
import AccountingPanel from './components/accounting/AccountingPanel';
import MapPage from './pages/MapPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-slate-900">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login/:role" element={<LoginPageByRole />} />
              <Route path="/admin/*" element={<AdminPanel />} />
              <Route path="/dispatcher" element={<DispatcherPanel />} />
              <Route path="/driver-app" element={<DriverApp />} />
              <Route path="/driver" element={<Navigate to="/driver-app" />} />
              <Route path="/support" element={<SupportPanel />} />
              <Route path="/accounting" element={<AccountingPanel />} />
              <Route path="/map" element={<MapPage />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;