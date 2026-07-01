import React, { useState } from 'react';
import { X, CheckCircle, Megaphone } from 'lucide-react';
import type { ChatMessage } from '../../services/chatService';

interface MessagePopupProps {
  message: ChatMessage;
  queueCount: number;
  onClose: () => void;
  onReply: () => void;
  onQuickReply: (response: string) => void;
}

const QUICK_REPLIES = ['Tak', 'Nie', 'OK'];

const MessagePopup: React.FC<MessagePopupProps> = ({
  message,
  queueCount,
  onClose,
  onReply,
  onQuickReply,
}) => {
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleQuickReply = (response: string) => {
    onQuickReply(response);
    setSentMessage(response);
  };

  const handleConfirmationClose = () => {
    setSentMessage(null);
    onClose();
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return { date: 'Dziś', time };
    if (isYesterday) return { date: 'Wczoraj', time };
    return {
      date: date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time,
    };
  };

  const { date: dateStr, time: timeStr } = formatDate(message.timestamp);
  const isFromDispatcher = message.senderType === 'dispatcher';
  const isBroadcast = message.isBroadcast === true;
  const rawName = message.senderName || '';
  const dispatcherCode = rawName ? (rawName.startsWith('OP-') ? rawName : `OP-${rawName}`) : 'Dyspozytor';
  const senderLabel = isFromDispatcher ? dispatcherCode : (rawName || 'Kierowca');

  if (isBroadcast) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end animate-fadeIn">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative w-full bg-amber-500 rounded-t-2xl animate-slideUpSheet flex flex-col h-[75vh]">
          <div className="p-5 border-b border-amber-600 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-amber-900 font-bold text-base">KOMUNIKAT</div>
                <div className="text-amber-800 text-sm">{dateStr} · {timeStr}</div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-amber-600 rounded-xl transition-colors">
              <X className="w-5 h-5 text-amber-900" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="bg-amber-400 rounded-xl border border-amber-600 p-4">
              <p className="text-amber-900 text-lg leading-relaxed break-words font-medium">{message.content}</p>
            </div>
          </div>
          {queueCount > 1 && (
            <div className="text-center text-amber-800 text-sm px-5 pb-2">
              +{queueCount - 1} {queueCount - 1 === 1 ? 'kolejna wiadomość' : queueCount - 1 < 5 ? 'kolejne wiadomości' : 'kolejnych wiadomości'}
            </div>
          )}
          <div className="p-5 shrink-0">
            <button onClick={onClose} className="w-full bg-amber-700 hover:bg-amber-800 text-white font-semibold py-3.5 rounded-xl transition-colors text-base">
              Zamknij
            </button>
          </div>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUpSheet {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .animate-fadeIn       { animation: fadeIn 0.2s ease-out; }
          .animate-slideUpSheet { animation: slideUpSheet 0.35s cubic-bezier(0.32, 0.72, 0, 1); }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="animate-fadeIn"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      {/* overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />

      {/* modal */}
      <div
        className="animate-slideUpSheet"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '420px',
          background: '#1a1d23',
          borderRadius: '22px 22px 0 0',
          padding: '22px',
          boxShadow: '0 -10px 35px rgba(0,0,0,.6)',
        }}
      >
        {/* NADAWCA */}
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>{senderLabel}</div>

        {/* DATA */}
        <div style={{ fontSize: '16px', color: '#9aa4b2', marginTop: '4px' }}>
          {dateStr} • {timeStr}
        </div>

        {/* TREŚĆ */}
        <div style={{ marginTop: '18px', background: '#232730', padding: '18px', borderRadius: '14px', fontSize: '17px', lineHeight: 1.5, color: '#e6eaf0' }}>
          {message.content}
        </div>

        {/* licznik kolejnych wiadomości */}
        {queueCount > 1 && (
          <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '14px', color: '#9aa4b2' }}>
            +{queueCount - 1} {queueCount - 1 === 1 ? 'kolejna wiadomość' : queueCount - 1 < 5 ? 'kolejne wiadomości' : 'kolejnych wiadomości'}
          </div>
        )}

        {/* SZYBKIE ODPOWIEDZI */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginTop: '18px', paddingBottom: '4px' }}>
          {QUICK_REPLIES.map(label => (
            <button
              key={label}
              onClick={() => handleQuickReply(label)}
              style={{ border: 'none', background: '#2b3240', color: '#7fb3ff', padding: '12px 16px', borderRadius: '24px', fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* AKCJE */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '22px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '16px', borderRadius: '14px', fontSize: '17px', fontWeight: 600, border: 'none', background: '#2a2f38', color: '#e6eaf0', cursor: 'pointer' }}
          >
            Zamknij
          </button>
          <button
            onClick={onReply}
            style={{ flex: 1, padding: '16px', borderRadius: '14px', fontSize: '17px', fontWeight: 600, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer' }}
          >
            Odpowiedz
          </button>
        </div>
      </div>

      {/* Potwierdzenie wysłania */}
      {sentMessage && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4 animate-fadeIn">
          <div className="absolute inset-0 bg-black/80" onClick={handleConfirmationClose} />
          <div className="relative bg-[#21222D] rounded-2xl w-full max-w-sm border border-[#2B2B36] animate-slideUpSheet p-6 text-center">
            <button onClick={handleConfirmationClose} className="absolute top-3 right-3 p-2 hover:bg-[#2B2B36] rounded-xl transition-colors">
              <X className="w-5 h-5 text-[#ACACB9]" />
            </button>
            <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-white text-xl font-semibold mb-2">Wiadomość wysłana</h3>
            <p className="text-[#ACACB9] mb-6">
              Wysłano: <span className="text-white font-medium">„{sentMessage}"</span>
            </p>
            <button onClick={handleConfirmationClose} className="w-full bg-[#2B2B36] hover:bg-[#4D4D59] text-white font-semibold py-3 rounded-xl transition-colors">
              Zamknij
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUpSheet {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-fadeIn       { animation: fadeIn 0.2s ease-out; }
        .animate-slideUpSheet { animation: slideUpSheet 0.35s cubic-bezier(0.32, 0.72, 0, 1); }
      `}</style>
    </div>
  );
};

export default MessagePopup;
