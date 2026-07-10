import { Router } from 'express';
import {
  seedTestDrivers,
  simTestOrder,
  simSetState,
  simUpdateLocation,
  sqlUpload,
  migrate,
} from '../controllers/admin.controller.js';

const router = Router();

router.post('/api/admin/seed-test-drivers', seedTestDrivers);
router.post('/api/admin/sim/test-order', simTestOrder);
router.post('/api/admin/sim/set-state', simSetState);
router.post('/api/admin/sim/location', simUpdateLocation);
router.post('/api/sql-upload', sqlUpload);
router.post('/api/migrate', migrate);

export default router;
