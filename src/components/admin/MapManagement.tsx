import React, { useState, useEffect, useCallback, Component } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Edit, Trash2, X, Save, Tag, Check } from 'lucide-react';
import { preferencesService, Preference } from '../../services/preferencesService';
import 'leaflet/dist/leaflet.css';

const API_BASE = '/api';

// ¦¦ Leaflet icon fix ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ¦¦ Types ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
interface AddressPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  preference_ids: number[];
  created_at: string;
}

// ¦¦ UUID helper ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ¦¦ API helpers ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
async function apiCall(sql: string, params: any[] = []): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'B³¹d sieci' };
  }
}

function parsePin(r: any): AddressPin | null {
  try {
    const lat = typeof r.lat === 'number' ? r.lat : parseFloat(r.lat);
    const lng = typeof r.lng === 'number' ? r.lng : parseFloat(r.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    let preference_ids: number[] = [];
    try {
      const raw = r.preference_ids;
      // mysql2 v3 automatycznie parsuje JSON kolumny  raw mo¿e byæ ju¿ tablic¹
      if (Array.isArray(raw)) {
        preference_ids = raw.map(Number);
      } else if (raw) {
        preference_ids = JSON.parse(raw);
      }
    } catch { preference_ids = []; }
    if (!Array.isArray(preference_ids)) preference_ids = [];
    return { id: r.id, name: r.name ?? '', lat, lng, preference_ids, created_at: r.created_at ?? '' };
  } catch {
    return null;
  }
}

async function loadPins(): Promise<AddressPin[]> {
  const result = await apiCall('SELECT * FROM address_pins ORDER BY created_at DESC');
  if (!result.success) throw new Error(result.error ?? 'B³¹d ³adowania pinezek');
  const rows: any[] = Array.isArray(result.data) ? result.data : [];
  return rows.map(parsePin).filter((p): p is AddressPin => p !== null);
}

// ¦¦ Error boundary ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
interface EBState { hasError: boolean; error: string }
class MapErrorBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  state: EBState = { hasError: false, error: '' };
  static getDerivedStateFromError(e: Error): EBState {
    return { hasError: true, error: e?.message ?? String(e) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
          <MapPin className="w-8 h-8 text-red-400" />
          <p className="text-red-300 text-sm">B³¹d mapy: {this.state.error}</p>
          <button
            type="button"
            onClick={() => { this.setState({ hasError: false, error: '' }); this.props.onReset(); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#2a2a2a] hover:bg-[#2a2a2a] text-white transition-colors"
          >
            Odwie¿
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ¦¦ Map click handler ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
const MapClickHandler: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
};

// ¦¦ Main component ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
const MapManagement: React.FC = () => {
  const [pins, setPins]               = useState<AddressPin[]>([]);
  const [allPrefs, setAllPrefs]       = useState<Preference[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [mapKey, setMapKey]           = useState(0); // reset map if needed

  // modal
  const [modalOpen, setModalOpen]     = useState(false);
  const [editingPin, setEditingPin]   = useState<AddressPin | null>(null);
  const [formName, setFormName]       = useState('');
  const [formCoords, setFormCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [formPrefIds, setFormPrefIds] = useState<number[]>([]);

  const [selectedId, setSelectedId]   = useState<string | null>(null);

  // ¦¦ Load ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  const refresh = useCallback(async () => {
    try {
      const [p, prefs] = await Promise.all([loadPins(), preferencesService.getAll()]);
      setPins(p);
      setAllPrefs(prefs);
      setError(null);
    } catch (e: any) {
      setError('B³¹d ³adowania: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ¦¦ Modal helpers ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  const openNew = (lat: number, lng: number) => {
    setEditingPin(null);
    setFormName('');
    setFormCoords({ lat, lng });
    setFormPrefIds([]);
    setModalOpen(true);
  };

  const openEdit = (pin: AddressPin) => {
    setEditingPin(pin);
    setFormName(pin.name);
    setFormCoords({ lat: pin.lat, lng: pin.lng });
    setFormPrefIds([...pin.preference_ids]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPin(null);
    setFormName('');
    setFormCoords(null);
    setFormPrefIds([]);
  };

  // ¦¦ Save ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  const handleSave = async () => {
    if (!formName.trim() || !formCoords) return;
    setSaving(true);
    try {
      let result;
      if (editingPin) {
        result = await apiCall(
          'UPDATE address_pins SET name=?, lat=?, lng=?, preference_ids=?, updated_at=NOW() WHERE id=?',
          [formName.trim(), formCoords.lat, formCoords.lng, JSON.stringify(formPrefIds), editingPin.id]
        );
      } else {
        result = await apiCall(
          'INSERT INTO address_pins (id, name, lat, lng, preference_ids, created_at, updated_at) VALUES (?,?,?,?,?,NOW(),NOW())',
          [generateUUID(), formName.trim(), formCoords.lat, formCoords.lng, JSON.stringify(formPrefIds)]
        );
      }
      if (!result.success) {
        setError('B³¹d zapisu: ' + (result.error ?? 'Nieznany b³¹d'));
        return;
      }
      closeModal();
      await refresh();
    } catch (e: any) {
      setError('B³¹d zapisu: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ¦¦ Delete ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  const handleDelete = async (id: string) => {
    if (!confirm('Usun¹æ tê pinezkê?')) return;
    const result = await apiCall('DELETE FROM address_pins WHERE id=?', [id]);
    if (!result.success) {
      setError('B³¹d usuwania: ' + (result.error ?? 'Nieznany b³¹d'));
      return;
    }
    setPins(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const getPrefBadges = (ids: number[]) =>
    ids.map(id => allPrefs.find(p => Number(p.id) === Number(id))).filter(Boolean) as Preference[];

  // ¦¦ Render ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
  return (
    <div className="flex flex-col gap-4 h-full">

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-2 text-red-300 text-sm flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

        {/* Mapa */}
        <div className="lg:col-span-2 bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] overflow-hidden" style={{ minHeight: '520px' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">£adowanie</div>
          ) : (
            <MapErrorBoundary onReset={() => setMapKey(k => k + 1)}>
              <MapContainer
                key={mapKey}
                center={[50.0647, 19.9450]}
                zoom={12}
                style={{ height: '100%', width: '100%', minHeight: '520px' }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onClick={openNew} />
                {pins.map(pin => (
                  <Marker
                    key={pin.id}
                    position={[pin.lat, pin.lng]}
                    eventHandlers={{ click: () => setSelectedId(pin.id) }}
                  >
                    <Popup>
                      <div className="text-black min-w-[140px]">
                        <p className="font-bold text-base mb-1">{pin.name}</p>
                        <p className="text-xs text-gray-300 font-mono mb-2">
                          {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                        </p>
                        {getPrefBadges(pin.preference_ids).map(pref => (
                          <span
                            key={pref.id}
                            className="inline-block text-white text-xs font-semibold px-2 py-0.5 rounded mr-1 mb-1"
                            style={{ backgroundColor: pref.color }}
                          >
                            {pref.name}
                          </span>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <button type="button" onClick={() => openEdit(pin)}
                            className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">
                            Edytuj
                          </button>
                          <button type="button" onClick={() => handleDelete(pin.id)}
                            className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded">
                            Usuñ
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </MapErrorBoundary>
          )}
        </div>

        {/* Lista */}
        <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#3d3d3d] shrink-0">
            <span className="text-white font-semibold text-sm">Zapisane pinezki</span>
            <span className="bg-[#272727] text-gray-300 text-xs font-bold px-2 py-0.5 rounded-full">{pins.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pins.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-100 gap-2 py-12">
                <MapPin className="w-8 h-8 opacity-40" />
                <p className="text-sm">Brak pinezek</p>
                <p className="text-xs">Kliknij na mapie, aby dodaæ</p>
              </div>
            ) : pins.map(pin => {
              const badges = getPrefBadges(pin.preference_ids);
              const isSelected = selectedId === pin.id;
              return (
                <div
                  key={pin.id}
                  onClick={() => setSelectedId(isSelected ? null : pin.id)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#2a2a2a] border-gray-400' : 'bg-[#272727] border-[#4a4a4a] hover:bg-[#272727]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                      <span className="text-white text-sm font-medium truncate">{pin.name}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={e => { e.stopPropagation(); openEdit(pin); }}
                        className="p-1 rounded hover:bg-[#2a2a2a] text-gray-300 hover:text-blue-400 transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); handleDelete(pin.id); }}
                        className="p-1 rounded hover:bg-[#2a2a2a] text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-100 text-xs font-mono mb-1.5">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>
                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {badges.map(b => (
                        <span key={b.id} className="inline-flex items-center text-white text-xs font-semibold px-2 py-0.5 rounded"
                          style={{ backgroundColor: b.color }}>
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && formCoords && (
        <div
          className="fixed inset-0 bg-[#272727]/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

            <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" />
                <h3 className="text-base font-bold text-white">
                  {editingPin ? 'Edytuj pinezkê' : 'Nowa pinezka'}
                </h3>
              </div>
              <button type="button" onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-[#272727] text-gray-300 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">Nazwa</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="np. Lotnisko Kraków-Balice, Dworzec G³ówny"
                  autoFocus
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="bg-[#272727] border border-[#4a4a4a] rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-300 mb-0.5">Wspó³rzêdne</p>
                <p className="text-white text-sm font-mono">
                  {formCoords.lat.toFixed(6)}, {formCoords.lng.toFixed(6)}
                </p>
              </div>

              {allPrefs.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">
                    <Tag className="w-3 h-3 inline mr-1" />
                    Preferencje
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {allPrefs.map(pref => {
                      const checked = formPrefIds.includes(pref.id);
                      return (
                        <label key={pref.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            checked ? 'bg-[#2a2a2a] border border-gray-400' : 'bg-[#272727] border border-[#4a4a4a] hover:border-gray-400'
                          }`}
                        >
                          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                            style={{ backgroundColor: checked ? pref.color : 'transparent', border: `2px solid ${pref.color}` }}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-sm text-gray-100 font-medium flex-1">{pref.name}</span>
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: pref.color }} />
                          <input type="checkbox" className="sr-only" checked={checked}
                            onChange={() => setFormPrefIds(prev =>
                              checked ? prev.filter(id => id !== pref.id) : [...prev, pref.id]
                            )}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-[#3d3d3d]">
              <button type="button" onClick={closeModal}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 bg-[#272727] hover:bg-[#2a2a2a] transition-colors">
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!formName.trim() || saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                {editingPin ? 'Zapisz zmiany' : 'Dodaj pinezkê'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapManagement;
