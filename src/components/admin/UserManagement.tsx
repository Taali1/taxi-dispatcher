import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Users, Shield, Car, Headphones, Calculator, Plus, Search, Filter } from 'lucide-react';
import { userService } from '../../services/userService';
import { UserRole, UserFilter } from '../../types/users';
import AdministratorManagement from './users/AdministratorManagement';
import DriverManagement from './users/DriverManagement';
import DispatcherManagement from './users/DispatcherManagement';
import SupportManagement from './users/SupportManagement';
import AccountingManagement from './users/AccountingManagement';

const UserManagement: React.FC = () => {
  const location = useLocation();
  const [statistics, setStatistics] = useState(userService.getStatistics());
  const [globalFilter, setGlobalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
    role: undefined,
  });

  useEffect(() => {
    // Update statistics when location changes (indicating data might have changed)
    setStatistics(userService.getStatistics());
  }, [location]);

  const userTypes = [
    {
      id: 'admins',
      name: 'Administratorzy',
      icon: Shield,
      color: 'bg-red-600',
      count: statistics.administrators,
      path: '/admin/users/admins',
      description: 'Zarządzanie administratorami systemu'
    },
    {
      id: 'drivers',
      name: 'Kierowcy',
      icon: Car,
      color: 'bg-green-600',
      count: statistics.drivers,
      path: '/admin/users/drivers',
      description: 'Zarządzanie kierowcami i pojazdami'
    },
    {
      id: 'dispatchers',
      name: 'Dyspozytorzy',
      icon: Users,
      color: 'bg-blue-600',
      count: statistics.dispatchers,
      path: '/admin/users/dispatchers',
      description: 'Zarządzanie dyspozytorami'
    },
    {
      id: 'support',
      name: 'Wsparcie',
      icon: Headphones,
      color: 'bg-purple-600',
      count: statistics.supportAgents,
      path: '/admin/users/support',
      description: 'Zarządzanie agentami wsparcia'
    },
    {
      id: 'accounting',
      name: 'Księgowość',
      icon: Calculator,
      color: 'bg-orange-600',
      count: statistics.accountingUsers,
      path: '/admin/users/accounting',
      description: 'Zarządzanie użytkownikami księgowości'
    },
  ];

  const isOverviewPage = location.pathname === '/admin/users';

  return (
    <div className="space-y-6">
      {isOverviewPage ? (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
              <div className="text-gray-300 text-sm">Wszyscy użytkownicy</div>
              <div className="text-2xl font-bold text-white mt-1">{statistics.total}</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
              <div className="text-gray-300 text-sm">Aktywni</div>
              <div className="text-2xl font-bold text-green-400 mt-1">{statistics.active}</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
              <div className="text-gray-300 text-sm">Nieaktywni</div>
              <div className="text-2xl font-bold text-red-400 mt-1">{statistics.inactive}</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
              <div className="text-gray-300 text-sm">Kierowcy</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{statistics.drivers}</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
              <div className="text-gray-300 text-sm">Administratorzy</div>
              <div className="text-2xl font-bold text-purple-400 mt-1">{statistics.administrators}</div>
            </div>
          </div>

          {/* User Type Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {userTypes.map((userType) => {
              const Icon = userType.icon;
              
              return (
                <Link
                  key={userType.id}
                  to={userType.path}
                  className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d] hover:border-[#4a4a4a] transition-all duration-200 hover:transform hover:scale-105 group"
                >
                  <div className="flex items-center space-x-4 mb-4">
                    <div className={`${userType.color} w-12 h-12 rounded-md flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors duration-200">
                        {userType.name}
                      </h3>
                      <div className="text-2xl font-bold text-blue-400">{userType.count}</div>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {userType.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        /* Nested Routes */
        <Routes>
          <Route path="/admins" element={<AdministratorManagement filter={globalFilter} />} />
          <Route path="/drivers" element={<DriverManagement filter={globalFilter} />} />
          <Route path="/dispatchers" element={<DispatcherManagement filter={globalFilter} />} />
          <Route path="/support" element={<SupportManagement filter={globalFilter} />} />
          <Route path="/accounting" element={<AccountingManagement filter={globalFilter} />} />
        </Routes>
      )}
    </div>
  );
};

export default UserManagement;