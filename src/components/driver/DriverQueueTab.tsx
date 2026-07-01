import React, { useEffect, useCallback, useState } from 'react';
import { driverQueueService, type QueueEntry } from '../../services/driverQueueService';
import { zoneService } from '../../services/zoneService';

interface Props {
  driverId: string;
  driverCode: string;
  currentZone: number | null;
  zoneName: string | null;
  zoneEnteredAt: string | null;
  queuePosition: number | null;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
}

interface ZoneInfo {
  number: number;
  name: string;
}

const STATE_COLOR: Record<string, string> = {
  wolna:  '#007a1e',
  dojazd: '#aa0000',
  zajeta: '#8428bc',
  kursem: '#0052cc',
};

const NUM_ROWS = 24;
const DRIVER_SLOTS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const ZoneCell: React.FC<{ zone: ZoneInfo | null }> = ({ zone }) => (
  <div
    className={`flex items-center justify-center overflow-hidden rounded-sm font-medium text-white text-xl ${zone ? 'bg-[#4D4D59]' : 'bg-[#171821]'}`}
  >
    {zone?.number ?? null}
  </div>
);

const DriverCell: React.FC<{ entry: QueueEntry | undefined; isMe: boolean }> = ({ entry }) => {
  if (!entry) {
    return <div className="bg-[#171821] rounded-sm" />;
  }
  const bgColor = STATE_COLOR[entry.driverState] ?? '#3f3f46';
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-sm font-medium text-white text-xl"
      style={{ backgroundColor: bgColor }}
    >
      {entry.driverCode}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const DriverQueueTab: React.FC<Props> = ({ driverId, driverCode }) => {
  const [queues, setQueues] = useState<Record<string, QueueEntry[]>>({});
  const [zones,  setZones]  = useState<ZoneInfo[]>([]);

  const fetchZones = useCallback(async () => {
    try {
      const allZones = await zoneService.getZones();
      setZones(allZones.map(z => ({ number: z.number, name: z.name || String(z.number) })));
    } catch (err) {
      console.error('[DriverQueueTab] fetchZones error:', err);
    }
  }, []);

  const fetchQueues = useCallback(async () => {
    try {
      const data = await driverQueueService.getAllZoneQueues();
      setQueues(data);
      // Uzupełnij rejony z danych kolejki, gdyby jakiś nie był w serwisie
      setZones(prev => {
        const known = new Set(prev.map(z => z.number));
        const extra: ZoneInfo[] = [];
        for (const key of Object.keys(data)) {
          const num = parseInt(key);
          if (!isNaN(num) && !known.has(num)) {
            extra.push({ number: num, name: String(num) });
          }
        }
        if (extra.length === 0) return prev;
        return [...prev, ...extra].sort((a, b) => a.number - b.number);
      });
    } catch (err) {
      console.error('[DriverQueueTab] fetchQueues error:', err);
    }
  }, []);

  useEffect(() => {
    fetchZones();
    fetchQueues();
    const t = setInterval(() => { fetchZones(); fetchQueues(); }, 10_000);
    return () => clearInterval(t);
  }, [fetchZones, fetchQueues]);

  // Posortowane rejony od najmniejszego, uzupełnione do NUM_ROWS nullami
  const sorted = [...zones].sort((a, b) => a.number - b.number);
  const rows: (ZoneInfo | null)[] = Array.from({ length: NUM_ROWS }, (_, i) => sorted[i] ?? null);

  const cells: React.ReactNode[] = [];

  rows.forEach((zone, ri) => {
    // Col 0: numer rejonu
    cells.push(<ZoneCell key={`${ri}-z`} zone={zone} />);

    // Cols 1–7: sloty kierowców — zajeta nie wyświetla się w kolejce
    const drivers: QueueEntry[] = zone
      ? (queues[String(zone.number)] ?? []).filter(d => d.driverState !== 'zajeta')
      : [];
    for (let s = 0; s < DRIVER_SLOTS; s++) {
      const entry = drivers[s];
      const isMe  = !!entry && (entry.driverId === driverId || entry.driverCode === driverCode);
      cells.push(<DriverCell key={`${ri}-d${s}`} entry={entry} isMe={isMe} />);
    }
  });

  return (
    <div className="flex-1 overflow-hidden bg-[#171821] pt-[1px]">
      {/* Siatka 8×24: 1 kolumna rejonu + 7 slotów kierowców */}
      <div
        className="h-full grid grid-cols-8 gap-[1px]"
        style={{ gridTemplateRows: `repeat(${NUM_ROWS}, 1fr)` }}
      >
        {cells}
      </div>
    </div>
  );
};

export default DriverQueueTab;
