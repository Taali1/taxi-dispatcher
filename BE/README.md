# Taxi Dispatch API — struktura modułowa

Ten projekt to podział oryginalnego, monolitycznego `server.js` na warstwy.
Cały kod backendu (poza samym punktem wejścia) mieszka w folderze `BE/`,
a `server.js` zostaje na poziomie roota projektu:

```
server.js              ← (poziom roota) punkt wejścia: importuje wszystko z ./BE,
                          montuje routery, uruchamia Express

BE/
  db.js                 ← pula MySQL, safeQuery, getConnectionWithTimeout, health-check
  migrations.js         ← runMigrations / runMigrationsWithReport
  README.md             ← ten plik

  shared/
    helpers.js          ← funkcje pomocnicze współdzielone między domenami
    push.js             ← inicjalizacja web-push (VAPID) + sendPushToDriver

  jobs/
    maintenance.js      ← orkiestracja interwałów offline-drivers / pending-timeout

  routes/               ← Express routery — tylko mapowanie ścieżka → kontroler
  controllers/          ← logika biznesowa + req/res, wywołuje repository
  repository/           ← wyłącznie zapytania SQL (poprzez safeQuery / connection)

  queue/                ← NIEZMIENIONY moduł kolejkowania (patrz BE/queue/README.md —
                          trzeba wkleić oryginalne pliki, nie były częścią serwera
                          przekazanego do refaktoryzacji)
```

`server.js` importuje wszystko poprzez `./BE/...`, np. `import { runMigrations } from './BE/migrations.js'`.
Pliki wewnątrz `BE/` odwołują się do siebie nawzajem po staremu (np. `routes/*.routes.js`
importuje z `../controllers/...`), ponieważ przeniosły się razem jako grupa — nic
tam nie trzeba było zmieniać.

## Domeny (routes/controllers/repository trzymają się tego samego podziału)

health, database (generyczne query/tables/insert/update/delete), drivers, orders,
zones, chat, announcements, notifications, tasks, push, settings, taximeter, blocks,
local-addresses, system-logs, city-boundaries, admin, asterisk, gielda,
driver-queries, tts.

## Uruchomienie

```bash
npm install
npm start
```

Wymagane zmienne środowiskowe — patrz oryginalny `.env` (MYSQL_HOST, MYSQL_PORT,
MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, VAPID_PUBLIC, VAPID_PRIVATE, API_PORT).

## Uwaga dot. zachowania

Logika biznesowa, zapytania SQL, kolejność tras i komunikaty logów zostały
przeniesione bez zmian — to czysto strukturalny podział na warstwy. Jedyne
wyjątki to konieczne zmiany mechaniczne wynikające z podziału na moduły:
- Funkcje uruchamiające interwały (np. `startHealthCheck`, `startGieldaCheck`,
  `startAutoDispatch`, repeater ogłoszeń) są teraz jawnie wywoływane z `server.js`
  zamiast uruchamiać się przy imporcie pliku.
- Duplikat trasy `GET /api/drivers/:driverId/next-order` (obecny również w
  oryginalnym pliku) został zachowany w tej samej kolejności rejestracji.
