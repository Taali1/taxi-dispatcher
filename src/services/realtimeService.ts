export class RealtimeService {
  private subscribers: Map<string, Function[]> = new Map();
  private mockData = {
    drivers: new Map(),
    orders: new Map(),
  };

  subscribe(channel: string, callback: Function): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel)!.push(callback);

    return () => {
      const callbacks = this.subscribers.get(channel) || [];
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  emit(channel: string, data: any): void {
    const callbacks = this.subscribers.get(channel) || [];
    callbacks.forEach(callback => callback(data));
  }

  // Driver location updates
  updateDriverLocation(driverId: string, location: { lat: number; lng: number }, zone: number): void {
    this.mockData.drivers.set(driverId, { location, zone, timestamp: new Date() });
    this.emit('driver_location_update', { driverId, location, zone });
  }

  // Order status updates
  updateOrderStatus(orderId: string, status: string, driverId?: string): void {
    this.mockData.orders.set(orderId, { status, driverId, timestamp: new Date() });
    this.emit('order_status_update', { orderId, status, driverId });
  }

  // Driver status updates
  updateDriverStatus(driverId: string, status: 'free' | 'driving' | 'pickup' | 'busy' | 'home'): void {
    this.emit('driver_status_update', { driverId, status });
  }

  // New order notifications
  notifyNewOrder(order: any, targetDrivers: string[]): void {
    targetDrivers.forEach(driverId => {
      this.emit(`driver_${driverId}_new_order`, order);
    });
  }

  // Chat messages
  sendChatMessage(chatId: string, message: any): void {
    this.emit(`chat_${chatId}_message`, message);
  }
}

export const realtimeService = new RealtimeService();