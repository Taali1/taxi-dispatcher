import React, { useState } from 'react';
import { Send, Phone, User } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'support';
  message: string;
  timestamp: string;
}

const ChatInterface: React.FC = () => {
  const [activeChats, setActiveChats] = useState([
    {
      id: 'chat1',
      customerName: 'Maria Kowalska',
      phone: '+48 123 456 789',
      status: 'active',
      lastMessage: 'Czy mogę anulować zlecenie?',
      lastTime: '14:35',
    },
    {
      id: 'chat2',
      customerName: 'Tomasz Nowak',
      phone: '+48 987 654 321',
      status: 'waiting',
      lastMessage: 'Dziękuję za pomoc!',
      lastTime: '14:20',
    },
  ]);

  const [selectedChat, setSelectedChat] = useState(activeChats[0]?.id);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'customer',
      message: 'Dzień dobry, mam problem z moim zleceniem',
      timestamp: '14:30',
    },
    {
      id: '2',
      sender: 'support',
      message: 'Dzień dobry! Chętnie pomogę. Jaki jest numer Pana zlecenia?',
      timestamp: '14:31',
    },
    {
      id: '3',
      sender: 'customer',
      message: 'ORD123, kierowca miał przyjechać o 14:00 ale nie ma go',
      timestamp: '14:32',
    },
    {
      id: '4',
      sender: 'customer',
      message: 'Czy mogę anulować zlecenie?',
      timestamp: '14:35',
    },
  ]);

  const sendMessage = () => {
    if (!message.trim()) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'support',
      message: message,
      timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([...messages, newMessage]);
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectedChatData = activeChats.find(chat => chat.id === selectedChat);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
      {/* Chat List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Aktywne rozmowy</h3>
        </div>
        
        <div className="overflow-y-auto h-full">
          {activeChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat.id)}
              className={`w-full p-4 text-left hover:bg-slate-700 transition-colors duration-200 border-b border-slate-700 last:border-b-0 ${
                selectedChat === chat.id ? 'bg-slate-700' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-white font-medium">{chat.customerName}</span>
                <span className="text-slate-400 text-xs">{chat.lastTime}</span>
              </div>
              <div className="text-slate-300 text-sm truncate mb-1">{chat.lastMessage}</div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">{chat.phone}</span>
                <span className={`w-2 h-2 rounded-full ${
                  chat.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'
                }`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Interface */}
      <div className="lg:col-span-3 bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
        {selectedChatData ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-600 w-10 h-10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{selectedChatData.customerName}</h3>
                    <p className="text-slate-400 text-sm">{selectedChatData.phone}</p>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors duration-200">
                    <Phone className="w-4 h-4" />
                    <span>Zadzwoń</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'support' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      msg.sender === 'support'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                    <p className="text-xs opacity-70 mt-1">{msg.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-slate-700">
              <div className="flex space-x-4">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Napisz wiadomość..."
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                />
                <button
                  onClick={sendMessage}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4" />
              <p>Wybierz rozmowę aby rozpocząć</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;