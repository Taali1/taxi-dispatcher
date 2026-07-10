import { Router } from 'express';
import {
  updateDriverLocation,
  listDrivers,
  listDriversAllInfo,
  getDriverDetail,
  listDriversForMap,
  getDriverLocations,
  recalculateZones,
  getDriverStatus,
  getPendingOrder,
  getActiveOrdersCount,
  getNextOrderExtended,
  getNextOrderBasic,
  getActiveOrder,
  driverLogin,
  driverLoginSingleSession,
  driverLogout,
  getDriverLogs,
  suspendDriver,
  setTaximeterEnabled,
  getTaximeterEnabled,
} from '../controllers/drivers.controller.js';

const router = Router();

router.post('/api/drivers/:driverId/location', updateDriverLocation);
router.get('/api/drivers', listDrivers);
router.get('/api/drivers/all-info', listDriversAllInfo);
router.get('/api/drivers/:id/detail', getDriverDetail);
router.get('/api/drivers/map', listDriversForMap);
router.get('/api/drivers/locations', getDriverLocations);
router.post('/api/drivers/recalculate-zones', recalculateZones);
router.get('/api/drivers/:driverId/status', getDriverStatus);
router.get('/api/drivers/:driverId/pending-order', getPendingOrder);
router.get('/api/drivers/:driverCode/active-orders-count', getActiveOrdersCount);
// UWAGA: w oryginalnym pliku istniały DWIE definicje tej samej trasy
// (/api/drivers/:driverId/next-order). Express wykonuje tylko pierwszą
// pasującą — zachowujemy tę samą kolejność rejestracji dla identycznego zachowania.
router.get('/api/drivers/:driverId/next-order', getNextOrderExtended);
router.get('/api/drivers/:driverId/active-order', getActiveOrder);
router.get('/api/drivers/:driverId/next-order', getNextOrderBasic);

// router.post('/api/auth/driver/login', driverLogin);
router.post('/api/auth/driver/login', driverLoginSingleSession);
router.post('/api/auth/driver/logout', driverLogout);

router.get('/api/drivers/:id/logs', getDriverLogs);
router.post('/api/drivers/:id/suspend', suspendDriver);

router.patch('/api/drivers/:id/taximeter-enabled', setTaximeterEnabled);
router.get('/api/drivers/:id/taximeter-enabled', getTaximeterEnabled);

export default router;
