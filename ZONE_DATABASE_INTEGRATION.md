# Integracja Rejonów z Bazą Danych

## Wprowadzone Zmiany

System zarządzania rejonami został zintegrowany z systemem baz danych, dzięki czemu rejony są teraz automatycznie zapisywane w bazie danych wybranej i skonfigurowanej w panelu wsparcia.

## Co zostało zmodyfikowane

### 1. Nowy Serwis: `zoneService.ts`

Utworzono nowy serwis `src/services/zoneService.ts`, który:

- **Automatycznie wykrywa źródło danych**: Sprawdza czy system używa lokalnej bazy (localStorage) czy zewnętrznej bazy danych (MySQL/MariaDB)
- **Synchronizuje dane**: Automatycznie ładuje rejony z aktywnej bazy danych
- **Obsługuje zmiany konfiguracji**: Reaguje na zmianę połączenia z bazą danych i automatycznie przeładowuje dane
- **Zapewnia jednolite API**: Niezależnie od źródła danych, komponenty korzystają z tego samego interfejsu

#### Kluczowe funkcje:

```typescript
- getZones(): Promise<Zone[]>              // Pobierz wszystkie rejony
- getZoneById(id): Promise<Zone | null>    // Pobierz rejon po ID
- createZone(zone): Promise<Zone>          // Utwórz nowy rejon
- updateZone(id, updates): Promise<Zone>   // Zaktualizuj rejon
- deleteZone(id): Promise<void>            // Usuń rejon
- refresh(): Promise<void>                 // Odśwież dane z bazy
```

### 2. Zaktualizowany Komponent: `ZoneManagement.tsx`

Komponent został przepisany, aby:

- Używać `zoneService` zamiast bezpośredniego dostępu do localStorage
- Wyświetlać informacje o aktywnej bazie danych
- Pokazywać stan ładowania i błędy
- Automatycznie odświeżać dane po zmianie konfiguracji bazy

#### Nowe funkcje UI:

- **Wskaźnik bazy danych**: Pokazuje czy system używa lokalnej czy zewnętrznej bazy
- **Obsługa błędów**: Wyświetla komunikaty o błędach w czytelnym formacie
- **Stan ładowania**: Pokazuje animacje podczas operacji na bazie danych
- **Automatyczna synchronizacja**: Po zmianie bazy w panelu wsparcia, rejony są automatycznie przeładowywane

## Jak to działa

### Scenariusz 1: Lokalna baza danych (localStorage)

1. Użytkownik nie konfiguruje żadnej zewnętrznej bazy w panelu wsparcia
2. System automatycznie używa localStorage przeglądarki
3. Rejony są zapisywane pod kluczem `taxi_zones`
4. Dane są dostępne tylko w tej przeglądarce

### Scenariusz 2: Zewnętrzna baza MySQL/MariaDB

1. Użytkownik konfiguruje połączenie w panelu wsparcia (Support → Database Management)
2. System aktywuje połączenie z zewnętrzną bazą
3. Wszystkie nowe rejony są zapisywane do tabeli `zones` w zewnętrznej bazie
4. Dane są dostępne z każdego urządzenia podłączonego do tej samej bazy

### Automatyczna migracja

- Jeśli użytkownik miał rejony w localStorage, pozostają one dostępne
- Po przełączeniu na zewnętrzną bazę, nowe rejony są zapisywane tam
- Można ręcznie przenieść stare rejony poprzez ich edycję (co zapisze je do nowej bazy)

## Struktura tabeli `zones` w bazie danych

