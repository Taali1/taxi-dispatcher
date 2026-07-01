import React, { useState, useEffect } from 'react';

interface DriverQuery {
  id: string;
  driver_id: string;
  question: string;
  status: 'pending' | 'answered';
  created_at: string;
}

interface DriverQueryPopupProps {
  query: DriverQuery;
  apiBase: string;
  onAnswered: () => void;
}

const TIME_LIMIT = 20;
const OPTIONS = [2, 4, 6, 8, 10, 12, 15, 17, 20, 22, 25, 27, 30];

const DriverQueryPopup: React.FC<DriverQueryPopupProps> = ({ query, apiBase, onAnswered }) => {
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // Odliczanie
  useEffect(() => {
    if (sent) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t);
          // Zapisz POMINIĘTO do bazy i zamknij
          fetch(`${apiBase}/driver-queries/${query.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer: 'BRAK ODPOWIEDZI' }),
          }).catch(() => {}).finally(() => onAnswered());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [sent, onAnswered, apiBase, query.id]);

  const respond = async (answer: string) => {
    if (sending) return;
    setSending(true);
    try {
      await fetch(`${apiBase}/driver-queries/${query.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      setSent(answer);
      setTimeout(() => onAnswered(), 1000);
    } catch {
      setSending(false);
    }
  };

  const timerColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f97316' : '#e2e8f0';

  return (
    <div className="absolute inset-0 z-[9999] flex flex-col bg-slate-800" style={{ touchAction: 'none' }}>

      {/* Nagłówek z pytaniem i timerem */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-slate-600 bg-slate-900">
        <p className="text-white font-semibold text-2xl flex-1">{query.question}</p>
        <span className="ml-4 text-4xl font-semibold tabular-nums shrink-0" style={{ color: timerColor }}>
          {timeLeft}
        </span>
      </div>

      {sent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="text-white text-5xl font-normal">✓</span>
          <span className="text-white text-3xl font-normal">
            {sent === 'TERAZ' ? 'Teraz' : sent === 'DŁUGO' ? 'Długo' : `${sent} min`}
          </span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center px-4 gap-3">

          {/* Kafelki 3 w rzędzie */}
          <div className="grid grid-cols-3 gap-3">
            {OPTIONS.map(val => (
              <button
                key={val}
                onClick={() => respond(String(val))}
                disabled={sending}
                className="font-semibold text-3xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg py-5 border border-slate-600"
              >
                {val}
              </button>
            ))}
          </div>

          {/* TERAZ i DŁUGO */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              onClick={() => respond('TERAZ')}
              disabled={sending}
              className="font-semibold text-3xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg py-5 border border-slate-600"
            >
              Teraz
            </button>
            <button
              onClick={() => respond('DŁUGO')}
              disabled={sending}
              className="font-semibold text-3xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg py-5 border border-slate-600"
            >
              Długo
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

export default DriverQueryPopup;
