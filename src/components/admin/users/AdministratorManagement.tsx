import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, Search, Filter } from 'lucide-react';
import { userService } from '../../../services/userService';
import { Administrator, UserFilter, AdminPermission } from '../../../types/users';

interface AdministratorManagementProps {
  filter: UserFilter;
}

const AdministratorManagement: React.FC<AdministratorManagementProps> = ({ filter }) => {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [filteredAdministrators, setFilteredAdministrators] = useState<Administrator[]>([]);
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);
  const [localFilter, setLocalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
  });

  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    accessLevel: 'standard' as 'super' | 'standard' | 'limited',
    permissions: [] as AdminPermission[],
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  useEffect(() => {
    loadAdministrators();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [administrators, filter, localFilter]);

  const loadAdministrators = () => {
    const admins = userService.getUsersByRole<Administrator>('admin');
    setAdministrators(admins);
  };

  const applyFilters = () => {
    let filtered = administrators;
    
    // Apply global filter
    if (filter.search || filter.status) {
      filtered = userService.filterUsers(filtered, filter);
    }
    
    // Apply local filter
    if (localFilter.search || localFilter.status) {
      filtered = userService.filterUsers(filtered, localFilter);
    }
    
    setFilteredAdministrators(filtered);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await userService.createAdministrator({
        name: adminForm.name,
        email: adminForm.email,
        password: adminForm.password,
        department: adminForm.department,
        accessLevel: adminForm.accessLevel,
        permissions: adminForm.permissions,
        status: adminForm.status,
      });

      if (!result.success) {
        alert(`Błąd podczas dodawania administratora: ${result.error}`);
        return;
      }

      resetForm();
      setIsAddingAdmin(false);
      loadAdministrators();
    } catch (error) {
      console.error('Error adding administrator:', error);
      alert('Wystąpił nieoczekiwany błąd podczas dodawania administratora');
    }
  };

  const handleEditAdmin = (admin: Administrator) => {
    setEditingAdmin(admin);
    setAdminForm({
      name: admin.name,
      email: admin.email,
      password: '',
      department: admin.department || '',
      accessLevel: admin.accessLevel,
      permissions: admin.permissions,
      status: admin.status,
    });
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAdmin) return;

    try {
      const updateData: Partial<Administrator> = {
        name: adminForm.name,
        email: adminForm.email,
        department: adminForm.department,
        accessLevel: adminForm.accessLevel,
        permissions: adminForm.permissions,
        status: adminForm.status,
      };

      if (adminForm.password) {
        updateData.password = adminForm.password;
      }

      const result = await userService.updateAdministrator(editingAdmin.id, updateData);

      if (!result.success) {
        alert(`Błąd podczas aktualizacji administratora: ${result.error}`);
        return;
      }

      resetForm();
      setEditingAdmin(null);
      loadAdministrators();
    } catch (error) {
      console.error('Error updating administrator:', error);
      alert('Wystąpił nieoczekiwany błąd podczas aktualizacji administratora');
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego administratora?')) return;

    try {
      const result = await userService.deleteAdministrator(id);

      if (!result.success) {
        alert(`Błąd podczas usuwania administratora: ${result.error}`);
        return;
      }

      loadAdministrators();
    } catch (error) {
      console.error('Error deleting administrator:', error);
      alert('Wystąpił nieoczekiwany błąd podczas usuwania administratora');
    }
  };

  const resetForm = () => {
    setAdminForm({
      name: '',
      email: '',
      password: '',
      department: '',
      accessLevel: 'standard',
      permissions: [],
      status: 'active',
    });
  };

  const togglePermission = (permission: AdminPermission) => {
    const newPermissions = adminForm.permissions.includes(permission)
      ? adminForm.permissions.filter(p => p !== permission)
      : [...adminForm.permissions, permission];
    
    setAdminForm({ ...adminForm, permissions: newPermissions });
  };

  const availablePermissions: { key: AdminPermission; label: string }[] = [
    { key: 'users', label: 'Zarządzanie użytkownikami' },
    { key: 'zones', label: 'Zarządzanie rejonami' },
    { key: 'pricing', label: 'Zarządzanie cenami' },
    { key: 'reports', label: 'Raporty i statystyki' },
    { key: 'system', label: 'Ustawienia systemowe' },
  ];

  const getAccessLevelBadge = (level: string) => {
    const badges = {
      super: 'bg-red-600 text-white',
      standard: 'bg-blue-600 text-white',
      limited: 'bg-yellow-600 text-white',
    };
    return badges[level as keyof typeof badges] || 'bg-gray-600 text-white';
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
          onClick={() => setIsAddingAdmin(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj administratora</span>
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Administratorami</h2>
        <p className="text-gray-100">Dodawaj i zarządzaj administratorami systemu</p>
      </div>

      {/* Local Filters */}
      <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Szukaj administratorów
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-100" />
              <input
                type="text"
                value={localFilter.search}
                onChange={(e) => setLocalFilter({ ...localFilter, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa lub email..."
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
      {(isAddingAdmin || editingAdmin) && (
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingAdmin ? 'Edytuj Administratora' : 'Nowy Administrator'}
          </h3>
          
          <form onSubmit={editingAdmin ? handleUpdateAdmin : handleAddAdmin} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Imię i nazwisko</label>
                <input
                  type="text"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Kowalski"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jan@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hasło {editingAdmin && '(pozostaw puste aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingAdmin}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dział</label>
                <input
                  type="text"
                  value={adminForm.department}
                  onChange={(e) => setAdminForm({ ...adminForm, department: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="IT, Operations, etc."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Poziom dostępu</label>
                <select
                  value={adminForm.accessLevel}
                  onChange={(e) => setAdminForm({ ...adminForm, accessLevel: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="limited">Ograniczony</option>
                  <option value="standard">Standardowy</option>
                  <option value="super">Super Administrator</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hasło {editingAdmin && '(pozostaw puste aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingAdmin}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dział</label>
                <input
                  type="text"
                  value={adminForm.department}
                  onChange={(e) => setAdminForm({ ...adminForm, department: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="IT, Operations, etc."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Poziom dostępu</label>
                <select
                  value={adminForm.accessLevel}
                  onChange={(e) => setAdminForm({ ...adminForm, accessLevel: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="limited">Ograniczony</option>
                  <option value="standard">Standardowy</option>
                  <option value="super">Super Administrator</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Uprawnienia</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {availablePermissions.map((perm) => (
                  <label key={perm.key} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminForm.permissions.includes(perm.key)}
                      onChange={() => togglePermission(perm.key)}
                      className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-gray-300 text-sm">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
              <select
                value={adminForm.status}
                onChange={(e) => setAdminForm({ ...adminForm, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Aktywny</option>
                <option value="inactive">Nieaktywny</option>
                <option value="suspended">Zawieszony</option>
              </select>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
              >
                {editingAdmin ? 'Zapisz zmiany' : 'Dodaj administratora'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingAdmin(false);
                  setEditingAdmin(null);
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

      {/* Administrators List */}
      <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
        <div className="p-6 border-b border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white">
            Lista Administratorów ({filteredAdministrators.length})
          </h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  <th className="pb-3 text-gray-300 font-medium">Administrator</th>
                  <th className="pb-3 text-gray-300 font-medium">Email</th>
                  <th className="pb-3 text-gray-300 font-medium">Dział</th>
                  <th className="pb-3 text-gray-300 font-medium">Poziom dostępu</th>
                  <th className="pb-3 text-gray-300 font-medium">Status</th>
                  <th className="pb-3 text-gray-300 font-medium">Uprawnienia</th>
                  <th className="pb-3 text-gray-300 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdministrators.map((admin) => (
                  <tr key={admin.id} className="border-b border-[#3d3d3d] last:border-b-0">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-red-600 w-8 h-8 rounded-full flex items-center justify-center">
                          <Shield className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-white">{admin.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-gray-300">{admin.email}</td>
                    <td className="py-4 text-gray-300">{admin.department || '--'}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getAccessLevelBadge(admin.accessLevel)}`}>
                        {admin.accessLevel}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(admin.status)}`}>
                        {admin.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1">
                        {admin.permissions.slice(0, 2).map((perm) => (
                          <span key={perm} className="bg-blue-600 text-white px-2 py-1 rounded text-xs">
                            {perm}
                          </span>
                        ))}
                        {admin.permissions.length > 2 && (
                          <span className="bg-[#2a2a2a] text-white px-2 py-1 rounded text-xs">
                            +{admin.permissions.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditAdmin(admin)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAdmin(admin.id)}
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
            
            {filteredAdministrators.length === 0 && (
              <div className="text-center py-8 text-gray-100">
                Brak administratorów spełniających kryteria wyszukiwania
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdministratorManagement;
