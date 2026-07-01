import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  User,
  Lock,
  LogIn,
  Home,
  Car,
  MapPin,
  Clock,
  Phone,
  Settings,
  LogOut,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Navigation,
  Wifi,
  WifiOff,
  Crosshair,
  Check,
  CheckCheck,
  Smartphone,
  RotateCcw,
  Monitor,
  MessageCircle,
  Send,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  ChevronsRight,
  X,
  Map,
  Terminal,
  List,
  ClipboardList,
  ShoppingBag,
  Eye,
  EyeOff
} from 'lucide-react';
import { DebugConsole } from './DebugConsole';
import { DriverChat } from './DriverChat';
import GieldaTab from './GieldaTab';
import NumericKeypad from './NumericKeypad';
import DriverQueueTab from './DriverQueueTab';
import OrderNotification from './OrderNotification';
import DriverQueryPopup from './DriverQueryPopup';
import { userService } from '../../services/userService';
import { driverQueueService, type DriverWithLocation } from '../../services/driverQueueService';
import { driverAnalyticsService } from '../../services/driverAnalyticsService';
import { driverLocationService } from '../../services/driverLocationService';
import { ZoneDetectionService } from '../../utils/zoneDetection';
import { getMarkerColor, getDriverStatusLabel, DRIVER_STATUS_COLORS } from '../../constants/driverColors';
import { chatService, type Conversation, type ChatMessage } from '../../services/chatService';
import { preferencesService, type Preference } from '../../services/preferencesService';
import MessagePopup from './MessagePopup';
import { useNotificationSound } from '../../hooks/useNotificationSound';
import StatusBar from './StatusBar';
import Taximeter from './Taximeter';
import { dataSourceService } from '../../services/dataSourceService';
import { soundService } from '../../services/soundService';

type DriverStatus = 'free' | 'driving' | 'pickup' | 'busy' | 'home';
type AppView = 'login' | 'main' | 'orders' | 'map' | 'settings' | 'emergency' | 'chat' | 'console' | 'kolejka' | 'kurs' | 'gielda' | 'nastepny';
type OrientationLock = 'auto' | 'portrait' | 'landscape';

interface PendingOrder {
  rawId: string;       // id z bazy (do accept/reject)
  id: string;          // order_number (do wyświetlenia)
  customer: string;
  phone: string;
  pickup: string;
  destination: string;
  estimatedTime: string;
  distance: string;
  cost: string;
  notes: string;
  operator?: string;       // kod dyspozytora który przyjął zlecenie
  orderType?: string;      // 'standard' | 'scheduled'
  pickupRegionId?: number; // numer rejonu np. 56 → "R-56"
  scheduledDate?: string;  // "2024-01-15"
  scheduledTime?: string;  // "14:55"
  preferenceIds?: number[];// [1, 2, 3]
  vehicleCategory?: string;// 'standard', 'van' itp.
  paymentMethod?: string;  // 'cash', 'card'
}


interface DriverUser {
  id: string;
  name: string;
  email: string;
  driverCode: string;
  sessionToken?: string;
}

