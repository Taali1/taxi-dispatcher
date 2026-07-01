import React, { useEffect, useCallback, useState } from 'react';
import { driverQueueService, type QueueEntry } from '../../services/driverQueueService';
import { zoneService } from '../../services/zoneService';

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
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const ZoneCell: React.FC<{ zone: ZoneInfo }> = ({ zone }) => (
  <div
    style={{ height: 24 }}
    className="flex items-center justify-center rounded font-bold text-base select-none bg-zinc-700 text-white"
  >
    {zone.number}
  </div>
);

const DriverCell: React.FC<{ entry: QueueEntry | undefined }> = ({ entry }) => {
  if (!entry) {
    return (
      <div
        style={{ height: 24 }}
        className="rounded bg-white dark:bg-[#2d2d2d]"
      />
    );
  }
  const bgColor = STATE_COLOR[entry.driverState] ?? '#3f3f46';
  return (
    <div
      style={{ height: 24, backgroundColor: bgColor }}
      className="flex items-center justify-center rounded font-semibold text-white text-sm select-none"
    >
      {entry.driverCode}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const DispatcherRejonTab: React.FC = () => {
  const [queues, setQueues] = useState<Record<string, QueueEntry[]>>({});
  const [zones,  setZones]  = useState<ZoneInfo[]>([]);

  const fetchZones = useCallback(async () => {
    try {
      const allZones = await zoneService.getZones();
      setZones(allZones.map(z => ({ number: z.number, name: z.name || String(z.number) })));
    } catch (err) {
      console.error('[DispatcherRejonTab] fetchZones error:', err);
    }
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
      console.error('[DispatcherRejonTab] fetchQueues error:', err);
    }
  }, []);

  useEffect(() => {
    fetchZones();
    fetchQueues();
    const t = setInterval(() => { fetchZones(); fetchQueues(); }, 10_000);
    return () => clearInterval(t);
  }, [fetchZones, fetchQueues]);

  const sorted = [...zones].sort((a, b) => a.number - b.number);
  const maxDrivers = sorted.length === 0 ? 0
    : Math.max(...sorted.map(z => (queues[String(z.number)] ?? []).length));
  const numCols = sorted.length;

  // Komórki: wiersz 0 = nagłówki rejonów, wiersze 1+ = kierowcy
  const cells: React.ReactNode[] = [];

  for (const zone of sorted) {
    cells.push(<ZoneCell key={`z-${zone.number}`} zone={zone} />);
  }
  for (let di = 0; di < maxDrivers; di++) {
    for (const zone of sorted) {
      const drivers = queues[String(zone.number)] ?? [];
      cells.push(<DriverCell key={`${zone.number}-d${di}`} entry={drivers[di]} />);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white dark:bg-[#2d2d2d] p-px pt-px">
      <div
        className="inline-grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${numCols || 1}, 50px)`,
        }}
      >
        {cells}
      </div>
    </div>
  );
};

export default DispatcherRejonTab;
