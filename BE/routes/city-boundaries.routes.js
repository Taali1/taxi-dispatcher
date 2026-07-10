import { Router } from 'express';
import {
  listCityBoundaries,
  createCityBoundary,
  updateCityBoundary,
  deleteCityBoundary,
} from '../controllers/city-boundaries.controller.js';

const router = Router();

router.get('/api/city-boundaries', listCityBoundaries);
router.post('/api/city-boundaries', createCityBoundary);
router.put('/api/city-boundaries/:id', updateCityBoundary);
router.delete('/api/city-boundaries/:id', deleteCityBoundary);

export default router;
