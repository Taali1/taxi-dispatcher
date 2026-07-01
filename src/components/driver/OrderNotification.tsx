import React, { useState, useEffect, useRef } from 'react';

interface Order {
  id: string;
  customer: string;
  pickup: string;
  destination: string;
  estimatedTime: string;
  distance: string;
  cost: string;
}

interface OrderNotificationProps {
  order: Order;
  onAccept: () => void;
  onReject: () => void;
}

const TOTAL = 15;

const styles = `
  @keyframes greenWave {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes redWave {
    0%   { background-position: 100% 50%; }
    50%  { background-position: 0% 50%; }
    100% { background-position: 100% 50%; }
  }
  @keyframes iconDrop {
    0%   { transform: translateY(-12px) scale(0.8); opacity: 0; }
    60%  { transform: translateY(4px) scale(1.08); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  @keyframes confirmPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.04); }
  }
  .btn-accept {
    background: linear-gradient(135deg, #052e16, #166534, #15803d, #16a34a, #166534, #052e16);
    background-size: 300% 300%;
    animation: greenWave 3s ease infinite;
  }
  .btn-accept:active {
    transform: scale(0.96);
    transition: transform 0.08s ease;
  }
  .btn-reject {
    background: linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b, #dc2626, #991b1b, #450a0a);
    background-size: 300% 300%;
    animation: redWave 3s ease infinite;
  }
  .btn-reject:active {
    transform: scale(0.96);
    transition: transform 0.08s ease;
  }
  .btn-reject.confirm {
    animation: redWave 3s ease infinite, confirmPulse 0.5s ease-in-out infinite;
  }
  .icon-enter {
    animation: iconDrop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }
`;

const OrderNotification: React.FC<OrderNotificationProps> = ({ order, onAccept, onReject }) => {
  const [timeLeft, setTimeLeft] = useState(TOTAL);
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio('/taxi_new_order.mp3');
    audio.loop = true;
    audio.volume = 1.0;
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { onReject(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onReject]);

  const handleReject = () => {
    if (rejectConfirm) {
      onReject();
    } else {
      setRejectConfirm(true);
      rejectTimerRef.current = setTimeout(() => setRejectConfirm(false), 2500);
    }
  };

  useEffect(() => {
    return () => { if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current); };
  }, []);

  const progress = (timeLeft / TOTAL) * 100;
  const isUrgent = timeLeft <= 5;
  const ringColor = isUrgent ? '#ef4444' : '#f59e0b';

  return (
    <div className="absolute inset-0 z-50 flex flex-col font-open-sans" style={{ backgroundColor: '#171821' }}>
      <style>{styles}</style>

      {/* Nagłówek */}
      <div className="relative shrink-0 flex items-center justify-between px-6 py-5 overflow-hidden">
        <div
          className="animate-order-bg-pulse absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 120%, ${ringColor}40 0%, transparent 70%)` }}
        />
        <div className="flex items-center gap-3">
          <span className="animate-order-icon text-3xl select-none" style={{ filter: `drop-shadow(0 0 8px ${ringColor})` }}>🔔</span>
          <span className="animate-order-glow text-xl font-semibold uppercase tracking-widest text-white select-none">
            Nowe zlecenie
          </span>
        </div>
        <span
          className="text-4xl font-semibold tabular-nums"
          style={{ color: ringColor, textShadow: `0 0 16px ${ringColor}88` }}
        >
          {timeLeft}s
        </span>
      </div>

      {/* Pasek postępu */}
      <div className="shrink-0 h-1.5 bg-[#2B2B36]">
        <div
          className="h-full"
          style={{
            width: `${progress}%`,
            backgroundColor: ringColor,
            boxShadow: `0 0 8px ${ringColor}`,
            transition: 'width 1s linear, background-color 0.4s ease, box-shadow 0.4s ease',
          }}
        />
      </div>

      {/* Przyciski */}
      <div className="flex-1 flex gap-[2px] pt-[2px]">

        {/* BIORĘ */}
        <button
          className="btn-accept flex-1 flex flex-col items-center justify-center gap-2 select-none"
          onClick={onAccept}
        >
          <span
            key="accept-icon"
            className="icon-enter text-white"
            style={{
              fontSize: 'clamp(3.5rem, 18vw, 6rem)',
              lineHeight: 1,
              fontWeight: 300,
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            ✓
          </span>
          <span
            className="text-white/90 font-black uppercase tracking-[0.2em]"
            style={{ fontSize: 'clamp(1rem, 5.5vw, 1.6rem)', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
          >
            BIORĘ
          </span>
        </button>

        {/* ODRZUĆ */}
        <button
          className={`btn-reject flex-1 flex flex-col items-center justify-center gap-2 select-none${rejectConfirm ? ' confirm' : ''}`}
          onClick={handleReject}
        >
          <span
            key={rejectConfirm ? 'reject-confirm' : 'reject-icon'}
            className="icon-enter text-white"
            style={{
              fontSize: 'clamp(3.5rem, 18vw, 6rem)',
              lineHeight: 1,
              fontWeight: 300,
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {rejectConfirm ? '?' : '✕'}
          </span>
          <span
            className="text-white/90 font-black uppercase tracking-[0.2em]"
            style={{ fontSize: 'clamp(1rem, 5.5vw, 1.6rem)', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
          >
            {rejectConfirm ? 'NA PEWNO?' : 'ODRZUĆ'}
          </span>
        </button>

      </div>
    </div>
  );
};

export default OrderNotification;
