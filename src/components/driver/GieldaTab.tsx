import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingBag } from 'lucide-react';

interface MarketOrder {
  id: string;
  orderNumber: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupRegionId: number | null;
  notes: string;
  createdAt: string;
  registrationsCount: number;
}

interface GieldaTabProps {
  driverId: string;
}

const splitAddress = (addr: string | null): { street: string; city: string } => {
  if (!addr) return { street: '—', city: '' };
  const parts = addr.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    return { street: parts.slice(0, -1).join(', '), city: parts[parts.length - 1] };
  }
  return { street: addr, city: '' };
};

const GieldaTab: React.FC<GieldaTabProps> = ({ driverId }) => {
  const [orders, setOrders]               = useState<MarketOrder[]>([]);
  const [selected, setSelected]           = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [registering, setRegistering]     = useState(false);
  const [gieldaEnabled, setGieldaEnabled] = useState<boolean | null>(null);
  const [successMsg, setSuccessMsg]       = useState('');
  const [errorMsg, setErrorMsg]           = useState('');
  const [myRegisteredIds, setMyRegisteredIds] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Sprawdź czy giełda jest włączona ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings/gielda')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setGieldaEnabled(data.data.gielda_enabled !== 0);
        } else {
          setGieldaEnabled(true);
        }
      })
      .catch(() => setGieldaEnabled(true));
  }, []);

  // ── Pobierz zlecenia z giełdy (REST endpoint) ──────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const [ordersRes, regsRes] = await Promise.all([
        fetch('/api/orders?status=market&limit=100'),
        fetch(`/api/gielda/driver-registrations/${driverId}`),
      ]);
      const ordersData = await ordersRes.json();
      const regsData   = await regsRes.json();

      if (ordersData.success) {
        const rows: MarketOrder[] = (ordersData.orders ?? ordersData.data ?? []).map((o: any) => ({
          id:                 o.id,
          orderNumber:        o.order_number ?? o.orderNumber ?? '',
          pickupAddress:      o.pickup_address ?? o.pickupAddress ?? '',
          destinationAddress: o.destination_address ?? o.destinationAddress ?? '',
          pickupRegionId:     o.pickup_region_id != null ? Number(o.pickup_region_id) : null,
          notes:              o.notes ?? '',
          createdAt:          o.created_at ?? o.createdAt ?? '',
          registrationsCount: Number(o.registrations_count ?? 0),
        }));
        setOrders(rows);
      }
      if (regsData.success) {
        setMyRegisteredIds(new Set(regsData.orderIds));
      }
    } catch {
      // cicha obsługa błędu — spróbujemy za 5s
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  // ── Uruchom polling co 5 sekund po sprawdzeniu statusu giełdy ─────────────
  useEffect(() => {
    if (gieldaEnabled === null) return;
    if (!gieldaEnabled) { setLoading(false); return; }
    fetchOrders();
    intervalRef.current = setInterval(fetchOrders, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [gieldaEnabled, fetchOrders]);

  // ── Zaznacz / odznacz wiersz ───────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => prev === id ? null : id);
    setErrorMsg('');
    setSuccessMsg('');
  };

  // ── Zgłoś chęć przyjęcia zleceń przez API ─────────────────────────────────
  const handleRegister = async () => {
    if (!selected || registering) return;
    setRegistering(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/gielda/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, orderIds: [selected] }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        const msg = data.message === 'assigned'
          ? 'Zlecenie zostało przypisane!'
          : 'Zgłoszono — oczekuj na przydział';
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 6000);
        fetchOrders();
      } else if (data.error === 'already_registered') {
        setErrorMsg('Jesteś już zapisany na zlecenie — poczekaj na rozstrzygnięcie');
        setSelected(null);
        fetchOrders();
      } else if (data.error === 'preferences_not_met') {
        setErrorMsg('Nie spełniasz warunków');
      } else if (data.error === 'blocked') {
        setErrorMsg('Brak dostępu do tego zlecenia');
      } else if (data.error === 'too_far') {
        setErrorMsg(`Jesteś za daleko od zlecenia (${data.distance} km, limit ${data.maxDistance} km)`);
      } else if (data.error === 'outside_hours') {
        setErrorMsg(`Giełda niedostępna — czynna od ${data.hoursFrom} do ${data.hoursTo}`);
      } else if (data.error === 'disabled') {
        setErrorMsg('Giełda jest chwilowo niedostępna');
        setGieldaEnabled(false);
      } else {
        setErrorMsg(data.error || 'Nie udało się zgłosić. Spróbuj ponownie.');
      }
    } catch {
      setErrorMsg('Błąd połączenia z serwerem.');
    } finally {
      setRegistering(false);
    }
  };

  // ── Giełda wyłączona ───────────────────────────────────────────────────────
  if (gieldaEnabled === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <ShoppingBag className="w-16 h-16 text-white/20" />
        <p className="text-white/50 text-lg font-medium">Giełda chwilowo niedostępna</p>
        <p className="text-white/30 text-sm">Skontaktuj się z dyspozytorem</p>
      </div>
    );
  }

  // ── Ładowanie ──────────────────────────────────────────────────────────────
  if (gieldaEnabled === null || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#6D6D7A] border-t-[#CAC9D7] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Lista */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#82818F]">
            <ShoppingBag className="w-14 h-14 mb-3 opacity-40" />
            <p className="text-sm">Brak zleceń na giełdzie</p>
          </div>
        ) : (
          <div>
            {orders.map(order => {
              const isSelected  = selected === order.id;
              const isRegistered = myRegisteredIds.has(order.id);
              const hasAnyReg   = myRegisteredIds.size > 0;
              const pickup = splitAddress(order.pickupAddress);
              const dest   = splitAddress(order.destinationAddress);

              return (
                <div
                  key={order.id}
                  onClick={() => !isRegistered && !hasAnyReg && toggleSelect(order.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors border-b border-[#2B2B36] ${
                    isRegistered
                      ? 'bg-blue-900/30 border-l-4 border-l-blue-400 cursor-default'
                      : isSelected
                        ? 'bg-green-900/20 border-l-4 border-l-green-500 cursor-pointer'
                        : hasAnyReg
                          ? 'border-l-4 border-l-transparent opacity-40 cursor-not-allowed'
                          : 'border-l-4 border-l-transparent cursor-pointer'
                  }`}
                >
                  {/* Lewa kolumna: rejon — biały kafelek */}
                  <div className="shrink-0 w-12">
                    <div className="w-full text-center py-0.5 rounded bg-white text-[#21222D] text-2xl font-bold">
                      {order.pickupRegionId != null ? order.pickupRegionId : '—'}
                    </div>
                  </div>

                  {/* Środek: adresy */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-white text-2xl font-semibold truncate">{pickup.street}</p>
                    {pickup.city && <p className="text-[#ACACB9] text-xl truncate">{pickup.city}</p>}
                    {order.destinationAddress && (
                      <>
                        <p className="text-[#ACACB9] text-xl truncate">{dest.street}</p>
                        {dest.city && <p className="text-[#82818F] text-lg truncate">{dest.city}</p>}
                      </>
                    )}
                  </div>

                  {/* Prawa kolumna: badge zapisany / licznik chętnych */}
                  <div className="shrink-0 flex flex-col items-center gap-0.5">
                    {isRegistered && (
                      <span className="text-sm font-bold text-blue-300 leading-none">Zapisany</span>
                    )}
                    {order.registrationsCount > 0 && (
                      <>
                        <span className="text-2xl font-bold text-amber-400 leading-none">
                          {order.registrationsCount}
                        </span>
                        <span className="text-sm text-[#82818F] leading-none">chętnych</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Komunikaty */}
      {successMsg ? (
        <div className="mx-3 mb-2 px-4 py-2.5 bg-green-700/30 border border-green-600/40 rounded-lg text-green-300 text-xl text-center font-semibold">
          {successMsg}
        </div>
      ) : null}
      {errorMsg ? (
        <div className="mx-3 mb-2 px-4 py-2.5 bg-red-700/30 border border-red-600/40 rounded-lg text-red-300 text-xl text-center font-semibold">
          {errorMsg}
        </div>
      ) : null}

      {/* Info — kierowca już zapisany */}
      {myRegisteredIds.size > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-[#2B2B36]">
          <div className="w-full bg-blue-900/40 border border-blue-500/40 text-blue-300 font-semibold py-3 text-xl rounded-lg text-center">
            Czekasz na rozstrzygnięcie — nie możesz się zapisać na inne zlecenie
          </div>
        </div>
      )}

      {/* Przycisk Biorę zaznaczone */}
      {selected !== null && myRegisteredIds.size === 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-[#2B2B36]">
          <button
            onClick={handleRegister}
            disabled={registering}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 text-2xl rounded-lg transition-colors active:scale-[0.98]"
          >
            {registering ? 'Zgłaszanie...' : 'Biorę zaznaczone'}
          </button>
        </div>
      )}
    </div>
  );
};

export default GieldaTab;
