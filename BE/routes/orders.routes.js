import { Router } from 'express';
import {
  getOrderLogs,
  acceptOrder,
  acceptNextOrder,
  rejectNextOrder,
  atPickupOrder,
  rejectOrder,
  getOrderStatusQuick,
  pickupOrder,
  completeOrder,
  finishOrder,
  updateOrder,
  listOrders,
  getOrderDetail,
  createOrder,
} from '../controllers/orders.controller.js';

const router = Router();

router.get('/api/orders/:orderId/logs', getOrderLogs);
router.post('/api/orders/:orderId/accept', acceptOrder);
router.post('/api/orders/:orderId/accept-next', acceptNextOrder);
router.post('/api/orders/:orderId/reject-next', rejectNextOrder);
router.post('/api/orders/:orderId/at-pickup', atPickupOrder);
router.post('/api/orders/:orderId/reject', rejectOrder);
router.get('/api/orders/:id/status', getOrderStatusQuick);
router.post('/api/orders/:orderId/pickup', pickupOrder);
router.post('/api/orders/:orderId/complete', completeOrder);
router.post('/api/orders/:id/finish', finishOrder);
router.post('/api/orders/:id/update', updateOrder);
router.get('/api/orders', listOrders);
router.get('/api/orders/:id', getOrderDetail);
router.post('/api/orders/create', createOrder);

export default router;
