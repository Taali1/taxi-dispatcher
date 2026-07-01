import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, MapPin, Activity, TrendingUp, List } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { driverAnalyticsService } from '../../services/driverAnalyticsService';
import { driverQueueService } from '../../services/driverQueueService';
import { DailyDriverStats, QueueSession, DriverStatusHistoryEntry } from '../../types/driverHistory';

const DriverReport: React.FC = () => {
  const { user } = useAuth();
  const [todayStats, setTodayStats] = useState<DailyDriverStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<QueueSession[]>([]);
  const [statusHistory, setStatusHistory] = useState<DriverStatusHistoryEntry[]>([]);
  const [selectedView, setSelectedView] = useState<'today' | 'history' | 'sessions' | 'emergency'>('today');

  useEffect(() => {
    if (!user?.id) return;

    loadDriverData();

    const interval = setInterval(loadDriverData, 10000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const loadDriverData = async () => {
    if (!user?.id) return;

    const stats = driverAnalyticsService.getTodayStats(user.id);
    setTodayStats(stats);

    const sessions = driverAnalyticsService.getQueueSessionHistory(user.id, 20);
    setRecentSessions(sessions);

    const today = new Date().toISOString().split('T')[0];
    const history = driverAnalyticsService.getStatusHistory(user.id, today);
    setStatusHistory(history.reverse());
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'free': return 'bg-emerald-500/20 text-emerald-400';
      case 'driving': return 'bg-blue-500/20 text-blue-400';
      case 'pickup': return 'bg-amber-500/20 text-amber-400';
      case 'home': return 'bg-[#82818F]/20 text-[#ACACB9]';
      default: return 'bg-[#82818F]/20 text-[#ACACB9]';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'free': return 'Wolny';
      case 'driving': return 'W trasie';
      case 'pickup': return 'Do odbioru';
      case 'home': return 'W domu';
      default: return status;
    }
  };

  const renderTodayStats = () => {
    if (!todayStats) {
      return (
        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <p className="text-[#ACACB9]">Ładowanie statystyk...</p>
        </div>
      );
    }

    const totalMinutes = todayStats.totalMinutesHome + todayStats.totalMinutesFree +
                         todayStats.totalMinutesDriving + todayStats.totalMinutesPickup;

    return (
      <div className="space-y-4">
        <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-6 h-6 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Statystyki dzisiejszego dnia</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="text-2xl font-bold text-white">{todayStats.ordersCompleted}</div>
              <div className="text-sm text-[#ACACB9]">Wykonanych zleceń</div>
            </div>
            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="text-2xl font-bold text-white">{todayStats.statusChanges}</div>
              <div className="text-sm text-[#ACACB9]">Zmian statusu</div>
            </div>
            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="text-2xl font-bold text-white">{todayStats.queueSessions}</div>
              <div className="text-sm text-[#ACACB9]">Sesji w kolejce</div>
            </div>
            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="text-2xl font-bold text-white">{todayStats.zonesVisited.length}</div>
              <div className="text-sm text-[#ACACB9]">Odwiedzonych stref</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#ACACB9]">Czas wolny (w kolejce)</span>
                <span className="text-white font-semibold">{formatDuration(todayStats.totalMinutesFree)}</span>
              </div>
              {totalMinutes > 0 && (
                <div className="w-full bg-[#4D4D59] rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${(todayStats.totalMinutesFree / totalMinutes) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#ACACB9]">Czas w trasie</span>
                <span className="text-white font-semibold">{formatDuration(todayStats.totalMinutesDriving)}</span>
              </div>
              {totalMinutes > 0 && (
                <div className="w-full bg-[#4D4D59] rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(todayStats.totalMinutesDriving / totalMinutes) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#ACACB9]">Czas odbioru pasażera</span>
                <span className="text-white font-semibold">{formatDuration(todayStats.totalMinutesPickup)}</span>
              </div>
              {totalMinutes > 0 && (
                <div className="w-full bg-[#4D4D59] rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full"
                    style={{ width: `${(todayStats.totalMinutesPickup / totalMinutes) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="bg-[#2B2B36] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#ACACB9]">Czas w domu (offline)</span>
                <span className="text-white font-semibold">{formatDuration(todayStats.totalMinutesHome)}</span>
              </div>
              {totalMinutes > 0 && (
                <div className="w-full bg-[#4D4D59] rounded-full h-2">
                  <div
                    className="bg-[#82818F] h-2 rounded-full"
                    style={{ width: `${(todayStats.totalMinutesHome / totalMinutes) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {todayStats.averageQueueWaitMinutes > 0 && (
            <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-[10px] p-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Średni czas oczekiwania: {formatDuration(todayStats.averageQueueWaitMinutes)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQueueSessions = () => {
    return (
      <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
        <div className="flex items-center gap-3 mb-4">
          <List className="w-6 h-6 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Historia sesji w kolejkach</h3>
        </div>

        {recentSessions.length === 0 ? (
          <p className="text-[#ACACB9]">Brak sesji do wyświetlenia</p>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <div key={session.sessionId} className="bg-[#2B2B36] rounded-[10px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#ACACB9]" />
                    <span className="text-white font-semibold">Strefa {session.zone}</span>
                  </div>
                  <span className="text-sm text-[#ACACB9]">
                    {formatTime(session.startTime)} - {session.endTime ? formatTime(session.endTime) : 'w trakcie'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <div className="text-xs text-[#ACACB9]">Pozycja start</div>
                    <div className="text-white font-semibold">#{session.startQueuePosition}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#ACACB9]">Czas oczekiwania</div>
                    <div className="text-white font-semibold">
                      {session.waitDurationMinutes !== null ? formatDuration(session.waitDurationMinutes) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#ACACB9]">Powód wyjścia</div>
                    <div className="text-white font-semibold text-xs">
                      {session.exitReason === 'order_assigned' ? 'Zlecenie' :
                       session.exitReason === 'zone_change' ? 'Zmiana strefy' :
                       session.exitReason === 'status_change' ? 'Zmiana statusu' : '-'}
                    </div>
                  </div>
                </div>

                {session.orderId && (
                  <div className="mt-2 text-xs text-emerald-400">
                    ✓ Przydzielono zlecenie
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStatusHistory = () => {
    return (
      <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-6 h-6 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Historia zmian statusu (dzisiaj)</h3>
        </div>

        {statusHistory.length === 0 ? (
          <p className="text-[#ACACB9]">Brak historii do wyświetlenia</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {statusHistory.map((entry, index) => (
              <div key={index} className="bg-[#2B2B36] rounded-[10px] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[#ACACB9]">{formatTime(entry.timestamp)}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(entry.status)}`}>
                      {getStatusLabel(entry.status)}
                    </span>
                    {entry.zone !== null && (
                      <span className="text-sm text-[#CAC9D7]">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        Strefa {entry.zone}
                      </span>
                    )}
                    {entry.queuePosition !== null && (
                      <span className="text-sm text-[#ACACB9]">
                        Poz. #{entry.queuePosition}
                      </span>
                    )}
                  </div>
                  {entry.duration > 0 && (
                    <span className="text-xs text-[#82818F]">
                      {formatDuration(Math.floor(entry.duration / 60))}
                    </span>
                  )}
                </div>
                {entry.metadata?.reason && (
                  <div className="text-xs text-[#82818F] mt-1">
                    {entry.metadata.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEmergencyContacts = () => {
    return (
      <div className="bg-[#21222D] rounded-[10px] p-4 border border-[#2B2B36]">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Kontakty awaryjne</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[#2B2B36] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Dyspozytornia</span>
              <p className="text-xs text-[#ACACB9]">Całodobowy kontakt</p>
            </div>
            <a
              href="tel:+48123456789"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-[10px] text-sm transition-colors duration-200"
            >
              Zadzwoń
            </a>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#2B2B36] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Pomoc drogowa</span>
              <p className="text-xs text-[#ACACB9]">Awarie i holowanie</p>
            </div>
            <a
              href="tel:+48987654321"
              className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-[10px] text-sm transition-colors duration-200"
            >
              Zadzwoń
            </a>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#2B2B36] rounded-[10px]">
            <div>
              <span className="text-white font-medium">Numer alarmowy</span>
              <p className="text-xs text-[#ACACB9]">Policja, straż, pogotowie</p>
            </div>
            <a
              href="tel:112"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-[10px] text-sm transition-colors duration-200"
            >
              112
            </a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedView('today')}
          className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-colors whitespace-nowrap border ${
            selectedView === 'today'
              ? 'bg-[#2B2B36] text-blue-400 border-blue-500/30'
              : 'bg-[#21222D] text-[#ACACB9] border-[#2B2B36] hover:bg-[#2B2B36] hover:text-[#CAC9D7]'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          Dzisiaj
        </button>
        <button
          onClick={() => setSelectedView('sessions')}
          className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-colors whitespace-nowrap border ${
            selectedView === 'sessions'
              ? 'bg-[#2B2B36] text-blue-400 border-blue-500/30'
              : 'bg-[#21222D] text-[#ACACB9] border-[#2B2B36] hover:bg-[#2B2B36] hover:text-[#CAC9D7]'
          }`}
        >
          <List className="w-4 h-4 inline mr-2" />
          Kolejki
        </button>
        <button
          onClick={() => setSelectedView('history')}
          className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-colors whitespace-nowrap border ${
            selectedView === 'history'
              ? 'bg-[#2B2B36] text-blue-400 border-blue-500/30'
              : 'bg-[#21222D] text-[#ACACB9] border-[#2B2B36] hover:bg-[#2B2B36] hover:text-[#CAC9D7]'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Historia
        </button>
        <button
          onClick={() => setSelectedView('emergency')}
          className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-colors whitespace-nowrap border ${
            selectedView === 'emergency'
              ? 'bg-[#2B2B36] text-blue-400 border-blue-500/30'
              : 'bg-[#21222D] text-[#ACACB9] border-[#2B2B36] hover:bg-[#2B2B36] hover:text-[#CAC9D7]'
          }`}
        >
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Kontakty
        </button>
      </div>

      {selectedView === 'today' && renderTodayStats()}
      {selectedView === 'sessions' && renderQueueSessions()}
      {selectedView === 'history' && renderStatusHistory()}
      {selectedView === 'emergency' && renderEmergencyContacts()}
    </div>
  );
};

export default DriverReport;
