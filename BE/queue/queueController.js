// ============================================================================
// QueueController — obsługa HTTP dla endpointów kolejkowania
// ============================================================================

export function createQueueController({ queueService }) {

  /**
   * POST /api/drivers/:driverId/enter-zone
   * Body: { driverState: 'wolna'|'dojazd'|'kursem', zoneNumber?: number }
   *
   * wolna/dojazd  — backend sam wykrywa strefę z GPS
   * kursem        — zoneNumber wymagany (kierowca podaje ręcznie)
   */
  async function enterZone(req, res) {
    const { driverId } = req.params;
    const { driverState, zoneNumber } = req.body;

    if (!driverId) {
      return res.status(400).json({ success: false, error: 'Brak driverId' });
    }
    if (!['wolna', 'dojazd', 'zajeta', 'kursem'].includes(driverState)) {
      return res.status(400).json({
        success: false,
        error: `Nieprawidłowy driverState: "${driverState}". Dozwolone: wolna, dojazd, zajeta, kursem`
      });
    }
    if (driverState === 'kursem' && !zoneNumber) {
      return res.status(400).json({ success: false, error: 'Dla stanu kursem wymagany jest numer rejonu (zoneNumber)' });
    }

    try {
      const result = await queueService.enterZone(driverId, driverState, zoneNumber ?? null);
      if (!result.success) {
        return res.status(422).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error('[QueueController] enterZone error:', err.message);
      return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
    }
  }

  /**
   * POST /api/drivers/:driverId/state
   * Body: { driverState: 'wolna'|'dojazd'|'kursem' }
   *
   * Zmienia stan w obecnej strefie bez jej zmiany.
   * Walidacja GPS dla wolna/dojazd.
   */
  async function changeState(req, res) {
    const { driverId } = req.params;
    const { driverState } = req.body;

    if (!driverId) {
      return res.status(400).json({ success: false, error: 'Brak driverId' });
    }
    if (!['wolna', 'dojazd', 'zajeta', 'kursem'].includes(driverState)) {
      return res.status(400).json({
        success: false,
        error: `Nieprawidłowy driverState: "${driverState}". Dozwolone: wolna, dojazd, zajeta, kursem`
      });
    }

    try {
      const result = await queueService.changeDriverState(driverId, driverState);
      if (!result.success) {
        return res.status(422).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error('[QueueController] changeState error:', err.message);
      return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
    }
  }

  /**
   * POST /api/drivers/:driverId/leave-zone
   * Wychodzi z kolejki (przycisk Dom).
   */
  async function leaveZone(req, res) {
    const { driverId } = req.params;

    if (!driverId) {
      return res.status(400).json({ success: false, error: 'Brak driverId' });
    }

    try {
      const result = await queueService.leaveZone(driverId);
      if (!result.success) {
        return res.status(422).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error('[QueueController] leaveZone error:', err.message);
      return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
    }
  }

  /**
   * GET /api/queue/zone/:zoneNumber
   * Zwraca posortowaną kolejkę kierowców w danej strefie.
   */
  async function getZoneQueue(req, res) {
    const zoneNumber = parseInt(req.params.zoneNumber);
    if (isNaN(zoneNumber)) {
      return res.status(400).json({ success: false, error: 'Nieprawidłowy numer strefy' });
    }

    try {
      const result = await queueService.getQueueForZone(zoneNumber);
      return res.json(result);
    } catch (err) {
      console.error('[QueueController] getZoneQueue error:', err.message);
      return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
    }
  }

  /**
   * GET /api/queue/all
   * Zwraca wszystkie kolejki ze wszystkich stref, pogrupowane.
   */
  async function getAllQueues(req, res) {
    try {
      const result = await queueService.getAllQueues();
      return res.json(result);
    } catch (err) {
      console.error('[QueueController] getAllQueues error:', err.message);
      return res.status(500).json({ success: false, error: 'Błąd serwera: ' + err.message });
    }
  }

  return { enterZone, changeState, leaveZone, getZoneQueue, getAllQueues };
}
