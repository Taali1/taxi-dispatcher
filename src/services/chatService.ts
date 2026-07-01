const API = '';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'driver' | 'dispatcher';
  recipientId: string;
  recipientName: string;
  recipientType?: 'driver' | 'dispatcher';
  content: string;
  timestamp: string;
  isRead: boolean;
  isBroadcast?: boolean;
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantCode: string;
  participantType: 'driver' | 'dispatcher' | 'base';
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

/** Mapuje wiersz z bazy (snake_case) na ChatMessage (camelCase) */
function rowToMessage(row: any): ChatMessage & { senderDriverCode?: string } {
  return {
    id:               row.id,
    senderId:         row.sender_id   ?? row.senderId   ?? '',
    senderName:       row.sender_name ?? row.senderName ?? '',
    senderType:       row.sender_type ?? row.senderType ?? 'driver',
    recipientId:      row.receiver_id ?? row.recipientId ?? '',
    recipientName:    row.receiver_name ?? row.recipientName ?? '',
    recipientType:    row.receiver_type ?? undefined,
    content:          row.message     ?? row.content    ?? '',
    timestamp:        row.created_at  ?? row.timestamp  ?? new Date().toISOString(),
    isRead:           Boolean(row.is_read ?? row.isRead ?? false),
    isBroadcast:      Boolean(row.is_broadcast ?? false),
    senderDriverCode: row.sender_driver_code ?? undefined,
  };
}

