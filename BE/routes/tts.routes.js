import { Router } from 'express';
import { textToSpeech } from '../controllers/tts.controller.js';

const router = Router();

router.post('/api/tts', textToSpeech);

export default router;
