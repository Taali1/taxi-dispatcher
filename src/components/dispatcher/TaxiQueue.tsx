import React, { useEffect, useCallback, useState } from 'react';
import { driverQueueService, type QueueEntry } from '../../services/driverQueueService';

interface ZoneInfo {
  number: number;
  name: string;
}

const STATE_COLOR: Record<string, string> = {
  wolna:  '#00bb2f',
  dojazd: '#cc0000',
  zajeta: '#663366',
  kursem: '#0052cc',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function loadZonesFromStorage(): ZoneInfo[] {
  try {
    const raw = localStorage.getItem('taxi_zones');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as any[])
      .filter(z => z && typeof z.number === 'number')
      .map(z => ({ number: z.number as number, name: (z.name as string) || String(z.number) }))
      .sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const ZoneCell: React.FC<{ zone: ZoneInfo }> = ({ zone }) => (
  <div
    className="flex items-center justify-center overflow-hidden font-semibold text-white bg-zinc-700"
    style={{ fontSize: 'clamp(12px, 1.8vw, 28px)', lineHeight: 1 }}
  >
    {zone.number}
  </div>
);

const DriverCell: React.FC<{ entry: QueueEntry | undefined }> = ({ entry }) => {
  if (!entry) return <div className="bg-zinc-950" />;
  const bg = STATE_COLOR[entry.driverState] ?? '#3f3f46';
  return (
    <div
      className="flex items-center justify-center overflow-hidden font-semibold text-white"
      style={{ fontSize: 'clamp(12px, 1.8vw, 28px)', lineHeight: 1, backgroundColor: bg }}
    >
      {entry.driverCode}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const TaxiQueue: React.FC = () => {
  const [queues, setQueues] = useState<Record<string, QueueEntry[]>>({});
  const [zones,  setZones]  = useState<ZoneInfo[]>([]);

  useEffect(() => {
    setZones(loadZonesFromStorage());
  }, []);

  const fetchQueues = useCallback(async () => {
    try {
      const data = await driverQueueService.getAllZoneQueues();
      setQueues(data);
      setZones(prev => {
        const known = new Set(prev.map(z => z.number));
        const extra: ZoneInfo[] = [];
        for (const key of Object.keys(data)) {
          const num = parseInt(key);
          if (!isNaN(num) && !known.has(num))
            extra.push({ number: num, name: String(num) });
        }
        if (extra.length === 0) return prev;
        return [...prev, ...extra].sort((a, b) => a.number - b.number);
      });
    } catch (err) {
      console.error('[TaxiQueue] fetchQueues error:', err);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
    const t = setInterval(fetchQueues, 10_000);
    return () => clearInterval(t);
  }, [fetchQueues]);

  const sorted = [...zones].sort((a, b) => a.number - b.number);
  const maxDrivers = sorted.length === 0 ? 0
    : Math.max(...sorted.map(z => (queues[String(z.number)] ?? []).length));
  const numRows = maxDrivers + 1; // +1 na nagłówek rejonu
  const numCols = sorted.length;

  // Komórki w kolejności: wiersz po wierszu (CSS grid auto-flow row)
  // Wiersz 0: nagłówki rejonów
  // Wiersze 1+: kierowcy
  const cells: React.ReactNode[] = [];

  // Nagłówki
  for (const zone of sorted) {
    cells.push(<ZoneCell key={`z-${zone.number}`} zone={zone} />);
  }
  // Kierowcy
  for (let di = 0; di < maxDrivers; di++) {
    for (const zone of sorted) {
      const drivers = queues[String(zone.number)] ?? [];
      cells.push(<DriverCell key={`${zone.number}-d${di}`} entry={drivers[di]} />);
    }
  }

  return (
    <div
      className="overflow-auto bg-zinc-950 p-px"
      style={{ height: 'calc(100vh - 52px)' }}
    >
      <div
        className="h-full grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${numCols || 1}, 1fr)`,
          gridTemplateRows: `repeat(${numRows || 1}, 1fr)`,
          minWidth: numCols * 60,
        }}
      >
        {cells}
      </div>
    </div>
  );
};

export default TaxiQueue;
