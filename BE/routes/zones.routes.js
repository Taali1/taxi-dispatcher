import { Router } from 'express';
import {
  detectZone,
  listZones,
  getZonesSimData,
  getAllZoneRules,
  cleanupZoneRules,
  deleteZoneRulesForSource,
  getZoneRulesForSource,
  putZoneRulesForSource,
} from '../controllers/zones.controller.js';

const router = Router();

router.get('/api/zones/detect', detectZone);
router.get('/api/zones', listZones);
router.get('/api/zones/sim-data', getZonesSimData);

router.get('/api/admin/zone-rules', getAllZoneRules);
router.delete('/api/admin/zone-rules/cleanup', cleanupZoneRules);
router.delete('/api/admin/zone-rules/:sourceZone', deleteZoneRulesForSource);
router.get('/api/admin/zone-rules/:sourceZone', getZoneRulesForSource);
router.put('/api/admin/zone-rules/:sourceZone', putZoneRulesForSource);

export default router;
