/**
 * seed-drivers.js
 * Dodaje 100 testowych kierowców do bazy danych.
 * Uruchom: node seed-drivers.js
 */

import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT || '3306'),
  user:     process.env.MYSQL_USER     || 'duocab',
  password: process.env.MYSQL_PASSWORD || '68233177',
  database: process.env.MYSQL_DATABASE || 'duocab',
  charset:  'utf8mb4',
});

// Warszawa i okolice — bounding box
const LAT_MIN = 52.10, LAT_MAX = 52.35;
const LNG_MIN = 20.85, LNG_MAX = 21.20;

const BRANDS = [
  ['Toyota', 'Corolla'],
  ['Skoda', 'Octavia'],
  ['Volkswagen', 'Passat'],
  ['Ford', 'Focus'],
  ['Opel', 'Astra'],
  ['BMW', '5 Series'],
  ['Mercedes', 'E-Class'],
  ['Hyundai', 'i30'],
  ['Kia', 'Ceed'],
  ['Dacia', 'Logan'],
];

const COLORS = ['Biały', 'Czarny', 'Srebrny', 'Szary', 'Granatowy', 'Czerwony'];

const STATUSES   = ['free', 'active', 'active', 'active', 'driving', 'pickup', 'home'];
const STATES     = ['wolna', 'kursem', 'dojazd', 'zajeta'];

const FIRST_NAMES = ['Adam', 'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Marek', 'Michał',
                     'Paweł', 'Jakub', 'Grzegorz', 'Rafał', 'Łukasz', 'Dariusz', 'Mariusz'];
const LAST_NAMES  = ['Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński',
                     'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randLat() { return +(LAT_MIN + Math.random() * (LAT_MAX - LAT_MIN)).toFixed(6); }
function randLng() { return +(LNG_MIN + Math.random() * (LNG_MAX - LNG_MIN)).toFixed(6); }
function randPlate() {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const l = () => letters[Math.floor(Math.random() * letters.length)];
  const d = () => Math.floor(Math.random() * 10);
  return `W${l()}${l()} ${d()}${d()}${d()}${d()}`;
}
function randPhone() {
  return `+48 ${Math.floor(500 + Math.random() * 499)} ${Math.floor(100 + Math.random() * 899)} ${Math.floor(100 + Math.random() * 899)}`;
}

async function seed() {
  const conn = await pool.getConnection();

  console.log('🚀 Dodawanie 100 kierowców testowych...\n');

  let added = 0, skipped = 0;

  for (let i = 1; i <= 100; i++) {
    const num     = String(i).padStart(3, '0');
    const code    = `T${num}`;
    const pin     = '1234';
    const fname   = rand(FIRST_NAMES);
    const lname   = rand(LAST_NAMES);
    const name    = `${fname} ${lname}`;
    const email   = `test${num}@taxi.test`;
    const status  = rand(STATUSES);
    const state   = (status === 'active' || status === 'free' || status === 'driving' || status === 'pickup')
                      ? rand(STATES) : null;
    const isOnline = status !== 'inactive' && status !== 'home' ? 1 : 0;
    const lat     = isOnline ? randLat() : null;
    const lng     = isOnline ? randLng() : null;
    const [brand, model] = rand(BRANDS);
    const color   = rand(COLORS);
    const plate   = randPlate();
    const phone   = randPhone();
    const side    = `${Math.floor(Math.random() * 900) + 100}`;
    const zone    = isOnline ? Math.floor(Math.random() * 8) + 1 : null;

    try {
      await conn.query(
        `INSERT INTO drivers
           (id, email, name, password, driver_code, pin,
            status, driver_state, is_online, latitude, longitude,
            last_location_update, last_seen,
            vehicle_brand, vehicle_model, vehicle_color, registration_number,
            phone_number, side_number, current_zone,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?,
                 NOW(), NOW(),
                 ?, ?, ?, ?,
                 ?, ?, ?,
                 NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           status = VALUES(status),
           driver_state = VALUES(driver_state),
           is_online = VALUES(is_online),
           latitude = VALUES(latitude),
           longitude = VALUES(longitude)`,
        [
          randomUUID(), email, name, 'unused', code, pin,
          status, state, isOnline, lat, lng,
          brand, model, color, plate,
          phone, side, zone,
        ]
      );
      added++;
      process.stdout.write(`  ✓ ${code} ${name} (${status}${state ? '/' + state : ''})\n`);
    } catch (err) {
      skipped++;
      process.stdout.write(`  ✗ ${code} — ${err.message}\n`);
    }
  }

  conn.release();
  await pool.end();

  console.log(`\n✅ Gotowe! Dodano: ${added}, pominięto: ${skipped}`);
  console.log('   Zaloguj się kodem T001–T100, PIN: 1234');
}

seed().catch(err => { console.error('❌ Błąd:', err.message); process.exit(1); });
