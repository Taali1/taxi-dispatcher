import { Router } from 'express';

export function createDatabaseRouter(deps) {
  const router = Router();
  const ctrl = deps.controllers.database;

  router.post('/api/test-connection', ctrl.testConnection);
  router.post('/api/query', ctrl.query);
  router.get('/api/tables', ctrl.listTables);
  router.get('/api/table/:tableName', ctrl.getTable);
  router.post('/api/insert/:tableName', ctrl.insert);
  router.put('/api/update/:tableName/:id', ctrl.update);
  router.delete('/api/delete/:tableName/:id', ctrl.remove);

  return router;
}
