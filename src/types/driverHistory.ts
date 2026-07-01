export interface DriverStatusHistoryEntry {
  timestamp: string;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  zone: number | null;
  queuePosition: number | null;
  duration: number;
  location?: {
    lat: number;
    lng: number;
  };
  metadata?: {
    orderId?: string;
    previousStatus?: string;
    reason?: string;
  };
}

export interface QueueSession {
  sessionId: string;
  driverId: string;
  zone: number;
  startTime: string;
  endTime: string | null;
  startQueuePosition: number;
  endQueuePosition: number | null;
  waitDurationMinutes: number | null;
  exitReason: 'order_assigned' | 'status_change' | 'zone_change' | null;
  orderId?: string;
}

export interface ZoneTransition {
  timestamp: string;
  fromZone: number | null;
  toZone: number | null;
  location?: {
    lat: number;
    lng: number;
  };
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
}

export interface DailyDriverStats {
  driverId: string;
  date: string;
  totalMinutesHome: number;
  totalMinutesFree: number;
  totalMinutesDriving: number;
  totalMinutesPickup: number;
  statusChanges: number;
  zoneChanges: number;
  queueSessions: number;
  averageQueueWaitMinutes: number;
  ordersCompleted: number;
  zonesVisited: number[];
  firstStatusChange?: string;
  lastStatusChange?: string;
}

export interface DriverHistoryData {
  driverId: string;
  statusHistory: DriverStatusHistoryEntry[];
  queueSessions: QueueSession[];
  zoneTransitions: ZoneTransition[];
  dailyStats: { [date: string]: DailyDriverStats };
  lastUpdated: string;
}

export interface DriverActivitySummary {
  currentStatus: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  currentZone: number | null;
  currentQueuePosition: number | null;
  statusSince: string;
  currentSessionDuration: string;
  todayStats: DailyDriverStats;
  activeQueueSession: QueueSession | null;
}
