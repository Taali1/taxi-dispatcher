import { Router } from 'express';
import { getChatMessages, postChatMessage, markChatMessagesRead } from '../controllers/chat.controller.js';

const router = Router();

router.get('/api/chat/messages', getChatMessages);
router.post('/api/chat/messages', postChatMessage);
router.patch('/api/chat/messages/read', markChatMessagesRead);

export default router;
