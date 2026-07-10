import { Router } from 'express';
import {
  getSystemEvents,
  getEvents,
  getAdminSystemLogs,
  getAdminSystemLogTypes,
  postAdminSystemLog,
} from '../controllers/system-logs.controller.js';

const router = Router();

router.get('/api/system-events', getSystemEvents);
router.get('/api/events', getEvents);
router.get('/api/admin/system-logs', getAdminSystemLogs);
router.get('/api/admin/system-logs/types', getAdminSystemLogTypes);
router.post('/api/admin/system-logs', postAdminSystemLog);

export default router;
