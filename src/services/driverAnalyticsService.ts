import {
  DriverHistoryData,
  DriverStatusHistoryEntry,
  QueueSession,
  ZoneTransition,
  DailyDriverStats,
  DriverActivitySummary
} from '../types/driverHistory';

class DriverAnalyticsService {
  private readonly HISTORY_PREFIX = 'taxi_driver_history_';
  private readonly MAX_HISTORY_DAYS = 90;

  private getHistoryKey(driverId: string): string {
    return `${this.HISTORY_PREFIX}${driverId}`;
  }

  getDriverHistory(driverId: string): DriverHistoryData {
    try {
      const data = localStorage.getItem(this.getHistoryKey(driverId));
      if (!data) {
        return this.initializeDriverHistory(driverId);
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('[getDriverHistory] Error loading history:', error);
      return this.initializeDriverHistory(driverId);
    }
  }

  private initializeDriverHistory(driverId: string): DriverHistoryData {
    const history: DriverHistoryData = {
      driverId,
      statusHistory: [],
      queueSessions: [],
      zoneTransitions: [],
      dailyStats: {},
      lastUpdated: new Date().toISOString()
    };
    this.saveDriverHistory(history);
    return history;
  }

  private saveDriverHistory(history: DriverHistoryData): void {
    try {
      history.lastUpdated = new Date().toISOString();
      localStorage.setItem(this.getHistoryKey(history.driverId), JSON.stringify(history));
      console.log('[saveDriverHistory] History saved for driver:', history.driverId);
    } catch (error) {
      console.error('[saveDriverHistory] Error saving history:', error);
    }
  }

  logStatusChange(
    driverId: string,
    status: 'free' | 'driving' | 'pickup' | 'busy' | 'home',
    zone: number | null,
    queuePosition: number | null,
    previousStatus?: string,
    location?: { lat: number; lng: number },
    orderId?: string
  ): void {
    const history = this.getDriverHistory(driverId);
    const now = new Date().toISOString();

    const lastEntry = history.statusHistory[history.statusHistory.length - 1];
    const duration = lastEntry
      ? new Date(now).getTime() - new Date(lastEntry.timestamp).getTime()
      : 0;

    const entry: DriverStatusHistoryEntry = {
      timestamp: now,
      status,
      zone,
      queuePosition,
      duration: Math.floor(duration / 1000),
      location,
      metadata: {
        orderId,
        previousStatus,
        reason: this.determineStatusChangeReason(previousStatus, status)
      }
    };

    history.statusHistory.push(entry);

    if (history.statusHistory.length > 10000) {
      history.statusHistory = history.statusHistory.slice(-5000);
    }

    this.updateDailyStats(history, entry);

    if (previousStatus && zone !== lastEntry?.zone) {
      this.logZoneTransition(history, lastEntry?.zone || null, zone, status, location);
    }

    if (status === 'free' && zone !== null) {
      this.startQueueSession(history, driverId, zone, queuePosition || 1);
    } else {
      this.endActiveQueueSessions(history, status === 'driving' ? 'order_assigned' : 'status_change', orderId);
    }

    this.saveDriverHistory(history);
    console.log('[logStatusChange] Status logged:', { driverId, status, zone, queuePosition });
  }

  private determineStatusChangeReason(previousStatus?: string, newStatus?: string): string {
    if (!previousStatus) return 'initial_status';
    if (previousStatus === 'home' && newStatus === 'free') return 'driver_available';
    if (newStatus === 'driving') return 'order_accepted';
    if (newStatus === 'pickup') return 'arriving_pickup';
    if (newStatus === 'home') return 'driver_offline';
    return 'status_update';
  }

  private logZoneTransition(
    history: DriverHistoryData,
    fromZone: number | null,
    toZone: number | null,
    status: 'free' | 'driving' | 'pickup' | 'busy' | 'home',
    location?: { lat: number; lng: number }
  ): void {
    const transition: ZoneTransition = {
      timestamp: new Date().toISOString(),
      fromZone,
      toZone,
      location,
      status
    };

    history.zoneTransitions.push(transition);

    if (history.zoneTransitions.length > 5000) {
      history.zoneTransitions = history.zoneTransitions.slice(-2500);
    }

    console.log('[logZoneTransition] Zone change logged:', { fromZone, toZone });
  }

  private startQueueSession(
    history: DriverHistoryData,
    driverId: string,
    zone: number,
    queuePosition: number
  ): void {
    const activeSession = history.queueSessions.find(s => s.endTime === null);
    if (activeSession && activeSession.zone === zone) {
      console.log('[startQueueSession] Session already active in zone:', zone);
      return;
    }

    if (activeSession) {
      this.endActiveQueueSessions(history, 'zone_change');
    }

    const session: QueueSession = {
      sessionId: crypto.randomUUID(),
      driverId,
      zone,
      startTime: new Date().toISOString(),
      endTime: null,
      startQueuePosition: queuePosition,
      endQueuePosition: null,
      waitDurationMinutes: null,
      exitReason: null
    };

    history.queueSessions.push(session);
    console.log('[startQueueSession] New queue session started:', { zone, queuePosition });
  }

  private endActiveQueueSessions(
    history: DriverHistoryData,
    exitReason: 'order_assigned' | 'status_change' | 'zone_change',
    orderId?: string
  ): void {
    const now = new Date();
    let sessionsEnded = 0;

    history.queueSessions.forEach(session => {
      if (session.endTime === null) {
        session.endTime = now.toISOString();
        session.exitReason = exitReason;
        session.orderId = orderId;

        const startTime = new Date(session.startTime);
        const durationMs = now.getTime() - startTime.getTime();
        session.waitDurationMinutes = Math.floor(durationMs / 60000);

        sessionsEnded++;
      }
    });

    if (sessionsEnded > 0) {
      console.log('[endActiveQueueSessions] Ended sessions:', sessionsEnded, 'Reason:', exitReason);
    }
  }

  updateQueuePosition(driverId: string, zone: number, queuePosition: number): void {
    const history = this.getDriverHistory(driverId);
    const activeSession = history.queueSessions.find(
      s => s.endTime === null && s.zone === zone
    );

    if (activeSession) {
      activeSession.endQueuePosition = queuePosition;
      this.saveDriverHistory(history);
    }
  }

  private updateDailyStats(history: DriverHistoryData, entry: DriverStatusHistoryEntry): void {
    const date = entry.timestamp.split('T')[0];

    if (!history.dailyStats[date]) {
      history.dailyStats[date] = {
        driverId: history.driverId,
        date,
        totalMinutesHome: 0,
        totalMinutesFree: 0,
        totalMinutesDriving: 0,
        totalMinutesPickup: 0,
        statusChanges: 0,
        zoneChanges: 0,
        queueSessions: 0,
        averageQueueWaitMinutes: 0,
        ordersCompleted: 0,
        zonesVisited: [],
        firstStatusChange: entry.timestamp,
        lastStatusChange: entry.timestamp
      };
    }

    const stats = history.dailyStats[date];
    stats.statusChanges++;
    stats.lastStatusChange = entry.timestamp;

    const durationMinutes = Math.floor(entry.duration / 60);
    switch (entry.metadata?.previousStatus) {
      case 'home':
        stats.totalMinutesHome += durationMinutes;
        break;
      case 'free':
        stats.totalMinutesFree += durationMinutes;
        break;
      case 'driving':
        stats.totalMinutesDriving += durationMinutes;
        if (entry.status === 'free' || entry.status === 'home') {
          stats.ordersCompleted++;
        }
        break;
      case 'pickup':
        stats.totalMinutesPickup += durationMinutes;
        break;
    }

    if (entry.zone !== null && !stats.zonesVisited.includes(entry.zone)) {
      stats.zonesVisited.push(entry.zone);
      stats.zoneChanges++;
    }

    const todaySessions = history.queueSessions.filter(
      s => s.startTime.startsWith(date) && s.endTime !== null
    );
    stats.queueSessions = todaySessions.length;

    if (todaySessions.length > 0) {
      const totalWait = todaySessions.reduce((sum, s) => sum + (s.waitDurationMinutes || 0), 0);
      stats.averageQueueWaitMinutes = Math.floor(totalWait / todaySessions.length);
    }

    this.cleanupOldStats(history);
  }

  private cleanupOldStats(history: DriverHistoryData): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.MAX_HISTORY_DAYS);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const dates = Object.keys(history.dailyStats);
    dates.forEach(date => {
      if (date < cutoffStr) {
        delete history.dailyStats[date];
      }
    });

