import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function textToSpeech(req, res) {
  const { text, voice = 'pl-PL-ZofiaNeural' } = req.body;
  if (!text) return res.status(400).json({ error: 'Brak tekstu' });

  const safeText = text.replace(/["\\]/g, "'").replace(/[\r\n]/g, ' ').trim().slice(0, 500);
  const safeVoice = String(voice).replace(/[^a-zA-Z0-9-]/g, '');
  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  const proc = spawn(
    'python', ['-m', 'edge_tts', '--voice', safeVoice, '--text', safeText, '--write-media', tmpFile],
    { windowsHide: true }
  );
  proc.on('error', (err) => {
    console.error('[TTS] spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'edge-tts niedostępne' });
  });
  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('[TTS] edge-tts exit code:', code);
      if (!res.headersSent) res.status(500).json({ error: 'edge-tts error code: ' + code });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(tmpFile, () => {}));
    stream.on('error', (e) => {
      console.error('[TTS] Stream error:', e.message);
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) res.status(500).json({ error: 'Błąd odczytu audio' });
    });
  });
}
