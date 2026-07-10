import { Router } from 'express';
import {
  getAnnouncements,
  postAnnouncement,
  getLatestAnnouncements,
  confirmAnnouncement,
} from '../controllers/announcements.controller.js';

const router = Router();

router.get('/api/announcements', getAnnouncements);
router.post('/api/announcements', postAnnouncement);
router.get('/api/announcements/latest', getLatestAnnouncements);
router.post('/api/announcements/:id/confirm', confirmAnnouncement);

export default router;
