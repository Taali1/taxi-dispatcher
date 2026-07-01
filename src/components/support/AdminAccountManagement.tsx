import React, { useState, useEffect } from 'react';
import { userService } from '../../services/userService';
import { Administrator } from '../../types/users';
import { Plus, Save, Trash2, Shield, AlertCircle } from 'lucide-react';

const AdminAccountManagement: React.FC = () => {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    accessLevel: 'standard' as 'super' | 'standard' | 'limited',
    permissions: [] as string[],
    status: 'active' as 'active' | 'inactive' | 'suspended'
  });

  const availablePermissions = [
    { id: 'users', label: 'Zarządzanie użytkownikami' },
    { id: 'zones', label: 'Zarządzanie strefami' },
    { id: 'pricing', label: 'Zarządzanie cenami' },
    { id: 'reports', label: 'Raporty' },
    { id: 'system', label: 'Ustawienia systemowe' }
  ];

  useEffect(() => {
    loadAdministrators();
  }, []);

  const loadAdministrators = async () => {
    await userService.refreshFromDatabase();
    const admins = userService.getUsersByRole<Administrator>('admin');
    setAdministrators(admins);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (!formData.name || !formData.email || !formData.password) {
      setError('Wszystkie pola są wymagane');
      setIsLoading(false);
      return;
    }

    const existingAdmin = userService.getAdministratorByEmail(formData.email);
    if (existingAdmin) {
      setError('Administrator z tym adresem email już istnieje');
      setIsLoading(false);
      return;
    }

    const result = await userService.createAdministrator({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      department: formData.department || 'IT',
      accessLevel: formData.accessLevel,
      permissions: formData.permissions.length > 0 ? formData.permissions : ['users', 'reports'],
      status: formData.status
    });

    if (result.success) {
      setSuccess('Administrator został utworzony pomyślnie');
      setFormData({
        name: '',
        email: '',
        password: '',
        department: '',
        accessLevel: 'standard',
        permissions: [],
        status: 'active'
      });
      setShowCreateForm(false);
      loadAdministrators();
    } else {
      setError(result.error || 'Nie udało się utworzyć administratora');
    }

    setIsLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć administratora: ${name}?`)) {
      return;
    }

    const result = await userService.deleteAdministrator(id);
    if (result.success) {
      setSuccess('Administrator został usunięty');
      loadAdministrators();
    } else {
      setError(result.error || 'Nie udało się usunąć administratora');
    }
  };

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Zarządzanie Administratorami</h2>
          <p className="text-slate-400 mt-1">Tworzenie i zarządzanie kontami administratorów systemu</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Nowy Administrator</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-900/50 border border-green-500 text-green-200 p-4 rounded-lg">
          {success}
        </div>
      )}

      {showCreateForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>Utwórz Nowe Konto Administratora</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Imię i nazwisko *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="np. Jan Kowalski"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Hasło *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="********"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Dział
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="IT"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Poziom dostępu
                </label>
                <select
                  value={formData.accessLevel}
                  onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value as 'super' | 'standard' | 'limited' })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="standard">Standard</option>
                  <option value="super">Super Admin</option>
                  <option value="limited">Ograniczony</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' | 'suspended' })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Aktywny</option>
                  <option value="inactive">Nieaktywny</option>
                  <option value="suspended">Zawieszony</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Uprawnienia
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {availablePermissions.map((perm) => (
                  <label
                    key={perm.id}
                    className="flex items-center space-x-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-300 text-sm">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors duration-200"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors duration-200"
              >
                <Save className="w-4 h-4" />
                <span>{isLoading ? 'Tworzenie...' : 'Utwórz Administratora'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Nazwa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Dział
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Poziom
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Akcje
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {administrators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Brak administratorów w systemie
                  </td>
                </tr>
              ) : (
                administrators.map((admin) => (
                  <tr key={admin.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Shield className="w-4 h-4 text-red-400" />
                        <span className="text-white font-medium">{admin.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                      {admin.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                      {admin.department || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        admin.accessLevel === 'super'
                          ? 'bg-red-900/50 text-red-200'
                          : admin.accessLevel === 'standard'
                          ? 'bg-blue-900/50 text-blue-200'
                          : 'bg-gray-900/50 text-gray-200'
                      }`}>
                        {admin.accessLevel === 'super' ? 'Super Admin' : admin.accessLevel === 'standard' ? 'Standard' : 'Ograniczony'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        admin.status === 'active'
                          ? 'bg-green-900/50 text-green-200'
                          : admin.status === 'suspended'
                          ? 'bg-yellow-900/50 text-yellow-200'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {admin.status === 'active' ? 'Aktywny' : admin.status === 'suspended' ? 'Zawieszony' : 'Nieaktywny'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(admin.id, admin.name)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Usuń administratora"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{administrators.length}</div>
            <div className="text-sm text-slate-400">Wszystkich administratorów</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">
              {administrators.filter(a => a.status === 'active').length}
            </div>
            <div className="text-sm text-slate-400">Aktywnych</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">
              {administrators.filter(a => a.status === 'inactive').length}
            </div>
            <div className="text-sm text-slate-400">Nieaktywnych</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAccountManagement;
