import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Search, X, MapPin, Loader, Database, Check } from 'lucide-react';

interface LocalAddress {
  id: number;
  street: string;
  house_number: string | null;
  city: string;
  postcode: string | null;
  lat: number;
  lng: number;
  notes: string | null;
}

interface OsmResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
}

const LocalAddresses: React.FC = () => {
  const [rows, setRows] = useState<LocalAddress[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Wyszukiwarka OSM (górna — do dodawania)
  const [osmQuery, setOsmQuery] = useState('');
  const [osmResults, setOsmResults] = useState<OsmResult[]>([]);
  const [osmLoading, setOsmLoading] = useState(false);
  const [showOsmResults, setShowOsmResults] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const osmRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Usuwanie
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/local-addresses/all');
      const json = await res.json();
      setRows(json.results || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Zamknij dropdown OSM po kliknięciu poza
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (osmRef.current && !osmRef.current.contains(e.target as Node)) {
        setShowOsmResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Wyszukiwanie OSM z debouncem
  const searchOsm = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setOsmResults([]); setShowOsmResults(false); return; }
    setOsmLoading(true);
    try {
      const params = new URLSearchParams({ format: 'json', q: q.trim(), countrycodes: 'PL', limit: '8', addressdetails: '1' });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' },
      });
      const data: OsmResult[] = await res.json();
      setOsmResults(data);
      setShowOsmResults(true);
    } catch {
      setOsmResults([]);
    } finally {
      setOsmLoading(false);
    }
  }, []);

  const handleOsmQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOsmQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchOsm(val), 400);
  };

  const formatOsmLabel = (r: OsmResult) => {
    const road = r.address?.road || r.display_name.split(',')[0].trim();
    const num = r.address?.house_number ? ` ${r.address.house_number}` : '';
    return `${road}${num}`;
  };

  const formatOsmCity = (r: OsmResult) => {
    const city = r.address?.city || r.address?.town || r.address?.village || '';
    const postcode = r.address?.postcode || '';
    return [postcode, city].filter(Boolean).join(' ');
  };

  const handleAddOsmResult = async (r: OsmResult) => {
    const body = {
      street: r.address?.road || r.display_name.split(',')[0].trim(),
      house_number: r.address?.house_number || null,
      city: r.address?.city || r.address?.town || r.address?.village || '',
      postcode: r.address?.postcode || null,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      notes: null,
    };
    try {
      const res = await fetch('/api/admin/local-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAddedIds(prev => new Set([...prev, r.place_id]));
        load();
      }
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await fetch(`/api/admin/local-addresses/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      load();
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtrowanie listy po wyszukiwarce
  const filtered = rows.filter(r => {
    const q = listSearch.toLowerCase();
    if (!q) return true;
    return (
      r.street.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      (r.house_number || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Nagłówek */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Database className="w-7 h-7 text-blue-400" />
          Lokalna baza adresów
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Adresy z tej bazy podpowiadane są dyspozytorowi w pierwszej kolejności, przed OpenStreetMap.
        </p>
      </div>

      {/* ── Wyszukiwarka do dodawania ── */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-5">
        <p className="text-sm font-medium text-white mb-3">Dodaj adres z OpenStreetMap</p>
        <div ref={osmRef} className="relative">
          <div className="flex items-center gap-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg px-3 py-2.5">
            {osmLoading
              ? <Loader className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
              : <Search className="w-4 h-4 text-gray-400 shrink-0" />
            }
            <input
              type="text"
              value={osmQuery}
              onChange={handleOsmQueryChange}
              onFocus={() => osmResults.length > 0 && setShowOsmResults(true)}
              placeholder="Wpisz nazwę ulicy lub adres, np. Leśna Bydgoszcz..."
              className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm focus:outline-none"
            />
            {osmQuery && (
              <button onClick={() => { setOsmQuery(''); setOsmResults([]); setShowOsmResults(false); }}>
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}
          </div>

          {/* Wyniki OSM */}
          {showOsmResults && osmResults.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-xl overflow-hidden">
              {osmResults.map(r => {
                const alreadyAdded = addedIds.has(r.place_id);
                return (
                  <div
                    key={r.place_id}
                    className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] last:border-0 hover:bg-[#2a2a2a] transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <MapPin className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{formatOsmLabel(r)}</div>
                        <div className="text-xs text-gray-400">{formatOsmCity(r)}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => !alreadyAdded && handleAddOsmResult(r)}
                      className={`ml-4 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        alreadyAdded
                          ? 'bg-green-900/30 text-green-400 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {alreadyAdded ? <><Check className="w-3.5 h-3.5" /> Dodano</> : <><Plus className="w-3.5 h-3.5" /> Dodaj</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showOsmResults && !osmLoading && osmResults.length === 0 && osmQuery.trim().length >= 3 && (
            <div className="absolute z-20 w-full mt-1 bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-xl px-4 py-4 text-sm text-gray-400 text-center">
              Brak wyników dla „{osmQuery}"
            </div>
          )}
        </div>
      </div>

      {/* ── Lista zapisanych adresów ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">
            Zapisane adresy <span className="text-gray-500 font-normal">({rows.length})</span>
          </p>
          {/* Filtr listy */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="Filtruj..."
              className="pl-8 pr-3 py-1.5 text-sm bg-[#1e1e1e] border border-[#3d3d3d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
          </div>
        </div>

        <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader className="w-5 h-5 animate-spin mr-2" />
              Ładowanie...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium">{listSearch ? 'Brak pasujących adresów' : 'Brak adresów'}</p>
              <p className="text-sm mt-1">
                {listSearch ? 'Zmień fraze wyszukiwania.' : 'Użyj wyszukiwarki powyżej aby dodać pierwszy adres.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Ulica</th>
                  <th className="text-left px-4 py-3 font-medium">Nr</th>
                  <th className="text-left px-4 py-3 font-medium">Miasto</th>
                  <th className="text-left px-4 py-3 font-medium">Kod</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#252525] last:border-0 ${i % 2 === 0 ? '' : 'bg-[#212121]'} hover:bg-[#2a2a2a] transition-colors`}
                  >
                    <td className="px-4 py-3 text-white font-medium">{row.street}</td>
                    <td className="px-4 py-3 text-gray-400">{row.house_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{row.city || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{row.postcode || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDeleteId(row.id)}
                        className="p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        title="Usuń"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Potwierdzenie usunięcia ── */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Usuń adres?</h3>
            <p className="text-gray-400 text-sm mb-5">Adres zostanie trwale usunięty z lokalnej bazy.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-gray-400 hover:text-white border border-[#3d3d3d] hover:border-[#6d6d6d] rounded-lg text-sm transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                {deleteLoading && <Loader className="w-4 h-4 animate-spin" />}
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalAddresses;