```sql
CREATE TABLE `zones` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `number` INT NOT NULL UNIQUE,
  `coordinates` JSON NOT NULL COMMENT 'Array of polygon coordinates [{lat, lng}]',
  `drivers_count` INT NOT NULL DEFAULT 0,
  `color` VARCHAR(7) DEFAULT '#3b82f6',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_number` (`number`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Konfiguracja bazy danych

### Krok 1: Dodanie połączenia

1. Przejdź do **Panel Wsparcia → Database Management → Połączenia**
2. Kliknij **"Nowe połączenie"**
3. Wprowadź dane:
   - Nazwa: np. "Produkcyjna baza MySQL"
   - Typ: MariaDB lub MySQL
   - Host: adres serwera
   - Port: 3306 (domyślnie)
   - Użytkownik: nazwa użytkownika
   - Hasło: hasło do bazy
   - Baza danych: nazwa bazy

### Krok 2: Test połączenia

1. Kliknij **"Testuj połączenie"**
2. Poczekaj na wynik testu
3. Jeśli test się powiedzie, kliknij **"Zapisz połączenie"**

### Krok 3: Aktywacja połączenia

1. Na liście połączeń kliknij **"Aktywuj"** przy wybranym połączeniu
2. System sprawdzi czy baza zawiera wymagane tabele
3. Jeśli brakuje tabel, zobaczysz opcję **"Zainstaluj schemat automatycznie"**
4. Kliknij aby utworzyć wszystkie wymagane tabele, w tym tabelę `zones`

### Krok 4: Weryfikacja

1. Przejdź do **Admin Panel → Zarządzanie Rejonami**
2. Sprawdź wskaźnik bazy danych (powinien pokazywać zewnętrzną bazę)
3. Utwórz nowy rejon testowy
4. W panelu wsparcia sprawdź tabelę `zones` - nowy rejon powinien tam być

## Korzyści z integracji

1. **Centralizacja danych**: Wszystkie rejony w jednym miejscu
2. **Dostęp wielourządzeniowy**: Te same rejony widoczne na wszystkich stacjach
3. **Bezpieczeństwo**: Dane w profesjonalnej bazie zamiast w przeglądarce
4. **Skalowalność**: Baza MySQL obsługuje tysiące rejonów bez problemów
5. **Backup**: Możliwość tworzenia kopii zapasowych bazy danych
6. **Synchronizacja**: Zmiany widoczne natychmiast na wszystkich stanowiskach

## Rozwiązywanie problemów

### Rejony nie zapisują się do bazy

1. Sprawdź aktywne połączenie w panelu wsparcia
2. Upewnij się, że tabela `zones` istnieje w bazie
3. Sprawdź uprawnienia użytkownika bazy (INSERT, UPDATE, DELETE)
4. Zobacz logi błędów w konsoli przeglądarki (F12)

### Stare rejony z localStorage nie są widoczne

- To normalne - stare rejony pozostają w localStorage
- Można je ręcznie przenieść poprzez edycję i ponowne zapisanie
- Alternatywnie: użyj funkcji eksportu SQL i zaimportuj do bazy

### Błąd "Tabela 'zones' nie istnieje"

1. Przejdź do panelu wsparcia
2. Kliknij **"Zainstaluj schemat automatycznie"**
3. Lub pobierz SQL i uruchom ręcznie w bazie

## Techniczne szczegóły

### Przepływ danych

```
ZoneManagement.tsx
      ↓
  zoneService.ts
      ↓
dataSourceService.ts
      ↓
    ┌─────┴─────┐
    ↓           ↓
localStorage  database-proxy (Edge Function)
              ↓
           MySQL/MariaDB
```

### Konwersja danych

Serwis automatycznie konwertuje między:
- Formatem JavaScript (camelCase) używanym w aplikacji
- Formatem bazy danych (snake_case) używanym w MySQL

Przykład:
```javascript
// JavaScript
{ driversCount: 5, isActive: true }

// MySQL
{ drivers_count: 5, is_active: 1 }
```

### Obsługa JSON w MySQL

Współrzędne rejonów (polygony) są przechowywane jako JSON:
```json
[
  {"lat": 50.0647, "lng": 19.9450},
  {"lat": 50.0650, "lng": 19.9550},
  {"lat": 50.0550, "lng": 19.9550}
]
```

Dla starszych wersji MySQL (< 5.7) używany jest typ TEXT z serializacją JSON.
