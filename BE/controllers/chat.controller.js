import * as chatRepo from '../repository/chat.repository.js';

export async function getChatMessages(req, res) {
  try {
    const rows = await chatRepo.listChatMessages();
    res.json({ success: true, data: rows ?? [] });
  } catch (error) {
    console.error('[Chat Messages] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function postChatMessage(req, res) {
  const { sender_id, sender_name, sender_type, receiver_id, receiver_name, receiver_type, message } = req.body;

  if (!sender_id || !sender_type || !message) {
    return res.status(400).json({ success: false, error: 'Sender ID, sender type, and message are required' });
  }

  try {
    await chatRepo.insertChatMessage([
      sender_id, sender_name || null, sender_type, receiver_id || null, receiver_name || null, receiver_type || null, message
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Chat Message] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function markChatMessagesRead(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'ids array required' });
  }
  try {
    await chatRepo.markMessagesRead(ids);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
