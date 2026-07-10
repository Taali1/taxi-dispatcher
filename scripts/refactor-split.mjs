/**
 * One-time script: splits server.js route blocks into modular files.
 * Run: node scripts/refactor-split.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const srcDir = path.join(root, 'src');

const content = fs.readFileSync(serverPath, 'utf8');
const lines = content.split('\n');

function extractLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Route line numbers (1-based, inclusive start of handler block)
const routeBlocks = {
  health: { start: 335, end: 397 },
  database: { start: 400, end: 670 },
  drivers: { start: 672, end: 1003 },
  chat: { start: 1006, end: 1056 },
  announcements: { start: 1087, end: 1247 },
  auth: { start: 1249, end: 1432 },
  driverApp: { start: 1440, end: 1870 },
  orders: { start: 1776, end: 2959, note: 'includes order lifecycle + create' },
  events: { start: 2583, end: 2702 },
  push: { start: 4042, end: 4082 },
  settings: { start: 4087, end: 4122 },
  zones: { start: 4125, end: 4209 },
  taximeter: { start: 4216, end: 4387 },
  blocks: { start: 4394, end: 4503 },
  zoneRules: { start: 4505, end: 4684 },
  localAddresses: { start: 4686, end: 4758 },
  systemLogs: { start: 4763, end: 4878 },
  sqlUpload: { start: 4883, end: 4946 },
  tasks: { start: 4953, end: 5027 },
  gieldaSettings: { start: 5068, end: 5190 },
  gielda: { start: 5662, end: 5827 },
  migrate: { start: 6001, end: 6011 },
  tts: { start: 6014, end: 6048 },
  driverQueries: { start: 6051, end: 6108 },
};

// Helper/non-route sections
const helperSections = {
  pool: { start: 41, end: 169 },
  healthCheck: { start: 175, end: 227 },
  cache: { start: 229, end: 252 },
  zoneDetection: { start: 254, end: 319 },
  middleware: { start: 323, end: 332 },
  logging: { start: 1873, end: 1906 },
  redispatch: { start: 1937, end: 2090 },
  helpers: { start: 2405, end: 2443 },
  migrateAnnouncements: { start: 1065, end: 1085 },
  nowPolish: { start: 1131, end: 1148 },
  migrations: { start: 2965, end: 4037 },
  ensureGieldaColumn: { start: 5030, end: 5065 },
  backgroundJobs: { start: 5196, end: 5645 },
  gieldaRegistrations: { start: 5830, end: 5998 },
  gracefulShutdown: { start: 6113, end: 6133 },
  start: { start: 6136, end: 6366 },
};

ensureDir(path.join(srcDir, 'db'));
ensureDir(path.join(srcDir, 'utils'));
ensureDir(path.join(srcDir, 'services'));
ensureDir(path.join(srcDir, 'repositories'));
ensureDir(path.join(srcDir, 'controllers'));
ensureDir(path.join(srcDir, 'routes'));

console.log('Extracted sections written to src/_extracted/ for manual assembly');
ensureDir(path.join(srcDir, '_extracted'));
for (const [name, sec] of Object.entries({ ...routeBlocks, ...helperSections })) {
  const text = extractLines(sec.start, sec.end);
  fs.writeFileSync(path.join(srcDir, '_extracted', `${name}.js.txt`), text);
  console.log(`  ${name}: lines ${sec.start}-${sec.end} (${sec.end - sec.start + 1} lines)`);
}

console.log('\nDone. Review src/_extracted/');
