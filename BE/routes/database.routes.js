import { Router } from 'express';
import {
  runQuery,
  getTables,
  getTableData,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
} from '../controllers/database.controller.js';

const router = Router();

router.post('/api/query', runQuery);
router.get('/api/tables', getTables);
router.get('/api/table/:tableName', getTableData);
router.post('/api/insert/:tableName', insertTableRow);
router.put('/api/update/:tableName/:id', updateTableRow);
router.delete('/api/delete/:tableName/:id', deleteTableRow);

export default router;
