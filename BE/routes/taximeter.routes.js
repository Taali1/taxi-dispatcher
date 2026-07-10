import { Router } from 'express';
import {
  getTaximeterConfig,
  getPricingEstimate,
  getAdminTaximeterSettings,
  putAdminTaximeterSettings,
  getAdminTariffs,
  postAdminTariff,
  putAdminTariff,
  deleteAdminTariff,
  getAdminSurcharges,
  postAdminSurcharge,
  putAdminSurcharge,
  deleteAdminSurcharge,
} from '../controllers/taximeter.controller.js';

const router = Router();

router.get('/api/taximeter/config', getTaximeterConfig);
router.get('/api/pricing/estimate', getPricingEstimate);

router.get('/api/admin/taximeter/settings', getAdminTaximeterSettings);
router.put('/api/admin/taximeter/settings', putAdminTaximeterSettings);

router.get('/api/admin/taximeter/tariffs', getAdminTariffs);
router.post('/api/admin/taximeter/tariffs', postAdminTariff);
router.put('/api/admin/taximeter/tariffs/:id', putAdminTariff);
router.delete('/api/admin/taximeter/tariffs/:id', deleteAdminTariff);

router.get('/api/admin/taximeter/surcharges', getAdminSurcharges);
router.post('/api/admin/taximeter/surcharges', postAdminSurcharge);
router.put('/api/admin/taximeter/surcharges/:id', putAdminSurcharge);
router.delete('/api/admin/taximeter/surcharges/:id', deleteAdminSurcharge);

export default router;
