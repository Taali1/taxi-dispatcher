import { Router } from 'express';
import {
  getStatus,
  serviceAction,
  installStep,
  getConfig,
  postConfig,
  getLog,
  getChannels,
  runCli,
  getCdr,
} from '../controllers/asterisk.controller.js';

const router = Router();

router.get('/api/asterisk/status', getStatus);
router.post('/api/asterisk/service', serviceAction);
router.post('/api/asterisk/install/step', installStep);
router.get('/api/asterisk/config/:file', getConfig);
router.post('/api/asterisk/config/:file', postConfig);
router.get('/api/asterisk/log', getLog);
router.get('/api/asterisk/channels', getChannels);
router.post('/api/asterisk/cli', runCli);
router.get('/api/asterisk/cdr', getCdr);

export default router;
