import { Router } from 'express';
import { getDriverRegistrations, registerForGielda } from '../controllers/gielda.controller.js';

const router = Router();

router.get('/api/gielda/driver-registrations/:driverId', getDriverRegistrations);
router.post('/api/gielda/register', registerForGielda);

export default router;
