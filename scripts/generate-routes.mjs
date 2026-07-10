/**
 * Generates modular route/controller/repository files from server.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverLines = fs.readFileSync(path.join(root, 'server.js'), 'utf8').split('\n');

const domains = [
  { name: 'health', start: 335, end: 410, prefix: '' },
  { name: 'database', start: 413, end: 670, prefix: '/api' },
  { name: 'drivers', start: 672, end: 1003, prefix: '/api' },
  { name: 'chat', start: 1006, end: 1056, prefix: '/api' },
  { name: 'announcements', start: 1087, end: 1247, prefix: '/api' },
  { name: 'auth', start: 1249, end: 1432, prefix: '/api' },
  { name: 'driverApp', start: 1440, end: 1870, prefix: '/api' },
  { name: 'orders', start: 1776, end: 2959, prefix: '/api' },
  { name: 'events', start: 2583, end: 2702, prefix: '/api' },
  { name: 'push', start: 4042, end: 4082, prefix: '/api' },
  { name: 'settings', start: 4087, end: 5190, prefix: '/api' },
  { name: 'zones', start: 4125, end: 4209, prefix: '/api' },
  { name: 'taximeter', start: 4216, end: 4387, prefix: '/api' },
  { name: 'blocks', start: 4394, end: 4503, prefix: '/api' },
  { name: 'zoneRules', start: 4505, end: 4684, prefix: '/api' },
  { name: 'localAddresses', start: 4686, end: 4758, prefix: '/api' },
  { name: 'systemLogs', start: 4763, end: 4878, prefix: '/api' },
  { name: 'sqlUpload', start: 4883, end: 4946, prefix: '/api' },
  { name: 'tasks', start: 4953, end: 5027, prefix: '/api' },
  { name: 'gielda', start: 5662, end: 5827, prefix: '/api' },
  { name: 'misc', start: 6001, end: 6108, prefix: '/api' },
];

function extract(start, end) {
  return serverLines.slice(start - 1, end).join('\n');
}

function transformHandlers(code) {
  return code
    .replace(/\bapp\.(get|post|put|patch|delete)\(/g, 'router.$1(')
    .replace(/\bsafeQuery\b/g, 'deps.db.safeQuery')
    .replace(/\bgetConnectionWithTimeout\b/g, 'deps.db.getConnectionWithTimeout')
    .replace(/\breconnectPool\b/g, 'deps.db.reconnectPool')
    .replace(/\bgetCached\b/g, 'deps.cache.getCached')
    .replace(/\bsetCache\b/g, 'deps.cache.setCache')
    .replace(/\bdetectZoneFromCoordinates\b/g, 'deps.zone.detectZoneFromCoordinates')
    .replace(/\baddOrderLog\b/g, 'deps.logging.addOrderLog')
    .replace(/\baddDriverLog\b/g, 'deps.logging.addDriverLog')
    .replace(/\baddSystemLog\b/g, 'deps.logging.addSystemLog')
    .replace(/\bredispatchOrder\b/g, 'deps.dispatch.redispatchOrder')
    .replace(/\bsendPushToDriver\b/g, 'deps.push.sendPushToDriver')
    .replace(/\bgenerateUUID\b/g, 'deps.helpers.generateUUID')
    .replace(/\bgenerateClientCode\b/g, 'deps.helpers.generateClientCode')
    .replace(/\bdetectZoneFromAddressKeywords\b/g, 'deps.helpers.detectZoneFromAddressKeywords')
    .replace(/\bnowPolish\b/g, 'deps.helpers.nowPolish')
    .replace(/\bhaversineKm\b/g, 'deps.helpers.haversineKm')
    .replace(/\bmigrateAnnouncements\b/g, 'deps.announcements.migrateAnnouncements')
    .replace(/\bannouncementsMigrated\b/g, 'deps.announcements.announcementsMigrated')
    .replace(/\bensureGieldaColumn\b/g, 'deps.gieldaSettings.ensureGieldaColumn')
    .replace(/\brunMigrationsWithReport\b/g, 'deps.migrations.runMigrationsWithReport')
    .replace(/\bVAPID_PUBLIC\b/g, 'deps.push.vapidPublic')
    .replace(/\bmysql\.createConnection\b/g, 'deps.mysql.createConnection');
}

for (const d of domains) {
  const raw = extract(d.start, d.end);
  const body = transformHandlers(raw);
  const routeFile = `import { Router } from 'express';

export function create${capitalize(d.name)}Router(deps) {
  const router = Router();
${body}
  return router;
}
`;
  const outDir = path.join(root, 'src', 'routes');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${d.name}Routes.js`), routeFile);
  console.log('Wrote', d.name, 'Routes.js');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

console.log('Done');
