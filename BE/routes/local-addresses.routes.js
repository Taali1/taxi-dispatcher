import { Router } from 'express';
import {
  getAllAddresses,
  getAdminAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/local-addresses.controller.js';

const router = Router();

router.get('/api/local-addresses/all', getAllAddresses);
router.get('/api/admin/local-addresses', getAdminAddresses);
router.post('/api/admin/local-addresses', createAddress);
router.put('/api/admin/local-addresses/:id', updateAddress);
router.delete('/api/admin/local-addresses/:id', deleteAddress);

export default router;