class ChatService {
  private messages: ChatMessage[] = [];
  private listeners: Set<() => void> = new Set();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadMessages();
    this.startPolling();
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => this.loadMessages(), 5000);
  }

  async loadMessages() {
    try {
      const res = await fetch(`${API}/api/chat/messages`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.messages = data.data.map(rowToMessage);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[ChatService] Error loading messages:', error);
    }
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb());
  }

  // Pobierz konwersacje dla dyspozytora
  async getDispatcherConversations(dispatcherId: string): Promise<Array<{
    driverId: string;
    driverName: string;
    driverCode: string;
    lastMessage: string;
    timestamp: string;
    unreadCount: number;
  }>> {
    const conversations = new Map<string, any>();

    (this.messages as Array<ChatMessage & { senderDriverCode?: string }>).forEach(msg => {
      let driverId: string | null = null;
      let driverName: string | null = null;
      let driverCode: string = '';

      if (msg.senderType === 'driver') {
        driverId = msg.senderId;
        driverName = msg.senderName;
        driverCode = (msg as any).senderDriverCode || '';
      } else if (msg.senderType === 'dispatcher' && msg.senderId === dispatcherId) {
        driverId = msg.recipientId;
        driverName = msg.recipientName;
      }

      if (driverId) {
        const existing = conversations.get(driverId);
        const isNewer = !existing || new Date(msg.timestamp) > new Date(existing.timestamp);
        if (isNewer) {
          conversations.set(driverId, {
            driverId,
            driverName: driverName || driverId,
            driverCode: driverCode || existing?.driverCode || '',
            lastMessage: msg.content,
            timestamp: msg.timestamp,
            unreadCount: 0,
          });
        } else if (driverCode && !existing.driverCode) {
          existing.driverCode = driverCode;
        }
      }
    });

    conversations.forEach((conv, driverId) => {
      conv.unreadCount = this.messages.filter(msg =>
        msg.senderType === 'driver' && msg.senderId === driverId && !msg.isRead
      ).length;
    });

    return Array.from(conversations.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // Wiadomości między dyspozytorem a kierowcą (widok dyspozytora)
  getConversationMessages(dispatcherId: string, driverId: string): ChatMessage[] {
    return this.messages
      .filter(msg =>
        (msg.senderId === dispatcherId && msg.recipientId === driverId && msg.senderType === 'dispatcher') ||
        (msg.senderId === driverId && msg.senderType === 'driver' &&
          (msg.recipientId === dispatcherId || msg.recipientId === 'dispatcher_master' || !msg.recipientId))
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Wiadomości kierowcy z dyspozytornia
  getDispatcherChatMessages(driverId: string): ChatMessage[] {
    return this.messages
      .filter(msg =>
        (msg.senderId === driverId && msg.senderType === 'driver' &&
          (msg.recipientType === 'dispatcher' || msg.recipientId === 'dispatcher_master' ||
           (!msg.recipientType && msg.recipientId !== driverId))) ||
        (msg.recipientId === driverId && msg.senderType === 'dispatcher')
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Wiadomości między dwoma kierowcami
  getDriverToDriverMessages(driver1Id: string, driver2Id: string): ChatMessage[] {
    return this.messages
      .filter(msg =>
        (msg.senderId === driver1Id && msg.recipientId === driver2Id) ||
        (msg.senderId === driver2Id && msg.recipientId === driver1Id)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Wszystkie wiadomości dla kierowcy (fallback)
  getDriverMessages(driverId: string): ChatMessage[] {
    return this.messages
      .filter(msg => msg.senderId === driverId || msg.recipientId === driverId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Nowe nieprzeczytane wiadomości przychodzące do kierowcy (do popup queue)
  getNewIncomingMessages(driverId: string): ChatMessage[] {
    return this.messages.filter(msg =>
      msg.recipientId === driverId &&
      msg.senderId !== driverId &&
      !msg.isRead
    );
  }

  getDriverUnreadCount(driverId: string): number {
    return this.messages.filter(msg =>
      msg.recipientId === driverId && !msg.isRead
    ).length;
  }

  // Wyślij wiadomość
  async sendMessage(
    senderId: string,
    senderName: string,
    senderType: 'driver' | 'dispatcher',
    recipientId: string,
    recipientName: string,
    conversationTypeOrContent: string,
    content?: string
  ): Promise<boolean> {
    const messageContent = content ?? conversationTypeOrContent;
    const conversationType = content !== undefined ? conversationTypeOrContent : null;
    const actualRecipientId = recipientId === 'base' ? 'dispatcher_master' : recipientId;

    // Określ receiver_type na podstawie typu konwersacji lub domyślnie
    let receiverType: string;
    if (conversationType === 'driver') {
      receiverType = 'driver';
    } else if (conversationType === 'dispatcher' || conversationType === 'base' || recipientId === 'base') {
      receiverType = 'dispatcher';
    } else {
      receiverType = senderType === 'driver' ? 'dispatcher' : 'driver';
    }

    try {
      const res = await fetch(`${API}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id:     senderId,
          sender_type:   senderType,
          receiver_id:   actualRecipientId,
          receiver_type: receiverType,
          message:       messageContent,
          sender_name:   senderName,
          receiver_name: recipientName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await this.loadMessages();
        return true;
      }
      throw new Error(data.error || 'Nie udało się wysłać wiadomości');
    } catch (error) {
      console.error('[ChatService] Error sending message:', error);
      throw error;
    }
  }

  // Oznacz jako przeczytane
  async markAsRead(messageIds: string[]) {
    if (messageIds.length === 0) return;
    try {
      await fetch(`${API}/api/chat/messages/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: messageIds }),
      });
      messageIds.forEach(id => {
        const msg = this.messages.find(m => m.id === id);
        if (msg) msg.isRead = true;
      });
      this.notifyListeners();
    } catch (error) {
      console.error('[ChatService] markAsRead error:', error);
    }
  }

  async markDispatcheryAsRead(driverId: string) {
    const ids = this.messages
      .filter(msg => msg.recipientId === driverId && msg.senderType === 'dispatcher' && !msg.isRead)
      .map(msg => msg.id);
    if (ids.length > 0) await this.markAsRead(ids);
  }

  async markDriverConversationAsRead(driverId: string, otherId: string) {
    const ids = this.messages
      .filter(msg => msg.senderId === otherId && msg.recipientId === driverId && !msg.isRead)
      .map(msg => msg.id);
    if (ids.length > 0) await this.markAsRead(ids);
  }

  async markConversationAsRead(
    userId: string,
    _userType: string,
    _conversationId: string,
    _conversationType: string
  ) {
    const ids = this.messages
      .filter(msg => msg.recipientId === userId && !msg.isRead)
      .map(msg => msg.id);
    if (ids.length > 0) await this.markAsRead(ids);
  }

  getAllDrivers(): Array<{ id: string; name: string; code: string; isOnline: boolean }> {
    const driverIds = new Set<string>();
    this.messages.forEach(msg => {
      if (msg.senderType === 'driver') driverIds.add(msg.senderId);
      if (msg.recipientType === 'driver' && msg.recipientId) driverIds.add(msg.recipientId);
    });
    const drivers: Array<{ id: string; name: string; code: string; isOnline: boolean }> = [];
    driverIds.forEach(id => {
      const msg = this.messages.find(m =>
        (m.senderId === id && m.senderType === 'driver') || m.recipientId === id
      );
      if (msg) {
        drivers.push({
          id,
          name: msg.senderType === 'driver' && msg.senderId === id ? msg.senderName : msg.recipientName,
          code: id.substring(0, 3).toUpperCase(),
          isOnline: true,
        });
      }
    });
    return drivers;
  }

  // Konwersacje między kierowcami (dla danego kierowcy)
  getDriverOnlyConversations(driverId: string): Conversation[] {
    const conversations = new Map<string, Conversation>();

    this.messages.forEach(msg => {
      // Wiadomości driver-to-driver: oba uczestnicy to kierowcy
      const isDriverToDriver =
        msg.senderType === 'driver' && msg.recipientType === 'driver' &&
        (msg.senderId === driverId || msg.recipientId === driverId);

      if (!isDriverToDriver) return;

      const otherId = msg.senderId === driverId ? msg.recipientId : msg.senderId;
      const otherName = msg.senderId === driverId ? msg.recipientName : msg.senderName;
      const otherCode = msg.senderId === driverId ? '' : ((msg as any).senderDriverCode || '');

      if (!otherId) return;

      const existing = conversations.get(otherId);
      const isNewer = !existing || new Date(msg.timestamp) > new Date(existing.lastMessageTime);
      if (isNewer) {
        conversations.set(otherId, {
          id: otherId,
          participantId: otherId,
          participantName: otherName || otherId,
          participantCode: otherCode,
          participantType: 'driver',
          lastMessage: msg.content,
          lastMessageTime: msg.timestamp,
          unreadCount: 0,
        });
      }
    });

    conversations.forEach((conv, otherId) => {
      conv.unreadCount = this.messages.filter(msg =>
        msg.senderId === otherId && msg.recipientId === driverId && !msg.isRead
      ).length;
    });

    return Array.from(conversations.values())
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  }

  getUnreadFromDispatchery(driverId: string): number {
    return this.messages.filter(msg =>
      msg.recipientId === driverId && msg.senderType === 'dispatcher' && !msg.isRead
    ).length;
  }

  destroy() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
  }
}

export const chatService = new ChatService();
