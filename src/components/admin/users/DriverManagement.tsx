import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Phone, X, User, Car, Hash, Shield, Tag, Eye, Trash2 } from 'lucide-react';
import { userService } from '../../../services/userService';
import { Driver, UserFilter } from '../../../types/users';
import { preferencesService, Preference } from '../../../services/preferencesService';

interface DriverManagementProps {
  filter: UserFilter;
}

const DriverManagement: React.FC<DriverManagementProps> = ({ filter }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [localFilter, setLocalFilter] = useState<UserFilter>({
    search: '',
    status: undefined,
    zone: undefined,
  });

  const [availablePreferences, setAvailablePreferences] = useState<Preference[]>([]);
  const [selectedPreferenceIds, setSelectedPreferenceIds] = useState<number[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailsDriver, setDetailsDriver] = useState<Driver | null>(null);
  const [detailsPrefs, setDetailsPrefs] = useState<string[]>([]);

  // ── Blokady kierowca ↔ klient ─────────────────────────────────────────────
  const [driverBlocks, setDriverBlocks] = useState<any[]>([]);
  const [showAddBlockModal, setShowAddBlockModal] = useState(false);
  const [blockSearch, setBlockSearch] = useState('');
  const [blockSearchResults, setBlockSearchResults] = useState<any[]>([]);
  const [blockSearchLoading, setBlockSearchLoading] = useState(false);

  // ── Zaznaczanie i masowe usuwanie ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const allSelected = filteredDrivers.length > 0 && filteredDrivers.every(d => selectedIds.has(d.id));
  const someSelected = filteredDrivers.some(d => selectedIds.has(d.id)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredDrivers.forEach(d => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredDrivers.forEach(d => next.add(d.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmBulkDelete = () => {
    try {
      selectedIds.forEach(id => userService.deleteDriver(id));
      setSelectedIds(new Set());
      loadDrivers();
    } catch {
      alert('Błąd podczas usuwania kierowców');
    } finally {
      setBulkDeleteConfirm(false);
    }
  };

  const [driverForm, setDriverForm] = useState({
    name: '',
    driverCode: '',
    pin: '',
    licenseNumber: '',
    sideNumber: '',
    phoneNumber: '',
    vehicleBrand: '',
    vehicleModel: '',
    vehicleColor: '',
    registrationNumber: '',
    status: 'inactive' as 'active' | 'inactive' | 'suspended',
    suspendedUntil: '',
    taxiMeterEnabled: false,
  });

  useEffect(() => {
    loadDrivers();
    loadAvailablePreferences();
  }, []);

  const loadAvailablePreferences = async () => {
    const prefs = await preferencesService.getAll();
    setAvailablePreferences(prefs);
  };

  useEffect(() => {
    applyFilters();
  }, [drivers, filter, localFilter]);

  const loadDrivers = () => {
    const driversList = userService.getUsersByRole<Driver>('driver');
    setDrivers(driversList);
  };

  const applyFilters = () => {
    let filtered = drivers;
    
    // Apply global filter
    if (filter.search || filter.status || filter.zone) {
      filtered = userService.filterUsers(filtered, filter);
    }
    
    // Apply local filter
    if (localFilter.search || localFilter.status) {
      filtered = userService.filterUsers(filtered, localFilter);
    }
    
    setFilteredDrivers(filtered);
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();

    if (driverForm.status === 'suspended' && !driverForm.suspendedUntil) {
      alert('Musisz określić datę zawieszenia konta');
      return;
    }

    try {
      const result = await userService.createDriver({
        name: driverForm.name,
        email: `${driverForm.driverCode}@driver.local`,
        password: driverForm.pin,
        driverCode: driverForm.driverCode,
        pin: driverForm.pin,
        licenseNumber: driverForm.licenseNumber,
        sideNumber: driverForm.sideNumber,
        phoneNumber: driverForm.phoneNumber,
        vehicleBrand: driverForm.vehicleBrand,
        vehicleModel: driverForm.vehicleModel,
        vehicleColor: driverForm.vehicleColor,
        registrationNumber: driverForm.registrationNumber,
        status: driverForm.status,
        suspendedUntil: driverForm.status === 'suspended' ? driverForm.suspendedUntil : undefined,
      });

      if (!result.success) {
        alert(`Błąd podczas dodawania kierowcy: ${result.error}`);
        return;
      }

      // Zapisz preferencje kierowcy
      if (result.data?.id) {
        await preferencesService.setDriverPreferences(result.data.id, selectedPreferenceIds);
        await fetch(`/api/drivers/${result.data.id}/taximeter-enabled`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: driverForm.taxiMeterEnabled }),
        });
      }

      resetForm();
      setIsAddingDriver(false);
      loadDrivers();
    } catch (error) {
      console.error('Error adding driver:', error);
      alert('Wystąpił nieoczekiwany błąd podczas dodawania kierowcy');
    }
  };

  const handleEditDriver = async (driver: Driver) => {
    setEditingDriver(driver);
    setDriverForm({
      name: driver.name,
      driverCode: driver.driverCode,
      pin: driver.pin || '',
      licenseNumber: driver.licenseNumber,
      sideNumber: driver.sideNumber || '',
      phoneNumber: driver.phoneNumber,
      vehicleBrand: driver.vehicleBrand || '',
      vehicleModel: driver.vehicleModel || '',
      vehicleColor: driver.vehicleColor || '',
      registrationNumber: driver.registrationNumber || '',
      status: driver.status as 'active' | 'inactive' | 'suspended',
      suspendedUntil: driver.suspendedUntil ? driver.suspendedUntil.split('T')[0] : '',
    });

    // Załaduj preferencje kierowcy
    const driverPrefs = await preferencesService.getDriverPreferences(driver.id);
    setSelectedPreferenceIds(driverPrefs.map(dp => dp.preference_id));

    // Załaduj ustawienie taksometru
    try {
      const r = await fetch(`/api/drivers/${driver.id}/taximeter-enabled`);
      const d = await r.json();
      if (d.success) setDriverForm(prev => ({ ...prev, taxiMeterEnabled: !!d.enabled }));
    } catch { /* ignore */ }
  };

  const handleUpdateDriver = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDriver) return;

    if (driverForm.status === 'suspended' && !driverForm.suspendedUntil) {
      alert('Musisz określić datę zawieszenia konta');
      return;
    }

    try {
      const updateData: Partial<Driver> = {
        name: driverForm.name,
        driverCode: driverForm.driverCode,
        pin: driverForm.pin,
        licenseNumber: driverForm.licenseNumber,
        sideNumber: driverForm.sideNumber,
        phoneNumber: driverForm.phoneNumber,
        vehicleBrand: driverForm.vehicleBrand,
        vehicleModel: driverForm.vehicleModel,
        vehicleColor: driverForm.vehicleColor,
        registrationNumber: driverForm.registrationNumber,
        status: driverForm.status,
        suspendedUntil: driverForm.status === 'suspended' ? driverForm.suspendedUntil : undefined,
      };

      const result = await userService.updateDriver(editingDriver.id, updateData);

      if (!result.success) {
        alert(`Błąd podczas aktualizacji kierowcy: ${result.error}`);
        return;
      }

      // Zapisz preferencje kierowcy
      await preferencesService.setDriverPreferences(editingDriver.id, selectedPreferenceIds);
      await fetch(`/api/drivers/${editingDriver.id}/taximeter-enabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: driverForm.taxiMeterEnabled }),
      });

      resetForm();
      setEditingDriver(null);
      loadDrivers();
    } catch (error) {
      console.error('Error updating driver:', error);
      alert('Wystąpił nieoczekiwany błąd podczas aktualizacji kierowcy');
    }
  };

  const handleShowDetails = async (driver: Driver) => {
    setDetailsDriver(driver);
    setDriverBlocks([]);
    const driverPrefs = await preferencesService.getDriverPreferences(driver.id);
    const allPrefs = await preferencesService.getAll();
    const names = driverPrefs.map(dp => {
      const p = allPrefs.find(p => p.id === dp.preference_id);
      return p?.name ?? '';
    }).filter(Boolean);
    setDetailsPrefs(names);
    const blocksRes = await fetch(`/api/admin/blocks/driver/${driver.id}`).then(r => r.json()).catch(() => ({ data: [] }));
    setDriverBlocks(blocksRes.data ?? []);
  };

  const loadDriverBlocks = async (driverId: string) => {
    const res = await fetch(`/api/admin/blocks/driver/${driverId}`).then(r => r.json()).catch(() => ({ data: [] }));
    setDriverBlocks(res.data ?? []);
  };

  const removeDriverBlock = async (blockId: number) => {
    await fetch(`/api/admin/blocks/${blockId}`, { method: 'DELETE' });
    if (detailsDriver) loadDriverBlocks(detailsDriver.id);
  };

  const searchClientsForBlock = async (q: string) => {
    setBlockSearch(q);
    if (q.length < 2) { setBlockSearchResults([]); return; }
    setBlockSearchLoading(true);
    const res = await fetch(`/api/admin/clients-search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({ data: [] }));
    setBlockSearchResults(res.data ?? []);
    setBlockSearchLoading(false);
  };

  const addDriverBlock = async (client: any) => {
    if (!detailsDriver) return;
    await fetch('/api/admin/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: detailsDriver.id, client_id: client.id, blocked_by: 'driver' }),
    });
    setShowAddBlockModal(false);
    setBlockSearch('');
    setBlockSearchResults([]);
    loadDriverBlocks(detailsDriver.id);
  };

  const handleDeleteDriver = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    try {
      userService.deleteDriver(deleteConfirmId);
      loadDrivers();
    } catch (error) {
      alert('Błąd podczas usuwania kierowcy');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const resetForm = () => {
    setDriverForm({
      name: '',
      driverCode: '',
      pin: '',
      licenseNumber: '',
      sideNumber: '',
      phoneNumber: '',
      vehicleBrand: '',
      vehicleModel: '',
      vehicleColor: '',
      registrationNumber: '',
      status: 'inactive',
      suspendedUntil: '',
      taxiMeterEnabled: false,
    });
    setSelectedPreferenceIds([]);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-600 text-white',
      inactive: 'bg-gray-600 text-white',
      suspended: 'bg-red-600 text-white',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-600 text-white';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      active: 'Aktywny',
      inactive: 'Nieaktywny',
      suspended: 'Zawieszony',
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <div className="space-y-6">
      {/* Local Filters */}
      <div className="bg-[#1e1e1e] rounded-md p-4 border border-[#3d3d3d]">
        <div className="flex items-end gap-4">
          <div className="w-64">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Szukaj kierowców
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-100" />
              <input
                type="text"
                value={localFilter.search}
                onChange={(e) => setLocalFilter({ ...localFilter, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nazwa, email lub kod..."
              />
            </div>
          </div>

          <div className="w-44">
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

          <div className="ml-auto">
            <button
              onClick={() => setIsAddingDriver(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>Dodaj kierowcę</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal potwierdzenia usunięcia */}
      {deleteConfirmId && createPortal(
        <div className="fixed inset-0 bg-[#272727] bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-base font-bold text-white">Usuń kierowcę</h3>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-100 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-300 text-sm mb-6">Czy na pewno chcesz usunąć tego kierowcę? Tej operacji nie można cofnąć.</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-[#272727] hover:bg-[#2a2a2a] text-white transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Usuń
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal potwierdzenia masowego usunięcia */}
      {bulkDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-[#272727] bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-base font-bold text-white">Usuń zaznaczonych kierowców</h3>
              <button onClick={() => setBulkDeleteConfirm(false)} className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-300 text-sm mb-6">
                Czy na pewno chcesz usunąć <span className="font-bold text-red-600">{selectedIds.size}</span> zaznaczonych kierowców? Tej operacji nie można cofnąć.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2 rounded-md text-sm font-semibold bg-[#272727] hover:bg-[#2a2a2a] text-white transition-colors">
                  Anuluj
                </button>
                <button onClick={confirmBulkDelete} className="px-4 py-2 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors">
                  Usuń {selectedIds.size} kierowców
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Details Modal */}
      {detailsDriver && createPortal(
        <div
          className="fixed inset-0 bg-[#272727]/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailsDriver(null); }}
        >
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex">

            {/* Panel boczny */}
            <div className="w-64 shrink-0 bg-[#1e1e1e] border-r border-[#3d3d3d] flex flex-col items-center p-6 gap-4">
              <div className="text-center">
                <p className="text-white font-bold text-xl leading-tight">{detailsDriver.name}</p>
              </div>
              <div className="w-full border-t border-[#3d3d3d] pt-4 divide-y divide-[#3d3d3d]">
                <div className="pb-3">
                  <p className="text-xs text-gray-300">Telefon</p>
                  <p className="text-white text-sm font-medium mt-0.5">{detailsDriver.phoneNumber || '—'}</p>
                </div>
                <div className="py-3">
                  <p className="text-xs text-gray-300">Kod kierowcy</p>
                  <p className="text-white text-sm font-mono font-semibold mt-0.5">{detailsDriver.driverCode}</p>
                </div>
                <div className="pt-3">
                  <p className="text-xs text-gray-300">Nr boczny</p>
                  <p className="text-white text-sm font-mono font-semibold mt-0.5">{detailsDriver.sideNumber || '—'}</p>
                </div>
              </div>

              {detailsDriver.status === 'suspended' && detailsDriver.suspendedUntil && (
                <div className="w-full bg-red-900/20 border border-red-700/40 rounded-xl p-3 flex items-start gap-2">
                  <Shield className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-400 font-semibold">Zawieszone do</p>
                    <p className="text-red-200 text-sm font-semibold">{new Date(detailsDriver.suspendedUntil).toLocaleDateString('pl-PL')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Główna treść */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Nagłówek */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
                <p className="text-xs font-semibold text-gray-100 uppercase tracking-widest">Szczegóły kierowcy</p>
                <button
                  onClick={() => setDetailsDriver(null)}
                  className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-100 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Siatka kart */}
              <div className="p-5 grid grid-cols-2 gap-4 flex-1">

                {/* Licencja */}
                <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Licencja i identyfikacja</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-300">Nr licencji</p>
                      <p className="text-white font-mono font-semibold mt-0.5">{detailsDriver.licenseNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300">Nr boczny</p>
                      <p className="text-white font-mono font-semibold mt-0.5">{detailsDriver.sideNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300">Kod kierowcy</p>
                      <p className="text-white font-mono font-semibold mt-0.5">{detailsDriver.driverCode}</p>
                    </div>
                  </div>
                </div>

                {/* Pojazd */}
                <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Pojazd</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-300">Marka i model</p>
                      <p className="text-white font-semibold mt-0.5">{detailsDriver.vehicleBrand} {detailsDriver.vehicleModel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300">Nr rejestracyjny</p>
                      <p className="text-white font-mono font-semibold mt-0.5">{detailsDriver.registrationNumber || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300">Kolor</p>
                      <p className="text-white mt-0.5">{detailsDriver.vehicleColor || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Preferencje — pełna szerokość */}
                <div className="col-span-2 bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Preferencje</p>
                  {detailsPrefs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detailsPrefs.map((name) => (
                        <span key={name} className="px-3 py-1 bg-pink-600/15 border border-pink-500/30 text-pink-300 rounded-md text-sm font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-300 text-sm">Brak przypisanych preferencji</p>
                  )}
                </div>

                {/* Blokady klientów — pełna szerokość */}
                <div className="col-span-2 bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider">Blokady klientów</p>
                    <button
                      onClick={() => { setShowAddBlockModal(true); setBlockSearch(''); setBlockSearchResults([]); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Dodaj blokadę
                    </button>
                  </div>
                  {driverBlocks.length === 0 ? (
                    <p className="text-gray-400 text-sm">Brak blokad</p>
                  ) : (
                    <div className="space-y-2">
                      {driverBlocks.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between bg-[#272727] rounded-lg px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-300 font-mono">{b.client_code}</span>
                            <span className="text-sm text-gray-200">{b.client_name}</span>
                            <span className="text-xs text-gray-400">{b.phone_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.blocked_by === 'driver' ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'}`}>
                              {b.blocked_by === 'driver' ? 'przez kierowcę' : 'przez klienta'}
                            </span>
                          </div>
                          <button onClick={() => removeDriverBlock(b.id)} className="p-1.5 hover:bg-red-600/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Modal dodawania blokady klienta */}
      {showAddBlockModal && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10001] p-4">
          <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-base font-bold text-white">Zablokuj klienta</h3>
              <button onClick={() => setShowAddBlockModal(false)} className="p-1.5 hover:bg-[#272727] rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={blockSearch}
                  onChange={e => searchClientsForBlock(e.target.value)}
                  placeholder="Szukaj po nazwie, kodzie lub telefonie..."
                  className="w-full pl-9 pr-3 py-2.5 bg-[#272727] border border-[#3d3d3d] rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              {blockSearchLoading && <p className="text-gray-400 text-sm text-center py-2">Szukam...</p>}
              {blockSearchResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {blockSearchResults.map((c: any) => (
                    <button key={c.id} onClick={() => addDriverBlock(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a2a2a] rounded-lg text-left transition-colors">
                      <span className="text-xs font-bold text-gray-400 font-mono w-14 shrink-0">{c.client_code}</span>
                      <span className="text-sm text-white flex-1">{c.client_name}</span>
                      <span className="text-xs text-gray-400">{c.phone_number}</span>
                    </button>
                  ))}
                </div>
              )}
              {blockSearch.length >= 2 && !blockSearchLoading && blockSearchResults.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-2">Nie znaleziono klientów</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add/Edit Form Modal */}
      {(isAddingDriver || editingDriver) && createPortal(
        <div className="fixed inset-0 bg-[#272727] bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] w-full max-w-6xl flex flex-col max-h-[90vh]">

            {/* Nagłówek */}
            <div className="shrink-0 flex justify-between items-center px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-lg font-bold text-white">
                {editingDriver ? 'Edytuj kierowcę' : 'Nowy kierowca'}
              </h3>
              <button
                onClick={() => { setIsAddingDriver(false); setEditingDriver(null); resetForm(); }}
                className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingDriver ? handleUpdateDriver : handleAddDriver} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-6 flex gap-6 overflow-y-auto flex-1">

                {/* Lewa strona — główny formularz */}
                <div className="flex-1 space-y-5">

                  {/* Dane personalne */}
                  <div>
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Dane personalne</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Imię i nazwisko</label>
                        <input type="text" value={driverForm.name}
                          onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Jan Kowalski" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Numer telefonu</label>
                        <input type="tel" value={driverForm.phoneNumber}
                          onChange={(e) => setDriverForm({ ...driverForm, phoneNumber: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="+48 191 191 191" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Numer kodowy</label>
                        <input type="text" value={driverForm.driverCode}
                          onChange={(e) => setDriverForm({ ...driverForm, driverCode: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="191" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          PIN {editingDriver && <span className="text-gray-300 font-normal">(puste = bez zmian)</span>}
                        </label>
                        <input type="password" value={driverForm.pin}
                          onChange={(e) => setDriverForm({ ...driverForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="1234" maxLength={6} required={!editingDriver} />
                        <p className="text-xs text-gray-300 mt-1">4–6 cyfr</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Numer licencji</label>
                        <input type="text" value={driverForm.licenseNumber}
                          onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="ABC123456" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Numer boczny</label>
                        <input type="text" value={driverForm.sideNumber}
                          onChange={(e) => setDriverForm({ ...driverForm, sideNumber: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="191" required />
                      </div>
                    </div>
                  </div>

                  {/* Dane samochodu */}
                  <div>
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Dane samochodu</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Marka</label>
                        <input type="text" value={driverForm.vehicleBrand}
                          onChange={(e) => setDriverForm({ ...driverForm, vehicleBrand: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Toyota" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Model</label>
                        <input type="text" value={driverForm.vehicleModel}
                          onChange={(e) => setDriverForm({ ...driverForm, vehicleModel: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Corolla" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Kolor</label>
                        <input type="text" value={driverForm.vehicleColor}
                          onChange={(e) => setDriverForm({ ...driverForm, vehicleColor: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Biały" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Numer rejestracyjny</label>
                        <input type="text" value={driverForm.registrationNumber}
                          onChange={(e) => setDriverForm({ ...driverForm, registrationNumber: e.target.value })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="KR 12345" required />
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Status</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Status kierowcy</label>
                        <select value={driverForm.status}
                          onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value as any })}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="active">Aktywny</option>
                          <option value="inactive">Nieaktywny</option>
                          <option value="suspended">Zawieszony</option>
                        </select>
                      </div>
                      {driverForm.status === 'suspended' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1.5">Zawieszone do</label>
                          <input type="date" value={driverForm.suspendedUntil}
                            onChange={(e) => setDriverForm({ ...driverForm, suspendedUntil: e.target.value })}
                            className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            required min={new Date().toISOString().split('T')[0]} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Taksometr */}
                  <div>
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Taksometr</p>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <div
                        className={`relative w-11 h-6 rounded-full transition-colors ${driverForm.taxiMeterEnabled ? 'bg-blue-600' : 'bg-[#4a4a4a]'}`}
                        onClick={() => setDriverForm(prev => ({ ...prev, taxiMeterEnabled: !prev.taxiMeterEnabled }))}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${driverForm.taxiMeterEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm text-gray-300">Włącz wirtualny taksometr</span>
                    </label>
                  </div>
                </div>

                {/* Prawa strona — Preferencje */}
                {availablePreferences.length > 0 && (
                  <div className="w-56 shrink-0 border-l border-[#3d3d3d] pl-6">
                    <p className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">Preferencje</p>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {availablePreferences.map((pref) => {
                        const isChecked = selectedPreferenceIds.includes(pref.id);
                        return (
                          <label key={pref.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                              isChecked ? 'bg-pink-600/20 border border-pink-500/50' : 'bg-[#272727] border border-[#4a4a4a] hover:border-gray-400'
                            }`}
                          >
                            <input type="checkbox" checked={isChecked}
                              onChange={() => setSelectedPreferenceIds(prev =>
                                isChecked ? prev.filter(id => id !== pref.id) : [...prev, pref.id]
                              )}
                              className="w-4 h-4 rounded border-gray-400 text-pink-500 focus:ring-pink-500 bg-[#2a2a2a]"
                            />
                            <span className="text-sm text-white font-medium">{pref.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Stopka */}
              <div className="shrink-0 flex gap-3 justify-end px-6 py-4 border-t border-[#3d3d3d]">
                <button type="button"
                  onClick={() => { setIsAddingDriver(false); setEditingDriver(null); resetForm(); }}
                  className="px-5 py-2 rounded-md text-sm font-semibold bg-[#272727] hover:bg-[#2a2a2a] text-white transition-colors"
                >
                  Anuluj
                </button>
                <button type="submit"
                  className="px-5 py-2 rounded-md text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  {editingDriver ? 'Zapisz zmiany' : 'Dodaj kierowcę'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Drivers List */}
      <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
        <div className="p-6 border-b border-[#3d3d3d] flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">
            Lista Kierowców ({filteredDrivers.length})
          </h3>

          {/* Pasek akcji masowych — widoczny gdy coś zaznaczono */}
          {selectedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-red-700">
                Zaznaczono: <span className="font-bold">{selectedIds.size}</span>
              </span>
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Usuń zaznaczone
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                Odznacz
              </button>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  {/* Checkbox "zaznacz wszystkie" */}
                  <th className="pb-3 pr-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-[#4a4a4a] text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="pb-3 text-gray-300 font-medium">Kierowca</th>
                  <th className="pb-3 text-gray-300 font-medium">Kod</th>
                  <th className="pb-3 text-gray-300 font-medium">Email</th>
                  <th className="pb-3 text-gray-300 font-medium">Telefon</th>
                  <th className="pb-3 text-gray-300 font-medium">Nr boczny</th>
                  <th className="pb-3 text-gray-300 font-medium">Pojazd</th>
                  <th className="pb-3 text-gray-300 font-medium">Status</th>
                  <th className="pb-3 text-gray-300 font-medium w-1">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((driver) => {
                  const isSelected = selectedIds.has(driver.id);
                  return (
                    <tr
                      key={driver.id}
                      className={`border-b border-[#3d3d3d] last:border-b-0 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-[#141414]'}`}
                    >
                      {/* Checkbox wiersza */}
                      <td className="py-4 pr-3 w-8">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(driver.id)}
                          className="w-4 h-4 rounded border-[#4a4a4a] text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-4">
                        <span className="text-white font-semibold">{driver.name}</span>
                      </td>
                      <td className="py-4 text-gray-300 font-mono">{driver.driverCode}</td>
                      <td className="py-4 text-gray-300">{driver.email}</td>
                      <td className="py-4 text-gray-300">
                        <div className="flex items-center space-x-1">
                          <Phone className="w-3 h-3" />
                          <span>{driver.phoneNumber}</span>
                        </div>
                      </td>
                      <td className="py-4 text-gray-300 font-mono">{driver.sideNumber}</td>
                      <td className="py-4">
                        <div className="text-sm">
                          <div className="text-white">{driver.vehicleBrand} {driver.vehicleModel}</div>
                          <div className="text-gray-100">{driver.vehicleColor} • {driver.registrationNumber}</div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-md text-sm font-medium ${getStatusBadge(driver.status)}`}>
                          {getStatusLabel(driver.status)}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleShowDetails(driver)}
                            className="px-3 py-1 rounded-md text-sm font-semibold bg-[#2a2a2a] hover:bg-[#333333] text-white transition-colors"
                          >
                            Szczegóły
                          </button>
                          <button
                            onClick={() => handleEditDriver(driver)}
                            className="px-3 py-1 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDeleteDriver(driver.id)}
                            className="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Usuń
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredDrivers.length === 0 && (
              <div className="text-center py-8 text-gray-100">
                Brak kierowców spełniających kryteria wyszukiwania
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverManagement;
