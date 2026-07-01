import React, { useEffect, useState } from 'react';
import { Save, Loader, MapPin, SlidersHorizontal, Pencil, X } from 'lucide-react';
import { settingsService } from '../../services/settingsService';

const SystemSettings: React.FC = () => {
  const [baseCity, setBaseCity] = useState('');
  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    settingsService.getSettings().then(s => {
      setBaseCity(s.baseCity);
      setIsLoading(false);
    });
  }, []);

  const handleEdit = () => {
    setEditValue(baseCity);
    setIsEditing(true);
    setSaveStatus('idle');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setIsSaving(true);
    const ok = await settingsService.saveSettings({ baseCity: trimmed });
    setIsSaving(false);
    if (ok) {
      setBaseCity(trimmed);
      settingsService.invalidateCache();
      setIsEditing(false);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } else {
      setSaveStatus('error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-md flex items-center justify-center">
          <SlidersHorizontal className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Ustawienia systemowe</h1>
          <p className="text-sm text-gray-300">Konfiguracja globalna systemu</p>
        </div>
      </div>

      {/* Karta: Miasto bazowe */}
      <div className="bg-[#1e1e1e] border border-[#3d3d3d] rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#3d3d3d]">
          <div className="w-8 h-8 bg-blue-500/20 rounded-md flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Miasto bazowe</h2>
            <p className="text-xs text-gray-300">
              Domyślne miasto w autouzupełnianiu adresu (Panel dyspozytora → Nowe zlecenie)
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-300">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Ładowanie...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {!isEditing && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 uppercase tracking-wide">Aktualne miasto:</span>
                    {baseCity ? (
                      <span className="text-white font-semibold text-lg">{baseCity}</span>
                    ) : (
                      <span className="text-gray-100 italic text-sm">Nie ustawiono</span>
                    )}
                  </div>
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-white text-sm font-medium rounded-md transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edytuj
                  </button>
                </div>
              )}

              {!isEditing && saveStatus === 'ok' && (
                <p className="text-sm text-green-400 flex items-center gap-1.5">
                  <span>✓</span> Miasto bazowe zostało zaktualizowane
                </p>
              )}

              {isEditing && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => { setEditValue(e.target.value); setSaveStatus('idle'); }}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      placeholder="np. Bydgoszcz"
                      className="flex-1 px-3 py-2.5 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleSave}
                      disabled={isSaving || !editValue.trim()}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                    >
                      {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Zapisz
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-4 py-2.5 bg-[#272727] hover:bg-[#2a2a2a] border border-[#4a4a4a] text-gray-300 text-sm rounded-md transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Anuluj
                    </button>
                  </div>
                  {saveStatus === 'error' && (
                    <p className="text-sm text-red-400 flex items-center gap-1.5">
                      <span>✗</span> Błąd zapisu — sprawdź połączenie z bazą danych MySQL
                    </p>
                  )}
                </div>
              )}

              <div className="bg-[#272727] border border-[#3d3d3d] rounded-md p-3 text-xs text-gray-300 space-y-1 mt-2">
                <p className="font-medium text-gray-300">Jak działa miasto bazowe?</p>
                <p>• Pole „Adres odbioru" w Nowym zleceniu domyślnie będzie zawierać tę nazwę.</p>
                <p>• Nominatim (OpenStreetMap) priorytetowo podpowiada adresy z tego miasta.</p>
                <p>• Dyspozytor może wpisać inne miasto ręcznie w formacie: <span className="font-mono text-white">Miasto, Ulica Numer</span></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
