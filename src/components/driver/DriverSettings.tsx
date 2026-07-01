import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { MapPin, Navigation, Compass, LogOut } from 'lucide-react';

interface Location {
  lat: number;
  lng: number;
}

interface DriverSettingsProps {
  location: Location | null;
  colorTopBarEnabled: boolean;
  colorBottomBarEnabled: boolean;
  onColorTopBarToggle: (enabled: boolean) => void;
  onColorBottomBarToggle: (enabled: boolean) => void;
}

const DriverSettings: React.FC<DriverSettingsProps> = ({ location, colorTopBarEnabled, colorBottomBarEnabled, onColorTopBarToggle, onColorBottomBarToggle }) => {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();

  // ── Push Notifications ──────────────────────────────────────────────────────
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled]     = useState(false);
  const [pushLoading, setPushLoading]     = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(supported);
    if (supported && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub));
      }).catch(() => {});
    }
  }, []);

  const handlePushToggle = async (enable: boolean) => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setPushLoading(false); return; }
        const keyRes = await fetch('/api/push/vapid-key');
        if (!keyRes.ok) { setPushLoading(false); return; }
        const { publicKey } = await keyRes.json();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverId: user?.id, subscription: sub })
        });
        setPushEnabled(true);
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/unsubscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: user?.id, endpoint: sub.endpoint })
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      }
    } catch (e) {
      console.error('[Push] toggle error:', e);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Ustawienia</h2>
        <p className="text-[#ACACB9]">Konfiguracja aplikacji kierowcy</p>
      </div>

      {/* GPS Location Section */}
      <div className="bg-[#2B2B36] rounded-[10px] p-4 border border-[#4D4D59]">
        <h3 className="flex items-center space-x-2 text-lg font-semibold text-white mb-4">
          <Compass className="w-5 h-5 text-blue-400" />
          <span>Lokalizacja GPS</span>
        </h3>

        <div className="bg-[#4D4D59] rounded-[10px] h-64 flex items-center justify-center mb-4 relative overflow-hidden">
          {location ? (
            <div className="text-center">
              <Navigation className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <div className="text-white font-medium mb-2">Pozycja aktywna</div>
              <div className="text-sm text-[#CAC9D7]">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <MapPin className="w-12 h-12 text-[#82818F] mx-auto mb-4" />
              <div className="text-[#ACACB9]">Pobieranie lokalizacji...</div>
            </div>
          )}

          {/* Mock map overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-emerald-900/20 pointer-events-none" />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center p-3 bg-[#4D4D59] rounded-[10px]">
            <span className="text-[#CAC9D7] text-sm">Dokładność GPS</span>
            <span className="text-emerald-400 font-medium">±3m</span>
          </div>

          <div className="flex justify-between items-center p-3 bg-[#4D4D59] rounded-[10px]">
            <span className="text-[#CAC9D7] text-sm">Ostatnia aktualizacja</span>
            <span className="text-white font-medium">Teraz</span>
          </div>

          <button className="w-full bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-[10px] transition-colors duration-200 text-sm">
            Odśwież lokalizację
          </button>
        </div>
      </div>

      {/* Other Settings */}
      <div className="bg-[#2B2B36] rounded-[10px] p-4 border border-[#4D4D59]">
        <h3 className="text-lg font-semibold text-white mb-4">Preferencje</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Powiadomienia dźwiękowe</span>
              <p className="text-xs text-[#ACACB9]">Dźwięk przy nowych zleceniach</p>
            </div>
            <button className="w-12 h-6 bg-blue-500 rounded-full transition-colors duration-200">
              <div className="w-5 h-5 bg-white rounded-full translate-x-6 transition-transform duration-200" />
            </button>
          </div>

          {pushSupported && (
            <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
              <div>
                <span className="text-white font-medium">Powiadomienia push</span>
                <p className="text-xs text-[#ACACB9]">Zlecenia nawet gdy aplikacja w tle</p>
              </div>
              <button
                onClick={() => handlePushToggle(!pushEnabled)}
                disabled={pushLoading}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${pushEnabled ? 'bg-green-500' : 'bg-[#6D6D7A]'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${pushEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Automatyczne przyjmowanie</span>
              <p className="text-xs text-[#ACACB9]">Auto-akceptacja zleceń po 10s</p>
            </div>
            <button className="w-12 h-6 bg-[#4D4D59] rounded-full transition-colors duration-200">
              <div className="w-5 h-5 bg-white rounded-full translate-x-1 transition-transform duration-200" />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Kolorowy górny pasek</span>
              <p className="text-xs text-[#ACACB9]">Pasek statusu w kolorze aktywnego statusu</p>
            </div>
            <button
              onClick={() => onColorTopBarToggle(!colorTopBarEnabled)}
              className={`w-12 h-6 rounded-full transition-colors duration-200 ${colorTopBarEnabled ? 'bg-blue-500' : 'bg-[#6D6D7A]'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${colorTopBarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Kolorowy dolny pasek</span>
              <p className="text-xs text-[#ACACB9]">Menu nawigacji w kolorze aktywnego statusu</p>
            </div>
            <button
              onClick={() => onColorBottomBarToggle(!colorBottomBarEnabled)}
              className={`w-12 h-6 rounded-full transition-colors duration-200 ${colorBottomBarEnabled ? 'bg-blue-500' : 'bg-[#6D6D7A]'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${colorBottomBarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#4D4D59] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Tryb nocny</span>
              <p className="text-xs text-[#ACACB9]">Ciemny motyw interfejsu</p>
            </div>
            <button
              onClick={toggleTheme}
              className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                theme === 'dark' ? 'bg-blue-500' : 'bg-[#4D4D59]'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-[#2B2B36] rounded-[10px] p-4 border border-[#4D4D59]">
        <h3 className="text-lg font-semibold text-white mb-4">Konto</h3>

        <div className="space-y-2">
          <button className="w-full text-left p-3 bg-[#2B2B36] hover:bg-[#6D6D7A] rounded-[10px] transition-colors duration-200">
            <span className="text-white">Zmień hasło</span>
          </button>

          <button className="w-full text-left p-3 bg-[#2B2B36] hover:bg-[#6D6D7A] rounded-[10px] transition-colors duration-200">
            <span className="text-white">Dane kontaktowe</span>
          </button>

          <button className="w-full text-left p-3 bg-[#2B2B36] hover:bg-[#6D6D7A] rounded-[10px] transition-colors duration-200">
            <span className="text-white">Dokumenty</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Czy na pewno chcesz wyczyścić dane lokalne? To usunie historię lokalizacji i wymagane będzie ponowne logowanie.')) {
                localStorage.removeItem('taxi_users_data');
                localStorage.removeItem('taxi_drivers');
                localStorage.removeItem('taxi_driver_history');
                localStorage.removeItem('taxi_auth_user');
                alert('Dane lokalne wyczyszczone. Odśwież stronę.');
                window.location.reload();
              }
            }}
            className="w-full text-left p-3 bg-[#2B2B36] hover:bg-[#4D4D59] border border-amber-700/50 rounded-[10px] transition-colors duration-200"
          >
            <span className="text-amber-400">🔧 Wyczyść dane lokalne (debug)</span>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center space-x-2 p-3 bg-red-600 hover:bg-red-700 rounded-[10px] transition-colors duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-white font-medium">Wyloguj</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverSettings;
