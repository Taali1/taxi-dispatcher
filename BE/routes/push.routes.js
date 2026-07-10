import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/push.controller.js';

const router = Router();

router.get('/api/push/vapid-key', getVapidKey);
router.post('/api/push/subscribe', subscribe);
router.delete('/api/push/unsubscribe', unsubscribe);

export default router;
