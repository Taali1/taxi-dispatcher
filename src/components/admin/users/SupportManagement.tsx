import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Headphones, Search, Globe } from 'lucide-react';
import { userService } from '../../../services/userService';
import { SupportAgent, UserFilter } from '../../../types/users';

interface SupportManagementProps {
  filter: UserFilter;
}

const SupportManagement: React.FC<SupportManagementProps> = ({ filter }) => {
  const [supportAgents, setSupportAgents] = useState<SupportAgent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<SupportAgent[]>([]);
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SupportAgent | null>(null);
  const [localFilter, setLocalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
  });

  const [agentForm, setAgentForm] = useState({
    name: '',
    email: '',
    password: '',
    agentId: '',
    department: 'customer' as 'technical' | 'customer' | 'billing',
    languages: [] as string[],
    ticketLimit: 20,
    specializations: [] as string[],
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  useEffect(() => {
    loadSupportAgents();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [supportAgents, filter, localFilter]);

  const loadSupportAgents = () => {
    const agents = userService.getUsersByRole<SupportAgent>('support');
    setSupportAgents(agents);
  };

  const applyFilters = () => {
    let filtered = supportAgents;
    
    // Apply global filter
    if (filter.search || filter.status) {
      filtered = userService.filterUsers(filtered, filter);
    }
    
    // Apply local filter
    if (localFilter.search || localFilter.status) {
      filtered = userService.filterUsers(filtered, localFilter);
    }
    
    setFilteredAgents(filtered);
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await userService.createSupportAgent({
        name: agentForm.name,
        email: agentForm.email,
        password: agentForm.password,
        agentId: agentForm.agentId,
        department: agentForm.department,
        languages: agentForm.languages,
        ticketLimit: agentForm.ticketLimit,
        specializations: agentForm.specializations,
        status: agentForm.status,
      });

      if (!result.success) {
        alert(`Błąd podczas dodawania agenta wsparcia: ${result.error}`);
        return;
      }

      resetForm();
      setIsAddingAgent(false);
      loadSupportAgents();
    } catch (error) {
      console.error('Error adding support agent:', error);
      alert('Wystąpił nieoczekiwany błąd podczas dodawania agenta wsparcia');
    }
  };

  const handleEditAgent = (agent: SupportAgent) => {
    setEditingAgent(agent);
    setAgentForm({
      name: agent.name,
      email: agent.email,
      password: '',
      agentId: agent.agentId,
      department: agent.department,
      languages: agent.languages,
      ticketLimit: agent.ticketLimit,
      specializations: agent.specializations,
      status: agent.status,
    });
  };

  const handleUpdateAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAgent) return;

    try {
      const updateData: Partial<SupportAgent> = {
        name: agentForm.name,
        email: agentForm.email,
        agentId: agentForm.agentId,
        department: agentForm.department,
        languages: agentForm.languages,
        ticketLimit: agentForm.ticketLimit,
        specializations: agentForm.specializations,
        status: agentForm.status,
      };

      if (agentForm.password) {
        updateData.password = agentForm.password;
      }

      const result = await userService.updateSupportAgent(editingAgent.id, updateData);

      if (!result.success) {
        alert(`Błąd podczas aktualizacji agenta wsparcia: ${result.error}`);
        return;
      }

      resetForm();
      setEditingAgent(null);
      loadSupportAgents();
    } catch (error) {
      console.error('Error updating support agent:', error);
      alert('Wystąpił nieoczekiwany błąd podczas aktualizacji agenta wsparcia');
    }
  };

  const handleDeleteAgent = (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego agenta wsparcia?')) return;
    
    try {
      userService.deleteSupportAgent(id);
      loadSupportAgents();
    } catch (error) {
      alert('Błąd podczas usuwania agenta wsparcia');
    }
  };

  const resetForm = () => {
    setAgentForm({
      name: '',
      email: '',
      password: '',
      agentId: '',
      department: 'customer',
      languages: [],
      ticketLimit: 20,
      specializations: [],
      status: 'active',
    });
  };

  const toggleLanguage = (language: string) => {
    const newLanguages = agentForm.languages.includes(language)
      ? agentForm.languages.filter(l => l !== language)
      : [...agentForm.languages, language];
    
    setAgentForm({ ...agentForm, languages: newLanguages });
  };

  const toggleSpecialization = (specialization: string) => {
    const newSpecializations = agentForm.specializations.includes(specialization)
      ? agentForm.specializations.filter(s => s !== specialization)
      : [...agentForm.specializations, specialization];
    
    setAgentForm({ ...agentForm, specializations: newSpecializations });
  };

  const availableLanguages = [
    { code: 'pl', name: 'Polski' },
    { code: 'en', name: 'Angielski' },
    { code: 'de', name: 'Niemiecki' },
    { code: 'fr', name: 'Francuski' },
    { code: 'es', name: 'Hiszpański' },
    { code: 'it', name: 'Włoski' },
  ];

  const availableSpecializations = [
    'technical', 'billing', 'complaints', 'driver_support', 'customer_onboarding', 'payment_issues'
  ];

  const getDepartmentBadge = (department: string) => {
    const badges = {
      technical: 'bg-blue-600 text-white',
      customer: 'bg-green-600 text-white',
      billing: 'bg-orange-600 text-white',
    };
    return badges[department as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const getDepartmentText = (department: string) => {
    const departmentText = {
      technical: 'Techniczne',
      customer: 'Obsługa klienta',
      billing: 'Rozliczenia',
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
          onClick={() => setIsAddingAgent(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj agenta wsparcia</span>
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Wsparciem</h2>
        <p className="text-gray-100">Dodawaj i zarządzaj agentami wsparcia</p>
      </div>

      {/* Local Filters */}
      <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Szukaj agentów wsparcia
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-100" />
              <input
                type="text"
                value={localFilter.search}
                onChange={(e) => setLocalFilter({ ...localFilter, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa, email lub ID agenta..."
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
      {(isAddingAgent || editingAgent) && (
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingAgent ? 'Edytuj Agenta Wsparcia' : 'Nowy Agent Wsparcia'}
          </h3>
          
          <form onSubmit={editingAgent ? handleUpdateAgent : handleAddAgent} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Imię i nazwisko</label>
                <input
                  type="text"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Kowalski"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={agentForm.email}
                  onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jan@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hasło {editingAgent && '(pozostaw puste aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  value={agentForm.password}
                  onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingAgent}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ID agenta</label>
                <input
                  type="text"
                  value={agentForm.agentId}
                  onChange={(e) => setAgentForm({ ...agentForm, agentId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="SUP001"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Limit zgłoszeń</label>
                <input
                  type="number"
                  value={agentForm.ticketLimit}
                  onChange={(e) => setAgentForm({ ...agentForm, ticketLimit: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="100"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dział</label>
                <select
                  value={agentForm.department}
                  onChange={(e) => setAgentForm({ ...agentForm, department: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="customer">Obsługa klienta</option>
                  <option value="technical">Wsparcie techniczne</option>
                  <option value="billing">Rozliczenia</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={agentForm.status}
                  onChange={(e) => setAgentForm({ ...agentForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Aktywny</option>
                  <option value="inactive">Nieaktywny</option>
                  <option value="suspended">Zawieszony</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Języki</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableLanguages.map((language) => (
                  <label key={language.code} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agentForm.languages.includes(language.code)}
                      onChange={() => toggleLanguage(language.code)}
                      className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-gray-300 text-sm">{language.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Specjalizacje</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableSpecializations.map((specialization) => (
                  <label key={specialization} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agentForm.specializations.includes(specialization)}
                      onChange={() => toggleSpecialization(specialization)}
                      className="rounded border-[#4a4a4a] text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-gray-300 text-sm capitalize">{specialization.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
              >
                {editingAgent ? 'Zapisz zmiany' : 'Dodaj agenta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingAgent(false);
                  setEditingAgent(null);
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

      {/* Support Agents List */}
      <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
        <div className="p-6 border-b border-[#3d3d3d]">
          <h3 className="text-lg font-semibold text-white">
            Lista Agentów Wsparcia ({filteredAgents.length})
          </h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  <th className="pb-3 text-gray-300 font-medium">Agent</th>
                  <th className="pb-3 text-gray-300 font-medium">ID Agenta</th>
                  <th className="pb-3 text-gray-300 font-medium">Email</th>
                  <th className="pb-3 text-gray-300 font-medium">Dział</th>
                  <th className="pb-3 text-gray-300 font-medium">Języki</th>
                  <th className="pb-3 text-gray-300 font-medium">Limit</th>
                  <th className="pb-3 text-gray-300 font-medium">Status</th>
                  <th className="pb-3 text-gray-300 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-b border-[#3d3d3d] last:border-b-0">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-purple-600 w-8 h-8 rounded-full flex items-center justify-center">
                          <Headphones className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-white">{agent.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-gray-300 font-mono">{agent.agentId}</td>
                    <td className="py-4 text-gray-300">{agent.email}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDepartmentBadge(agent.department)}`}>
                        {getDepartmentText(agent.department)}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center space-x-1">
                        <Globe className="w-3 h-3 text-gray-100" />
                        <span className="text-gray-300 text-sm">
                          {agent.languages.join(', ').toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 text-gray-300">{agent.ticketLimit}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(agent.status)}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditAgent(agent)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAgent(agent.id)}
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
            
            {filteredAgents.length === 0 && (
              <div className="text-center py-8 text-gray-100">
                Brak agentów wsparcia spełniających kryteria wyszukiwania
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportManagement;