    const cutoffTimestamp = cutoffDate.toISOString();
    history.statusHistory = history.statusHistory.filter(
      entry => entry.timestamp >= cutoffTimestamp
    );
    history.zoneTransitions = history.zoneTransitions.filter(
      transition => transition.timestamp >= cutoffTimestamp
    );
    history.queueSessions = history.queueSessions.filter(
      session => session.startTime >= cutoffTimestamp
    );
  }

  getDailyStats(driverId: string, date: string): DailyDriverStats | null {
    const history = this.getDriverHistory(driverId);
    return history.dailyStats[date] || null;
  }

  getTodayStats(driverId: string): DailyDriverStats {
    const today = new Date().toISOString().split('T')[0];
    const stats = this.getDailyStats(driverId, today);

    if (stats) {
      return stats;
    }

    return {
      driverId,
      date: today,
      totalMinutesHome: 0,
      totalMinutesFree: 0,
      totalMinutesDriving: 0,
      totalMinutesPickup: 0,
      statusChanges: 0,
      zoneChanges: 0,
      queueSessions: 0,
      averageQueueWaitMinutes: 0,
      ordersCompleted: 0,
      zonesVisited: []
    };
  }

  getQueueSessionHistory(driverId: string, limit: number = 50): QueueSession[] {
    const history = this.getDriverHistory(driverId);
    return history.queueSessions
      .filter(s => s.endTime !== null)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit);
  }

  getActiveQueueSession(driverId: string): QueueSession | null {
    const history = this.getDriverHistory(driverId);
    return history.queueSessions.find(s => s.endTime === null) || null;
  }

  getZoneTransitions(driverId: string, date: string): ZoneTransition[] {
    const history = this.getDriverHistory(driverId);
    return history.zoneTransitions.filter(t => t.timestamp.startsWith(date));
  }

  getStatusHistory(driverId: string, dateFrom?: string, dateTo?: string): DriverStatusHistoryEntry[] {
    const history = this.getDriverHistory(driverId);
    let filtered = history.statusHistory;

    if (dateFrom) {
      filtered = filtered.filter(entry => entry.timestamp >= dateFrom);
    }

    if (dateTo) {
      filtered = filtered.filter(entry => entry.timestamp <= dateTo);
    }

    return filtered;
  }

  getActivitySummary(driverId: string, currentStatus: {
    status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
    zone: number | null;
    queuePosition: number | null;
    statusChangedAt: string;
  }): DriverActivitySummary {
    const todayStats = this.getTodayStats(driverId);
    const activeSession = this.getActiveQueueSession(driverId);

    const now = new Date();
    const statusSince = new Date(currentStatus.statusChangedAt);
    const durationMs = now.getTime() - statusSince.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const sessionDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      currentStatus: currentStatus.status,
      currentZone: currentStatus.zone,
      currentQueuePosition: currentStatus.queuePosition,
      statusSince: currentStatus.statusChangedAt,
      currentSessionDuration: sessionDuration,
      todayStats,
      activeQueueSession: activeSession
    };
  }

  clearDriverHistory(driverId: string): void {
    localStorage.removeItem(this.getHistoryKey(driverId));
    console.log('[clearDriverHistory] History cleared for driver:', driverId);
  }

  exportDriverHistory(driverId: string): string {
    const history = this.getDriverHistory(driverId);
    return JSON.stringify(history, null, 2);
  }

  getAllDriversWithHistory(): string[] {
    const driverIds: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.HISTORY_PREFIX)) {
        driverIds.push(key.replace(this.HISTORY_PREFIX, ''));
      }
    }
    return driverIds;
  }
}

export const driverAnalyticsService = new DriverAnalyticsService();
