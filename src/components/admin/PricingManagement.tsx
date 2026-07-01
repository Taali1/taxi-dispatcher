import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, Gauge, Tag, Settings } from 'lucide-react';

interface GlobalSettings {
  initial_fee: number;
  waiting_rate: number;
  pulse_amount: number;
  min_speed_kmh: number;
}

interface Tariff {
  id: number;
  name: string;
  per_km_rate: number;
  sort_order: number;
}

interface Surcharge {
  id: number;
  name: string;
  amount: number;
  sort_order: number;
}

const defaultSettings = (): GlobalSettings => ({
  initial_fee: 8.00,
  waiting_rate: 40.00,
  pulse_amount: 0.85,
  min_speed_kmh: 20,
});

const PricingManagement: React.FC = () => {
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings());
  const [settingsForm, setSettingsForm] = useState<GlobalSettings>(defaultSettings());
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [surcharges, setSurcharges] = useState<Surcharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tariff form
  const [showTariffForm, setShowTariffForm] = useState(false);
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null);
  const [tariffForm, setTariffForm] = useState({ name: '', per_km_rate: 2.50, sort_order: 0 });
  const [savingTariff, setSavingTariff] = useState(false);

  // Surcharge form
  const [showSurchargeForm, setShowSurchargeForm] = useState(false);
  const [editingSurcharge, setEditingSurcharge] = useState<Surcharge | null>(null);
  const [surchargeForm, setSurchargeForm] = useState({ name: '', amount: 0, sort_order: 0 });
  const [savingSurcharge, setSavingSurcharge] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes, srRes] = await Promise.all([
        fetch('/api/admin/taximeter/settings').then(r => r.json()),
        fetch('/api/admin/taximeter/tariffs').then(r => r.json()),
        fetch('/api/admin/taximeter/surcharges').then(r => r.json()),
      ]);
      if (sRes.success) {
        const s: GlobalSettings = {
          initial_fee: parseFloat(sRes.data.initial_fee),
          waiting_rate: parseFloat(sRes.data.waiting_rate),
          pulse_amount: parseFloat(sRes.data.pulse_amount),
          min_speed_kmh: parseInt(sRes.data.min_speed_kmh),
        };
        setSettings(s);
        setSettingsForm(s);
      }
      if (tRes.success) setTariffs(tRes.data.map((t: any) => ({ ...t, per_km_rate: parseFloat(t.per_km_rate) || 0, sort_order: parseInt(t.sort_order) || 0 })));
      if (srRes.success) setSurcharges(srRes.data);
    } catch {
      setError('Błąd ładowania danych');
    } finally {
      setLoading(false);
    }
  };

  // ── Ustawienia globalne ────────────────────────────────────────────────────

  const updateSettingsForm = (key: keyof GlobalSettings, val: string) => {
    const num = key === 'min_speed_kmh' ? parseInt(val) || 0 : parseFloat(val) || 0;
    setSettingsForm(prev => ({ ...prev, [key]: num }));
    setSettingsDirty(true);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/taximeter/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSettings(settingsForm);
      setSettingsDirty(false);
    } catch (e: any) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Taryfy ────────────────────────────────────────────────────────────────

  const openAddTariff = () => {
    setEditingTariff(null);
    setTariffForm({ name: '', per_km_rate: 2.50, sort_order: tariffs.length });
    setShowTariffForm(true);
  };

  const openEditTariff = (t: Tariff) => {
    setEditingTariff(t);
    setTariffForm({ name: t.name, per_km_rate: parseFloat(String(t.per_km_rate)) || 0, sort_order: t.sort_order || 0 });
    setShowTariffForm(true);
  };

  const saveTariff = async () => {
    if (!tariffForm.name.trim()) { setError('Podaj nazwę taryfy'); return; }
    setSavingTariff(true);
    setError(null);
    try {
      const url = editingTariff ? `/api/admin/taximeter/tariffs/${editingTariff.id}` : '/api/admin/taximeter/tariffs';
      const method = editingTariff ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tariffForm) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadAll();
      setShowTariffForm(false);
      setEditingTariff(null);
    } catch (e: any) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSavingTariff(false);
    }
  };

  const deleteTariff = async (id: number) => {
    if (!confirm('Usunąć tę taryfę?')) return;
    await fetch(`/api/admin/taximeter/tariffs/${id}`, { method: 'DELETE' });
    loadAll();
  };

  // ── Dopłaty ───────────────────────────────────────────────────────────────

  const openAddSurcharge = () => {
    setEditingSurcharge(null);
    setSurchargeForm({ name: '', amount: 0, sort_order: surcharges.length });
    setShowSurchargeForm(true);
  };

  const openEditSurcharge = (s: Surcharge) => {
    setEditingSurcharge(s);
    setSurchargeForm({ name: s.name, amount: s.amount, sort_order: s.sort_order });
    setShowSurchargeForm(true);
  };

  const saveSurcharge = async () => {
    if (!surchargeForm.name.trim()) { setError('Podaj nazwę dopłaty'); return; }
    setSavingSurcharge(true);
    setError(null);
    try {
      const url = editingSurcharge ? `/api/admin/taximeter/surcharges/${editingSurcharge.id}` : '/api/admin/taximeter/surcharges';
      const method = editingSurcharge ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(surchargeForm) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadAll();
      setShowSurchargeForm(false);
      setEditingSurcharge(null);
    } catch (e: any) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSavingSurcharge(false);
    }
  };

  const deleteSurcharge = async (id: number) => {
    if (!confirm('Usunąć tę dopłatę?')) return;
    await fetch(`/api/admin/taximeter/surcharges/${id}`, { method: 'DELETE' });
    loadAll();
  };

  // Pomocnicza: ile metrów na puls dla danej stawki
  const metersPerPulse = (per_km: number) =>
    per_km > 0 ? Math.round((settingsForm.pulse_amount / per_km) * 1000) : 0;
  const secondsPerPulse = () =>
    settingsForm.waiting_rate > 0
      ? Math.round((3600 * settingsForm.pulse_amount) / settingsForm.waiting_rate)
      : 0;

  const inputCls = 'w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';
  const labelCls = 'block text-sm font-medium text-gray-300 mb-1.5';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Cennik Kursów</h2>
        <p className="text-gray-400 text-sm">Konfiguracja taksometru — ustawienia globalne, taryfy i dopłaty</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-600/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      {/* ── USTAWIENIA GLOBALNE ─────────────────────────────────────────── */}
      <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">Ustawienia globalne</h3>
          </div>
          {settingsDirty && (
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {savingSettings ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Ładowanie…</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Opłata początkowa (zł)
                  <span className="text-gray-500 font-normal ml-1">— naliczana przy starcie</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputCls}
                  value={settingsForm.initial_fee}
                  onChange={e => updateSettingsForm('initial_fee', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Puls co (zł)
                  <span className="text-gray-500 font-normal ml-1">— co ile zł przebija</span>
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  className={inputCls}
                  value={settingsForm.pulse_amount}
                  onChange={e => updateSettingsForm('pulse_amount', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Czasówka (zł/godz)
                  <span className="text-gray-500 font-normal ml-1">— postój / wolna jazda</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputCls}
                  value={settingsForm.waiting_rate}
                  onChange={e => updateSettingsForm('waiting_rate', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Próg prędkości (km/h)
                  <span className="text-gray-500 font-normal ml-1">— poniżej = tryb czasowy</span>
                </label>
                <input
                  type="number" step="1" min="0"
                  className={inputCls}
                  value={settingsForm.min_speed_kmh}
                  onChange={e => updateSettingsForm('min_speed_kmh', e.target.value)}
                />
              </div>
            </div>

            {/* Podgląd puls */}
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-4 py-3 text-xs text-gray-400 space-y-1">
              <p className="text-gray-300 font-medium mb-1">Podgląd działania pulsu:</p>
              <p>
                Czasówka: puls <span className="text-yellow-400 font-semibold">co {secondsPerPulse()} sek</span> przy prędkości poniżej {settingsForm.min_speed_kmh} km/h
                {' '}({settingsForm.waiting_rate} zł/h ÷ {settingsForm.pulse_amount} zł = 1 puls co {secondsPerPulse()} sek)
              </p>
              {tariffs.map(t => (
                <p key={t.id}>
                  {t.name}: puls co <span className="text-blue-400 font-semibold">{metersPerPulse(t.per_km_rate)} m</span>
                  {' '}({settingsForm.pulse_amount} zł ÷ {Number(t.per_km_rate).toFixed(2)} zł/km = {(settingsForm.pulse_amount / t.per_km_rate * 1000).toFixed(0)} m)
                </p>
              ))}
            </div>

            {!settingsDirty && (
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#333] disabled:opacity-50 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? 'Zapisywanie…' : 'Zapisz ustawienia'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── TARYFY ──────────────────────────────────────────────────────── */}
      <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold">Taryfy</h3>
            <span className="bg-[#2a2a2a] text-gray-400 text-xs px-2 py-0.5 rounded">{tariffs.length}</span>
          </div>
          <button
            onClick={openAddTariff}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Dodaj taryfę
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Ładowanie…</div>
        ) : tariffs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Brak taryf — dodaj pierwszą</div>
        ) : (
          <div className="divide-y divide-[#2a2a2a]">
            {tariffs.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#232323] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{t.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    <span className="text-gray-200">{Number(t.per_km_rate).toFixed(2)} zł/km</span>
                    {' · '}puls co <span className="text-blue-300">{metersPerPulse(t.per_km_rate)} m</span>
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEditTariff(t)} className="px-3 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors">Edytuj</button>
                  <button onClick={() => deleteTariff(t.id)} className="p-1.5 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DOPŁATY ───────────────────────────────────────────────────────── */}
      <div className="bg-[#1e1e1e] rounded-xl border border-[#3d3d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3d3d3d]">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-green-400" />
            <h3 className="text-white font-semibold">Dopłaty</h3>
            <span className="bg-[#2a2a2a] text-gray-400 text-xs px-2 py-0.5 rounded">{surcharges.length}</span>
          </div>
          <button
            onClick={openAddSurcharge}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Dodaj dopłatę
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Ładowanie…</div>
        ) : surcharges.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Brak dopłat — dodaj pierwszą (np. Kombi, Nocna)</div>
        ) : (
          <div className="divide-y divide-[#2a2a2a]">
            {surcharges.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#232323] transition-colors">
                <p className="text-white flex-1">{s.name}</p>
                <span className="text-green-400 font-semibold text-sm">+{Number(s.amount).toFixed(2)} zł</span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEditSurcharge(s)} className="px-3 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors">Edytuj</button>
                  <button onClick={() => deleteSurcharge(s.id)} className="p-1.5 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL TARYFA ─────────────────────────────────────────────── */}
      {showTariffForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-sm border border-[#3d3d3d] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-white font-semibold">{editingTariff ? 'Edytuj taryfę' : 'Nowa taryfa'}</h3>
              <button onClick={() => setShowTariffForm(false)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Nazwa taryfy</label>
                <input
                  className={inputCls}
                  value={tariffForm.name}
                  onChange={e => setTariffForm({ ...tariffForm, name: e.target.value })}
                  placeholder="np. Taryfa 1"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Stawka za km (zł)</label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputCls}
                  value={tariffForm.per_km_rate}
                  onChange={e => setTariffForm({ ...tariffForm, per_km_rate: parseFloat(e.target.value) || 0 })}
                />
                {Number(tariffForm.per_km_rate) > 0 && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Puls co {Math.round((settings.pulse_amount / Number(tariffForm.per_km_rate)) * 1000)} m
                    ({settings.pulse_amount} zł ÷ {Number(tariffForm.per_km_rate).toFixed(2)} zł/km)
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveTariff}
                  disabled={savingTariff}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingTariff ? 'Zapisywanie…' : editingTariff ? 'Zapisz zmiany' : 'Dodaj taryfę'}
                </button>
                <button onClick={() => setShowTariffForm(false)} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-xl transition-colors">Anuluj</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DOPŁATA ────────────────────────────────────────────── */}
      {showSurchargeForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-sm border border-[#3d3d3d] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
              <h3 className="text-white font-semibold">{editingSurcharge ? 'Edytuj dopłatę' : 'Nowa dopłata'}</h3>
              <button onClick={() => setShowSurchargeForm(false)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Nazwa dopłaty</label>
                <input
                  className={inputCls}
                  value={surchargeForm.name}
                  onChange={e => setSurchargeForm({ ...surchargeForm, name: e.target.value })}
                  placeholder="np. Kombi, Nocna, Lotnisko"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Kwota (zł)</label>
                <input
                  type="number" step="0.01" min="0"
                  className={inputCls}
                  value={surchargeForm.amount}
                  onChange={e => setSurchargeForm({ ...surchargeForm, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveSurcharge}
                  disabled={savingSurcharge}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingSurcharge ? 'Zapisywanie…' : editingSurcharge ? 'Zapisz zmiany' : 'Dodaj dopłatę'}
                </button>
                <button onClick={() => setShowSurchargeForm(false)} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-xl transition-colors">Anuluj</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingManagement;
