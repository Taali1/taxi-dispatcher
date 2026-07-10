import { Router } from 'express';
import { getDriverNotifications, markNotificationRead } from '../controllers/notifications.controller.js';

const router = Router();

router.get('/api/driver-notifications', getDriverNotifications);
router.post('/api/driver-notifications/:id/read', markNotificationRead);

export default router;
