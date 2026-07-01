import React from 'react';
import { Info } from 'lucide-react';
import { DRIVER_STATUS_COLORS, ALL_STATUSES } from '../../constants/driverColors';

interface ColorLegendProps {
  compact?: boolean;
  showHomeStatus?: boolean;
}

const ColorLegend: React.FC<ColorLegendProps> = ({ compact = false, showHomeStatus = true }) => {
  const statusesToShow = showHomeStatus
    ? ALL_STATUSES
    : ALL_STATUSES.filter(status => status !== 'home');

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {statusesToShow.map((status) => {
          const color = DRIVER_STATUS_COLORS[status];
          return (
            <div key={status} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: color.primary }}
              />
              <span className="text-xs text-slate-400">{color.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-white">Legenda statusów</h4>
      </div>

      <div className="space-y-2">
        {statusesToShow.map((status) => {
          const color = DRIVER_STATUS_COLORS[status];
          return (
            <div key={status} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded border-2 border-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: color.primary }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{color.label}</div>
                <div className="text-xs text-slate-400">
                  {status === 'free' && 'Kierowca jest wolny i czeka w kolejce'}
                  {status === 'driving' && 'Kierowca jedzie z pasażerem'}
                  {status === 'pickup' && 'Kierowca dojeżdża do klienta'}
                  {status === 'home' && 'Kierowca nie pracuje (niewidoczny w kolejce)'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ColorLegend;
