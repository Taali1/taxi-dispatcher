import { Router } from 'express';
import {
  getSettings,
  postSettings,
  getGieldaSettings,
  postGieldaSettings,
} from '../controllers/settings.controller.js';

const router = Router();

router.get('/api/settings', getSettings);
router.post('/api/settings', postSettings);
router.get('/api/settings/gielda', getGieldaSettings);
router.post('/api/settings/gielda', postGieldaSettings);

export default router;
