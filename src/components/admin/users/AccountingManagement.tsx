import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Calculator, Search, Award } from 'lucide-react';
import { userService } from '../../../services/userService';
import { AccountingUser, UserFilter } from '../../../types/users';

interface AccountingManagementProps {
  filter: UserFilter;
}

const AccountingManagement: React.FC<AccountingManagementProps> = ({ filter }) => {
  const [accountingUsers, setAccountingUsers] = useState<AccountingUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AccountingUser[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<AccountingUser | null>(null);
  const [localFilter, setLocalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
  });

  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    employeeId: '',
    accessLevel: 'viewer' as 'viewer' | 'editor' | 'manager',
    certifications: [] as string[],
    department: 'billing' as 'payroll' | 'billing' | 'reports' | 'audit',
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  useEffect(() => {
    loadAccountingUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [accountingUsers, filter, localFilter]);

  const loadAccountingUsers = () => {
    const users = userService.getUsersByRole<AccountingUser>('accounting');
    setAccountingUsers(users);
  };

  const applyFilters = () => {
    let filtered = accountingUsers;
    
    // Apply global filter
    if (filter.search || filter.status) {
      filtered = userService.filterUsers(filtered, filter);
    }
    
    // Apply local filter
    if (localFilter.search || localFilter.status) {
      filtered = userService.filterUsers(filtered, localFilter);
    }
    
    setFilteredUsers(filtered);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await userService.createAccountingUser({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        employeeId: userForm.employeeId,
        accessLevel: userForm.accessLevel,
        certifications: userForm.certifications,
        department: userForm.department,
        status: userForm.status,
      });

      if (!result.success) {
        alert(`Błąd podczas dodawania użytkownika księgowości: ${result.error}`);
        return;
      }

      resetForm();
      setIsAddingUser(false);
      loadAccountingUsers();
    } catch (error) {
      console.error('Error adding accounting user:', error);
      alert('Wystąpił nieoczekiwany błąd podczas dodawania użytkownika księgowości');
    }
  };

  const handleEditUser = (user: AccountingUser) => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      password: '',
      employeeId: user.employeeId,
      accessLevel: user.accessLevel,
      certifications: user.certifications,
      department: user.department,
      status: user.status,
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingUser) return;

    try {
      const updateData: Partial<AccountingUser> = {
        name: userForm.name,
        email: userForm.email,
        employeeId: userForm.employeeId,
        accessLevel: userForm.accessLevel,
        certifications: userForm.certifications,
        department: userForm.department,
        status: userForm.status,
      };

      if (userForm.password) {
        updateData.password = userForm.password;
      }

      const result = await userService.updateAccountingUser(editingUser.id, updateData);

      if (!result.success) {
        alert(`Błąd podczas aktualizacji użytkownika księgowości: ${result.error}`);
        return;
      }

      resetForm();
      setEditingUser(null);
      loadAccountingUsers();
    } catch (error) {
      console.error('Error updating accounting user:', error);
      alert('Wystąpił nieoczekiwany błąd podczas aktualizacji użytkownika księgowości');
    }
  };

  const handleDeleteUser = (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego użytkownika księgowości?')) return;
    
    try {
      userService.deleteAccountingUser(id);
      loadAccountingUsers();
    } catch (error) {
      alert('Błąd podczas usuwania użytkownika księgowości');
    }
  };

  const resetForm = () => {
    setUserForm({
      name: '',
      email: '',
      password: '',
      employeeId: '',
      accessLevel: 'viewer',
      certifications: [],
      department: 'billing',
      status: 'active',
    });
  };

  const toggleCertification = (certification: string) => {
    const newCertifications = userForm.certifications.includes(certification)
      ? userForm.certifications.filter(c => c !== certification)
      : [...userForm.certifications, certification];
    
    setUserForm({ ...userForm, certifications: newCertifications });
  };

  const availableCertifications = [
    'CPA', 'Tax Specialist', 'Bookkeeper', 'Financial Analyst', 'Auditor', 'Payroll Specialist'
  ];

  const getAccessLevelBadge = (level: string) => {
    const badges = {
      viewer: 'bg-blue-600 text-white',
      editor: 'bg-green-600 text-white',
      manager: 'bg-purple-600 text-white',
    };
    return badges[level as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const getAccessLevelText = (level: string) => {
    const levelText = {
      viewer: 'Przeglądanie',
      editor: 'Edycja',
      manager: 'Menedżer',
    };
    return levelText[level as keyof typeof levelText] || level;
  };

  const getDepartmentBadge = (department: string) => {
    const badges = {
      payroll: 'bg-green-600 text-white',
      billing: 'bg-blue-600 text-white',
      reports: 'bg-orange-600 text-white',
      audit: 'bg-red-600 text-white',
    };
    return badges[department as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const getDepartmentText = (department: string) => {
    const departmentText = {
      payroll: 'Płace',
      billing: 'Rozliczenia',
      reports: 'Raporty',
      audit: 'Audyt',
    };
    return departmentText[department as keyof typeof departmentText] || department;
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-600 text-white',
      inactive: 'bg-gray-600 text-white',
      suspended: 'bg-red-600 text-white',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setIsAddingUser(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj użytkownika księgowości</span>
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Księgowością</h2>
        <p className="text-gray-100">Dodawaj i zarządzaj użytkownikami księgowości</p>
      </div>

      {/* Local Filters */}
      <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Szukaj użytkowników księgowości
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-100" />
              <input
                type="text"
                value={localFilter.search}
                onChange={(e) => setLocalFilter({ ...localFilter, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa, email lub ID pracownika..."
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
            <select
              value={localFilter.status || ''}
              onChange={(e) => setLocalFilter({ 
                ...localFilter, 
                status: e.target.value as any || undefined 
              })}
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Wszystkie statusy</option>
              <option value="active">Aktywny</option>
              <option value="inactive">Nieaktywny</option>
              <option value="suspended">Zawieszony</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(isAddingUser || editingUser) && (
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingUser ? 'Edytuj Użytkownika Księgowości' : 'Nowy Użytkownik Księgowości'}
          </h3>
          
          <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Imię i nazwisko</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Kowalski"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jan@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hasło {editingUser && '(pozostaw puste aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingUser}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ID pracownika</label>
                <input
                  type="text"
                  value={userForm.employeeId}
                  onChange={(e) => setUserForm({ ...userForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ACC001"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={userForm.status}
                  onChange={(e) => setUserForm({ ...userForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Aktywny</option>
                  <option value="inactive">Nieaktywny</option>
                  <option value="suspended">Zawieszony</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Poziom dostępu</label>
                <select
                  value={userForm.accessLevel}
                  onChange={(e) => setUserForm({ ...userForm, accessLevel: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Przeglądanie</option>
                  <option value="editor">Edycja</option>
                  <option value="manager">Menedżer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dział</label>
                <select
                  value={userForm.department}
                  onChange={(e) => setUserForm({ ...userForm, department: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="billing">Rozliczenia</option>
                  <option value="payroll">Płace</option>
                  <option value="reports">Raporty</option>
                  <option value="audit">Audyt</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Certyfikaty</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableCertifications.map((certification) => (
                  <label key={certification} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.certifications.includes(certification)}
                      onChange={() => toggleCertification(certification)}
                      className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-gray-300 text-sm">{certification}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
              >
                {editingUser ? 'Zapisz zmiany' : 'Dodaj użytkownika'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingUser(false);
                  setEditingUser(null);
                  resetForm();
                }}
                className="bg-[#2a2a2a] hover:bg-[#272727] text-white px-4 py-2 rounded-md transition-colors duration-200"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounting Users List */}
      <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
        <div className="p-6 border-b border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white">
            Lista Użytkowników Księgowości ({filteredUsers.length})
          </h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  <th className="pb-3 text-gray-300 font-medium">Użytkownik</th>
                  <th className="pb-3 text-gray-300 font-medium">ID Pracownika</th>
                  <th className="pb-3 text-gray-300 font-medium">Email</th>
                  <th className="pb-3 text-gray-300 font-medium">Dział</th>
                  <th className="pb-3 text-gray-300 font-medium">Poziom dostępu</th>
                  <th className="pb-3 text-gray-300 font-medium">Certyfikaty</th>
                  <th className="pb-3 text-gray-300 font-medium">Status</th>
                  <th className="pb-3 text-gray-300 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-[#3d3d3d] last:border-b-0">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-orange-600 w-8 h-8 rounded-full flex items-center justify-center">
                          <Calculator className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-white">{user.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-gray-300 font-mono">{user.employeeId}</td>
                    <td className="py-4 text-gray-300">{user.email}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDepartmentBadge(user.department)}`}>
                        {getDepartmentText(user.department)}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getAccessLevelBadge(user.accessLevel)}`}>
                        {getAccessLevelText(user.accessLevel)}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center space-x-1">
                        <Award className="w-3 h-3 text-gray-100" />
                        <span className="text-gray-300 text-sm">
                          {user.certifications.length > 0 ? user.certifications.length : 'Brak'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-gray-100">
                Brak użytkowników księgowości spełniających kryteria wyszukiwania
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountingManagement;
