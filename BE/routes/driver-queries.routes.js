import { Router } from 'express';
import {
  createDriverQuery,
  getRecentAnswers,
  getPendingQuery,
  respondToQuery,
} from '../controllers/driver-queries.controller.js';

const router = Router();

router.post('/api/driver-queries', createDriverQuery);
router.get('/api/driver-queries/recent-answers', getRecentAnswers);
router.get('/api/driver-queries/:driverId/pending', getPendingQuery);
router.post('/api/driver-queries/:queryId/respond', respondToQuery);

export default router;
