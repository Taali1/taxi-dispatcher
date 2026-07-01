import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Users, Search, Clock, MapPin } from 'lucide-react';
import { userService } from '../../../services/userService';
import { Dispatcher, UserFilter } from '../../../types/users';

interface DispatcherManagementProps {
  filter: UserFilter;
}

const DispatcherManagement: React.FC<DispatcherManagementProps> = ({ filter }) => {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [filteredDispatchers, setFilteredDispatchers] = useState<Dispatcher[]>([]);
  const [isAddingDispatcher, setIsAddingDispatcher] = useState(false);
  const [editingDispatcher, setEditingDispatcher] = useState<Dispatcher | null>(null);
  const [localFilter, setLocalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
  });

  const [dispatcherForm, setDispatcherForm] = useState({
    name: '',
    email: '',
    password: '',
    employeeId: '',
    shift: 'morning' as 'morning' | 'afternoon' | 'night' | 'rotating',
    assignedZones: [] as number[],
    maxConcurrentOrders: 10,
    phoneExtension: '',
    trainingCompleted: false,
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  useEffect(() => {
    loadDispatchers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [dispatchers, filter, localFilter]);

  const loadDispatchers = () => {
    const dispatchersList = userService.getUsersByRole<Dispatcher>('dispatcher');
    setDispatchers(dispatchersList);
  };

  const applyFilters = () => {
    let filtered = dispatchers;
    
    // Apply global filter
    if (filter.search || filter.status) {
      filtered = userService.filterUsers(filtered, filter);
    }
    
    // Apply local filter
    if (localFilter.search || localFilter.status) {
      filtered = userService.filterUsers(filtered, localFilter);
    }
    
    setFilteredDispatchers(filtered);
  };

  const handleAddDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await userService.createDispatcher({
        name: dispatcherForm.name,
        email: dispatcherForm.email,
        password: dispatcherForm.password,
        employeeId: dispatcherForm.employeeId,
        shift: dispatcherForm.shift,
        assignedZones: dispatcherForm.assignedZones,
        maxConcurrentOrders: dispatcherForm.maxConcurrentOrders,
        phoneExtension: dispatcherForm.phoneExtension,
        trainingCompleted: dispatcherForm.trainingCompleted,
        status: dispatcherForm.status,
      });

      if (!result.success) {
        alert(`Błąd podczas dodawania dyspozytora: ${result.error}`);
        return;
      }

      resetForm();
      setIsAddingDispatcher(false);
      loadDispatchers();
    } catch (error) {
      console.error('Error adding dispatcher:', error);
      alert('Wystąpił nieoczekiwany błąd podczas dodawania dyspozytora');
    }
  };

  const handleEditDispatcher = (dispatcher: Dispatcher) => {
    setEditingDispatcher(dispatcher);
    setDispatcherForm({
      name: dispatcher.name,
      email: dispatcher.email,
      password: '',
      employeeId: dispatcher.employeeId,
      shift: dispatcher.shift,
      assignedZones: Array.isArray(dispatcher.assignedZones) ? dispatcher.assignedZones : [],
      maxConcurrentOrders: dispatcher.maxConcurrentOrders,
      phoneExtension: dispatcher.phoneExtension || '',
      trainingCompleted: dispatcher.trainingCompleted,
      status: dispatcher.status,
    });
  };

  const handleUpdateDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDispatcher) return;

    try {
      const updateData: Partial<Dispatcher> = {
        name: dispatcherForm.name,
        email: dispatcherForm.email,
        employeeId: dispatcherForm.employeeId,
        shift: dispatcherForm.shift,
        assignedZones: dispatcherForm.assignedZones,
        maxConcurrentOrders: dispatcherForm.maxConcurrentOrders,
        phoneExtension: dispatcherForm.phoneExtension,
        trainingCompleted: dispatcherForm.trainingCompleted,
        status: dispatcherForm.status,
      };

      if (dispatcherForm.password) {
        updateData.password = dispatcherForm.password;
      }

      const result = await userService.updateDispatcher(editingDispatcher.id, updateData);

      if (!result.success) {
        alert(`Błąd podczas aktualizacji dyspozytora: ${result.error}`);
        return;
      }

      resetForm();
      setEditingDispatcher(null);
      loadDispatchers();
    } catch (error) {
      console.error('Error updating dispatcher:', error);
      alert('Wystąpił nieoczekiwany błąd podczas aktualizacji dyspozytora');
    }
  };

  const handleDeleteDispatcher = (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego dyspozytora?')) return;
    
    try {
      userService.deleteDispatcher(id);
      loadDispatchers();
    } catch (error) {
      alert('Błąd podczas usuwania dyspozytora');
    }
  };

  const resetForm = () => {
    setDispatcherForm({
      name: '',
      email: '',
      password: '',
      employeeId: '',
      shift: 'morning',
      assignedZones: [],
      maxConcurrentOrders: 10,
      phoneExtension: '',
      trainingCompleted: false,
      status: 'active',
    });
  };

  const toggleZone = (zone: number) => {
    const newZones = dispatcherForm.assignedZones.includes(zone)
      ? dispatcherForm.assignedZones.filter(z => z !== zone)
      : [...dispatcherForm.assignedZones, zone].sort((a, b) => a - b);
    
    setDispatcherForm({ ...dispatcherForm, assignedZones: newZones });
  };

  const getShiftBadge = (shift: string) => {
    const badges = {
      morning: 'bg-yellow-600 text-white',
      afternoon: 'bg-orange-600 text-white',
      night: 'bg-purple-600 text-white',
      rotating: 'bg-blue-600 text-white',
    };
    return badges[shift as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const getShiftText = (shift: string) => {
    const shiftText = {
      morning: 'Poranny',
      afternoon: 'Popołudniowy',
      night: 'Nocny',
      rotating: 'Rotacyjny',
    };
    return shiftText[shift as keyof typeof shiftText] || shift;
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
          onClick={() => setIsAddingDispatcher(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj dyspozytora</span>
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Dyspozytorami</h2>
        <p className="text-gray-100">Dodawaj i zarządzaj dyspozytorami</p>
      </div>

      {/* Local Filters */}
      <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Szukaj dyspozytorów
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
      {(isAddingDispatcher || editingDispatcher) && (
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingDispatcher ? 'Edytuj Dyspozytora' : 'Nowy Dyspozytor'}
          </h3>
          
          <form onSubmit={editingDispatcher ? handleUpdateDispatcher : handleAddDispatcher} className="space-y-4">
            <div className={`grid grid-cols-1 ${!editingDispatcher ? 'md:grid-cols-2' : ''} gap-4`}>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Imię i nazwisko</label>
                <input
                  type="text"
                  value={dispatcherForm.name}
                  onChange={(e) => setDispatcherForm({ ...dispatcherForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Kowalski"
                  required
                />
              </div>

              {!editingDispatcher && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={dispatcherForm.email}
                    onChange={(e) => setDispatcherForm({ ...dispatcherForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="jan@example.com"
                    required
                  />
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 ${editingDispatcher ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hasło {editingDispatcher && '(pozostaw puste aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  value={dispatcherForm.password}
                  onChange={(e) => setDispatcherForm({ ...dispatcherForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingDispatcher}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ID pracownika</label>
                <input
                  type="text"
                  value={dispatcherForm.employeeId}
                  onChange={(e) => setDispatcherForm({ ...dispatcherForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="OP-09"
                  required
                />
              </div>

              {!editingDispatcher && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Wewnętrzny telefon</label>
                  <input
                    type="text"
                    value={dispatcherForm.phoneExtension}
                    onChange={(e) => setDispatcherForm({ ...dispatcherForm, phoneExtension: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="101"
                  />
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 ${!editingDispatcher ? 'md:grid-cols-3' : ''} gap-4`}>
              {!editingDispatcher && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Zmiana</label>
                  <select
                    value={dispatcherForm.shift}
                    onChange={(e) => setDispatcherForm({ ...dispatcherForm, shift: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="morning">Poranna (6:00-14:00)</option>
                    <option value="afternoon">Popołudniowa (14:00-22:00)</option>
                    <option value="night">Nocna (22:00-6:00)</option>
                    <option value="rotating">Rotacyjna</option>
                  </select>
                </div>
              )}

              {!editingDispatcher && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Max równoczesnych zleceń</label>
                  <input
                    type="number"
                    value={dispatcherForm.maxConcurrentOrders}
                    onChange={(e) => setDispatcherForm({ ...dispatcherForm, maxConcurrentOrders: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="50"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={dispatcherForm.status}
                  onChange={(e) => setDispatcherForm({ ...dispatcherForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Aktywny</option>
                  <option value="inactive">Nieaktywny</option>
                  <option value="suspended">Zawieszony</option>
                </select>
              </div>
            </div>

            {!editingDispatcher && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Przypisane rejony</label>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(zone => (
                    <label key={zone} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dispatcherForm.assignedZones.includes(zone)}
                        onChange={() => toggleZone(zone)}
                        className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                      />
                      <span className="text-gray-300 text-sm">{zone}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!editingDispatcher && (
              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dispatcherForm.trainingCompleted}
                    onChange={(e) => setDispatcherForm({ ...dispatcherForm, trainingCompleted: e.target.checked })}
                    className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                  />
                  <span className="text-gray-300">Szkolenie ukończone</span>
                </label>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
              >
                {editingDispatcher ? 'Zapisz zmiany' : 'Dodaj dyspozytora'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingDispatcher(false);
                  setEditingDispatcher(null);
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

      {/* Dispatchers List */}
      <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
        <div className="p-6 border-b border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white">
            Lista Dyspozytorów ({filteredDispatchers.length})
          </h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  <th className="pb-3 text-gray-300 font-medium">Dyspozytor</th>
                  <th className="pb-3 text-gray-300 font-medium">ID Pracownika</th>
                  <th className="pb-3 text-gray-300 font-medium">Email</th>
                  <th className="pb-3 text-gray-300 font-medium">Zmiana</th>
                  <th className="pb-3 text-gray-300 font-medium">Rejony</th>
                  <th className="pb-3 text-gray-300 font-medium">Max zleceń</th>
                  <th className="pb-3 text-gray-300 font-medium">Status</th>
                  <th className="pb-3 text-gray-300 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredDispatchers.map((dispatcher) => (
                  <tr key={dispatcher.id} className="border-b border-[#3d3d3d] last:border-b-0">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="text-white">{dispatcher.name}</span>
                          {dispatcher.trainingCompleted && (
                            <div className="text-xs text-green-400">✓ Przeszkolony</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-gray-300 font-mono">{dispatcher.employeeId}</td>
                    <td className="py-4 text-gray-300">{dispatcher.email}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getShiftBadge(dispatcher.shift)}`}>
                        {getShiftText(dispatcher.shift)}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(dispatcher.assignedZones) ? dispatcher.assignedZones : []).slice(0, 3).map((zone) => (
                          <span key={zone} className="bg-[#2a2a2a] text-white px-2 py-1 rounded text-xs">
                            {zone}
                          </span>
                        ))}
                        {(dispatcher.assignedZones?.length ?? 0) > 3 && (
                          <span className="bg-[#2a2a2a] text-white px-2 py-1 rounded text-xs">
                            +{(dispatcher.assignedZones?.length ?? 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-gray-300">{dispatcher.maxConcurrentOrders}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(dispatcher.status)}`}>
                        {dispatcher.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditDispatcher(dispatcher)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDispatcher(dispatcher.id)}
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
            
            {filteredDispatchers.length === 0 && (
              <div className="text-center py-8 text-gray-100">
                Brak dyspozytorów spełniających kryteria wyszukiwania
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatcherManagement;
