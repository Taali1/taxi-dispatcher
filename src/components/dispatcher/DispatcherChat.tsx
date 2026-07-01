import React, { useState, useEffect, useRef } from 'react';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { Send, MessageSquare } from 'lucide-react';

// ── Kolory awatarów (po numerze kodu) ───────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-violet-600', 'bg-emerald-600', 'bg-rose-600',
  'bg-amber-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-teal-600',
];
const avatarColor = (code: string) =>
  AVATAR_COLORS[parseInt(code.replace(/\D/g, '') || '0', 10) % AVATAR_COLORS.length];

// ── Formatowanie czasu ───────────────────────────────────────────────────────
const fmtTime = (ts: string) => {
  const d = new Date(ts);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yest.toDateString())
    return 'Wczoraj ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
};

const fmtDateSep = (ts: string) => {
  const d = new Date(ts);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Dzisiaj';
  if (d.toDateString() === yest.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: 'long' });
};

// ── Komponent ────────────────────────────────────────────────────────────────
export const DispatcherChat: React.FC<{
  initialDriverId?: string;
  initialDriverCode?: string;
  initialDriverName?: string;
}> = ({ initialDriverId, initialDriverCode, initialDriverName }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Array<{
    driverId: string; driverName: string; driverCode: string;
    lastMessage: string; timestamp: string; unreadCount: number;
  }>>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(initialDriverId ?? null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const convs = await chatService.getDispatcherConversations(user.id);
      setConversations(convs);
      if (selectedDriverId) {
        setMessages(chatService.getConversationMessages(user.id, selectedDriverId));
      }
    };
    load();
    const unsub = chatService.subscribe(load);
    return () => unsub();
  }, [user, selectedDriverId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId(driverId);
    if (user) {
      const msgs = chatService.getConversationMessages(user.id, driverId);
      setMessages(msgs);
      const unreadIds = msgs.filter(m => m.senderType === 'driver' && !m.isRead).map(m => m.id);
      if (unreadIds.length > 0) chatService.markAsRead(unreadIds);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedDriverId || !user) return;
    const conv = conversations.find(c => c.driverId === selectedDriverId);
    const driverName = conv?.driverName ?? initialDriverName ?? initialDriverCode ?? '—';
    try {
      await chatService.sendMessage(
        user.id, (user as any).employeeId || user.name || 'Dyspozytor', 'dispatcher',
        selectedDriverId, driverName, messageInput.trim()
      );
      setMessageInput('');
    } catch (err: any) {
      alert('Błąd wysyłania: ' + (err?.message || String(err)));
    }
  };

  // Jeśli kierowca nie napisał jeszcze (brak w conversations), tworzymy wirtualną konwersację
  const selectedConv = conversations.find(c => c.driverId === selectedDriverId)
    ?? (selectedDriverId && initialDriverId && selectedDriverId === initialDriverId
      ? {
          driverId: initialDriverId,
          driverName: initialDriverName ?? initialDriverCode ?? '—',
          driverCode: initialDriverCode ?? '—',
          lastMessage: '',
          timestamp: new Date().toISOString(),
          unreadCount: 0,
        }
      : undefined);

  // Grupowanie wiadomości po dniu
  const grouped: { date: string; msgs: any[] }[] = [];
  messages.forEach(msg => {
    const day = new Date(msg.timestamp).toDateString();
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== day) grouped.push({ date: day, msgs: [msg] });
    else last.msgs.push(msg);
  });

  return (
    <div className="flex h-full bg-gray-50 dark:bg-[#1a1a1a]">

      {/* ══ LEWA KOLUMNA — lista konwersacji (ukryta gdy konkretny kierowca) ══ */}
      <div className={`${initialDriverId ? 'hidden' : 'w-64 shrink-0'} flex flex-col border-r border-[#b0b3b8] dark:border-[#7a7a7a] bg-white dark:bg-[#202020]`}>

        {/* Nagłówek listy */}
        <div className="px-4 py-3.5 border-b border-[#b0b3b8] dark:border-[#7a7a7a] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-gray-900 dark:text-white text-sm">Wiadomości</span>
          {conversations.reduce((s, c) => s + c.unreadCount, 0) > 0 && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
              {conversations.reduce((s, c) => s + c.unreadCount, 0)}
            </span>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-300 p-6">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-xs text-center">Brak aktywnych konwersacji</p>
            </div>
          ) : (
            conversations.map(conv => {
              const isActive = selectedDriverId === conv.driverId;
              const color = avatarColor(conv.driverCode);
              return (
                <button
                  key={conv.driverId}
                  onClick={() => handleSelectDriver(conv.driverId)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b border-[#b0b3b8] dark:border-[#7a7a7a] transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-[#434343]/60'
                  }`}
                >
                  {/* Awatar */}
                  <div className={`shrink-0 w-11 h-6 rounded ${color} flex items-center justify-center`}>
                    <span className="text-xs font-bold text-white leading-none">
                      {conv.driverCode || conv.driverName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                        {conv.driverCode} · {conv.driverName}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-300 truncate">{conv.lastMessage}</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-300 mt-0.5 tabular-nums">{fmtTime(conv.timestamp)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ══ PRAWA KOLUMNA — okno wiadomości ══════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConv ? (
          <>
            {/* Nagłówek okna — ukryty gdy czat osadzony w modalu zlecenia */}
            {!initialDriverId && (
              <div className="shrink-0 px-4 py-3 bg-white dark:bg-[#202020] border-b border-[#b0b3b8] dark:border-[#7a7a7a] flex items-center gap-3">
                <div className={`shrink-0 w-10 h-6 rounded ${avatarColor(selectedConv.driverCode)} flex items-center justify-center`}>
                  <span className="text-xs font-bold text-white">{selectedConv.driverCode}</span>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedConv.driverName}</p>
              </div>
            )}

            {/* Wiadomości */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {grouped.map(group => (
                <div key={group.date}>
                  {/* Separator daty */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-[#383838]" />
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      {fmtDateSep(group.msgs[0].timestamp)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-[#383838]" />
                  </div>

                  <div className="space-y-1.5">
                    {group.msgs.map((msg, i) => {
                      const isOwn = msg.senderId === user?.id;
                      const prevMsg = group.msgs[i - 1];
                      const showTime = !prevMsg ||
                        Math.abs(new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) > 5 * 60_000 ||
                        prevMsg.senderId !== msg.senderId;

                      return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[72%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                            <div className={`px-3 py-2 text-sm leading-relaxed break-words ${
                              isOwn
                                ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm'
                                : 'bg-white dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] text-gray-900 dark:text-white rounded-2xl rounded-bl-sm shadow-sm'
                            }`}>
                              {msg.content}
                            </div>
                            {showTime && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-300 px-1 tabular-nums">
                                {fmtTime(msg.timestamp)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300 dark:text-gray-300">
                  <MessageSquare className="w-10 h-10" />
                  <p className="text-sm">Brak wiadomości — napisz pierwszą!</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Pasek wprowadzania */}
            <div className="shrink-0 px-4 py-3 bg-white dark:bg-[#202020] border-t border-[#b0b3b8] dark:border-[#7a7a7a]">
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#2d2d2d] border border-[#b0b3b8] dark:border-[#7a7a7a] rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                <input
                  type="text"
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Napisz wiadomość…"
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none py-1"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim()}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-[#2e2e2e] disabled:cursor-not-allowed text-white disabled:text-gray-400 dark:disabled:text-gray-400 transition-all active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Stan pusty */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-300 dark:text-gray-300">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-[#2d2d2d] flex items-center justify-center">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-400 dark:text-gray-300">Wybierz konwersację</p>
              <p className="text-xs text-gray-300 dark:text-gray-300 mt-0.5">aby zobaczyć wiadomości</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
