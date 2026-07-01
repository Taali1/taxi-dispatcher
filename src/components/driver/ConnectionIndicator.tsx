import React, { useState } from 'react';
import { Signal } from 'lucide-react';

interface ConnectionIndicatorProps {
  isConnected: boolean;
  isOnline: boolean;
  hasGPS: boolean;
}

const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  isConnected,
  isOnline,
  hasGPS,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatusMessage = () => {
    if (!isOnline && !hasGPS) return 'Brak internetu i GPS';
    if (!isOnline) return 'Brak połączenia z internetem';
    if (!hasGPS) return 'Brak sygnału GPS';
    return 'Połączenie aktywne';
  };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`transition-all duration-300 ${
          isConnected
            ? 'text-green-500'
            : 'text-red-500 animate-signal-blink drop-shadow-[0_0_12px_rgba(239,68,68,0.9)]'
        }`}
      >
        <Signal className="w-6 h-6" strokeWidth={2.5} />
      </div>

      {showTooltip && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-slate-700 text-white text-xs rounded-lg whitespace-nowrap z-50">
          <div className="font-semibold">{getStatusMessage()}</div>
          <div className="mt-1 text-slate-300">
            <div>Internet: {isOnline ? '✓' : '✗'}</div>
            <div>GPS: {hasGPS ? '✓' : '✗'}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionIndicator;
