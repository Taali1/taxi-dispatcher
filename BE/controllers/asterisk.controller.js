import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import * as asteriskRepo from '../repository/asterisk.repository.js';

const ASTERISK_CONF_DIR = '/etc/asterisk';
const ASTERISK_LOG_FILE = '/var/log/asterisk/messages';
const ALLOWED_CONF_FILES = ['sip','pjsip','extensions','queues','manager','cdr','cdr_mysql','cdr_csv','logger','asterisk','musiconhold','voicemail','features','rtp','iax','http','indications'];

function runShell(cmd) {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', cmd], { timeout: 30000 });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    proc.on('error', err => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

// eslint-disable-next-line no-unused-vars
function amiCommand(host, port, username, secret, action, extraFields = {}) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let buffer = '';
    let done = false;
    const finish = (result) => { if (!done) { done = true; client.destroy(); resolve(result); } };
    client.setTimeout(8000);
    client.connect(port || 5038, host || '127.0.0.1', () => {
      let msg = `Action: Login\r\nUsername: ${username}\r\nSecret: ${secret}\r\n\r\nAction: ${action}\r\n`;
      for (const [k, v] of Object.entries(extraFields)) msg += `${k}: ${v}\r\n`;
      msg += '\r\n';
      client.write(msg);
    });
    client.on('data', d => { buffer += d.toString(); if (buffer.split('\r\n\r\n').length > 2) finish({ success: true, data: buffer }); });
    client.on('timeout', () => finish({ success: false, error: 'AMI timeout' }));
    client.on('error', e => finish({ success: false, error: e.message }));
  });
}

export async function getStatus(req, res) {
  try {
    const [installed, running, version] = await Promise.all([
      runShell('which asterisk 2>/dev/null && echo "yes" || echo "no"'),
      runShell('systemctl is-active asterisk 2>/dev/null || echo "inactive"'),
      runShell('asterisk -V 2>/dev/null || echo ""'),
    ]);
    res.json({
      success: true,
      installed: installed.stdout.includes('yes') || installed.stdout.includes('/asterisk'),
      running: running.stdout.trim() === 'active',
      version: version.stdout.trim(),
      status: running.stdout.trim(),
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}

export async function serviceAction(req, res) {
  const { action } = req.body;
  if (!['start','stop','restart','reload'].includes(action)) return res.json({ success: false, error: 'Invalid action' });
  const cmd = action === 'reload' ? 'asterisk -rx "core reload"' : `systemctl ${action} asterisk`;
  const result = await runShell(cmd);
  res.json({ success: result.code === 0, stdout: result.stdout, stderr: result.stderr, code: result.code });
}

export async function installStep(req, res) {
  const { step } = req.body;
  const commands = {
    update:  'DEBIAN_FRONTEND=noninteractive apt-get update 2>&1',
    install: 'DEBIAN_FRONTEND=noninteractive apt-get install -y asterisk 2>&1',
    modules: 'DEBIAN_FRONTEND=noninteractive apt-get install -y asterisk-modules asterisk-config 2>&1',
    enable:  'systemctl enable asterisk 2>&1',
    start:   'systemctl start asterisk 2>&1',
    status:  'systemctl status asterisk --no-pager 2>&1',
  };
  if (!commands[step]) return res.json({ success: false, error: 'Unknown step' });
  const result = await runShell(commands[step]);
  res.json({ success: result.code === 0, stdout: result.stdout, stderr: result.stderr, code: result.code });
}

export async function getConfig(req, res) {
  const name = req.params.file.replace(/[^a-z0-9_-]/gi, '');
  if (!ALLOWED_CONF_FILES.includes(name)) return res.json({ success: false, error: 'File not allowed' });
  const filePath = `${ASTERISK_CONF_DIR}/${name}.conf`;
  try {
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ success: true, content });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}

export async function postConfig(req, res) {
  const name = req.params.file.replace(/[^a-z0-9_-]/gi, '');
  if (!ALLOWED_CONF_FILES.includes(name)) return res.json({ success: false, error: 'File not allowed' });
  const { content } = req.body;
  if (typeof content !== 'string') return res.json({ success: false, error: 'No content' });
  const filePath = `${ASTERISK_CONF_DIR}/${name}.conf`;
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`);
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}

export async function getLog(req, res) {
  const lines = Math.min(parseInt(req.query.lines) || 200, 1000);
  try {
    const result = await runShell(`tail -n ${lines} ${ASTERISK_LOG_FILE} 2>/dev/null || echo "(brak logów — Asterisk nie zainstalowany lub plik nieistnieje)"`);
    res.json({ success: true, log: result.stdout });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}

export async function getChannels(req, res) {
  try {
    const [channels, peers] = await Promise.all([
      runShell('asterisk -rx "core show channels concise" 2>/dev/null || echo ""'),
      runShell('asterisk -rx "sip show peers" 2>/dev/null || echo ""'),
    ]);
    res.json({ success: true, channels: channels.stdout, peers: peers.stdout });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}

export async function runCli(req, res) {
  const { command } = req.body;
  if (!command || typeof command !== 'string') return res.json({ success: false, error: 'No command' });
  const safe = command.replace(/[`$(){}|;&<>]/g, '').slice(0, 200);
  const result = await runShell(`asterisk -rx "${safe}" 2>&1`);
  res.json({ success: true, output: result.stdout, stderr: result.stderr });
}

export async function getCdr(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const dbResult = await asteriskRepo.getCdrFromDb(limit).catch(() => null);
    if (dbResult && dbResult.length > 0) {
      return res.json({ success: true, source: 'db', cdr: dbResult });
    }
    const csvResult = await runShell(`tail -n ${limit} /var/log/asterisk/cdr-csv/Master.csv 2>/dev/null || echo ""`);
    res.json({ success: true, source: 'csv', cdr: csvResult.stdout });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}
