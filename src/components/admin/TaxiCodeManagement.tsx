import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Hash, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { Region, TaxiCode } from '../../types';
import { regionService } from '../../services/regionService';
import { userService } from '../../services/userService';

const TaxiCodeManagement: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [taxiCodes, setTaxiCodes] = useState<TaxiCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<TaxiCode | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedRegionForGeneration, setSelectedRegionForGeneration] = useState<string>('');
  const [generateCount, setGenerateCount] = useState(10);
  const [formData, setFormData] = useState({
    code: '',
    region_id: '',
    status: 'available' as 'available' | 'assigned' | 'inactive',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [regionsData, codesData] = await Promise.all([
        regionService.getRegions(),
        regionService.getTaxiCodes(),
      ]);
      setRegions(regionsData);
      setTaxiCodes(codesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingCode) {
        await regionService.updateTaxiCode(editingCode.id, {
          code: formData.code,
          region_id: formData.region_id,
          status: formData.status,
        });
      } else {
        await regionService.createTaxiCode({
          code: formData.code,
          region_id: formData.region_id,
          status: formData.status,
        });
      }

      await loadData();
      setShowForm(false);
      setEditingCode(null);
      setFormData({ code: '', region_id: '', status: 'available' });
    } catch (error) {
      console.error('Error saving taxi code:', error);
      alert('Błąd podczas zapisywania kodu taxi');
    }
  };

  const handleEdit = (code: TaxiCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      region_id: code.region_id,
      status: code.status,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten kod taxi?')) return;

    try {
      await regionService.deleteTaxiCode(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting taxi code:', error);
      alert('Błąd podczas usuwania kodu taxi');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      available: { bg: 'bg-green-600', text: 'Dostępny', icon: CheckCircle },
      assigned: { bg: 'bg-blue-600', text: 'Przydzielony', icon: Clock },
      inactive: { bg: 'bg-gray-600', text: 'Nieaktywny', icon: XCircle },
    };
    return badges[status as keyof typeof badges] || badges.inactive;
  };

  const getDriverName = (driverId?: string) => {
    if (!driverId) return null;
    const drivers = userService.getUsersByRole('driver');
    const driver = drivers.find(d => d.id === driverId);
    return driver?.name || driverId;
  };

  const getTaxiCodesByRegion = (regionId: string) => {
    return taxiCodes.filter(code => code.region_id === regionId);
  };

  const handleGenerateCodes = async () => {
    if (!selectedRegionForGeneration) {
      alert('Wybierz rejon');
      return;
    }

    try {
      await regionService.generateCodesForRegion(selectedRegionForGeneration, generateCount);
      await loadData();
      setShowGenerateModal(false);
      setSelectedRegionForGeneration('');
      setGenerateCount(10);
    } catch (error) {
      console.error('Error generating codes:', error);
      alert('Błąd podczas generowania kodów taxi');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Kodami Taxi</h2>
          <p className="text-gray-300">Przypisuj kody taxi do rejonów</p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
          >
            <Zap className="w-4 h-4" />
            <span>Generuj kody</span>
          </button>
          <button
            onClick={() => {
              setEditingCode(null);
              setFormData({ code: '', region_id: regions[0]?.id || '', status: 'available' });
              setShowForm(true);
            }}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
          >
            <Plus className="w-4 h-4" />
            <span>Dodaj kod taxi</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {regions.map((region) => {
          const regionCodes = getTaxiCodesByRegion(region.id);

          return (
            <div
              key={region.id}
              className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">
                    {region.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{region.name}</h3>
                    {region.description && (
                      <p className="text-sm text-gray-300">{region.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-300">Kody taxi</div>
                  <div className="text-2xl font-bold text-white">{regionCodes.length}</div>
                </div>
              </div>

              {regionCodes.length === 0 ? (
                <div className="text-center py-8 text-gray-100 text-sm border-2 border-dashed border-[#3d3d3d] rounded-md">
                  Brak kodów taxi w tym rejonie
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {regionCodes.map((code) => {
                    const statusBadge = getStatusBadge(code.status);
                    const StatusIcon = statusBadge.icon;
                    const driverName = getDriverName(code.driver_id);

                    return (
                      <div
                        key={code.id}
                        className="bg-[#272727] rounded-md p-3 border border-[#4a4a4a]"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Hash className="w-4 h-4 text-blue-400" />
                            <span className="font-mono font-semibold text-white text-lg">
                              {code.code}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className={`flex items-center space-x-1 ${statusBadge.bg} text-white px-2 py-1 rounded text-xs`}>
                              <StatusIcon className="w-3 h-3" />
                              <span>{statusBadge.text}</span>
                            </div>
                            <button
                              onClick={() => handleEdit(code)}
                              className="text-blue-400 hover:text-blue-300 p-1"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(code.id)}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {driverName && (
                          <div className="text-xs text-gray-300">
                            Kierowca: {driverName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {regions.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <Hash className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">Brak rejonów</p>
          <p className="text-sm">Najpierw utwórz rejony w zarządzaniu rejonami</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-[#272727]/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e1e1e] rounded-xl w-full max-w-md border border-[#3d3d3d] shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">
                  {editingCode ? 'Edytuj Kod Taxi' : 'Nowy Kod Taxi'}
                </h3>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingCode(null);
                  }}
                  className="text-gray-300 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Kod Taxi
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="np. 101"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Rejon
                  </label>
                  <select
                    value={formData.region_id}
                    onChange={(e) => setFormData({ ...formData, region_id: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Wybierz rejon</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        Rejon {region.number} - {region.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'available' | 'assigned' | 'inactive' })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="available">Dostępny</option>
                    <option value="assigned">Przydzielony</option>
                    <option value="inactive">Nieaktywny</option>
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingCode ? 'Zapisz zmiany' : 'Dodaj kod'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingCode(null);
                    }}
                    className="bg-[#2a2a2a] hover:bg-[#272727] text-white font-medium px-6 py-3 rounded-md transition-colors duration-200"
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="fixed inset-0 bg-[#272727]/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e1e1e] rounded-xl w-full max-w-md border border-[#3d3d3d] shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Generuj Kody Taxi</h3>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="text-gray-300 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Wybierz rejon
                  </label>
                  <select
                    value={selectedRegionForGeneration}
                    onChange={(e) => setSelectedRegionForGeneration(e.target.value)}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Wybierz rejon</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        Rejon {region.number} - {region.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Liczba kodów do wygenerowania
                  </label>
                  <input
                    type="number"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(parseInt(e.target.value) || 10)}
                    min="1"
                    max="50"
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-gray-300 mt-1">
                    Kody będą generowane automatycznie w formacie [numer_rejonu][01-99]
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={handleGenerateCodes}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Generuj kody</span>
                  </button>
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    className="bg-[#2a2a2a] hover:bg-[#272727] text-white font-medium px-6 py-3 rounded-md transition-colors duration-200"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxiCodeManagement;
