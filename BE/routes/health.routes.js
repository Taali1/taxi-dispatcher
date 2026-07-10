import { Router } from 'express';
import {
  getHealth,
  getRestartConsole,
  restartServer,
  reconnectDatabase,
  testDbConnection,
} from '../controllers/health.controller.js';

const router = Router();

router.get('/health', getHealth);
router.get('/api/restart-console', getRestartConsole);
router.post('/api/restart', restartServer);
router.post('/api/reconnect', reconnectDatabase);
router.post('/api/test-connection', testDbConnection);

export default router;
