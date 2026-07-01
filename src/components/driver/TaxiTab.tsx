import React, { useState, useEffect } from 'react';
import { driverQueueService, type QueueEntry } from '../../services/driverQueueService';
import { zoneService, type Zone } from '../../services/zoneService';

// Kolor badge dla driver_state
const stateColor: Record<string, string> = {
  wolna:  'bg-emerald-600 text-white',
  dojazd: 'bg-amber-600  text-white',
  kursem: 'bg-blue-600   text-white',
};

const TaxiTab: React.FC = () => {
  // queues: { [zoneNumber]: QueueEntry[] }  — bezpośrednio z API
  const [queues, setQueues] = useState<Record<string, QueueEntry[]>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);

  const loadZones = async () => {
    const allZones = await zoneService.getZones();
    setZones(allZones);
  };

  useEffect(() => {
    loadZones();
    loadQueues();

    const interval = setInterval(() => {
      loadZones();
      loadQueues();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadQueues = async () => {
    setLoading(true);
    try {
      const result = await driverQueueService.getAllZoneQueues();
      setQueues(result);
    } catch (error) {
      console.error('[TaxiTab] Błąd podczas ładowania kolejek:', error);
    } finally {
      setLoading(false);
    }
  };

  // Zwraca wszystkie numery stref posortowane rosnąco.
  // Podstawą są strefy z serwisu (baza/localStorage) — zawsze wyświetlamy każdy rejon.
  // Kolejki z API mogą ewentualnie dodać rejon, którego nie ma w bazie.
  const getAllZoneNumbers = (): number[] => {
    const fromZones = zones.map(z => z.number);
    const fromQueues = Object.keys(queues).map(Number).filter(n => !isNaN(n));
    return Array.from(new Set([...fromZones, ...fromQueues])).sort((a, b) => a - b);
  };

  const getZonePairs = (): [number, number | null][] => {
    const zoneNumbers = getAllZoneNumbers();
    const pairs: [number, number | null][] = [];
    for (let i = 0; i < zoneNumbers.length; i += 2) {
      pairs.push([zoneNumbers[i], i + 1 < zoneNumbers.length ? zoneNumbers[i + 1] : null]);
    }
    return pairs;
  };

  const renderZoneCell = (zoneNumber: number) => (
    <div
      key={`zone-${zoneNumber}`}
      className="bg-white text-[#21222D] font-bold text-2xl flex items-center justify-center h-16 rounded-sm"
    >
      {zoneNumber}
    </div>
  );

  const renderDriverCell = (zoneNumber: number, slotIndex: number) => {
    const driver: QueueEntry | undefined = queues[zoneNumber]?.[slotIndex];

    if (!driver) {
      return (
        <div
          key={`driver-${zoneNumber}-${slotIndex}`}
          className="bg-[#2B2B36] h-16 rounded-sm"
        />
      );
    }

    const badgeClass = stateColor[driver.driverState] ?? 'bg-[#6D6D7A] text-[#E8E8E8]';

    return (
      <div
        key={`driver-${zoneNumber}-${slotIndex}`}
        className="bg-[#2B2B36] text-white text-base flex flex-col items-center justify-center h-16 rounded-sm px-1 gap-0.5"
      >
        <span className="font-bold text-lg leading-tight">{driver.driverCode}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium leading-tight ${badgeClass}`}>
          {driver.driverState}
        </span>
      </div>
    );
  };

  const renderGridRow = (zone1: number, zone2: number | null) => {
    const cells: React.ReactNode[] = [];

    // Lewa strefa
    cells.push(renderZoneCell(zone1));
    for (let i = 0; i < 3; i++) {
      cells.push(renderDriverCell(zone1, i));
    }

    // Prawa strefa (lub puste miejsca)
    if (zone2 !== null) {
      cells.push(renderZoneCell(zone2));
      for (let i = 0; i < 3; i++) {
        cells.push(renderDriverCell(zone2, i));
      }
    } else {
      for (let i = 0; i < 4; i++) {
        cells.push(
          <div key={`empty-${zone1}-${i}`} className="bg-[#21222D] h-16 rounded-sm" />
        );
      }
    }

    return cells;
  };

  const zonePairs = getZonePairs();

  if (zones.length === 0 && Object.keys(queues).length === 0 && !loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center text-[#ACACB9]">
          <p className="text-lg">Brak zdefiniowanych stref</p>
          <p className="text-sm mt-2">Administrator musi najpierw utworzyć strefy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <div className="space-y-[1px]">
        {zonePairs.map((pair, index) => (
          <div key={`row-${index}`} className="grid grid-cols-8 gap-[1px]">
            {renderGridRow(pair[0], pair[1])}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaxiTab;
