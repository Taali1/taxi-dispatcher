import { Router } from 'express';

export function createHealthRouter(deps) {
  const router = Router();
  const ctrl = deps.controllers.health;

  router.get('/health', ctrl.health);
  router.get('/api/restart-console', ctrl.restartConsole);
  router.post('/api/restart', ctrl.restart);
  router.post('/api/reconnect', ctrl.reconnect);

  return router;
}