const SwipeButton: React.FC<{
  label: string;
  color: string;
  onConfirm: () => void;
}> = ({ label, color, onConfirm }) => {
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragXRef = React.useRef(0);
  const THUMB = 56;
  const PAD = 5;

  const getMax = () => (trackRef.current ? trackRef.current.clientWidth - THUMB - PAD * 2 : 260);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left - PAD - THUMB / 2, getMax()));
    dragXRef.current = x;
    setDragX(x);
  };
  const onUp = () => {
    if (dragXRef.current >= getMax() * 0.85) onConfirm();
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
  };

  const progress = Math.min(dragX / (getMax() || 260), 1);

  return (
    <div
      ref={trackRef}
      className="relative h-[52px] rounded-md overflow-hidden select-none"
      style={{ backgroundColor: color }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center font-semibold text-lg font-open-sans pointer-events-none text-white"
      >
        {label}
      </div>
      <div
        className="absolute top-[4px] bottom-[4px] rounded-sm flex items-center justify-center touch-none"
        style={{
          left: `${PAD + dragX}px`,
          width: `${THUMB}px`,
          backgroundColor: 'transparent',
          transition: dragging ? 'none' : 'left 0.3s ease',
          cursor: 'grab',
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <ChevronsRight className="w-5 h-5 text-white" />
      </div>
    </div>
  );
};

const SWIPE_STEPS = [
  { label: 'Pod adresem',      color: '#f59e0b' },
  { label: 'Mam klienta',      color: '#3b82f6' },
  { label: 'Zakończ',          color: '#22c55e' },
] as const;

const DriverApp: React.FC = () => {
  const [view, setView] = useState<AppView>('login');
  const [driverCode, setDriverCode] = useState('');
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [driver, setDriver] = useState<DriverUser | null>(null);
  const [status, setStatus] = useState<DriverStatus>('home');
  const [suspendedModal, setSuspendedModal] = useState<{ show: boolean; until: string }>({
    show: false,
    until: '',
  });
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({
    show: false,
    message: '',
  });
  const [dispatcherNotif, setDispatcherNotif] = useState<{ id: number; title: string; message: string } | null>(null);
  const [currentZone, setCurrentZone] = useState<number | null>(null);
  // Dane strefy z API (stabilne — nie są kasowane przez GPS)
  const [apiZoneName, setApiZoneName] = useState<string | null>(null);
  const [apiZoneEnteredAt, setApiZoneEnteredAt] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [statusDuration, setStatusDuration] = useState('0m');
  const [availablePreferences, setAvailablePreferences] = useState<Preference[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [pendingQuery, setPendingQuery] = useState<any | null>(null);
  const [activeOrder, setActiveOrder] = useState<PendingOrder | null>(null);
  const [nextOrder, setNextOrder] = useState<PendingOrder | null>(null);
  const [nextOrderStatus, setNextOrderStatus] = useState<string | null>(null); // 'next_driver' | 'next_accepted'
  const prevNextOrderIdRef = React.useRef<string | null>(null);
  const [orderAcceptedAt, setOrderAcceptedAt] = useState<Date | null>(null);
  const [swipeStep, setSwipeStep] = useState<0 | 1 | 2>(0);
  const [orderMapOpen, setOrderMapOpen] = useState(false);
  const [expandedAddr, setExpandedAddr] = useState<'pickup' | 'dest' | null>(null);
  const [expandedNotes, setExpandedNotes] = useState(false);
  const [waitingSince, setWaitingSince] = useState<Date | null>(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [orderMapCoords, setOrderMapCoords] = useState<[number, number] | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [taximeterEnabled, setTaximeterEnabled] = useState(false);
  const [showTaximeter, setShowTaximeter] = useState(false);
  const [taximeterKey, setTaximeterKey] = useState(0); // zmiana key = reset stanu taksometru po "Zakończ"
  const [nextOrderReadyModal, setNextOrderReadyModal] = useState<PendingOrder | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBlockedOpen, setLogoutBlockedOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [orderDetailOpen, setOrderDetailOpen] = useState<any | null>(null);

  // ── Zlecenia (zakładka „Wydane" / „Terminowe") ──
  const [ordersTab, setOrdersTab] = useState<'wydane' | 'terminowe'>('wydane');
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([52.2297, 21.0122]);
  const [isLocating, setIsLocating] = useState(false);
  const [detectedZoneInfo, setDetectedZoneInfo] = useState<{id: number, number: number, name: string} | null>(null);
  const [zoneEntryTime, setZoneEntryTime] = useState<string | null>(null);
  const [isDetectingZone, setIsDetectingZone] = useState(false);
  // Ref do śledzenia ostatniego rejonu wykrytego przez GPS — bezpieczny w stale closure GPS callbacka
  const lastDetectedZoneIdRef = React.useRef<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<string | null>(null);
  const [orientationLock, setOrientationLock] = useState<OrientationLock>(() => {
    const saved = localStorage.getItem('driver_orientation_lock');
    return (saved as OrientationLock) || 'auto';
  });
  const [colorTopBarEnabled, setColorTopBarEnabled] = useState<boolean>(
    () => localStorage.getItem('driver_color_top_bar') !== 'false'
  );
  const [colorBottomBarEnabled, setColorBottomBarEnabled] = useState<boolean>(
    () => localStorage.getItem('driver_color_bottom_bar') !== 'false'
  );

  // ── TTS — serwer edge-tts (pl-PL-ZofiaNeural) ───────────────────────────
  const ttsAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Fetch orders when the orders view is active
  useEffect(() => {
    if (view !== 'orders') return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingOrders(true);
      try {
        const r = await fetch('/api/orders?limit=100');
        const json = await r.json();
        if (!cancelled && json.success) setAllOrders(json.data ?? []);
      } catch { /* ignore */ }
      finally { if (!cancelled) setIsLoadingOrders(false); }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [view]);

  const handleColorTopBarToggle = (enabled: boolean) => {
    setColorTopBarEnabled(enabled);
    localStorage.setItem('driver_color_top_bar', enabled ? 'true' : 'false');
  };
  const handleColorBottomBarToggle = (enabled: boolean) => {
    setColorBottomBarEnabled(enabled);
    localStorage.setItem('driver_color_bottom_bar', enabled ? 'true' : 'false');
  };
  const [allDrivers, setAllDrivers] = useState<DriverWithLocation[]>([]);
  const [showOtherDrivers, setShowOtherDrivers] = useState(true);
  const [showDriverSearch, setShowDriverSearch] = useState(false);
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [trackedDriverId, setTrackedDriverId] = useState<string | null>(null);
  const [trackedDriverNotFound, setTrackedDriverNotFound] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [sentQuickReply, setSentQuickReply] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeConversation, setActiveConversation] = useState<{id: string, name: string, type: 'driver' | 'dispatcher' | 'base'} | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [driverSearch, setDriverSearch] = useState('');
  const [messageQueue, setMessageQueue] = useState<ChatMessage[]>([]);
  const chatMessagesEndRef = React.useRef<HTMLDivElement>(null);
  const shownMessageIdsRef = React.useRef<Set<string>>(new Set());
  const { playNotificationSound } = useNotificationSound();

  useEffect(() => {
    const initializeDataSource = async () => {
      console.log('[DriverApp] Mounted - loading config from Supabase');
      await dataSourceService.waitForConfigLoad();
      const debugInfo = dataSourceService.getDebugInfo();
      console.log('[DriverApp] Data source configuration loaded:', debugInfo);
    };

    initializeDataSource();
  }, []);

  useEffect(() => {
    const applyOrientationLock = async () => {
      try {
        if ('screen' in window && 'orientation' in screen) {
          const screenOrientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
          if (orientationLock === 'auto') {
            if (screenOrientation.unlock) {
              screenOrientation.unlock();
            }
          } else if (orientationLock === 'portrait') {
            await screenOrientation.lock('portrait');
          } else if (orientationLock === 'landscape') {
            await screenOrientation.lock('landscape');
          }
        }
      } catch (e) {
        console.log('Orientation lock not supported');
      }
    };
    applyOrientationLock();
    localStorage.setItem('driver_orientation_lock', orientationLock);
  }, [orientationLock]);

  useEffect(() => {
    console.log('[DriverApp] Component mounted, checking for saved session');

    try {
      const savedDriver = sessionStorage.getItem('driver_app_user');
      if (savedDriver) {
        console.log('[DriverApp] Found saved driver session:', savedDriver);
        const parsed = JSON.parse(savedDriver);
        setDriver(parsed);
        console.log('[DriverApp] Setting view to main from saved session');
        setView('main');
        loadDriverStatus(parsed.id);
        loadActiveOrder(parsed.id);
        fetch(`/api/drivers/${parsed.id}/taximeter-enabled`)
          .then(r => r.json())
          .then(d => { if (d.success) setTaximeterEnabled(!!d.enabled); })
          .catch(() => {});
      } else {
        console.log('[DriverApp] No saved session found');
      }

      const savedCode = localStorage.getItem('driver_remembered_code');
      const savedPin = localStorage.getItem('driver_remembered_pin');
      if (savedCode) {
        setDriverCode(savedCode);
        setRememberMe(true);
      }
      if (savedPin) {
        setPin(savedPin);
      }
    } catch (error) {
      console.error('[DriverApp] Error loading saved session:', error);
      sessionStorage.removeItem('driver_app_user');
      setView('login');
    }
  }, []);

  // Polling statusu/kolejki — działa NA WSZYSTKICH widokach (nie tylko 'main')
  // Interwał 2s: szybka reakcja na zmiany pozycji w kolejce i rejonu
  useEffect(() => {
    if (!driver) return;
    const interval = setInterval(() => {
      loadDriverStatus(driver.id);
    }, 2000);
    return () => clearInterval(interval);
  }, [driver]);

  // Timer oczekiwania — startuje gdy swipeStep === 1 (pod adresem)
  useEffect(() => {
    if (waitingSince) {
      const interval = setInterval(() => {
        setWaitingSeconds(Math.floor((Date.now() - waitingSince.getTime()) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setWaitingSeconds(0);
    }
  }, [waitingSince]);

  // Ładuj listę preferencji przy starcie
  useEffect(() => {
    preferencesService.getAll().then(setAvailablePreferences).catch(() => {});
  }, []);

  // Polling "Następny Kurs" co 5s — tylko gdy kierowca ma aktywne zlecenie
  useEffect(() => {
    if (!driver || !activeOrder) {
      setNextOrder(null);
      setNextOrderStatus(null);
      prevNextOrderIdRef.current = null;
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/drivers/${driver.id}/next-order`);
        const data = await res.json();
        if (data.success && data.order) {
          const o = data.order;
          const newRawId = String(o.id);
          const newStatus = o.status ?? 'next_driver';
          setNextOrderStatus(newStatus);
          setNextOrder({
            rawId: newRawId,
            id: o.order_number ?? newRawId,
            customer: o.customer_name ?? 'Klient',
            phone: o.customer_phone ?? '',
            pickup: o.pickup_address ?? '',
            destination: o.destination_address ?? '',
            estimatedTime: '-',
            distance: '-',
            cost: o.cost ? `${o.cost} zł` : '-',
            notes: o.notes ?? '',
            operator: o.operator ?? '',
            orderType: o.order_type || undefined,
            pickupRegionId: o.pickup_region_id ?? undefined,
            scheduledDate: o.scheduled_date || undefined,
            scheduledTime: o.scheduled_time || undefined,
            preferenceIds: (() => { try { const r = o.preference_ids; return Array.isArray(r) ? r : JSON.parse(r || '[]'); } catch { return []; } })(),
          });
          // Auto-switch to 'nastepny' view when a new next order arrives
          if (prevNextOrderIdRef.current !== newRawId && newStatus === 'next_driver') {
            prevNextOrderIdRef.current = newRawId;
            setView('nastepny');
          } else {
            prevNextOrderIdRef.current = newRawId;
          }
        } else {
          setNextOrder(null);
          setNextOrderStatus(null);
          prevNextOrderIdRef.current = null;
        }
      } catch { /* ignoruj cicho */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [driver?.id, activeOrder?.rawId]);

  // Polling pending orders co 3s — wyświetla popup gdy dyspozytor wyda zlecenie
  useEffect(() => {
    if (!driver) return;
    const pollPendingOrder = async () => {
      try {
        const res = await fetch(`/api/drivers/${driver.id}/pending-order`);
        const data = await res.json();
        if (data.success && data.order) {
          const o = data.order;
          const newRawId = String(o.id);
          // Nie nadpisuj stanu jeśli to to samo zlecenie — zapobiega resetowi timera
          setPendingOrder(prev => {
            if (prev && prev.rawId === newRawId) return prev;
            return {
              rawId: newRawId,
              id: o.order_number ?? newRawId,
              customer: o.customer_name ?? 'Klient',
              phone: o.customer_phone ?? '',
              pickup: o.pickup_address ?? '',
              destination: o.destination_address ?? '',
              estimatedTime: '-',
              distance: '-',
              cost: o.cost ? `${o.cost} zł` : '-',
              notes: o.notes ?? '',
              operator: o.operator ?? '',
              orderType: o.order_type || undefined,
              pickupRegionId: o.pickup_region_id ?? undefined,
              scheduledDate: o.scheduled_date || undefined,
              scheduledTime: o.scheduled_time || undefined,
              preferenceIds: (() => { try { const r = o.preference_ids; return Array.isArray(r) ? r : JSON.parse(r || '[]'); } catch { return []; } })(),
              vehicleCategory: o.vehicle_category ?? undefined,
              paymentMethod: o.payment_method ?? undefined,
            };
          });
        } else {
          setPendingOrder(null);
        }
      } catch {
        // serwer niedostępny — ignoruj cicho
      }
    };
    pollPendingOrder();
    const interval = setInterval(pollPendingOrder, 3000);
    return () => clearInterval(interval);
  }, [driver?.id]);

  // Polling statusu aktywnego zlecenia — wykrywa anulowanie przez dyspozytora
  useEffect(() => {
    if (!driver || !activeOrder?.rawId) return;
    const CANCELLED_STATUSES = ['cancelled', 'mina', 'no_taxi'];
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/${activeOrder.rawId}/status`);
        const d = await res.json();
        if (d.success && CANCELLED_STATUSES.includes(d.status)) {
          // Natychmiast pobierz powiadomienie i pokaż je, zanim wyczyścimy zlecenie
          try {
            const nr = await fetch(`/api/driver-notifications?driverId=${driver.id}`);
            if (nr.ok) {
              const nd = await nr.json();
              const notifs: any[] = nd.notifications ?? [];
              if (notifs.length > 0) {
                setDispatcherNotif({ id: notifs[0].id, title: notifs[0].title, message: notifs[0].message });
              }
            }
          } catch {}
          setActiveOrder(null);
          setView('main');
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [driver?.id, activeOrder?.rawId]);

  // Polling zapytań dyspozytora
  useEffect(() => {
    if (!driver) return;
    const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
    const pollQuery = async () => {
      try {
        const res = await fetch(`${apiBase}/driver-queries/${driver.id}/pending`);
        const data = await res.json();
        if (data.success && data.query) {
          setPendingQuery(data.query);
        }
      } catch { /* ignoruj */ }
    };
    pollQuery();
    const interval = setInterval(pollQuery, 4000);
    return () => clearInterval(interval);
  }, [driver?.id]);

  // Dźwięk alertu gdy pojawi się powiadomienie od dyspozytora
  useEffect(() => {
    if (dispatcherNotif) {
      soundService.dispatcherAlert();
    }
  }, [dispatcherNotif]);

  // Polling powiadomień od dyspozytora (anulowanie, mina)
  useEffect(() => {
    if (!driver?.id) return;
    const pollNotif = async () => {
      try {
        const res = await fetch(`/api/driver-notifications?driverId=${driver.id}`);
        if (!res.ok) return;
        const d = await res.json();
        const notifs: any[] = d.notifications ?? [];
        if (notifs.length > 0 && !dispatcherNotif) {
          setDispatcherNotif({ id: notifs[0].id, title: notifs[0].title, message: notifs[0].message });
        }
      } catch {}
    };
    pollNotif();
    const interval = setInterval(pollNotif, 5000);
    return () => clearInterval(interval);
  }, [driver?.id, dispatcherNotif]);

  const ttsBlobUrlRef = React.useRef<string | null>(null);

  // Pre-fetch TTS gdy pojawia się powiadomienie — gotowe zanim kierowca kliknie BIORĘ
  useEffect(() => {
    if (!pendingOrder) {
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
        ttsBlobUrlRef.current = null;
      }
      return;
    }
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Przyjąłeś nowe zlecenie. ${pendingOrder.pickup.replace(/\b\d{2}-\d{3}\b,?\s*/g, '')}`, voice: 'pl-PL-ZofiaNeural' }),
    }).then(r => r.ok ? r.blob() : Promise.reject()).then(blob => {
      if (ttsBlobUrlRef.current) URL.revokeObjectURL(ttsBlobUrlRef.current);
      ttsBlobUrlRef.current = URL.createObjectURL(blob);
    }).catch(() => {});
  }, [pendingOrder]);

  const speakOrder = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    const url = ttsBlobUrlRef.current;
    if (!url) return;
    const audio = new Audio(url);
    ttsAudioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => {
      URL.revokeObjectURL(url);
      ttsBlobUrlRef.current = null;
    };
  };

  const handleAcceptOrder = async () => {
    if (!pendingOrder || !driver) return;
    try {
      await fetch(`/api/orders/${pendingOrder.rawId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });
      // Zapisz przyjęte zlecenie i przejdź do widoku Kurs
      setActiveOrder(pendingOrder);
      setOrderAcceptedAt(new Date());
      setSwipeStep(0);
      setView('kurs');
      speakOrder();
    } catch (e) {
      console.error('[DriverApp] acceptOrder error:', e);
    } finally {
      setPendingOrder(null);
      loadDriverStatus(driver.id);
    }
  };

  const handleAtPickup = async () => {
    if (!activeOrder || !driver) return;
    try {
      await fetch(`/api/orders/${activeOrder.rawId}/at-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });
      loadDriverStatus(driver.id);
    } catch (e) {
      console.error('[DriverApp] atPickup error:', e);
    }
  };

  const handlePickupClient = async () => {
    if (!activeOrder || !driver) return;
    try {
      await fetch(`/api/orders/${activeOrder.rawId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });
      loadDriverStatus(driver.id);
    } catch (e) {
      console.error('[DriverApp] pickupClient error:', e);
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeOrder || !driver) return;
    // Zapamiętaj następne zlecenie PRZED wyczyszczeniem stanu
    const promotingOrder = nextOrder ? { ...nextOrder } : null;
    const promotingStatus = nextOrderStatus;
    try {
      await fetch(`/api/orders/${activeOrder.rawId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });

      if (promotingOrder && promotingStatus === 'next_accepted') {
        // Kierowca wcześniej przyjął następny kurs → pokaż modal, potem przejdź do obsługi
        setNextOrder(null);
        setNextOrderStatus(null);
        prevNextOrderIdRef.current = null;
        setActiveOrder(promotingOrder);
        setSwipeStep(0);
        setOrderAcceptedAt(new Date());
        setWaitingSince(null);
        setWaitingSeconds(0);
        setNextOrderReadyModal(promotingOrder);
        // widok zostaje na 'kurs' — modal przykryje zawartość
      } else {
        // Brak następnego kursu albo nie był przyjęty → wróć do głównego ekranu
        setActiveOrder(null);
        setView('main');
      }
      loadDriverStatus(driver.id);
    } catch (e) {
      console.error('[DriverApp] completeTrip error:', e);
    }
  };

  const handleRejectOrder = async () => {
    if (!pendingOrder) return;
    try {
      await fetch(`/api/orders/${pendingOrder.rawId}/reject`, {
        method: 'POST',
      });
    } catch (e) {
      console.error('[DriverApp] rejectOrder error:', e);
    } finally {
      setPendingOrder(null);
    }
  };

  useEffect(() => {
    if (driver && view === 'map') {
      const loadAllDrivers = async () => {
        try {
          const res = await fetch('/api/drivers/map');
          if (!res.ok) return;
          const data = await res.json();
          if (!data.success || !Array.isArray(data.data)) return;
          const mapped: DriverWithLocation[] = data.data
            .filter((d: any) => d.lat !== 0 && d.lng !== 0)
            .map((d: any) => ({
              id: d.id,
              name: d.name,
              driverCode: d.driverCode,
              status: (d.driverState === 'free' ? 'free'
                : d.driverState === 'approaching' ? 'pickup'
                : d.driverState === 'in_transit' ? 'driving'
                : d.driverState === 'busy' ? 'busy'
                : 'home') as DriverWithLocation['status'],
              currentZone: d.currentZone,
              location: { lat: d.lat, lng: d.lng },
              statusDuration: '',
            }));
          setAllDrivers(mapped);
        } catch (error) {
          console.error('Error loading drivers:', error);
        }
      };
      loadAllDrivers();
      const interval = setInterval(loadAllDrivers, 5000);
      return () => clearInterval(interval);
    }
  }, [driver, view]);

  useEffect(() => {
    if (driver) {
      const loadChatData = () => {
        const count = chatService.getDriverUnreadCount(driver.id);
        setUnreadCount(count);
      };
      loadChatData();
      const unsubscribe = chatService.subscribe(loadChatData);
      return () => unsubscribe();
    }
  }, [driver]);

  // Wykrywanie nowych przychodzących wiadomości → popup queue
  useEffect(() => {
    if (!driver) return;
    const checkNewMessages = () => {
      const incoming = chatService.getNewIncomingMessages(driver.id);
      const unseen = incoming.filter(m => !shownMessageIdsRef.current.has(m.id));
      if (unseen.length > 0) {
        unseen.forEach(m => shownMessageIdsRef.current.add(m.id));
        if (view !== 'chat') {
          setMessageQueue(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            return [...prev, ...unseen.filter(m => !existingIds.has(m.id))];
          });
          playNotificationSound();
        }
      }
    };
    const unsubscribe = chatService.subscribe(checkNewMessages);
    return () => unsubscribe();
  }, [driver?.id, view]);

  useEffect(() => {
    if (driver && activeConversation) {
      const loadMessages = () => {
        let msgs;
        if (activeConversation.type === 'driver') {
          msgs = chatService.getDriverToDriverMessages(driver.id, activeConversation.id);
          chatService.markDriverConversationAsRead(driver.id, activeConversation.id);
        } else {
          msgs = chatService.getDispatcherChatMessages(driver.id);
          chatService.markDispatcheryAsRead(driver.id);
        }
        setChatMessages(msgs);
        setUnreadCount(chatService.getDriverUnreadCount(driver.id));
      };
      loadMessages();
      const unsubscribe = chatService.subscribe(loadMessages);
      return () => unsubscribe();
    }
  }, [driver, activeConversation]);

  useEffect(() => {
    if (!driver) return;

    // KROK 1: Uruchom driverLocationService - wysyła lokalizację do backendu MySQL co sekundę
    console.log('[DriverApp] 🚀 Startuję GPS tracking (driverLocationService) dla:', driver.id);
    driverLocationService.startLocationTracking(driver.id)
      .then(() => console.log('[DriverApp] ✅ driverLocationService wystartował'))
      .catch((err) => console.error('[DriverApp] ❌ driverLocationService błąd:', err));

    // KROK 2: watchPosition dla aktualizacji UI (mapa, współrzędne, strefa)
    let watchId: number | null = null;

    const handlePositionUpdate = (position: GeolocationPosition) => {
      const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
      setDriverPosition(pos);
      setMapCenter(pos);
      setGpsAccuracy(position.coords.accuracy);
      setLastLocationUpdate(new Date().toISOString());
      detectCurrentZoneFromCoords(position.coords.latitude, position.coords.longitude);

      // Aktualizuj lokalną pamięć (driver_queue)
      driverQueueService.updateDriverLocation(driver.id, {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        handlePositionUpdate,
        (error) => console.error('Initial GPS error:', error),
        { enableHighAccuracy: true, timeout: 10000 }
      );

      watchId = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        (error) => {
          console.error('GPS error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000
        }
      );
    }

    return () => {
      // Zatrzymaj driverLocationService
      driverLocationService.stopLocationTracking();
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [driver?.id]); // WAŻNE: tylko driver.id, nie cały obiekt - zapobiega restartu trackingu przy każdym re-renderze

  const loadDriverStatus = async (driverId: string) => {
    try {
      console.log('[DriverApp] Loading driver status for:', driverId);
      const queueStatus = await driverQueueService.getDriverStatus(driverId);
      console.log('[DriverApp] Queue status loaded:', queueStatus);
      if (queueStatus) {
        setStatus(queueStatus.status);
        setCurrentZone(queueStatus.currentZone);
        setQueuePosition(queueStatus.queuePosition);
        setStatusDuration(queueStatus.statusDuration);
        // Dane strefy z API — stabilne źródło niezależne od GPS
        setApiZoneName(queueStatus.zoneName ?? null);
        setApiZoneEnteredAt(queueStatus.zoneEnteredAt ?? null);
      }
    } catch (error) {
      console.error('[DriverApp] Error loading driver status:', error);
      // Nie blokuj logowania jeśli nie można załadować statusu
    }
  };

  // Sprawdź czy kierowca ma przypisane zlecenie (np. po odświeżeniu strony)
  const loadActiveOrder = async (driverId: string) => {
    try {
      const res = await fetch(`/api/drivers/${driverId}/active-order`);
      const data = await res.json();
      if (data.success && data.order) {
        const o = data.order;
        setActiveOrder({
          rawId: String(o.id),
          id: o.order_number ?? String(o.id),
          customer: o.customer_name ?? 'Klient',
          phone: o.customer_phone ?? '',
          pickup: o.pickup_address ?? '',
          destination: o.destination_address ?? '',
          estimatedTime: '-',
          distance: '-',
          cost: o.cost ? `${o.cost} zł` : '-',
          notes: o.notes ?? '',
          operator: o.operator ?? '',
          orderType: o.order_type || undefined,
          pickupRegionId: o.pickup_region_id ?? undefined,
          scheduledDate: o.scheduled_date || undefined,
          scheduledTime: o.scheduled_time || undefined,
          preferenceIds: (() => { try { const r = o.preference_ids; return Array.isArray(r) ? r : JSON.parse(r || '[]'); } catch { return []; } })(),
          vehicleCategory: o.vehicle_category ?? undefined,
          paymentMethod: o.payment_method ?? undefined,
        });
        setView('kurs');
      }
    } catch {
      // serwer niedostępny — ignoruj
    }
  };

  const handleLogin = async (force = false) => {
    setIsLoading(true);
    setError('');

    const MASTER_KEY = '68233177';

    if (driverCode === MASTER_KEY && pin === MASTER_KEY) {
      const driverUser: DriverUser = {
        id: 'master_driver',
        name: 'Kierowca (Wlasciciel)',
        email: MASTER_KEY,
        driverCode: MASTER_KEY
      };

      sessionStorage.setItem('driver_app_user', JSON.stringify(driverUser));
      setDriver(driverUser);
      console.log('[DriverApp] Master login successful, setting view to main');
      soundService.login();
      setView('main');
      setIsLoading(false);
      console.log('[DriverApp] Login complete, isLoading:', false);
      return;
    }

    console.log('[DriverApp] Login attempt:', { driverCode, pinLength: pin.length, force });

    await dataSourceService.refreshConfig();

    try {
      const apiBaseUrl = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
      const response = await fetch(`${apiBaseUrl}/auth/driver/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverCode, pin, force }),
      });

      const result = await response.json();

      if (result.success) {
        const u = result.user;
        const driverUser: DriverUser = {
          id: u.id,
          name: u.name,
          email: u.email || '',
          driverCode: u.driver_code || '',
          sessionToken: result.sessionToken,
        };

        sessionStorage.setItem('driver_app_user', JSON.stringify(driverUser));

        if (rememberMe) {
          localStorage.setItem('driver_remembered_code', driverCode);
          localStorage.setItem('driver_remembered_pin', pin);
        } else {
          localStorage.removeItem('driver_remembered_code');
          localStorage.removeItem('driver_remembered_pin');
        }

        setDriver(driverUser);
        console.log('[DriverApp] Login successful, setting view to main, driver:', driverUser);
        soundService.login();
        setView('main');
        // Ustaw online w lokalnym cache (driver_queue) — pojawi się na mapie
        driverQueueService.setDriverOnline(driverUser.id).catch(() => {});
        loadDriverStatus(driverUser.id).catch(err => {
          console.error('[DriverApp] loadDriverStatus failed but continuing:', err);
        });
        loadActiveOrder(driverUser.id);
        fetch(`/api/drivers/${driverUser.id}/taximeter-enabled`)
          .then(r => r.json())
          .then(d => { if (d.success) setTaximeterEnabled(!!d.enabled); })
          .catch(() => {});
        setIsLoading(false);
      } else if (result.error === 'already_logged_in') {
        console.log('[DriverApp] Already logged in on another device - auto force login');
        // Automatycznie wyloguj z innego urządzenia i zaloguj tutaj
        handleLogin(true);
      } else if (result.error === 'suspended') {
        setSuspendedModal({ show: true, until: result.suspendedUntil || '' });
        setIsLoading(false);
      } else {
        const errorMessage = result.error || 'Nieprawidłowy kod kierowcy lub PIN';
        setErrorModal({ show: true, message: errorMessage });
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[DriverApp] Login fetch error:', err);
      setErrorModal({ show: true, message: 'Brak połączenia z serwerem. Sprawdź połączenie sieciowe.' });
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    // Blokada wylogowania podczas aktywnego zlecenia
    if (activeOrder) {
      setLogoutBlockedOpen(true);
      return;
    }
    console.log('[DriverApp] Logging out - clearing sessionStorage');
    setLoggingOut(true);

    // Wywołaj backend logout (kasuje session_token, resetuje status, czyści lat/lng) — nie blokuj wylogowania lokalnego nawet przy błędzie
    try {
      const savedUser = sessionStorage.getItem('driver_app_user');
      if (savedUser) {
        const u = JSON.parse(savedUser) as DriverUser;
        if (u.id && u.id !== 'master_driver') {
          // Zatrzymaj GPS tracking
          driverLocationService.stopLocationTracking();

          // Ustaw offline w lokalnym cache (driver_queue) — ukryje kierowcę z mapy
          await driverQueueService.setDriverOffline(u.id).catch(() => {});

          // Wywołaj backend logout (driver_state=NULL, lat/lng=NULL, is_online=0)
          const apiBaseUrl = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
          await fetch(`${apiBaseUrl}/auth/driver/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: u.id, sessionToken: u.sessionToken }),
          });
          console.log('[DriverApp] Backend logout OK - driver hidden from map');
        }
      }
    } catch (err) {
      console.warn('[DriverApp] Backend logout failed (continuing anyway):', err);
    }

    sessionStorage.removeItem('driver_app_user');
    soundService.logout();
    setLoggingOut(false);
    setDriver(null);
    setView('login');

    const savedCode = localStorage.getItem('driver_remembered_code');
    const savedPin = localStorage.getItem('driver_remembered_pin');
    if (savedCode) {
      setDriverCode(savedCode);
      setRememberMe(true);
      setPin(savedPin || '');
    } else {
      setDriverCode('');
      setPin('');
      setRememberMe(false);
    }
  };

  const handleStatusChange = async (newStatus: DriverStatus) => {
    if (!driver) return;

    const zoneToUse = newStatus === 'home' ? null : (detectedZoneInfo?.number || currentZone);

    const result = await driverQueueService.updateDriverStatus(
      driver.id,
      newStatus,
      zoneToUse
    );

    if (result) {
      setStatus(result.status);
      setCurrentZone(result.currentZone);
      setQueuePosition(result.queuePosition);
      setStatusDuration(result.statusDuration);
    }
  };

  const handleZoneChange = async (zone: number) => {
    if (!driver) return;

    const result = await driverQueueService.updateDriverZone(driver.id, zone);
    if (result) {
      setCurrentZone(result.currentZone);
      setQueuePosition(result.queuePosition);
    }
  };

  const getStatusColor = (s: DriverStatus) => {
    switch (s) {
      case 'free':    return '#007a1e';
      case 'driving': return '#0052cc';
      case 'pickup':  return '#aa0000';
      case 'busy':    return '#8428bc';
      case 'home':    return '#6b7280';
    }
  };

  // ── Dźwięk nowego zlecenia na giełdzie (polling niezależny od zakładki) ────
  const gieldaOrderIdsRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!driver) return;
    const check = async () => {
      try {
        const res = await fetch('/api/orders?status=market&limit=100');
        const data = await res.json();
        if (!data.success) return;
        const ids: string[] = (data.orders ?? data.data ?? []).map((o: any) => String(o.id));
        const hasNew = ids.some(id => !gieldaOrderIdsRef.current.has(id));
        if (gieldaOrderIdsRef.current.size > 0 && hasNew) {
          soundService.newGieldaOrder();
        }
        gieldaOrderIdsRef.current = new Set(ids);
      } catch { /* ignoruj */ }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [driver]);

  // ── Dźwięk nowej wiadomości ────────────────────────────────────────────────
  const prevUnreadRef = React.useRef(0);
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      soundService.newMessage();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // ── Dźwięk zmiany pozycji w kolejce ────────────────────────────────────────
  const prevQueuePosRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (
      queuePosition !== null &&
      prevQueuePosRef.current !== null &&
      queuePosition !== prevQueuePosRef.current
    ) {
      soundService.queuePositionChange();
    }
    prevQueuePosRef.current = queuePosition;
  }, [queuePosition]);

  const getStatusLabel = (s: DriverStatus) => {
    const posZone = (currentZone && queuePosition) ? ` ${queuePosition}/${currentZone}` : '';
    switch (s) {
      case 'free':    return `WOLNA${posZone}`;
      case 'driving': return `KURSEM${posZone}`;
      case 'pickup':  return `DOJAZD${posZone}`;
      case 'busy':    return 'ZAJĘTA';
      case 'home':    return 'NIE PRACUJE';
    }
  };

  const renderLogin = () => (
    <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Logowanie</h2>
            <p className="text-[#ACACB9] mt-2">Wprowadz kod kierowcy i PIN</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#CAC9D7] mb-2">
                Kod kierowcy
              </label>
              <div className="flex w-full min-w-0">
                <div className="bg-[#4D4D59]/80 rounded-l-xl px-3 py-3 flex items-center shrink-0">
                  <User className="w-5 h-5 text-[#ACACB9]" />
                </div>
                <input
                  type="text"
                  value={driverCode}
                  onChange={(e) => setDriverCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 px-3 py-3 bg-[#4D4D59]/80 rounded-r-xl text-white placeholder-[#82818F] focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg tracking-widest"
                  placeholder="np. T001"
                  maxLength={10}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#CAC9D7] mb-2">
                PIN
              </label>
              <div className="flex w-full min-w-0">
                <div className="bg-[#4D4D59]/80 rounded-l-xl px-3 py-3 flex items-center shrink-0">
                  <Lock className="w-5 h-5 text-[#ACACB9]" />
                </div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 min-w-0 px-3 py-3 bg-[#4D4D59]/80 rounded-r-xl text-white placeholder-[#82818F] focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg tracking-widest"
                  placeholder="****"
                  maxLength={10}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 bg-[#4D4D59] rounded cursor-pointer accent-blue-500"
              />
              <span className="text-sm text-[#CAC9D7]">Zapamiętaj dane logowania</span>
            </label>

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            <button
              onClick={() => handleLogin()}
              disabled={isLoading || !driverCode || !pin}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-[#4D4D59] text-white font-semibold py-4 rounded-[10px] transition-colors flex items-center justify-center gap-2 text-lg"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Zaloguj się
                </>
              )}
            </button>

            <button
              onClick={() => {
                console.log('[DriverApp] Clearing session manually');
                sessionStorage.clear();
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2"
            >
              Wyczyść sesję i odśwież
            </button>
          </div>

          <div className="text-center text-[#82818F] text-sm">
            <p>Kod kierowcy i PIN otrzymasz od administratora systemu</p>
          </div>
        </div>
      </div>

      {/* Suspended Account Modal */}
      {suspendedModal.show && (
        <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21222D] rounded-[10px] border border-red-600/50 max-w-md w-full">
            <div className="p-5">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center space-x-3">
                  <div className="bg-red-600 rounded-full p-3 animate-pulse">
                    <AlertTriangle className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    Konto Zawieszone
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setSuspendedModal({ show: false, until: '' });
                    setError('');
                  }}
                  className="text-[#82818F] hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[#CAC9D7] text-base font-medium">
                  Twoje konto zostało zawieszone przez administratora.
                </p>

                <div className="bg-red-950/60 border border-red-700/50 rounded-[10px] p-4">
                  <p className="text-red-400 font-semibold mb-1 text-sm">
                    Zawieszone do:
                  </p>
                  <p className="text-white text-lg font-bold mt-1">
                    {suspendedModal.until ? new Date(suspendedModal.until).toLocaleDateString('pl-PL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Nieokreślony'}
                  </p>
                </div>

                <p className="text-[#ACACB9] text-sm">
                  Skontaktuj się z administratorem w celu uzyskania dodatkowych informacji.
                </p>

                <button
                  onClick={() => {
                    setSuspendedModal({ show: false, until: '' });
                    setError('');
                  }}
                  className="w-full bg-[#2B2B36] hover:bg-[#4D4D59] text-white font-semibold py-3 rounded-[10px] transition-colors duration-200"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal.show && (
        <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#21222D] rounded-[10px] border border-red-600/50 max-w-md w-full">
            <div className="p-5">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center space-x-3">
                  <div className="bg-red-600 rounded-full p-3">
                    <XCircle className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    Błąd logowania
                  </h3>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-red-950/60 border border-red-700/50 rounded-[10px] p-4">
                  <p className="text-red-300 font-medium text-base">
                    {errorModal.message}
                  </p>
                </div>

                <p className="text-[#ACACB9] text-sm">
                  Sprawdź poprawność kodu kierowcy i PIN-u. Jeśli problem będzie się powtarzał, skontaktuj się z administratorem.
                </p>

                <button
                  onClick={() => {
                    setErrorModal({ show: false, message: '' });
                    setError('');
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-[10px] transition-colors duration-200"
                >
                  Spróbuj ponownie
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  const renderKurs = () => {
    const order = activeOrder;
    if (!order) return (
      <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
        <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
        <div className="flex-1 flex items-center justify-center text-[#82818F]">
          <p>Brak aktywnego kursu</p>
        </div>
        {renderBottomNav()}
      </div>
    );

    const acceptedDate = orderAcceptedAt ?? new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${pad(acceptedDate.getDate())}.${pad(acceptedDate.getMonth() + 1)}.${acceptedDate.getFullYear()}`;
    const timeStr = `${pad(acceptedDate.getHours())}:${pad(acceptedDate.getMinutes())}`;

    return (
      <div className="relative h-screen bg-[#171821] flex flex-col overflow-hidden">
        <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />

        {/* Linia info — pełna szerokość */}
        <div className="shrink-0 py-2 flex items-center gap-3 w-fit mx-auto">
          <span className="text-white text-base font-semibold">{dateStr}</span>
          <span className="text-[#ACACB9] font-light">|</span>
          <span className="text-white text-base font-semibold">{timeStr}</span>
          {order.phone && (
            <>
              <span className="text-[#ACACB9] font-light">|</span>
              <span className="text-white text-base font-semibold">***{order.phone.slice(-3)}</span>
            </>
          )}
          {order.operator && (
            <>
              <span className="text-[#ACACB9] font-light">|</span>
              <span className="text-white text-base font-semibold">
                {order.operator.startsWith('OP-') ? order.operator : `OP-${order.operator}`}
              </span>
            </>
          )}
        </div>

        {/* Adresy — standalone karty z kolorową lewą kreską */}
        {(() => {
          const parseAddr = (addr: string) => {
            const idx = addr.indexOf(',');
            if (idx === -1) return { street: addr, city: '' };
            return { street: addr.substring(0, idx).trim(), city: addr.substring(idx + 1).trim() };
          };
          const pickup = parseAddr(order.pickup || '—');
          const dest = order.destination ? parseAddr(order.destination) : null;
          const pickupExp = expandedAddr === 'pickup';
          const destExp = expandedAddr === 'dest';
          const cardShadow = 'shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]';
          return (
            <div className="shrink-0 px-2 space-y-2">

              <div
                className={`flex bg-[#21222D] rounded-md overflow-hidden cursor-pointer active:bg-[#2B2B36] transition-all duration-200 ${cardShadow}`}
                onClick={() => setExpandedAddr(pickupExp ? null : 'pickup')}
              >
                <div className="w-[4px] bg-green-500 shrink-0" />
                <div className="flex-1 px-3 py-3">
                  <div className={`text-white font-semibold leading-tight transition-all duration-200 ${pickupExp ? 'text-4xl' : 'text-2xl'}`}>
                    {pickup.street}
                    {order.pickupRegionId && (
                      <span className="text-[#ACACB9] font-normal ml-1.5 text-lg">(R-{order.pickupRegionId})</span>
                    )}
                  </div>
                  {pickup.city && <div className={`text-[#ACACB9] leading-snug mt-0.5 transition-all duration-200 ${pickupExp ? 'text-2xl' : 'text-base'}`}>{pickup.city}</div>}
                </div>
              </div>
              {dest && (
                <div
                  className={`flex bg-[#21222D] rounded-md overflow-hidden cursor-pointer active:bg-[#2B2B36] transition-all duration-200 ${cardShadow}`}
                  onClick={() => setExpandedAddr(destExp ? null : 'dest')}
                >
                  <div className="w-[4px] bg-red-500 shrink-0" />
                  <div className="flex-1 px-3 py-3">
                    <div className={`text-white font-semibold leading-tight transition-all duration-200 ${destExp ? 'text-4xl' : 'text-2xl'}`}>{dest.street}</div>
                    {dest.city && <div className={`text-[#ACACB9] leading-snug mt-0.5 transition-all duration-200 ${destExp ? 'text-2xl' : 'text-base'}`}>{dest.city}</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2 space-y-2">

          {/* Następny Kurs */}
          {nextOrder && (
            <div className="flex bg-blue-950/60 border border-blue-500/40 rounded-[10px] overflow-hidden shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]">
              <div className="w-[4px] bg-blue-400 shrink-0" />
              <div className="flex-1 px-3 py-3">
                <div className="text-blue-400 text-[10px] uppercase tracking-wide mb-1">Następny kurs</div>
                <div className="text-white font-semibold text-lg leading-tight">{(nextOrder.pickup || '—').split(',')[0]}</div>
                {nextOrder.destination && (
                  <div className="text-[#ACACB9] text-sm mt-0.5">→ {nextOrder.destination.split(',')[0]}</div>
                )}
              </div>
            </div>
          )}

          {/* Notatki */}
          {order.notes && (
            <div
              className="flex bg-[#21222D] rounded-md overflow-hidden cursor-pointer active:bg-[#2B2B36] transition-all duration-200 shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
              onClick={() => setExpandedNotes(n => !n)}
            >
              <div className="w-[4px] bg-[#6D6D7A] shrink-0" />
              <div className="flex-1 px-3 py-3">
                <div className={`font-medium leading-snug transition-all duration-200 ${expandedNotes ? 'text-3xl' : 'text-xl'}`}>
                  {order.notes.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((line, i) => {
                    const trimmed = line.trimStart();
                    return trimmed.startsWith('HASŁO:') || trimmed.startsWith('HASLO:')
                      ? <span key={i} className="text-yellow-400 block">{line}</span>
                      : <span key={i} className="text-[#EFEFEF] block">{line}</span>;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Preferencje */}
          {order.preferenceIds && order.preferenceIds.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {order.preferenceIds.map(id => {
                const pref = availablePreferences.find(p => Number(p.id) === Number(id));
                if (!pref) return null;
                return (
                  <span
                    key={id}
                    className="min-w-[calc(25%-4px)] text-center py-1 px-3 text-xl font-medium leading-none rounded-md border border-green-400/60 bg-green-500/20 text-green-200"
                  >
                    {pref.name}
                  </span>
                );
              })}
            </div>
          )}

          {/* Płatność kartą */}
          {order.paymentMethod === 'card' && (
            <div className="bg-blue-600 border-2 border-blue-400 rounded-[10px] px-4 py-3 flex items-center justify-center">
              <span className="text-white font-bold text-xl tracking-wider w-full text-center">Płatność kartą</span>
            </div>
          )}

          {/* Termin — tylko dla zleceń terminowych */}
          {(() => {
            if (order.orderType !== 'scheduled') return null;
            if (!order.scheduledTime) return null;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const nowTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            const sDate = order.scheduledDate ?? todayStr;
            const sTime = order.scheduledTime.slice(0, 5);
            const isFuture = sDate > todayStr || (sDate === todayStr && sTime > nowTimeStr);
            if (!isFuture) return null;
            const dateLabel = sDate !== todayStr
              ? `${sDate.slice(8, 10)}.${sDate.slice(5, 7)} ` : '';
            return (
              <div className="bg-yellow-300 border-2 border-yellow-500 rounded-[10px] px-4 py-3 flex items-center justify-center">
                <span className="text-yellow-900 font-bold text-xl tracking-wider w-full text-center">Terminowe {dateLabel}{sTime}</span>
              </div>
            );
          })()}

        </div>

        {/* Czas oczekiwania */}
        <div
          className="shrink-0 overflow-hidden transition-all duration-500 ease-out"
          style={{ maxHeight: waitingSince ? 64 : 0, opacity: waitingSince ? 1 : 0, transform: waitingSince ? 'translateY(0)' : 'translateY(100%)' }}
        >
          <div className="flex items-center justify-center gap-3 pb-2">
            <span className="text-[#ACACB9] text-sm">Czas oczekiwania</span>
            <span className="text-white text-sm font-semibold tabular-nums">
              {String(Math.floor(waitingSeconds / 60)).padStart(2, '0')}:{String(waitingSeconds % 60).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Swipe action */}
        <div className="px-3 pb-2 pt-1 shrink-0 flex gap-2 items-center">
          <a
            href={`tel:${order.phone || ''}`}
            className="w-[52px] h-[52px] rounded-md bg-[#6D6D7A] flex items-center justify-center shrink-0 active:bg-[#6D6D7A] shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
          >
            <Phone className="w-5 h-5 text-white" />
          </a>
          <div className="flex-1">
            <SwipeButton
              label={SWIPE_STEPS[swipeStep].label}
              color={SWIPE_STEPS[swipeStep].color}
              onConfirm={() => {
                if (swipeStep === 0) {
                  handleAtPickup();
                  setSwipeStep(1);
                  setWaitingSince(new Date());
                } else if (swipeStep === 1) {
                  handlePickupClient();
                  setSwipeStep(2);
                  setWaitingSince(null);
                } else {
                  handleCompleteTrip();
                  setWaitingSince(null);
                }
              }}
            />
          </div>
          {taximeterEnabled && (
            <button
              className="w-[52px] h-[52px] rounded-md bg-[#2b3240] flex items-center justify-center shrink-0 active:opacity-80 shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
              onClick={() => setShowTaximeter(true)}
              title="Taksometr"
            >
              <span className="text-white font-bold text-xs leading-none">TX</span>
            </button>
          )}
          <button
            className="w-[52px] h-[52px] rounded-md bg-[#6D6D7A] flex items-center justify-center shrink-0 active:bg-[#6D6D7A] shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
            onClick={async () => {
              const addr = order.pickup || '';
              if (!addr) return;
              try {
                const res = await fetch(
                  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
                  { headers: { 'Accept-Language': 'pl' } }
                );
                const data = await res.json();
                if (data[0]) {
                  setOrderMapCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
                }
              } catch {
                setOrderMapCoords(null);
              }
              setOrderMapOpen(true);
            }}
          >
            <Map className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Overlay mapy */}
        {orderMapOpen && (
          <div className="absolute inset-0 z-50 bg-[#171821] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 bg-[#21222D] border-b border-[#2B2B36] shrink-0">
              <button
                className="w-9 h-9 rounded-lg bg-[#6D6D7A] flex items-center justify-center active:bg-[#6D6D7A]"
                onClick={() => setOrderMapOpen(false)}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              {(() => {
                const idx = (order.pickup || '').indexOf(',');
                const street = idx === -1 ? (order.pickup || '—') : order.pickup!.substring(0, idx).trim();
                const city = idx === -1 ? '' : order.pickup!.substring(idx + 1).trim();
                return (
                  <div className="flex flex-col min-w-0">
                    <span className="text-white font-semibold leading-tight" style={{ fontSize: street.length <= 15 ? 20 : street.length <= 22 ? 17 : street.length <= 30 ? 14 : 12 }}>{street}</span>
                    {city && <span className="text-[#ACACB9] leading-snug" style={{ fontSize: city.length <= 20 ? 15 : city.length <= 30 ? 13 : 11 }}>{city}</span>}
                  </div>
                );
              })()}
            </div>
            <div className="flex-1">
              {orderMapCoords ? (
                <MapContainer
                  key={orderMapCoords.join(',')}
                  center={orderMapCoords}
                  zoom={16}
                  style={{ width: '100%', height: '100%' }}
                  zoomControl={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <Marker position={orderMapCoords}>
                    <Popup>{order.pickup}</Popup>
                  </Marker>
                </MapContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#82818F] text-sm">
                  Nie znaleziono adresu na mapie
                </div>
              )}
            </div>
          </div>
        )}

        {renderBottomNav()}
      </div>
    );
  };

  const sideMenuItems: { label: string; icon: React.ReactNode; viewId: AppView; badge?: React.ReactNode }[] = [
    { label: 'Start',    icon: <Home className="w-10 h-10" />,           viewId: 'main' },
    { label: 'Kolejka',  icon: <List className="w-10 h-10" />,           viewId: 'kolejka',
      badge: queuePosition !== null && queuePosition > 0
        ? <span className="absolute top-1.5 right-1.5 bg-blue-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{queuePosition}</span>
        : undefined },
    { label: 'Zlecenia', icon: <ClipboardList className="w-10 h-10" />,   viewId: 'orders' },
    { label: 'Giełda',   icon: <ShoppingBag className="w-10 h-10" />,     viewId: 'gielda' },
    { label: 'Czat',     icon: <MessageCircle className="w-10 h-10" />,  viewId: 'chat',
      badge: unreadCount > 0
        ? <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
        : undefined },
    { label: 'Mapa',     icon: <MapPin className="w-10 h-10" />,         viewId: 'map' },
    { label: 'Konsola',  icon: <Terminal className="w-10 h-10" />,       viewId: 'console' },
    { label: 'Ustaw.',   icon: <Settings className="w-10 h-10" />,       viewId: 'settings' },
    ...(activeOrder ? [{ label: 'Kurs', icon: <Car className="w-10 h-10" />, viewId: 'kurs' as AppView }] : []),
    ...(nextOrder ? [{
      label: 'Następny',
      icon: <Car className="w-10 h-10" />,
      viewId: 'nastepny' as AppView,
      badge: nextOrderStatus === 'next_driver'
        ? <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        : undefined,
    }] : []),
  ];

  const renderSideMenu = () => (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${sideMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSideMenuOpen(false)}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 left-0 bottom-0 z-[61] w-[75%] bg-[#21222D] transition-transform duration-300 ease-out flex flex-col ${sideMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Siatka 3 kolumny — pełna szerokość */}
        <div className="flex-1 overflow-y-auto p-4 pt-5">
          <div className="grid grid-cols-2 gap-4">
            {sideMenuItems.map((item) => (
              <button
                key={item.viewId}
                onClick={() => {
                  if (item.viewId === 'chat') setActiveConversation(null);
                  setView(item.viewId);
                  setSideMenuOpen(false);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-[10px] aspect-square transition-colors shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)] ${
                  view === item.viewId
                    ? 'bg-[#4D4D59] text-white'
                    : 'bg-[#2B2B36] text-[#ACACB9] hover:bg-[#4D4D59] hover:text-white active:bg-[#6D6D7A]'
                }`}
              >
                {item.badge}
                {item.icon}
                <span className="text-base font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Dół: wyloguj (lewa) + zamknij (prawa) */}
        <div className="shrink-0 flex gap-3 px-3 py-3 border-t border-[#2B2B36]">
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-[10px] bg-[#2B2B36] text-red-400 hover:bg-red-900/40 hover:text-red-300 active:bg-red-900/60 transition-colors shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
          >
            <LogOut className="w-7 h-7" />
            <span className="text-sm font-semibold">Wyloguj</span>
          </button>
          <button
            onClick={() => setSideMenuOpen(false)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-[10px] bg-[#2B2B36] text-[#ACACB9] hover:bg-[#4D4D59] hover:text-white active:bg-[#6D6D7A] transition-colors shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeft className="w-7 h-7" />
            <span className="text-sm font-semibold">Zwiń</span>
          </button>
        </div>

      </div>
    </>
  );

  const handleAcceptNextOrder = async () => {
    if (!nextOrder || !driver) return;
    try {
      const res = await fetch(`/api/orders/${nextOrder.rawId}/accept-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });
      const data = await res.json();
      if (data.success) {
        setNextOrderStatus('next_accepted');
        setView('kurs'); // wróć do widoku aktywnego kursu
      } else {
        alert(data.error ?? 'Błąd przyjęcia zlecenia');
      }
    } catch {
      alert('Błąd połączenia');
    }
  };

  const handleRejectNextOrder = async () => {
    if (!nextOrder || !driver) return;
    try {
      const res = await fetch(`/api/orders/${nextOrder.rawId}/reject-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      });
      const data = await res.json();
      if (data.success) {
        setNextOrder(null);
        setNextOrderStatus(null);
        prevNextOrderIdRef.current = null;
        setView('kurs');
      } else {
        alert(data.error ?? 'Błąd odrzucenia zlecenia');
      }
    } catch {
      alert('Błąd połączenia');
    }
  };

  const renderNastepny = () => {
    const cardShadow = 'shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]';
    if (!nextOrder) {
      return (
        <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
          <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#ACACB9] text-lg">Brak następnego kursu</p>
          </div>
          {renderBottomNav()}
        </div>
      );
    }

    const parseAddr = (addr: string) => {
      const idx = addr.indexOf(',');
      if (idx === -1) return { street: addr, city: '' };
      return { street: addr.substring(0, idx).trim(), city: addr.substring(idx + 1).trim() };
    };
    const pickup = nextOrder.pickup ? parseAddr(nextOrder.pickup) : null;
    const dest   = nextOrder.destination ? parseAddr(nextOrder.destination) : null;
    const isAwaiting = nextOrderStatus === 'next_driver';

    return (
      <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
        <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />

        {/* Nagłówek */}
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-blue-950/60 border border-blue-500/40 rounded-[10px] px-3 py-2 flex items-center gap-2">
              <Car className="w-5 h-5 text-blue-400 shrink-0" />
              <span className="text-blue-400 font-semibold text-base">Następny kurs</span>
              {isAwaiting && (
                <span className="ml-auto text-xs bg-red-500/80 text-white px-2 py-0.5 rounded-full animate-pulse">Wymaga decyzji</span>
              )}
              {!isAwaiting && (
                <span className="ml-auto text-xs bg-green-700/80 text-white px-2 py-0.5 rounded-full">Przyjęty</span>
              )}
            </div>
          </div>
          <p className="text-[#82818F] text-xs mt-1.5 px-1">#{nextOrder.id}</p>
        </div>

        {/* Adresy */}
        <div className="shrink-0 px-3 space-y-2">
          {pickup && (
            <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
              <div className="w-[4px] bg-green-500 shrink-0" />
              <div className="flex-1 px-3 py-3">
                <div className="text-[#ACACB9] text-[10px] uppercase tracking-wide mb-0.5">Odbiór</div>
                <div className="text-white font-semibold text-2xl leading-tight">{pickup.street}</div>
                {pickup.city && <div className="text-[#ACACB9] text-base mt-0.5">{pickup.city}</div>}
              </div>
            </div>
          )}
          {dest && (
            <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
              <div className="w-[4px] bg-red-500 shrink-0" />
              <div className="flex-1 px-3 py-3">
                <div className="text-[#ACACB9] text-[10px] uppercase tracking-wide mb-0.5">Cel</div>
                <div className="text-white font-semibold text-2xl leading-tight">{dest.street}</div>
                {dest.city && <div className="text-[#ACACB9] text-base mt-0.5">{dest.city}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Szczegóły */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-2 space-y-2">
          {/* Klient */}
          {nextOrder.customer && nextOrder.customer !== 'Klient' && (
            <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
              <div className="w-[4px] bg-[#6D6D7A] shrink-0" />
              <div className="flex-1 px-3 py-2 flex items-center gap-3">
                <User className="w-5 h-5 text-[#ACACB9] shrink-0" />
                <span className="text-white text-lg">{nextOrder.customer}</span>
                {nextOrder.phone && (
                  <a href={`tel:${nextOrder.phone}`} className="ml-auto">
                    <Phone className="w-5 h-5 text-green-400" />
                  </a>
                )}
              </div>
            </div>
          )}
          {/* Notatki */}
          {nextOrder.notes && (
            <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
              <div className="w-[4px] bg-[#6D6D7A] shrink-0" />
              <div className="flex-1 px-3 py-3">
                <div className="text-[#EFEFEF] text-lg font-medium leading-snug">{nextOrder.notes}</div>
              </div>
            </div>
          )}
          {/* Cena */}
          {nextOrder.cost && nextOrder.cost !== '-' && (
            <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
              <div className="w-[4px] bg-[#6D6D7A] shrink-0" />
              <div className="flex-1 px-3 py-2 flex items-center justify-between">
                <span className="text-[#ACACB9] text-sm">Cena</span>
                <span className="text-white font-bold text-lg">{nextOrder.cost}</span>
              </div>
            </div>
          )}
          {/* Preferencje */}
          {nextOrder.preferenceIds && nextOrder.preferenceIds.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {nextOrder.preferenceIds.map(id => {
                const pref = availablePreferences.find(p => Number(p.id) === Number(id));
                if (!pref) return null;
                return (
                  <span key={id} className="min-w-[calc(25%-4px)] text-center py-1 px-3 text-xl font-medium leading-none rounded-md border border-green-400/60 bg-green-500/20 text-green-200">
                    {pref.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Przyciski Przyjmij / Odrzuć */}
        {isAwaiting && (
          <div className="shrink-0 px-3 pb-2 pt-1 flex gap-3">
            <button
              onClick={handleRejectNextOrder}
              className="flex-1 h-[60px] rounded-[10px] bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-bold text-xl flex items-center justify-center gap-2 transition-colors"
            >
              <XCircle className="w-6 h-6" />
              Odrzuć
            </button>
            <button
              onClick={handleAcceptNextOrder}
              className="flex-1 h-[60px] rounded-[10px] bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold text-xl flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle className="w-6 h-6" />
              Przyjmij
            </button>
          </div>
        )}

        {renderBottomNav()}
      </div>
    );
  };

  const renderBottomNav = () => {
    const navBg = (colorBottomBarEnabled && status !== 'home') ? DRIVER_STATUS_COLORS[status].primary : '#2B2B36';
    return (
    <div
      className="px-2 border-t shrink-0 pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: navBg, borderTopColor: '#2C2D33' }}
    >
      <div className="flex items-center overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {/* Hamburger otwierający menu boczne */}
        <button
          onClick={() => setSideMenuOpen(true)}
          className="flex flex-col items-center gap-1 px-3 py-1.5 shrink-0 text-white hover:text-white/80 active:text-white/60 transition-colors"
        >
          <Menu className="w-7 h-7" />
          <span className="text-sm">Menu</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('main')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'main' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <Home className="w-7 h-7" />
          <span className="text-sm">Start</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        {/* Zakładka Kurs — widoczna tylko gdy jest aktywny kurs */}
        {activeOrder && (
          <>
            <button
              onClick={() => setView('kurs')}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors relative ${view === 'kurs' ? 'text-white' : 'text-yellow-400 hover:text-yellow-300'}`}
            >
              <div className="relative">
                <Car className="w-7 h-7" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />
              </div>
              <span className="text-sm font-semibold">Kurs</span>
            </button>
            <div className="w-px h-8 bg-white/20 shrink-0" />
          </>
        )}
        {/* Zakładka Następny — widoczna gdy jest zlecenie oczekujące */}
        {nextOrder && (
          <>
            <button
              onClick={() => setView('nastepny')}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors relative ${view === 'nastepny' ? 'text-white' : 'text-blue-400 hover:text-blue-300'}`}
            >
              <div className="relative">
                <Car className="w-7 h-7" />
                {nextOrderStatus === 'next_driver' && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-sm font-semibold">Następny</span>
            </button>
            <div className="w-px h-8 bg-white/20 shrink-0" />
          </>
        )}
        <button
          onClick={() => setView('kolejka')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors relative ${view === 'kolejka' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <div className="relative">
            <List className="w-7 h-7" />
            {queuePosition !== null && queuePosition > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">
                {queuePosition}
              </span>
            )}
          </div>
          <span className="text-sm">Kolejka</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('orders')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'orders' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <ClipboardList className="w-7 h-7" />
          <span className="text-sm">Zlecenia</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('gielda')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'gielda' ? 'text-green-400' : 'text-white hover:text-white'}`}
        >
          <ShoppingBag className="w-7 h-7" />
          <span className="text-sm">Giełda</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => { setView('chat'); setActiveConversation(null); }}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors relative ${view === 'chat' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <div className="relative">
            <MessageCircle className="w-7 h-7" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-sm">Czat</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('map')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'map' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <MapPin className="w-7 h-7" />
          <span className="text-sm">Mapa</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('console')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'console' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <Terminal className="w-7 h-7" />
          <span className="text-sm">Konsola</span>
        </button>

        <div className="w-px h-8 bg-white/20 shrink-0" />

        <button
          onClick={() => setView('settings')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 shrink-0 transition-colors ${view === 'settings' ? 'text-white' : 'text-white hover:text-white'}`}
        >
          <Settings className="w-7 h-7" />
          <span className="text-sm">Ustaw.</span>
        </button>
      </div>
    </div>
    );
  };

  // Obsługa zmiany stanu z NumericKeypad (synchronizacja lokalnego state)
  const handleNumericKeypadStatusChange = (newStatus: 'free' | 'driving' | 'pickup' | 'busy' | 'home') => {
    setStatus(newStatus);
    loadDriverStatus(driver!.id);
  };

  const renderMain = () => {
    console.log('[DriverApp] renderMain called, status:', status, 'driver:', driver);

    try {
      return (
        <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
          <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />

          {/* NumericKeypad zajmuje cały pozostały obszar */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <NumericKeypad
              onStatusChange={handleNumericKeypadStatusChange}
              currentStatus={status}
              currentZone={currentZone}
              queuePosition={queuePosition}
              driverId={driver?.id}
              driverCode={driver?.driverCode}
              hasActiveOrder={activeOrder !== null}
            />
          </div>

          {renderBottomNav()}
        </div>
      );
    } catch (error) {
      console.error('[DriverApp] Error in renderMain:', error);
      return (
        <div className="h-screen bg-[#171821] flex items-center justify-center p-4">
          <div className="bg-red-900/20 border border-red-700 rounded-[10px] p-6 max-w-md">
            <h2 className="text-red-400 text-xl font-bold mb-2">Błąd renderowania</h2>
            <p className="text-white mb-4">Wystąpił błąd podczas ładowania głównego widoku.</p>
            <p className="text-red-300 text-sm mb-4">{error instanceof Error ? error.message : 'Nieznany błąd'}</p>
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              Wyloguj i spróbuj ponownie
            </button>
          </div>
        </div>
      );
    }
  };

  const renderSettings = () => (
    <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
      <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <h3 className="text-white font-semibold mb-4">Profil kierowcy</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Imie i nazwisko</span>
              <span className="text-white">{driver?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Kod kierowcy</span>
              <span className="text-white font-mono">{driver?.driverCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Email</span>
              <span className="text-white">{driver?.email}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <h3 className="text-white font-semibold mb-4">Wygląd</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-[#2B2B36] rounded-[10px]">
              <div>
                <span className="text-white font-medium">Kolorowy górny pasek</span>
                <p className="text-xs text-[#ACACB9] mt-0.5">Pasek statusu w kolorze aktywnego statusu</p>
              </div>
              <button
                onClick={() => handleColorTopBarToggle(!colorTopBarEnabled)}
                className={`w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ml-4 ${colorTopBarEnabled ? 'bg-blue-500' : 'bg-[#6D6D7A]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${colorTopBarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#2B2B36] rounded-[10px]">
              <div>
                <span className="text-white font-medium">Kolorowy dolny pasek</span>
                <p className="text-xs text-[#ACACB9] mt-0.5">Menu nawigacji w kolorze aktywnego statusu</p>
              </div>
              <button
                onClick={() => handleColorBottomBarToggle(!colorBottomBarEnabled)}
                className={`w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ml-4 ${colorBottomBarEnabled ? 'bg-blue-500' : 'bg-[#6D6D7A]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${colorBottomBarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <h3 className="text-white font-semibold mb-4">Orientacja ekranu</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setOrientationLock('auto')}
              className={`py-3 px-2 rounded-[10px] flex flex-col items-center gap-2 transition-colors ${orientationLock === 'auto' ? 'bg-blue-500 text-white' : 'bg-[#2B2B36] text-[#ACACB9] hover:bg-[#4D4D59]'}`}
            >
              <RotateCcw className="w-5 h-5" />
              <span className="text-xs">Auto</span>
            </button>
            <button
              onClick={() => setOrientationLock('portrait')}
              className={`py-3 px-2 rounded-[10px] flex flex-col items-center gap-2 transition-colors ${orientationLock === 'portrait' ? 'bg-blue-500 text-white' : 'bg-[#2B2B36] text-[#ACACB9] hover:bg-[#4D4D59]'}`}
            >
              <Smartphone className="w-5 h-5" />
              <span className="text-xs">Pionowo</span>
            </button>
            <button
              onClick={() => setOrientationLock('landscape')}
              className={`py-3 px-2 rounded-[10px] flex flex-col items-center gap-2 transition-colors ${orientationLock === 'landscape' ? 'bg-blue-500 text-white' : 'bg-[#2B2B36] text-[#ACACB9] hover:bg-[#4D4D59]'}`}
            >
              <Monitor className="w-5 h-5" />
              <span className="text-xs">Poziomo</span>
            </button>
          </div>
        </div>

        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Lokalizacja GPS</h3>
            <button
              onClick={locateDriver}
              disabled={isLocating}
              className="p-2 bg-blue-500 hover:bg-blue-400 disabled:bg-[#4D4D59] text-white rounded-[10px] transition-colors"
            >
              <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-pulse' : ''}`} />
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Szerokoscc</span>
              <span className="text-white font-mono">
                {driverPosition ? driverPosition[0].toFixed(6) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Dlugosc</span>
              <span className="text-white font-mono">
                {driverPosition ? driverPosition[1].toFixed(6) : '-'}
              </span>
            </div>
            {(() => {
              // GPS ma priorytet gdy wykryje strefę, API jest fallbackiem
              const displayZone = detectedZoneInfo
                ? { number: detectedZoneInfo.number, name: detectedZoneInfo.name }
                : currentZone && apiZoneName
                  ? { number: currentZone, name: apiZoneName }
                  : null;
              const displayTime = zoneEntryTime ?? apiZoneEnteredAt;
              return (
                <div className="flex justify-between items-start">
                  <span className="text-[#ACACB9]">Rejon</span>
                  <div className="text-right">
                    <div className={displayZone ? 'text-green-400 font-medium' : 'text-[#82818F]'}>
                      {isDetectingZone && !displayZone
                        ? 'Wykrywanie...'
                        : displayZone
                          ? `${displayZone.number} - ${displayZone.name}`
                          : 'Poza rejonami'}
                    </div>
                    {displayZone && displayTime && (
                      <div className="text-xs text-[#ACACB9] mt-0.5">
                        od {new Date(displayTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Dokladnosc GPS</span>
              <span className={`font-mono ${gpsAccuracy !== null ? (gpsAccuracy <= 10 ? 'text-green-400' : gpsAccuracy <= 30 ? 'text-yellow-400' : 'text-red-400') : 'text-[#82818F]'}`}>
                {gpsAccuracy !== null ? `${gpsAccuracy.toFixed(0)} m` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#ACACB9]">Ostatnia aktualizacja</span>
              <span className="text-[#CAC9D7] text-xs">
                {lastLocationUpdate ? new Date(lastLocationUpdate).toLocaleTimeString('pl-PL', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }) : '-'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-[10px] transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Wyloguj się
        </button>
      </div>

      {renderBottomNav()}
    </div>
  );

  const renderEmergency = () => (
    <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
      <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
      <div className="flex-1 p-4 space-y-4 overflow-hidden flex flex-col justify-center">
        <a
          href="tel:112"
          className="block bg-red-600 hover:bg-red-700 text-white p-6 rounded-[10px] transition-colors"
        >
          <div className="flex items-center gap-4">
            <Phone className="w-10 h-10" />
            <div>
              <div className="font-bold text-xl">112</div>
              <div className="text-red-200">Numer alarmowy</div>
            </div>
          </div>
        </a>

        <a
          href="tel:+48123456789"
          className="block bg-[#2B2B36] hover:bg-[#4D4D59] text-white p-6 rounded-[10px] border border-[#4D4D59] transition-colors"
        >
          <div className="flex items-center gap-4">
            <Phone className="w-10 h-10 text-green-400" />
            <div>
              <div className="font-bold text-xl">Dyspozytornia</div>
              <div className="text-[#ACACB9]">Calodobowy kontakt</div>
            </div>
          </div>
        </a>

        <a
          href="tel:+48987654321"
          className="block bg-[#2B2B36] hover:bg-[#4D4D59] text-white p-6 rounded-[10px] border border-[#4D4D59] transition-colors"
        >
          <div className="flex items-center gap-4">
            <Car className="w-10 h-10 text-blue-400" />
            <div>
              <div className="font-bold text-xl">Pomoc drogowa</div>
              <div className="text-[#ACACB9]">Awarie i holowanie</div>
            </div>
          </div>
        </a>
      </div>

      {renderBottomNav()}
    </div>
  );

  const driverStateToStatus = (ds: string | null): DriverStatus => {
    switch (ds) {
      case 'wolna': return 'free';
      case 'kursem': return 'driving';
      case 'dojazd': return 'pickup';
      case 'zajeta': return 'busy';
      default: return 'home';
    }
  };

  const renderOrders = () => {
    // Filtruj: "wydane" = zlecenia z przypisanym kierowcą, "terminowe" = z datą w przyszłości
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const WYDANE_STATUSES = ['pending_driver', 'accepted', 'at_pickup', 'in_progress', 'completed'];
    const wydaneOrders = allOrders.filter(o => WYDANE_STATUSES.includes(o.status));
    const terminoweOrders = allOrders.filter(o => o.scheduled_date && o.scheduled_date > todayStr);

    const visibleOrders = ordersTab === 'wydane' ? wydaneOrders : terminoweOrders;
    // Najnowsze na dole
    const sorted = [...visibleOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const splitAddress = (addr: string | null) => {
      if (!addr) return { street: '—', city: '' };
      // Próbuj wyciągnąć miasto po ostatnim przecinku
      const parts = addr.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const city = parts[parts.length - 1];
        const street = parts.slice(0, -1).join(', ');
        return { street, city };
      }
      return { street: addr, city: '' };
    };

    const formatTime = (dateStr: string | null) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    return (
      <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
        <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />

        {/* Sub-tabs */}
        <div className="shrink-0 flex border-b border-[#2B2B36]">
          {(['wydane', 'terminowe'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setOrdersTab(tab)}
              className={`flex-1 py-2 text-base font-semibold uppercase tracking-wide transition-colors ${
                ordersTab === tab
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-[#82818F] hover:text-[#CAC9D7]'
              }`}
            >
              {tab === 'wydane' ? 'Wydane' : 'Terminowe'}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div
          className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          ref={el => { if (el && sorted.length > 0) el.scrollTop = el.scrollHeight; }}
        >
          {isLoadingOrders && sorted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#82818F]">
              <div className="w-6 h-6 border-2 border-[#6D6D7A] border-t-[#CAC9D7] rounded-full animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#82818F]">
              <ClipboardList className="w-14 h-14 mb-3 opacity-40" />
              <p className="text-sm">Brak zleceń</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2B2B36]">
              {sorted.map(order => {
                const addr = splitAddress(order.pickup_address);
                const driverSt = driverStateToStatus(order.driver_state);
                const stColor = DRIVER_STATUS_COLORS[driverSt];

                return (
                  <div key={order.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer active:bg-[#2B2B36] transition-colors" onClick={() => setOrderDetailOpen(order)}>
                    {/* Lewa kolumna: kafelek kierowcy */}
                    <div className="flex flex-col items-center gap-1 shrink-0 w-12">
                      {/* Kafelek kierowcy — zawsze zielony */}
                      {order.driver_code ? (
                        <div className="w-full text-center py-0.5 rounded text-white text-xl font-bold bg-[#007a1e]">
                          {order.driver_code}
                        </div>
                      ) : (
                        <div className="w-full text-center py-0.5 rounded bg-[#4D4D59] text-[#ACACB9] text-xl font-medium">
                          —
                        </div>
                      )}
                    </div>

                    {/* Środek: adres + rejon inline */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="text-white text-xl font-semibold truncate">
                        {addr.street}
                        {order.pickup_region_id != null && (
                          <span className="text-[#ACACB9] font-normal ml-1.5 text-lg">(R-{order.pickup_region_id})</span>
                        )}
                      </p>
                      {addr.city && (
                        <p className="text-[#ACACB9] text-base truncate">{addr.city}</p>
                      )}
                    </div>

                    {/* Godzina */}
                    <div className="shrink-0 flex items-end self-end">
                      <span className="text-[#ACACB9] text-base font-semibold tabular-nums">
                        {formatTime(order.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal szczegółów zlecenia */}
        {orderDetailOpen && (() => {
          const o = orderDetailOpen;
          const statusLabels: Record<string, string> = {
            pending_driver: 'Wydane',
            accepted:       'Przyjęte',
            at_pickup:      'Dojazd',
            in_progress:    'W trakcie',
            completed:      'Zakończone',
            market:         'Giełda',
            next_driver:    'Kolejny kurs',
          };
          const statusColors: Record<string, string> = {
            pending_driver: '#0052cc',
            accepted:       '#007a1e',
            at_pickup:      '#aa0000',
            in_progress:    '#8428bc',
            completed:      '#4D4D59',
            market:         '#b45309',
            next_driver:    '#0052cc',
          };
          const paymentLabels: Record<string, string> = {
            card:   '💳 Karta',
            online: '📱 Bezgotówkowa',
          };
          const statusColor = statusColors[o.status] ?? '#4D4D59';
          const statusLabel = statusLabels[o.status] ?? o.status;
          const cardShadow = 'shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]';

          const parseAddr = (addr: string) => {
            const idx = addr.indexOf(',');
            if (idx === -1) return { street: addr, city: '' };
            return { street: addr.substring(0, idx).trim(), city: addr.substring(idx + 1).trim() };
          };

          const formatFullTime = (dateStr: string) => {
            const d = new Date(dateStr);
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          };

          const pickup = o.pickup_address ? parseAddr(o.pickup_address) : null;
          const dest   = o.destination_address ? parseAddr(o.destination_address) : null;
          const showPayment = o.payment_method && o.payment_method !== 'cash';

          return (
            <div
              className="absolute inset-0 z-[80] flex flex-col justify-end"
              style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
              onClick={() => setOrderDetailOpen(null)}
            >
              <style>{`
                @keyframes slideUp {
                  from { transform: translateY(100%); opacity: 0; }
                  to   { transform: translateY(0);    opacity: 1; }
                }
                .order-detail-sheet { animation: slideUp 0.28s cubic-bezier(0.32,0.72,0,1) forwards; }
              `}</style>
              <div
                className="order-detail-sheet bg-[#1A1B26] rounded-t-2xl max-h-[88%] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-[#4D4D59]" />
                </div>

                {/* Nagłówek: numer + taxi + status */}
                <div className="px-4 pb-3 shrink-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-xl font-bold">#{o.order_number ?? o.id}</span>
                      {o.driver_code && (
                        <>
                          <span className="text-[#4D4D59]">|</span>
                          <span
                            className="px-2.5 py-0.5 rounded text-white font-bold text-base"
                            style={{ backgroundColor: '#007a1e' }}
                          >
                            taxi {o.driver_code}
                          </span>
                        </>
                      )}
                    </div>
                    <span
                      className="px-2.5 py-0.5 rounded text-white text-sm font-semibold"
                      style={{ backgroundColor: statusColor }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {/* Przyjęto */}
                  {o.created_at && (
                    <p className="text-[#82818F] text-xs mt-1.5">{formatFullTime(o.created_at)}</p>
                  )}
                </div>

                {/* Treść */}
                <div className="overflow-y-auto px-3 space-y-2 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">

                  {/* Adres odbioru — styl kurs */}
                  {pickup && (
                    <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
                      <div className="w-[4px] bg-green-500 shrink-0" />
                      <div className="flex-1 px-3 py-3">
                        <div className="text-white font-semibold text-2xl leading-tight">
                          {pickup.street}
                          {o.pickup_region_id != null && (
                            <span className="text-[#ACACB9] font-normal ml-1.5 text-lg">(R-{o.pickup_region_id})</span>
                          )}
                        </div>
                        {pickup.city && <div className="text-[#ACACB9] text-base mt-0.5">{pickup.city}</div>}
                      </div>
                    </div>
                  )}

                  {/* Adres docelowy — styl kurs */}
                  {dest && (
                    <div className={`flex bg-[#21222D] rounded-md overflow-hidden ${cardShadow}`}>
                      <div className="w-[4px] bg-red-500 shrink-0" />
                      <div className="flex-1 px-3 py-3">
                        <div className="text-white font-semibold text-2xl leading-tight">{dest.street}</div>
                        {dest.city && <div className="text-[#ACACB9] text-base mt-0.5">{dest.city}</div>}
                      </div>
                    </div>
                  )}

                  {/* Koszt + płatność (tylko nie-gotówkowa) */}
                  {(o.cost || showPayment) && (
                    <div className={`flex items-center gap-3 bg-[#21222D] rounded-md px-4 py-3 ${cardShadow}`}>
                      {o.cost && <span className="text-white font-bold text-xl">{o.cost} zł</span>}
                      {showPayment && (
                        <span className="text-[#ACACB9] text-sm">
                          {paymentLabels[o.payment_method] ?? o.payment_method}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Uwagi */}
                  {o.notes && (
                    <div className={`bg-[#21222D] rounded-md px-4 py-3 ${cardShadow}`}>
                      <p className="text-[#82818F] text-xs uppercase tracking-wide mb-1">Uwagi</p>
                      <p className="text-[#CAC9D7] text-sm">{o.notes}</p>
                    </div>
                  )}

                  {/* Info wewnętrzne */}
                  {o.internal_info && (
                    <div className={`bg-[#21222D] rounded-md px-4 py-3 ${cardShadow}`}>
                      <p className="text-[#82818F] text-xs uppercase tracking-wide mb-1">Info</p>
                      <p className="text-[#ACACB9] text-sm">{o.internal_info}</p>
                    </div>
                  )}

                </div>

                {/* Przycisk */}
                <div className="shrink-0 px-4 py-4">
                  <button
                    onClick={() => setOrderDetailOpen(null)}
                    className="w-full py-3.5 rounded-[10px] bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-base transition-colors"
                  >
                    Zamknij
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {renderBottomNav()}
      </div>
    );
  };

  const renderConsole = () => (
    <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
      <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
      <div className="flex-1 overflow-hidden">
        <DebugConsole />
      </div>
      {renderBottomNav()}
    </div>
  );

  const renderQueue = () => (
    <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
      <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
      <DriverQueueTab
        driverId={driver!.id}
        driverCode={driver!.driverCode}
        currentZone={currentZone}
        zoneName={apiZoneName}
        zoneEnteredAt={apiZoneEnteredAt}
        queuePosition={queuePosition}
        status={status}
      />
      {renderBottomNav()}
    </div>
  );

  const detectCurrentZoneFromCoords = (lat: number, lng: number) => {
    try {
      const storedZones = localStorage.getItem('taxi_zones');
      if (!storedZones) { setDetectedZoneInfo(null); return; }
      const zones = JSON.parse(storedZones);
      if (!zones.length) { setDetectedZoneInfo(null); return; }

      const zoneDetection = new ZoneDetectionService(zones);
      const detectedZoneId = zoneDetection.detectZoneFromCoordinates(lat, lng);

      if (detectedZoneId) {
        const zoneData = zones.find((z: any) => z.id === detectedZoneId);
        if (!zoneData) return;

        const zoneIdStr = String(zoneData.id);

        // Rejon się zmienił — zaktualizuj UI natychmiast i wyślij do serwera
        if (lastDetectedZoneIdRef.current !== zoneIdStr) {
          lastDetectedZoneIdRef.current = zoneIdStr;
          const newZoneInfo = { id: zoneData.id, number: zoneData.number, name: zoneData.name };
          setDetectedZoneInfo(newZoneInfo);
          setCurrentZone(zoneData.number);
          setZoneEntryTime(new Date().toISOString());

          // Natychmiastowy update serwera — nie czekaj na polling
          // driverQueueService i setState są stable references, więc stale closure GPS jest bezpieczna
          driverQueueService.updateDriverZone(driver!.id, zoneData.number)
            .then((result) => {
              if (result) {
                setCurrentZone(result.currentZone ?? zoneData.number);
                setQueuePosition(result.queuePosition);
              }
            })
            .catch(err => console.error('[Zone] updateDriverZone error:', err));
        }
      } else {
        // Poza rejonami
        if (lastDetectedZoneIdRef.current !== null) {
          lastDetectedZoneIdRef.current = null;
          setDetectedZoneInfo(null);
          setZoneEntryTime(null);
        }
      }
    } catch (error) {
      console.error('Error detecting zone:', error);
    }
  };

  const detectCurrentZone = (lat: number, lng: number) => {
    setIsDetectingZone(true);
    detectCurrentZoneFromCoords(lat, lng);
    setIsDetectingZone(false);
  };

  const locateDriver = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setDriverPosition(pos);
          setMapCenter(pos);
          setGpsAccuracy(position.coords.accuracy);
          setLastLocationUpdate(new Date().toISOString());
          setIsLocating(false);
          detectCurrentZone(position.coords.latitude, position.coords.longitude);

          if (driver) {
            driverQueueService.updateDriverLocation(driver.id, {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          }
        },
        () => {
          setIsLocating(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setIsLocating(false);
    }
  };

  const MapController = ({ center, disabled, recenterTrigger }: { center: [number, number], disabled?: boolean, recenterTrigger?: number }) => {
    const map = useMap();
    const userPannedRef = React.useRef(false);

    useMapEvents({
      dragstart: () => { userPannedRef.current = true; },
    });

    // Tylko gdy użytkownik kliknie przycisk crosshair — wymuś powrót do swojej pozycji
    useEffect(() => {
      if (recenterTrigger === 0) return;
      userPannedRef.current = false;
      map.setView(center, 16);
    }, [recenterTrigger]);

    // Automatyczne śledzenie własnej pozycji tylko gdy użytkownik nie przesunął mapy
    useEffect(() => {
      if (disabled || userPannedRef.current) return;
      map.setView(center, map.getZoom());
    }, [center, map, disabled]);

    return null;
  };

  const TrackedDriverController = ({ drivers, trackedId }: { drivers: DriverWithLocation[], trackedId: string | null }) => {
    const map = useMap();
    const lastPosRef = React.useRef<string>('');
    useEffect(() => {
      if (!trackedId) { lastPosRef.current = ''; return; }
      const found = drivers.find(d => d.id === trackedId);
      if (!found?.location) return;
      const key = `${found.location.lat.toFixed(5)},${found.location.lng.toFixed(5)}`;
      if (key === lastPosRef.current) return;
      lastPosRef.current = key;
      map.panTo([found.location.lat, found.location.lng]);
    }, [map, drivers, trackedId]);
    return null;
  };

  const AllDriversMapMarkers = ({ drivers, currentDriverId, visible }: { drivers: DriverWithLocation[], currentDriverId: string, visible: boolean }) => {
    const map = useMap();
    const markersRef = React.useRef<L.Marker[]>([]);

    useEffect(() => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      if (!visible) return;

      drivers.forEach(d => {
        if (!d.location || d.location.lat === 0 || d.location.lng === 0) return;
        if (d.id === currentDriverId) return;

        const isCurrentDriver = d.id === currentDriverId;
        const color = getMarkerColor(d.status);
        const statusLabel = getDriverStatusLabel(d.status);

        const markerHtml = `
          <div style="
            background: ${color};
            color: white;
            padding: 1px 8px;
            border-radius: 4px;
            font-size: 20px;
            font-weight: bold;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            text-align: center;
            min-width: 40px;
            white-space: nowrap;
          ">${d.driverCode}</div>
        `;

        const icon = L.divIcon({
          html: markerHtml,
          className: 'driver-map-marker',
          iconSize: [50, 28],
          iconAnchor: [25, 14],
        });

        const marker = L.marker([d.location.lat, d.location.lng], { icon });

        const popupContent = `
          <div style="min-width: 140px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${d.name}${isCurrentDriver ? ' (Ty)' : ''}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Kod: ${d.driverCode}</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
              <span style="font-size: 12px;">${statusLabel}</span>
            </div>
            ${d.currentZone ? `<div style="font-size: 11px; color: #888;">Rejon: ${d.currentZone}</div>` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(map);
        markersRef.current.push(marker);
      });

      return () => {
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
      };
    }, [map, drivers, currentDriverId, visible]);

    return null;
  };

  const CurrentDriverMarker = ({ position, driverCode, status }: { position: [number, number], driverCode: string, status: DriverStatus }) => {
    const map = useMap();
    const markerRef = React.useRef<L.Marker | null>(null);

    useEffect(() => {
      if (markerRef.current) {
        markerRef.current.remove();
      }

      const color = getMarkerColor(status);

      const markerHtml = `
        <div style="
          background: ${color};
          color: white;
          padding: 1px 8px;
          border-radius: 4px;
          font-size: 20px;
          font-weight: bold;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          text-align: center;
          min-width: 40px;
          white-space: nowrap;
        ">${driverCode}</div>
      `;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'driver-map-marker',
        iconSize: [50, 28],
        iconAnchor: [25, 14],
      });

      markerRef.current = L.marker(position, { icon }).addTo(map);

      return () => {
        if (markerRef.current) {
          markerRef.current.remove();
        }
      };
    }, [map, position, driverCode, status]);

    return null;
  };

  const renderMap = () => (
    <div className="h-screen bg-[#171821] flex flex-col">
      <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
      <div className="flex-1 relative">
        <MapContainer
          center={mapCenter}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController center={mapCenter} disabled={!!trackedDriverId} recenterTrigger={recenterTrigger} />
          <AllDriversMapMarkers drivers={allDrivers} currentDriverId={driver?.id || ''} visible={showOtherDrivers} />
          <TrackedDriverController drivers={allDrivers} trackedId={trackedDriverId} />
          {driverPosition && driver && (
            <CurrentDriverMarker position={driverPosition} driverCode={driver.driverCode} status={status} />
          )}
        </MapContainer>

        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-2">
          {/* Div z rejonem */}
          <div className="bg-[#21222D]/95 backdrop-blur-xl rounded-[10px] px-4 py-3 border border-[#2B2B36]">
            {(() => {
              const displayZone = detectedZoneInfo
                ? { number: detectedZoneInfo.number, name: detectedZoneInfo.name }
                : currentZone && apiZoneName
                  ? { number: currentZone, name: apiZoneName }
                  : null;
              const displayTime = zoneEntryTime ?? apiZoneEnteredAt;
              return (
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${displayZone ? 'bg-emerald-600' : 'bg-[#4D4D59]'}`}>
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    {isDetectingZone && !displayZone ? (
                      <div className="text-[#CAC9D7] text-sm">Wykrywanie rejonu...</div>
                    ) : displayZone ? (
                      <>
                        <div className="text-white font-semibold">
                          Rejon {displayZone.number} - {displayZone.name}
                        </div>
                        {displayTime && (
                          <div className="text-green-400 text-sm">
                            Od {new Date(displayTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[#ACACB9] font-medium">Poza rejonami</div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Przyciski pod divem z rejonem — osobne kwadraty w kolumnie */}
          <button
            onClick={() => { setTrackedDriverId(null); setRecenterTrigger(t => t + 1); locateDriver(); }}
            disabled={isLocating}
            className="self-start bg-[#21222D]/95 backdrop-blur-xl rounded-[10px] border border-[#2B2B36] p-3 hover:bg-[#2B2B36]/95 disabled:opacity-50 text-white transition-colors"
            title="Centruj na sobie"
          >
            <Crosshair className={`w-6 h-6 ${isLocating ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={() => setShowOtherDrivers(v => !v)}
            className={`self-start bg-[#21222D]/95 backdrop-blur-xl rounded-[10px] border border-[#2B2B36] p-3 hover:bg-[#2B2B36]/95 text-white transition-colors ${!showOtherDrivers ? 'opacity-50' : ''}`}
            title={showOtherDrivers ? 'Ukryj kierowców' : 'Pokaż kierowców'}
          >
            {showOtherDrivers ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
          </button>
          <button
            onClick={() => { setShowDriverSearch(true); setDriverSearchQuery(''); setTrackedDriverNotFound(false); }}
            className="self-start bg-[#21222D]/95 backdrop-blur-xl rounded-[10px] border border-[#2B2B36] p-3 hover:bg-[#2B2B36]/95 text-white transition-colors"
            title="Szukaj kierowcy"
          >
            <Search className="w-6 h-6" />
          </button>
        </div>

        {trackedDriverId && (
          <button
            onClick={() => setTrackedDriverId(null)}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 border border-blue-400 text-white rounded-full text-sm font-semibold shadow-lg whitespace-nowrap"
          >
            <X className="w-4 h-4" /> Zatrzymaj śledzenie
          </button>
        )}

        {showDriverSearch && (
          <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#21222D] border border-[#2B2B36] rounded-2xl p-6 w-80 shadow-2xl">
              <h3 className="text-white font-bold text-lg mb-4">Szukaj kierowcy</h3>
              <input
                type="text"
                value={driverSearchQuery}
                onChange={e => { setDriverSearchQuery(e.target.value); setTrackedDriverNotFound(false); }}
                placeholder="Wpisz numer kierowcy..."
                autoFocus
                className="w-full px-4 py-3 bg-[#2B2B36] border border-[#3B3B46] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 text-lg mb-3"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const q = driverSearchQuery.trim().toLowerCase();
                    const found = allDrivers.find(d =>
                      d.driverCode?.toLowerCase() === q ||
                      d.driverCode?.toLowerCase().includes(q) ||
                      d.name?.toLowerCase().includes(q)
                    );
                    if (found) {
                      setTrackedDriverId(found.id);
                      setShowOtherDrivers(true);
                      setShowDriverSearch(false);
                      setTrackedDriverNotFound(false);
                    } else {
                      setTrackedDriverNotFound(true);
                    }
                  }
                }}
              />
              {trackedDriverNotFound && (
                <p className="text-red-400 text-sm mb-3">Nie znaleziono kierowcy o tym numerze</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => {
                    const q = driverSearchQuery.trim().toLowerCase();
                    const found = allDrivers.find(d =>
                      d.driverCode?.toLowerCase() === q ||
                      d.driverCode?.toLowerCase().includes(q) ||
                      d.name?.toLowerCase().includes(q)
                    );
                    if (found) {
                      setTrackedDriverId(found.id);
                      setShowOtherDrivers(true);
                      setShowDriverSearch(false);
                      setTrackedDriverNotFound(false);
                    } else {
                      setTrackedDriverNotFound(true);
                    }
                  }}
                  className="flex-1 py-3 bg-[#4D4D59] hover:bg-[#5D5D69] text-white rounded-md font-semibold"
                >
                  Szukaj
                </button>
                <button
                  onClick={() => { setShowDriverSearch(false); setTrackedDriverNotFound(false); }}
                  className="flex-1 py-3 bg-[#4D4D59] hover:bg-[#5D5D69] text-white rounded-md font-semibold"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {renderBottomNav()}
    </div>
  );

  const handleSendMessage = async () => {
    if (!driver || !newMessage.trim() || !activeConversation) return;

    try {
      await chatService.sendMessage(
        driver.id,
        driver.name,
        'driver',
        activeConversation.id,
        activeConversation.name,
        activeConversation.type,
        newMessage.trim()
      );

      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Nieznany błąd';
      alert(`Błąd wysyłania wiadomości: ${errorMsg}`);
    }
  };

  const handleOpenConversation = (conv: Conversation) => {
    setActiveConversation({
      id: conv.participantId,
      name: conv.participantName,
      type: conv.participantType
    });
  };

  const handleStartNewConversation = (targetId: string, targetName: string, targetType: 'driver' | 'dispatcher' | 'base') => {
    setActiveConversation({
      id: targetId,
      name: targetName,
      type: targetType
    });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + ' ' +
           date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  const currentPopupMessage = messageQueue.length > 0 ? messageQueue[0] : null;

  const handlePopupClose = () => {
    if (currentPopupMessage) {
      chatService.markAsRead([currentPopupMessage.id]);
      setMessageQueue(prev => prev.slice(1));
    }
  };

  const handlePopupReply = () => {
    if (!currentPopupMessage || !driver) return;

    const isFromDispatcher = currentPopupMessage.senderType === 'dispatcher';

    if (isFromDispatcher) {
      setActiveConversation({
        id: 'base',
        name: 'Dyspozytornia',
        type: 'base'
      });
      chatService.markDispatcheryAsRead(driver.id);
    } else {
      setActiveConversation({
        id: currentPopupMessage.senderId,
        name: currentPopupMessage.senderName,
        type: currentPopupMessage.senderType
      });
      chatService.markConversationAsRead(
        driver.id,
        'driver',
        currentPopupMessage.senderId,
        currentPopupMessage.senderType
      );
    }

    setMessageQueue([]);
    setView('chat');
  };

  const handlePopupQuickReply = async (response: string) => {
    if (!currentPopupMessage || !driver) return;

    const isFromDispatcher = currentPopupMessage.senderType === 'dispatcher';

    try {
      if (isFromDispatcher) {
        await chatService.sendMessage(driver.id, driver.name, 'driver', 'base', 'Dyspozytornia', 'base', response);
      } else {
        await chatService.sendMessage(driver.id, driver.name, 'driver', currentPopupMessage.senderId, currentPopupMessage.senderName, currentPopupMessage.senderType, response);
      }
      await chatService.markAsRead([currentPopupMessage.id]);
      // NIE usuwamy z kolejki tutaj — czekamy aż kierowca kliknie "Zamknij"
      setSentQuickReply(response);
    } catch (error) {
      console.error('Failed to send quick reply:', error);
      alert('Błąd wysyłania odpowiedzi');
    }
  };

  const handleSentQuickReplyClose = () => {
    setSentQuickReply(null);
    setMessageQueue(prev => prev.slice(1)); // Teraz dopiero usuwamy z kolejki
  };

  const renderChat = () => {
    const allDriversList = chatService.getAllDrivers().filter(d => d.id !== driver?.id);
    const filteredDrivers = driverSearch
      ? allDriversList.filter(d =>
          d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
          d.code.toLowerCase().includes(driverSearch.toLowerCase())
        )
      : allDriversList;

    const driverConversations = driver ? chatService.getDriverOnlyConversations(driver.id) : [];
    const dispatcheryUnread = driver ? chatService.getUnreadFromDispatchery(driver.id) : 0;

    if (activeConversation) {
      const isDispatcheryChat = activeConversation.type === 'base';
      const displayMessages = chatMessages;

      return (
        <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
          <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
          <div className="p-3 bg-[#21222D] border-b border-[#2B2B36] flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveConversation(null)}
              className="p-2 hover:bg-[#4D4D59] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#ACACB9]" />
            </button>
            {isDispatcheryChat ? (
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-white font-semibold">Dyspozytornia</div>
                  <div className="text-[#ACACB9] text-xs">Czat z dyspozytornia</div>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <div className="text-white font-semibold">{activeConversation.name}</div>
                <div className="text-[#ACACB9] text-xs">Kierowca</div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {displayMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#82818F]">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Brak wiadomosci</p>
                  <p className="text-sm">{isDispatcheryChat ? 'Rozpocznij rozmowe z dyspozytornia' : 'Rozpocznij rozmowe'}</p>
                </div>
              </div>
            ) : (
              displayMessages.map((msg) => {
                const isOwn = msg.senderId === driver?.id && msg.senderType === 'driver';
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-[10px] px-4 py-2 ${
                      isOwn ? 'bg-blue-600 text-white rounded-br-md' : 'bg-[#4D4D59] text-white rounded-bl-md'
                    }`}>
                      {!isOwn && isDispatcheryChat && msg.senderType === 'dispatcher' && (
                        <div className="text-xs font-semibold text-green-400 mb-1">{msg.senderName}</div>
                      )}
                      {!isOwn && !isDispatcheryChat && (
                        <div className="text-xs text-[#ACACB9] mb-1">{msg.senderName}</div>
                      )}
                      <div className="break-words">{msg.content}</div>
                      <div className={`text-xs mt-1 flex items-center gap-1.5 ${isOwn ? 'text-blue-200 justify-end' : 'text-[#ACACB9]'}`}>
                        <span>{formatMessageTime(msg.timestamp)}</span>
                        {isOwn && (
                          msg.isRead ? (
                            <CheckCheck className="w-5 h-5 text-cyan-300" strokeWidth={2.5} />
                          ) : (
                            <Check className="w-4 h-4 text-white/60" strokeWidth={2} />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatMessagesEndRef} />
          </div>

          <div className="p-3 bg-[#21222D] border-t border-[#2B2B36] shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Napisz wiadomosc..."
                className="flex-1 bg-[#4D4D59]/80 text-white px-4 py-3 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-[#6D6D7A] text-white p-3 rounded-[10px] transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
        <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <button
              onClick={() => {
                handleStartNewConversation('base', 'Dyspozytornia', 'base');
                if (driver) chatService.markDispatcheryAsRead(driver.id);
              }}
              className="w-full bg-[#21222D] hover:bg-[#2B2B36] text-white p-4 rounded-[10px] flex items-center gap-3 transition-colors mb-4 shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
            >
              <div className="relative">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                {dispatcheryUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {dispatcheryUnread}
                  </span>
                )}
              </div>
              <div className="text-left">
                <div className="font-semibold">Dyspozytornia</div>
                <div className="text-[#ACACB9] text-sm">Czat z dyspozytornia</div>
              </div>
            </button>
          </div>

          {driverConversations.length > 0 && (
            <div className="px-3 mb-4">
              <h3 className="text-[#ACACB9] text-sm font-medium mb-2 px-1">Rozmowy z kierowcami</h3>
              <div className="space-y-1">
                {driverConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleOpenConversation(conv)}
                    className="w-full bg-[#21222D] hover:bg-[#2B2B36] p-3 rounded-[10px] flex items-center gap-3 transition-colors shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
                  >
                    <div className="relative">
                      <div className="w-12 h-12 bg-[#6D6D7A] rounded-full flex items-center justify-center text-white font-semibold">
                        {conv.participantCode || conv.participantName.charAt(0).toUpperCase()}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium truncate">{conv.participantName}</span>
                        <span className="text-[#82818F] text-xs">{formatMessageTime(conv.lastMessageTime)}</span>
                      </div>
                      <div className="text-[#ACACB9] text-sm truncate">{conv.lastMessage}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-3">
            <h3 className="text-[#ACACB9] text-sm font-medium mb-2 px-1">Kierowcy</h3>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#82818F]" />
              <input
                type="text"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                placeholder="Szukaj kierowcy..."
                className="w-full bg-[#4D4D59]/80 text-white pl-10 pr-4 py-2 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="space-y-1">
              {filteredDrivers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleStartNewConversation(d.id, d.name, 'driver')}
                  className="w-full bg-[#2B2B36] hover:bg-[#4D4D59] p-3 rounded-[10px] flex items-center gap-3 transition-colors shadow-[0px_2px_1px_-1px_rgba(0,0,0,0.2),0px_1px_1px_0px_rgba(0,0,0,0.14),0px_1px_3px_0px_rgba(0,0,0,0.12)]"
                >
                  <div className="w-10 h-10 bg-[#6D6D7A] rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {d.code}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-white font-medium">{d.name}</div>
                    <div className="text-[#82818F] text-xs">Kod: {d.code}</div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${d.isOnline ? 'bg-green-500' : 'bg-[#82818F]'}`} />
                </button>
              ))}
              {filteredDrivers.length === 0 && (
                <div className="text-center text-[#82818F] py-4">
                  {driverSearch ? 'Nie znaleziono kierowcow' : 'Brak innych kierowcow'}
                </div>
              )}
            </div>
          </div>
        </div>

        {renderBottomNav()}
      </div>
    );
  };

  const renderNextOrderReadyModal = () => {
    const order = nextOrderReadyModal;
    if (!order) return null;
    const parseStreet = (addr: string) => addr.split(',')[0].trim();
    return (
      <div className="absolute inset-0 z-[90] flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
        <div className="bg-[#21222D] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
          {/* Kolorowy pasek górny */}
          <div className="h-1.5 w-full" style={{ backgroundColor: '#8428bc' }} />

          <div className="px-5 pt-5 pb-4">
            {/* Tytuł */}
            <div className="mb-4">
              <p className="text-white font-bold text-lg leading-tight">Następne zlecenie</p>
              <p className="text-[#ACACB9] text-sm">Proszę obsłużyć kolejny kurs</p>
            </div>

            {/* Adres odbioru */}
            <div className="bg-[#2B2B36] rounded-[10px] px-4 py-3 mb-2">
              <p className="text-[#ACACB9] text-[10px] uppercase tracking-wide mb-0.5">Odbiór</p>
              <p className="text-white font-semibold text-xl leading-tight">{parseStreet(order.pickup || '—')}</p>
              {order.pickup?.includes(',') && (
                <p className="text-[#ACACB9] text-sm mt-0.5">{order.pickup.split(',').slice(1).join(',').trim()}</p>
              )}
            </div>

            {/* Adres docelowy */}
            {order.destination && (
              <div className="bg-[#2B2B36] rounded-[10px] px-4 py-3 mb-4">
                <p className="text-[#ACACB9] text-[10px] uppercase tracking-wide mb-0.5">Cel</p>
                <p className="text-white font-semibold text-xl leading-tight">{parseStreet(order.destination)}</p>
                {order.destination.includes(',') && (
                  <p className="text-[#ACACB9] text-sm mt-0.5">{order.destination.split(',').slice(1).join(',').trim()}</p>
                )}
              </div>
            )}

            {/* Przycisk OK */}
            <button
              onClick={() => {
                setNextOrderReadyModal(null);
                setView('kurs');
              }}
              className="w-full h-[52px] rounded-[10px] text-white font-bold text-lg transition-colors"
              style={{ backgroundColor: '#8428bc' }}
            >
              OK, przechodzę do kursu
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPopup = () => {
    if (!currentPopupMessage || view === 'chat') return null;

    return (
      <MessagePopup
        message={currentPopupMessage}
        queueCount={messageQueue.length}
        onClose={handlePopupClose}
        onReply={handlePopupReply}
        onQuickReply={handlePopupQuickReply}
      />
    );
  };

  const renderDriverQuery = () => {
    if (!pendingQuery || !driver) return null;
    const apiBase = (dataSourceService.getDebugInfo() as any).apiBaseUrl || '/api';
    return (
      <DriverQueryPopup
        query={pendingQuery}
        apiBase={apiBase}
        onAnswered={() => setPendingQuery(null)}
      />
    );
  };

  const renderOrderNotification = () => {
    if (!pendingOrder) return null;
    return (
      <OrderNotification
        order={pendingOrder}
        onAccept={handleAcceptOrder}
        onReject={handleRejectOrder}
      />
    );
  };

  console.log('[DriverApp] Rendering view:', view, 'driver:', driver);

  const wrapWithWidth = (content: React.ReactNode) => {
    const sideMenu = view !== 'login' ? renderSideMenu() : null;
    return (
      <div className="h-screen flex flex-col relative">
        <div className="flex-1 relative overflow-hidden">{content}{sideMenu}</div>
        {renderDriverQuery()}
        {renderOrderNotification()}
        {renderPopup()}

        {/* Modal "Wiadomość wysłana" — widoczny na wszystkich widokach, nie znika automatycznie */}
        {sentQuickReply && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 bg-black/80">
            <div className="bg-[#21222D] rounded-2xl w-full max-w-sm border border-[#2B2B36] p-6 text-center shadow-2xl">
              <button onClick={handleSentQuickReplyClose} className="absolute top-3 right-3 p-2 hover:bg-[#2B2B36] rounded-xl transition-colors">
                <X className="w-5 h-5 text-[#ACACB9]" />
              </button>
              <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-white text-xl font-semibold mb-2">Wiadomość wysłana</h3>
              <p className="text-[#ACACB9] mb-6">Wysłano: <span className="text-white font-medium">„{sentQuickReply}"</span></p>
              <button onClick={handleSentQuickReplyClose} className="w-full bg-[#2B2B36] hover:bg-[#4D4D59] text-white font-semibold py-3 rounded-xl transition-colors">
                Zamknij
              </button>
            </div>
          </div>
        )}

        {/* Modal powiadomienia od dyspozytora (Mina / Anulowanie) — dostępny we wszystkich widokach */}
        {dispatcherNotif && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] px-4">
            <div className="bg-[#21222D] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="h-1.5 w-full bg-orange-500" />
              <div className="px-5 pt-5 pb-4">
                <p className="text-white font-bold text-lg leading-tight mb-1">{dispatcherNotif.title}</p>
                <p className="text-[#ACACB9] text-sm mb-4">{dispatcherNotif.message}</p>
                <button
                  onClick={async () => {
                    try { await fetch(`/api/driver-notifications/${dispatcherNotif.id}/read`, { method: 'POST' }); } catch {}
                    setDispatcherNotif(null);
                  }}
                  className="w-full py-3.5 rounded-[10px] text-lg font-bold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-colors"
                >
                  OK, rozumiem
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: trwa wylogowanie */}
        {loggingOut && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-6">
            <div className="bg-[#171821] rounded-[14px] p-7 w-full max-w-sm border border-[#2B2B36] flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-[#6D6D7A] border-t-white rounded-full animate-spin" />
              <p className="text-white font-bold text-xl">Zamykanie...</p>
            </div>
          </div>
        )}

        {/* Modal: blokada wylogowania podczas kursu */}
        {logoutBlockedOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-6">
            <div className="bg-[#171821] rounded-[14px] p-7 w-full max-w-sm border border-[#2B2B36]">
              <p className="text-white text-center font-bold text-xl mb-2">Aktywny kurs</p>
              <p className="text-[#ACACB9] text-center text-base mb-6">Nie możesz się wylogować podczas obsługi zlecenia. Zakończ kurs najpierw.</p>
              <button
                onClick={() => setLogoutBlockedOpen(false)}
                className="w-full py-3.5 rounded-[10px] bg-[#4D4D59] text-white hover:bg-[#6D6D7A] font-bold text-lg transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Taksometr — zawsze w DOM gdy włączony, ukryty przez CSS (nie odmontowany) żeby zachować stan */}
        {taximeterEnabled && (
          <div style={showTaximeter ? {} : { display: 'none' }}>
            <Taximeter
              key={taximeterKey}
              onClose={() => {
                setShowTaximeter(false);
                setTaximeterKey(k => k + 1); // nowy key = świeży stan przy następnym otwarciu
              }}
            />
          </div>
        )}

        {/* Modal: potwierdzenie wylogowania */}
        {logoutConfirmOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-6">
            <div className="bg-[#171821] rounded-[14px] p-7 w-full max-w-sm border border-[#2B2B36]">
              <p className="text-white text-center font-bold text-xl mb-2">Wylogować się?</p>
              <p className="text-[#ACACB9] text-center text-base mb-6">Czy na pewno chcesz się wylogować?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setLogoutConfirmOpen(false)}
                  className="flex-1 py-3.5 rounded-[10px] bg-[#4D4D59] text-white hover:bg-[#6D6D7A] font-bold text-lg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={() => { setLogoutConfirmOpen(false); setSideMenuOpen(false); handleLogout(); }}
                  className="flex-1 py-3.5 rounded-[10px] bg-red-600 text-white hover:bg-red-500 active:bg-red-700 font-bold text-lg transition-colors"
                >
                  Wyloguj
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  switch (view) {
    case 'login':    return wrapWithWidth(renderLogin());
    case 'main':     console.log('[DriverApp] About to render main view'); return wrapWithWidth(renderMain());
    case 'settings': return wrapWithWidth(renderSettings());
    case 'emergency':return wrapWithWidth(renderEmergency());
    case 'orders':   return wrapWithWidth(renderOrders());
    case 'gielda':
      return wrapWithWidth(
        <div className="h-screen bg-[#171821] flex flex-col overflow-hidden">
          <StatusBar status={status} statusLabel={getStatusLabel(status)} colorEnabled={colorTopBarEnabled} />
          <GieldaTab driverId={driver?.id ?? ''} />
          {renderBottomNav()}
        </div>
      );
    case 'map':      return wrapWithWidth(renderMap());
    case 'chat':     return wrapWithWidth(renderChat());
    case 'console':  return wrapWithWidth(renderConsole());
    case 'kolejka':  return wrapWithWidth(renderQueue());
    case 'kurs':     return wrapWithWidth(<>{renderKurs()}{renderNextOrderReadyModal()}</>);
    case 'nastepny': return wrapWithWidth(renderNastepny());
    default:         return wrapWithWidth(renderLogin());
  }
};

export default DriverApp;
