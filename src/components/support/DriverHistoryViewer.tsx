import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Activity, Download, User, Calendar, TrendingUp } from 'lucide-react';
import { driverAnalyticsService } from '../../services/driverAnalyticsService';
import { driverQueueService } from '../../services/driverQueueService';
import { DriverHistoryData, DailyDriverStats } from '../../types/driverHistory';
import { userService } from '../../services/userService';

const DriverHistoryViewer: React.FC = () => {
  const [allDrivers, setAllDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [driverHistory, setDriverHistory] = useState<DriverHistoryData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'overview' | 'daily' | 'sessions' | 'transitions'>('overview');

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    if (selectedDriverId) {
      loadDriverHistory(selectedDriverId);
    }
  }, [selectedDriverId]);

  const loadDrivers = () => {
    const drivers = userService.getDrivers();
    setAllDrivers(drivers);
    if (drivers.length > 0 && !selectedDriverId) {
      setSelectedDriverId(drivers[0].id);
    }
  };

  const loadDriverHistory = (driverId: string) => {
    const history = driverAnalyticsService.getDriverHistory(driverId);
    setDriverHistory(history);
  };

  const handleExportHistory = () => {
    if (!selectedDriverId) return;

    const jsonData = driverAnalyticsService.exportDriverHistory(selectedDriverId);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver_history_${selectedDriverId}_${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('pl-PL');
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'free': return 'bg-green-500/20 text-green-400';
      case 'driving': return 'bg-blue-500/20 text-blue-400';
      case 'pickup': return 'bg-yellow-500/20 text-yellow-400';
      case 'home': return 'bg-slate-500/20 text-slate-400';
      default: return 'bg-slate-500/20 text-slate-400';
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

  const renderOverview = () => {
    if (!driverHistory) return null;

    const totalEntries = driverHistory.statusHistory.length;
    const totalSessions = driverHistory.queueSessions.length;
    const totalTransitions = driverHistory.zoneTransitions.length;
    const daysWithData = Object.keys(driverHistory.dailyStats).length;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-blue-400" />
              <div className="text-sm text-slate-400">Zmian statusu</div>
            </div>
            <div className="text-2xl font-bold text-white">{totalEntries}</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <div className="text-sm text-slate-400">Sesji w kolejce</div>
            </div>
            <div className="text-2xl font-bold text-white">{totalSessions}</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-green-400" />
              <div className="text-sm text-slate-400">Zmian strefy</div>
            </div>
            <div className="text-2xl font-bold text-white">{totalTransitions}</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-orange-400" />
              <div className="text-sm text-slate-400">Dni z danymi</div>
            </div>
            <div className="text-2xl font-bold text-white">{daysWithData}</div>
          </div>
        </div>

        <div className="bg-slate-700 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Statystyki dzienne
          </h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(driverHistory.dailyStats)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, stats]) => (
                <div key={date} className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-white">{formatDate(date)}</div>
                    <div className="text-sm text-slate-400">
                      {stats.ordersCompleted} zleceń • {stats.statusChanges} zmian
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <div className="text-slate-400">W kolejce</div>
                      <div className="text-green-400 font-semibold">{formatDuration(stats.totalMinutesFree)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">W trasie</div>
                      <div className="text-blue-400 font-semibold">{formatDuration(stats.totalMinutesDriving)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Do odbioru</div>
                      <div className="text-yellow-400 font-semibold">{formatDuration(stats.totalMinutesPickup)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">W domu</div>
                      <div className="text-slate-400 font-semibold">{formatDuration(stats.totalMinutesHome)}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDailyView = () => {
    if (!driverHistory) return null;

    const dailyStats = driverHistory.dailyStats[selectedDate];
    const statusHistory = driverHistory.statusHistory.filter(entry =>
      entry.timestamp.startsWith(selectedDate)
    ).reverse();

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="text-slate-400">
            {statusHistory.length} zmian statusu
          </div>
        </div>

        {dailyStats && (
          <div className="bg-slate-700 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Podsumowanie dnia</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-sm text-slate-400">Zleceń</div>
                <div className="text-2xl font-bold text-white">{dailyStats.ordersCompleted}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-sm text-slate-400">Sesji w kolejce</div>
                <div className="text-2xl font-bold text-white">{dailyStats.queueSessions}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-sm text-slate-400">Odwiedz. stref</div>
                <div className="text-2xl font-bold text-white">{dailyStats.zonesVisited.length}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-sm text-slate-400">Śr. oczekiwanie</div>
                <div className="text-2xl font-bold text-white">{formatDuration(dailyStats.averageQueueWaitMinutes)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-700 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Historia zmian statusu</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {statusHistory.map((entry, index) => (
              <div key={index} className="bg-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400 font-mono">{formatTime(entry.timestamp)}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(entry.status)}`}>
                      {getStatusLabel(entry.status)}
                    </span>
                    {entry.zone !== null && (
                      <span className="text-sm text-slate-300 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Strefa {entry.zone}
                      </span>
                    )}
                    {entry.queuePosition !== null && (
                      <span className="text-sm text-slate-400">Poz. #{entry.queuePosition}</span>
                    )}
                  </div>
                  {entry.duration > 0 && (
                    <span className="text-xs text-slate-500">
                      {formatDuration(Math.floor(entry.duration / 60))}
                    </span>
                  )}
                </div>
                {entry.metadata?.reason && (
                  <div className="text-xs text-slate-500 mt-1 ml-20">{entry.metadata.reason}</div>
                )}
              </div>
            ))}
            {statusHistory.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                Brak danych dla wybranej daty
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSessions = () => {
    if (!driverHistory) return null;

    const sessions = driverHistory.queueSessions
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return (
      <div className="bg-slate-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Wszystkie sesje w kolejkach</h4>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {sessions.map((session) => (
            <div key={session.sessionId} className="bg-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="text-white font-semibold">Strefa {session.zone}</span>
                </div>
                <span className="text-sm text-slate-400">
                  {formatDate(session.startTime)} {formatTime(session.startTime)}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-slate-400">Start pozycja</div>
                  <div className="text-white font-semibold">#{session.startQueuePosition}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Koniec pozycja</div>
                  <div className="text-white font-semibold">
                    {session.endQueuePosition !== null ? `#${session.endQueuePosition}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Czas oczekiwania</div>
                  <div className="text-white font-semibold">
                    {session.waitDurationMinutes !== null ? formatDuration(session.waitDurationMinutes) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Status</div>
                  <div className="text-white font-semibold text-xs">
                    {session.endTime ? (
                      session.exitReason === 'order_assigned' ? '✓ Zlecenie' :
                      session.exitReason === 'zone_change' ? '→ Zmiana strefy' :
                      session.exitReason === 'status_change' ? '◆ Zmiana statusu' : 'Zakończona'
                    ) : (
                      <span className="text-green-400">● Aktywna</span>
                    )}
                  </div>
                </div>
              </div>

              {session.orderId && (
                <div className="mt-2 text-xs text-green-400">
                  Zlecenie: {session.orderId}
                </div>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              Brak sesji w kolejkach
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTransitions = () => {
    if (!driverHistory) return null;

    const transitions = driverHistory.zoneTransitions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
      <div className="bg-slate-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Zmiany stref</h4>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {transitions.map((transition, index) => (
            <div key={index} className="bg-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-400 font-mono">
                    {formatDate(transition.timestamp)} {formatTime(transition.timestamp)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">
                      {transition.fromZone !== null ? `Strefa ${transition.fromZone}` : 'Brak strefy'}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="text-white font-semibold">
                      {transition.toZone !== null ? `Strefa ${transition.toZone}` : 'Brak strefy'}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(transition.status)}`}>
                    {getStatusLabel(transition.status)}
                  </span>
                </div>
              </div>
              {transition.location && (
                <div className="text-xs text-slate-500 mt-2">
                  Lokalizacja: {transition.location.lat.toFixed(6)}, {transition.location.lng.toFixed(6)}
                </div>
              )}
            </div>
          ))}
          {transitions.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              Brak zmian stref
            </div>
          )}
        </div>
      </div>
    );
  };

  const selectedDriver = allDrivers.find(d => d.id === selectedDriverId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">Historia Aktywności Kierowców</h3>
          <p className="text-slate-400">Przeglądaj szczegółową historię i statystyki z localStorage</p>
        </div>
        <button
          onClick={handleExportHistory}
          disabled={!selectedDriverId}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Eksportuj JSON
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-4 mb-6">
          <User className="w-5 h-5 text-blue-400" />
          <label className="text-sm font-medium text-slate-300">Wybierz kierowcę:</label>
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="flex-1 max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Wybierz kierowcę --</option>
            {allDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} ({driver.driverCode})
              </option>
            ))}
          </select>
        </div>

        {selectedDriver && (
          <div className="bg-slate-700 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Imię i nazwisko</div>
                <div className="text-white font-semibold">{selectedDriver.name}</div>
              </div>
              <div>
                <div className="text-slate-400">Kod kierowcy</div>
                <div className="text-white font-semibold">{selectedDriver.driverCode}</div>
              </div>
              <div>
                <div className="text-slate-400">Email</div>
                <div className="text-white font-semibold">{selectedDriver.email}</div>
              </div>
              <div>
                <div className="text-slate-400">ID</div>
                <div className="text-white font-mono text-xs">{selectedDriver.id}</div>
              </div>
            </div>
          </div>
        )}

        {selectedDriverId && (
          <>
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              <button
                onClick={() => setViewMode('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'overview'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Activity className="w-4 h-4 inline mr-2" />
                Przegląd
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'daily'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Calendar className="w-4 h-4 inline mr-2" />
                Dzień po dniu
              </button>
              <button
                onClick={() => setViewMode('sessions')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'sessions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Clock className="w-4 h-4 inline mr-2" />
                Sesje w kolejkach
              </button>
              <button
                onClick={() => setViewMode('transitions')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'transitions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <MapPin className="w-4 h-4 inline mr-2" />
                Zmiany stref
              </button>
            </div>

            {viewMode === 'overview' && renderOverview()}
            {viewMode === 'daily' && renderDailyView()}
            {viewMode === 'sessions' && renderSessions()}
            {viewMode === 'transitions' && renderTransitions()}
          </>
        )}

        {!selectedDriverId && (
          <div className="text-center text-slate-400 py-12">
            Wybierz kierowcę aby zobaczyć historię
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverHistoryViewer;
