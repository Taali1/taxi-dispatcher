import React, { useState, useEffect, useRef } from 'react';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';

const QUICK_REPLIES = [
  'Już jadę',
  'Jestem na miejscu',
  'Nie mogę znaleźć klienta',
  'Spóźnię się ~5 min',
  'Problem z autem',
];

export const DriverChat: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const loadMessages = () => {
      const msgs = chatService.getDriverMessages(user.id);
      setMessages(msgs);

      const unread = chatService.getDriverUnreadCount(user.id);
      setUnreadCount(unread);

      // Oznacz wszystkie wiadomości jako przeczytane
      const unreadIds = msgs
        .filter(m => m.recipientId === user.id && !m.isRead)
        .map(m => m.id);
      if (unreadIds.length > 0) {
        chatService.markAsRead(unreadIds);
      }
    };

    // Załaduj na początku
    loadMessages();

    // Subskrybuj zmiany
    const unsubscribe = chatService.subscribe(loadMessages);

    return () => {
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    // Przewiń do końca przy nowych wiadomościach
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendQuickReply = async (text: string) => {
    if (!user) return;
    try {
      let dispatcherId = 'dispatcher_master';
      let dispatcherName = 'Dyspozytor';
      const lastDispatcherMsg = messages.find((m: any) => m.senderType === 'dispatcher');
      if (lastDispatcherMsg) {
        dispatcherId = lastDispatcherMsg.senderId;
        dispatcherName = lastDispatcherMsg.senderName;
      }
      await chatService.sendMessage(user.id, user.username, 'driver', dispatcherId, dispatcherName, text);
    } catch {
      alert('Nie udało się wysłać wiadomości');
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !user) return;

    try {
      // Znajdź ID dyspozytora z poprzednich wiadomości
      let dispatcherId = 'dispatcher_master';
      let dispatcherName = 'Dyspozytor';

      const lastDispatcherMsg = messages.find(m => m.senderType === 'dispatcher');
      if (lastDispatcherMsg) {
        dispatcherId = lastDispatcherMsg.senderId;
        dispatcherName = lastDispatcherMsg.senderName;
      }

      await chatService.sendMessage(
        user.id,
        user.username,
        'driver',
        dispatcherId,
        dispatcherName,
        messageInput.trim()
      );
      setMessageInput('');
    } catch (error) {
      console.error('[DriverChat] Error sending message:', error);
      alert('Nie udało się wysłać wiadomości');
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Wczoraj ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + ' ' +
        date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Nagłówek */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Wiadomości z Dyspozytorem</h1>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-sm px-3 py-1 rounded-full">
              {unreadCount} nowych
            </span>
          )}
        </div>
      </div>

      {/* Wiadomości */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-lg">Brak wiadomości</p>
              <p className="text-sm mt-2">Napisz pierwszą wiadomość do dyspozytora</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.senderId === user?.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-white'
                  }`}
                >
                  {msg.senderId !== user?.id && (
                    <div className="text-xs font-semibold mb-1 text-gray-300">
                      {msg.senderName}
                    </div>
                  )}
                  <div className="break-words">{msg.content}</div>
                  <div className={`text-xs mt-1 ${
                    msg.senderId === user?.id ? 'text-blue-200' : 'text-gray-400'
                  }`}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Pole wprowadzania */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        {/* Szybkie odpowiedzi */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_REPLIES.map(msg => (
            <button
              key={msg}
              onClick={() => sendQuickReply(msg)}
              className="shrink-0 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-200 rounded-full border border-gray-600 transition-colors whitespace-nowrap"
            >
              {msg}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Wpisz wiadomość..."
            className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            Wyślij
          </button>
        </div>
      </div>
    </div>
  );
};
