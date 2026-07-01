import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Layout from '../common/Layout';
import DriverStatus from './DriverStatus';
import OrderNotification from './OrderNotification';
import DriverMap from './DriverMap';
import OrdersList from './OrdersList';
import DriverSettings from './DriverSettings';
import DriverReport from './DriverReport';
import DriverMapPage from './DriverMapPage';
import NumericKeypad from './NumericKeypad';
import TaxiTab from './TaxiTab';
import GieldaTab from './GieldaTab';
import { DebugConsole } from './DebugConsole';
import { driverLocationService } from '../../services/driverLocationService';
import { driverQueueService } from '../../services/driverQueueService';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import ConnectionIndicator from './ConnectionIndicator';
import { GPSStatusIndicator } from './GPSStatusIndicator';
import { MapPin, Settings, AlertTriangle, Home, Map, Car, Terminal, ShoppingBag } from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';
import { DRIVER_STATUS_COLORS } from '../../constants/driverColors';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const DriverPanel: React.FC = () => {
  const { user } = useAuth();
  const { isOnline, hasGPS, isConnected } = useConnectionStatus();
  const [activeTab, setActiveTab] = useState<'home' | 'taxi' | 'map' | 'report' | 'settings' | 'console' | 'gielda' | 'next'>('home');
  const [driverStatus, setDriverStatus] = useState<'free' | 'driving' | 'pickup' | 'busy' | 'home'>('free');
  const [colorTopBarEnabled, setColorTopBarEnabled] = useState<boolean>(
    () => localStorage.getItem('driver_color_top_bar') !== 'false'
  );
  const [colorBottomBarEnabled, setColorBottomBarEnabled] = useState<boolean>(
    () => localStorage.getItem('driver_color_bottom_bar') !== 'false'
  );
  const [currentZone, setCurrentZone] = useState<number | null>(null);
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [zoneEnteredAt, setZoneEnteredAt] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState(3);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<any>(null);
  const [currentPendingOrderId, setCurrentPendingOrderId] = useState<string | null>(null);
  const [nextOrder, setNextOrder] = useState<{ id: string; orderNumber: string; pickupAddress: string; destinationAddress: string; status: string } | null>(null);
  const [nextOrderLoading, setNextOrderLoading] = useState(false);
  const incomingOrderRef = useRef<any>(null);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  if (!user || user.role !== 'driver') {
    return <Navigate to="/login" />;
  }

  useEffect(() => {
    // KROK 1: Natychmiast startuj GPS tracking - NIE czekaj na config/queue/nic
    // To jest najważniejsza operacja - musi wystartować od razu po zalogowaniu
    if (user?.id) {
      console.log('[DriverPanel] 🚀 NATYCHMIAST startuję GPS tracking dla:', user.id);
      driverLocationService.startLocationTracking(user.id)
        .then(() => console.log('[DriverPanel] ✅ GPS tracking wystartował'))
        .catch((err) => console.error('[DriverPanel] ❌ GPS tracking błąd:', err));
    }

    // KROK 2: W tle - inicjalizacja reszty (config, queue, status)
    const initializeDriver = async () => {
      try {
        console.log('[DriverPanel] Inicjalizacja komponentu dla kierowcy:', user?.id);
        console.log('[DriverPanel] Waiting for config to load...');
        await dataSourceService.waitForConfigLoad();

        console.log('[DriverPanel] Forcing config refresh');
        dataSourceService.refreshConfig();
        const debugInfo = dataSourceService.getDebugInfo();
        console.log('[DriverPanel] Current data source:', debugInfo);
        console.log('[DriverPanel] Is using external DB?', dataSourceService.isUsingExternalDatabase());

        // Refresh driver data from localStorage to ensure latest structure
        driverQueueService.refreshDriverData();

        // Load driver data and current zone
        loadDriverData();

        if (user?.id) {
          console.log('[DriverPanel] Setting driver online...');
          await driverQueueService.setDriverOnline(user.id);
          console.log('[DriverPanel] ✅ Driver online');
        }
      } catch (error) {
        console.error('[DriverPanel] ❌ Błąd inicjalizacji (GPS nadal działa):', error);
      }
    };

    initializeDriver();

    // Pobierz lokalizację od razu do wyświetlenia
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => console.error('[DriverPanel] Initial GPS error:', error),
        { enableHighAccuracy: true }
      );
    }

    // Aktualizuj wyświetlaną lokalizację co 2 sekundy
    const locationInterval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            // Cichy błąd - nie spamuj konsoli
          },
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      }
    }, 2000);

    // Set up interval to refresh driver data every 5 seconds
    const intervalId = setInterval(() => {
      loadDriverData();
    }, 5000);

    // Polling: sprawdzaj co 3s czy dyspozytor przydzielił zlecenie
    const pendingOrderInterval = setInterval(async () => {
      if (!user?.id) return;
      try {
        // 1. Zlecenie do natychmiastowego przyjęcia (pending_driver)
        if (!incomingOrderRef.current) {
          const res = await dataSourceService.query<{
            id: string; orderNumber: string; customerName: string;
            customerPhone: string; pickupAddress: string;
            destinationAddress: string; pickupLat: number | null; pickupLng: number | null;
          }>(
            `SELECT id, order_number, customer_name, customer_phone,
                    pickup_address, destination_address, pickup_lat, pickup_lng
             FROM orders WHERE driver_id = ? AND status = 'pending_driver' LIMIT 1`,
            [user.id]
          );
          if (res.success && res.data && res.data.length > 0) {
            const o = res.data[0];
            let distanceStr = '—'; let etaStr = '—';
            const currentLocation = locationRef.current;
            if (currentLocation && o.pickupLat != null && o.pickupLng != null) {
              const km = haversineKm(currentLocation.lat, currentLocation.lng, Number(o.pickupLat), Number(o.pickupLng));
              distanceStr = `${km.toFixed(1)} km`;
              etaStr = `~${Math.round(km * 2)} min`;
            }
            setCurrentPendingOrderId(o.id);
            setIncomingOrder({
              id: o.orderNumber ?? o.id, customer: o.customerName || '—',
              pickup: o.pickupAddress, destination: o.destinationAddress || '—',
              estimatedTime: etaStr, distance: distanceStr, cost: '—',
            });
          }
        }

        // 2. Następny kurs (next_driver / next_accepted)
        const nextRes = await dataSourceService.query<{
          id: string; orderNumber: string; pickupAddress: string;
          destinationAddress: string; status: string;
        }>(
          `SELECT id, order_number, pickup_address, destination_address, status
           FROM orders WHERE driver_id = ? AND status IN ('next_driver','next_accepted')
           ORDER BY created_at ASC LIMIT 1`,
          [user.id]
        );
        if (nextRes.success && nextRes.data && nextRes.data.length > 0) {
          const n = nextRes.data[0];
          setNextOrder(prev => {
            const isNew = !prev || prev.id !== n.id;
            if (isNew && n.status === 'next_driver') {
              // Nowe zlecenie — przełącz na zakładkę natychmiast
              setTimeout(() => setActiveTab('next'), 0);
            }
            return {
              id: n.id,
              orderNumber: n.orderNumber ?? n.id,
              pickupAddress: n.pickupAddress ?? '—',
              destinationAddress: n.destinationAddress ?? '—',
              status: n.status,
            };
          });
        } else {
          setNextOrder(null);
        }
      } catch { /* ignoruj */ }
    }, 3000);

    return () => {
      driverLocationService.stopLocationTracking();
      clearInterval(intervalId);
      clearInterval(locationInterval);
      clearInterval(pendingOrderInterval);
      if (user?.id) {
        driverQueueService.setDriverOffline(user.id);
      }
    };
  }, []); // Puste dependency - odpala się tylko raz przy mount/unmount

  // Synchronizuj refy z aktualną wartością stanu (by interval widział najnowszą wartość)
  useEffect(() => {
    incomingOrderRef.current = incomingOrder;
  }, [incomingOrder]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);


  const loadDriverData = async () => {
    if (!user?.id) return;

    try {
      const status = await driverQueueService.getDriverStatus(user.id);
      if (status) {
        setDriverStatus(status.status);
        setCurrentZone(status.currentZone);
        setZoneName(status.zoneName ?? null);
        setZoneEnteredAt(status.zoneEnteredAt ?? null);

        if (status.currentZone) {
          const position = await driverQueueService.getDriverQueuePosition(user.id);
          setQueuePosition(position || 1);
        }
      }
    } catch (error) {
      console.error('Błąd podczas ładowania danych kierowcy:', error);
    }
  };


  const handleAcceptOrder = async () => {
    if (!currentPendingOrderId || !user?.id) return;
    try {
      await dataSourceService.query(
        `UPDATE orders SET status = 'assigned', updated_at = NOW() WHERE id = ?`,
        [currentPendingOrderId]
      );
      await dataSourceService.query(
        `UPDATE drivers SET driver_state = 'zajeta', updated_at = NOW() WHERE id = ?`,
        [user.id]
      );
    } catch { /* ignoruj */ }
    setIncomingOrder(null);
    setCurrentPendingOrderId(null);
    loadDriverData();
  };

  const handleRejectOrder = async () => {
    if (!currentPendingOrderId) return;
    try {
      await dataSourceService.query(
        `UPDATE orders SET status = 'market', driver_id = NULL, updated_at = NOW() WHERE id = ?`,
        [currentPendingOrderId]
      );
    } catch { /* ignoruj */ }
    setIncomingOrder(null);
    setCurrentPendingOrderId(null);
  };

  const handleStatusChange = (newStatus: 'free' | 'driving' | 'pickup' | 'busy' | 'home') => {
    setDriverStatus(newStatus);
    loadDriverData();
  };

  const topBarColor = colorTopBarEnabled
    ? (DRIVER_STATUS_COLORS[driverStatus]?.primary ?? '#3f3f46')
    : undefined;
  const bottomBarColor = colorBottomBarEnabled
    ? (DRIVER_STATUS_COLORS[driverStatus]?.primary ?? '#3f3f46')
    : '#21222D';

  const handleColorTopBarToggle = (enabled: boolean) => {
    setColorTopBarEnabled(enabled);
    localStorage.setItem('driver_color_top_bar', enabled ? 'true' : 'false');
  };
  const handleColorBottomBarToggle = (enabled: boolean) => {
    setColorBottomBarEnabled(enabled);
    localStorage.setItem('driver_color_bottom_bar', enabled ? 'true' : 'false');
  };

  const headerActions = (
    <div className="flex items-center space-x-4">
      <ConnectionIndicator isConnected={isConnected} isOnline={isOnline} hasGPS={hasGPS} />
      <GPSStatusIndicator />
      <div className="flex items-center space-x-2">
        <MapPin className={`w-5 h-5 ${currentZone ? 'text-emerald-400' : 'text-[#82818F]'}`} />
        <div className="flex flex-col leading-tight">
          <span className={`text-sm font-medium ${currentZone ? 'text-white' : 'text-[#ACACB9]'}`}>
            {currentZone
              ? (zoneName ? `${zoneName}` : `Rejon ${currentZone}`)
              : 'Poza rejonami'}
          </span>
          {currentZone && zoneEnteredAt && (
            <span className="text-xs text-emerald-400">
              od {new Date(zoneEnteredAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {currentZone && (
          <span className="bg-[#2B2B36] px-2 py-1 rounded-full text-xs text-[#CAC9D7]">
            #{queuePosition} w kolejce
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {activeTab === 'map' ? (
        <DriverMapPage />
      ) : (
        <>
          <Layout title="Panel Kierowcy" headerActions={headerActions} hideTitle={true} hideUserInfo={true} noPadding={activeTab === 'home'} headerStyle={topBarColor ? { backgroundColor: topBarColor, transition: 'background-color 0.4s ease' } : undefined}>
            {activeTab === 'home' && (
              <NumericKeypad
                onStatusChange={handleStatusChange}
                currentStatus={driverStatus}
                currentZone={currentZone}
                queuePosition={queuePosition}
                driverId={user?.id}
              />
            )}
            {activeTab === 'taxi' && (
              <div className="pb-20">
                <TaxiTab />
              </div>
            )}
            {activeTab === 'report' && (
              <div className="pb-20">
                <DriverReport />
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="pb-20">
                <DriverSettings location={location} colorTopBarEnabled={colorTopBarEnabled} colorBottomBarEnabled={colorBottomBarEnabled} onColorTopBarToggle={handleColorTopBarToggle} onColorBottomBarToggle={handleColorBottomBarToggle} />
              </div>
            )}
            {activeTab === 'console' && (
              <div className="pb-20 h-[calc(100vh-180px)]">
                <DebugConsole />
              </div>
            )}
            {activeTab === 'next' && nextOrder && (
              <div className="h-full flex flex-col bg-[#171821] p-4 gap-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Następny kurs</div>
                    <div className="text-white font-bold text-lg">#{nextOrder.orderNumber}</div>
                  </div>
                  {nextOrder.status === 'next_accepted' && (
                    <span className="ml-auto px-3 py-1 bg-green-600/20 border border-green-500/40 text-green-400 text-xs font-bold rounded-full">✓ Przyjęte</span>
                  )}
                </div>

                {/* Adresy */}
                <div className="bg-[#21222D] rounded-2xl border border-[#2B2B36] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3.5 border-b border-[#2B2B36]">
                    <div className="w-3 h-3 rounded-full bg-green-500 mt-1 shrink-0" />
                    <div>
                      <div className="text-[10px] text-[#ACACB9] uppercase tracking-wide mb-0.5">Odbiór</div>
                      <div className="text-white text-base font-semibold leading-snug">{nextOrder.pickupAddress}</div>
                    </div>
                  </div>
                  {nextOrder.destinationAddress && nextOrder.destinationAddress !== '—' && (
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className="w-3 h-3 rounded-full bg-red-400 mt-1 shrink-0" />
                      <div>
                        <div className="text-[10px] text-[#ACACB9] uppercase tracking-wide mb-0.5">Cel</div>
                        <div className="text-[#ACACB9] text-base leading-snug">{nextOrder.destinationAddress}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Przyciski */}
                <div className="mt-auto flex flex-col gap-3">
                  {nextOrder.status === 'next_driver' && (
                    <button
                      disabled={nextOrderLoading}
                      onClick={async () => {
                        if (!user?.id || !nextOrder) return;
                        setNextOrderLoading(true);
                        try {
                          const res = await fetch(`/api/orders/${nextOrder.id}/accept-next`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ driverId: user.id }),
                          });
                          const data = await res.json();
                          if (data.success) setNextOrder(prev => prev ? { ...prev, status: 'next_accepted' } : null);
                        } catch { /* ignoruj */ } finally { setNextOrderLoading(false); }
                      }}
                      className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-bold text-lg transition-all disabled:opacity-50"
                    >
                      {nextOrderLoading ? '...' : '✓ Przyjmij następny kurs'}
                    </button>
                  )}
                  <button
                    disabled={nextOrderLoading}
                    onClick={async () => {
                      if (!user?.id || !nextOrder) return;
                      setNextOrderLoading(true);
                      try {
                        await fetch(`/api/orders/${nextOrder.id}/reject-next`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ driverId: user.id }),
                        });
                        setNextOrder(null);
                        setActiveTab('home');
                      } catch { /* ignoruj */ } finally { setNextOrderLoading(false); }
                    }}
                    className="w-full py-3.5 rounded-2xl bg-[#2B2B36] hover:bg-[#3a3b46] active:scale-[0.98] text-[#ACACB9] font-semibold text-base transition-all disabled:opacity-50"
                  >
                    Odrzuć
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'gielda' && (
              <div className="h-[calc(100vh-180px)] flex flex-col">
                <GieldaTab driverId={user!.id} />
              </div>
            )}
          </Layout>

        </>
      )}

      {/* Bottom Navigation */}
      <div
        className="fixed bottom-0 left-0 right-0 border-t border-[#2B2B36] px-2 z-[1100] flex items-center"
        style={{ height: 'calc((100vh - 44px) / 7)', backgroundColor: bottomBarColor, transition: 'background-color 0.4s ease' }}
      >
        <div className={`grid w-full ${nextOrder ? 'grid-cols-8' : 'grid-cols-7'}`}>
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'home' ? 'text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">Główna</span>
          </button>

          <button
            onClick={() => setActiveTab('taxi')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'taxi' ? 'text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            <Car className="w-5 h-5" />
            <span className="text-[10px]">Taxi</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'map' ? 'text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            <Map className="w-5 h-5" />
            <span className="text-[10px]">Mapa</span>
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'report' ? 'text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="text-[10px]">Zgłoś</span>
          </button>

          <button
            onClick={() => setActiveTab('console')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'console' ? 'text-blue-400' : 'text-[#82818F] hover:text-[#CAC9D7]'
            }`}
          >
            <Terminal className="w-5 h-5" />
            <span className="text-[10px]">Konsola</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'settings' ? 'text-blue-400' : 'text-[#82818F] hover:text-[#CAC9D7]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px]">Ustaw.</span>
          </button>

          <button
            onClick={() => setActiveTab('gielda')}
            className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 ${
              activeTab === 'gielda' ? 'text-green-400' : 'text-[#82818F] hover:text-[#CAC9D7]'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px]">Giełda</span>
          </button>

          {nextOrder && (
            <button
              onClick={() => setActiveTab('next')}
              className={`flex-1 flex flex-col items-center space-y-1 py-2 transition-colors duration-200 relative ${
                activeTab === 'next' ? 'text-blue-400' : 'text-blue-400/60 hover:text-blue-400'
              }`}
            >
              <div className="relative">
                <Car className="w-5 h-5" />
                {nextOrder.status === 'next_driver' && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-[10px]">Następny</span>
            </button>
          )}
        </div>
      </div>

      {incomingOrder && (
        <OrderNotification
          order={incomingOrder}
          onAccept={handleAcceptOrder}
          onReject={handleRejectOrder}
        />
      )}

    </>
  );
};

export default DriverPanel;