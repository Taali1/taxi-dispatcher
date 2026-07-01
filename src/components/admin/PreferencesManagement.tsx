import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Save, X, ListChecks } from 'lucide-react';
import { preferencesService, Preference } from '../../services/preferencesService';
import { zoneService, Zone } from '../../services/zoneService';

const PRESET_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#64748b', '#1e293b', '#ffffff',
];

const DEFAULT_COLOR = '#3b82f6';

const PreferencesManagement: React.FC = () => {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal dodawania
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  // Edycja
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState(DEFAULT_COLOR);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [data, zonesData] = await Promise.all([
      preferencesService.getAll(),
      zoneService.getZones(),
    ]);
    setPreferences(data);
    setZones(zonesData.filter(z => z.isActive !== false));
    setLoading(false);
  };

  const openAddModal = () => {
    setNewName('');
    setNewColor(DEFAULT_COLOR);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewName('');
    setNewColor(DEFAULT_COLOR);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    const result = await preferencesService.create(newName.trim(), newColor);
    if (result.success) {
      closeAddModal();
      await loadAll();
    } else {
      alert(`Nie udalo sie dodac preferencji: ${result.error}`);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Czy na pewno chcesz usunac te preferencje?')) return;
    const result = await preferencesService.delete(id);
    if (result.success) {
      await loadAll();
    } else {
      alert(`Blad usuwania: ${result.error}`);
    }
  };

  const handleEditStart = (pref: Preference) => {
    setEditingId(pref.id);
    setEditingName(pref.name);
    setEditingColor(pref.color || DEFAULT_COLOR);
  };

  const handleEditSave = async () => {
    if (editingId === null || !editingName.trim()) return;
    setSaving(true);
    const result = await preferencesService.update(editingId, editingName.trim(), editingColor);
    if (result.success) {
      setEditingId(null);
      await loadAll();
    } else {
      alert(`Blad edycji: ${result.error}`);
    }
    setSaving(false);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName('');
    setEditingColor(DEFAULT_COLOR);
  };

  const handleZonePreference = async (zoneId: string, prefId: number | null) => {
    try {
      const res = await fetch(`/api/update/zones/${zoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference_id: prefId }),
      });
      const json = await res.json();
      if (json.success) {
        await loadAll();
      } else {
        alert(`Blad przypisania: ${json.error}`);
      }
    } catch (err) {
      alert(`Blad: ${err}`);
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
      {/* Naglowek */}
      <div className="flex items-center gap-3">
        <ListChecks className="w-6 h-6 text-pink-400" />
        <h2 className="text-xl font-bold text-white">Preferencje</h2>
        <span className="text-sm text-gray-300">({preferences.length})</span>
        <button
          onClick={openAddModal}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nowa preferencja
        </button>
      </div>

      {/* Lista preferencji */}
      {preferences.length === 0 ? (
        <div className="text-center py-12 text-gray-100">
          <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Brak preferencji. Dodaj pierwsza preferencje powyzej.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {preferences.map((pref, index) => (
            <PreferenceRow
              key={pref.id}
              pref={pref}
              index={index}
              zones={zones}
              isEditing={editingId === pref.id}
              editingName={editingName}
              editingColor={editingColor}
              saving={saving}
              onEditStart={handleEditStart}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
              onDelete={handleDelete}
              onNameChange={setEditingName}
              onColorChange={setEditingColor}
              onZonePreference={handleZonePreference}
            />
          ))}
        </div>
      )}

      {/* Rejony z przypisanymi preferencjami */}
      {zones.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Preferencje rejonów</h3>
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3d3d3d]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">Rejon</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300">Przypisana preferencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3d3d3d]/50">
                {zones.map(zone => {
                  const assignedPref = preferences.find(p => p.id === (zone as any).preference_id);
                  return (
                    <tr key={zone.id} className="hover:bg-[#272727] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{zone.name}</span>
                          <span className="text-xs text-gray-100">#{zone.number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={(zone as any).preference_id ?? ''}
                          onChange={e => handleZonePreference(zone.id, e.target.value ? Number(e.target.value) : null)}
                          className="px-3 py-1.5 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value=""> brak </option>
                          {preferences.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        {assignedPref && (
                          <span className="ml-2 inline-flex items-center gap-1.5">
                            <PreferenceButton color={assignedPref.color} name={assignedPref.name} small />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal dodawania preferencji */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#272727]/60"
          onMouseDown={e => { if (e.target === e.currentTarget) closeAddModal(); }}
        >
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-2xl shadow-2xl w-full max-w-md mx-4">
            {/* Nag³ówek modala */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-base font-bold text-white">Nowa preferencja</h3>
              <button
                onClick={closeAddModal}
                className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Treæ modala */}
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-gray-300 mb-1.5 block">Nazwa</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Nazwa preferencji..."
                  autoFocus
                  className="w-full px-4 py-2.5 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 mb-1.5 block">Kolor przycisku</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      title={c}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={newColor}
                    onChange={e => setNewColor(e.target.value)}
                    className="w-6 h-6 rounded-full border-2 border-[#4a4a4a] cursor-pointer bg-transparent"
                    title="Dowolny kolor"
                  />
                </div>
                <p className="text-xs text-gray-100 mt-1">{newColor}</p>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-300">Podgl¹d:</p>
                <PreferenceButton color={newColor} name={newName || 'Preferencja'} />
              </div>

              {/* Przyciski */}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!newName.trim() || saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#272727] disabled:text-gray-100 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Dodaj preferencjê
                </button>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2.5 bg-[#272727] hover:bg-[#2a2a2a] text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ¦¦¦ Pomocnicze komponenty ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦ */

const PreferenceButton: React.FC<{ color: string; name: string; small?: boolean }> = ({ color, name, small }) => {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'}`}
      style={{ backgroundColor: color, color: '#fff' }}
    >
      {name}
    </span>
  );
};

interface PreferenceRowProps {
  pref: Preference;
  index: number;
  zones: Zone[];
  isEditing: boolean;
  editingName: string;
  editingColor: string;
  saving: boolean;
  onEditStart: (p: Preference) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (id: number) => void;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onZonePreference: (zoneId: string, prefId: number | null) => void;
}

const PreferenceRow: React.FC<PreferenceRowProps> = ({
  pref, index, isEditing,
  editingName, editingColor, saving,
  onEditStart, onEditSave, onEditCancel, onDelete,
  onNameChange, onColorChange,
}) => {
  return (
    <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <span className="text-gray-100 text-sm font-semibold w-6 text-center">{index + 1}</span>

        {isEditing ? (
          <div className="flex-1 space-y-3">
            <input
              type="text"
              value={editingName}
              onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onEditSave();
                if (e.key === 'Escape') onEditCancel();
              }}
              className="w-full px-3 py-1.5 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />

            <div>
              <p className="text-xs text-gray-300 mb-1.5">Kolor</p>
              <div className="flex gap-1.5 flex-wrap max-w-[200px]">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onColorChange(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${editingColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={editingColor}
                  onChange={e => onColorChange(e.target.value)}
                  className="w-5 h-5 rounded-full border-2 border-[#4a4a4a] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300">Podgl¹d:</span>
              <PreferenceButton color={editingColor} name={editingName || 'Preferencja'} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={onEditSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Zapisz
              </button>
              <button
                onClick={onEditCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#2a2a2a] text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Anuluj
              </button>
            </div>
          </div>
        ) : (
          <>
            <PreferenceButton color={pref.color || DEFAULT_COLOR} name={pref.name} />
            <span className="text-gray-100 text-xs ml-auto">
              {pref.created_at ? new Date(pref.created_at).toLocaleDateString('pl-PL') : ''}
            </span>
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => onEditStart(pref)}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                title="Edytuj"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(pref.id)}
                className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                title="Usuñ"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PreferencesManagement;
