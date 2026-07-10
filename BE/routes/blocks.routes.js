import { Router } from 'express';
import {
  getBlocksForDriver,
  getBlocksForClient,
  createBlock,
  getBlocksByPhone,
  deleteBlock,
  searchDrivers,
  searchClients,
} from '../controllers/blocks.controller.js';

const router = Router();

router.get('/api/admin/blocks/driver/:driverId', getBlocksForDriver);
router.get('/api/admin/blocks/client/:clientId', getBlocksForClient);
router.post('/api/admin/blocks', createBlock);
router.get('/api/driver-client-blocks/by-phone/:phone', getBlocksByPhone);
router.delete('/api/admin/blocks/:id', deleteBlock);
router.get('/api/admin/drivers-search', searchDrivers);
router.get('/api/admin/clients-search', searchClients);

export default router;
