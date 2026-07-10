import { Router } from 'express';
import { getTasks, createTask, updateTaskStatus, deleteTask } from '../controllers/tasks.controller.js';

const router = Router();

router.get('/api/tasks', getTasks);
router.post('/api/tasks', createTask);
router.patch('/api/tasks/:id/status', updateTaskStatus);
router.delete('/api/tasks/:id', deleteTask);

export default router;
