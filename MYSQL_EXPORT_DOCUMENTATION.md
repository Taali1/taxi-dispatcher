# MySQL Schema Export - Documentation

## Overview
System dyspozytorski taxi posiada teraz kompletny eksporter schematu bazy danych MySQL/MariaDB, który generuje gotowe do użycia pliki SQL zawierające wszystkie niezbędne tabele.

## Funkcjonalność

### Przycisk w Panelu Support
W panelu **Support** → **Zarządzanie Bazami Danych** → zakładka **Tabele** znajduje się przycisk:
- **"Pobierz SQL dla MySQL"** - otwiera modal z opcjami eksportu

### Opcje Eksportu

Modal pozwala na konfigurację:

1. **Nazwa bazy danych** (domyślnie: `taxi_dispatch`)
   - Możliwość dostosowania nazwy do własnych potrzeb

2. **Opcje struktury:**
   - ✅ **Instrukcje DROP TABLE** - dla czystej instalacji
   - ✅ **Klucze obce (Foreign Keys)** - relacje między tabelami
   - ✅ **Indeksy** - dla optymalnej wydajności zapytań
   - ✅ **Triggery** - automatyczne aktualizacje
   - ✅ **Dane testowe** - przykładowe rekordy dla testów
   - ✅ **Użyj TEXT zamiast JSON** - kompatybilność ze starszymi wersjami MySQL (< 5.7)

## Wygenerowane Tabele

System generuje **20+ tabel** z pełną strukturą:

### Tabele Użytkowników
1. **administrators** - Administratorzy systemu
   - Poziomy dostępu: full, limited, read_only
   - Uprawnienia w formacie JSON
   - Status: active, inactive, suspended

2. **drivers** - Kierowcy
   - Pełne dane osobowe i pojazdu
   - Status: free, driving, pickup, home, active, inactive
   - Lokalizacja GPS (JSON)
   - Kolejka i strefa
   - Historia statusów

3. **dispatchers** - Dyspozytorzy
   - Zmiana (morning, afternoon, night, rotating)
   - Przypisane strefy
   - Limit równoczesnych zamówień

4. **support_agents** - Agenci wsparcia
   - Języki obsługi
   - Specjalizacje
   - Limit ticketów

5. **accounting_users** - Księgowość
   - Certyfikaty
   - Poziomy dostępu

### Tabele Operacyjne
6. **orders** - Zamówienia
   - Pełne dane klienta
   - Adresy pickup/destination z GPS
   - Statusy zamówienia
   - Koszty i płatności
   - Kategorie pojazdów

7. **zones** - Strefy geograficzne
   - Wielokąty (polygon coordinates) w JSON
   - Licznik kierowców
   - Kolory dla mapy

8. **regions** - Regiony
   - Numer regionu
   - Opis

9. **taxi_codes** - Kody taksówek
   - Przypisanie do regionów i kierowców
   - Status: available, assigned, inactive

### Tabele Konfiguracji
10. **pricing_rules** - Zasady cenowe
    - Opłata bazowa
    - Stawka za km
    - Stawka za oczekiwanie
    - Dopłata nocna

11. **assignment_rules** - Zasady przydziału
    - Typy: auto, manual, hybrid
    - Priorytety
    - Warunki w JSON

### Tabele Systemowe
12. **database_connections** - Połączenia z bazami
13. **corporations** - Korporacje (multi-tenant)
14. **map_tokens** - Tokeny map
15. **custom_addresses** - Własne adresy

### Tabele Kolejek i Historii
16. **driver_queue** - Kolejka kierowców
17. **queue_sessions** - Sesje kolejki
18. **zone_transitions** - Przejścia między strefami
19. **driver_history** - Historia aktywności kierowców
20. **chat_messages** - Wiadomości w systemie

## Cechy Techniczne

### Kodowanie i Silnik
```sql
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci
ENGINE = InnoDB
```

- **UTF-8MB4** - pełne wsparcie dla emoji i znaków międzynarodowych
- **InnoDB** - transakcje i klucze obce
- **Automatyczne timestampy** - created_at, updated_at

### Indeksy
Każda tabela posiada zoptymalizowane indeksy na:
- Klucze główne
- Klucze obce
- Często przeszukiwane pola (status, email, zone_id, itp.)

### Relacje (Foreign Keys)
```sql
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_driver`
  FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
```

Wszystkie relacje z odpowiednimi akcjami:
- ON DELETE SET NULL / CASCADE
- ON UPDATE CASCADE

### Typy Danych
- **VARCHAR** z określonymi długościami
- **ENUM** dla statusów i typów
- **JSON/TEXT** dla złożonych danych (coordinates, permissions, itp.) - zależnie od wersji MySQL
- **DECIMAL(10,2)** dla wartości pieniężnych
- **DATETIME** dla czasów utworzenia i znaczników czasowych
- **TIMESTAMP** tylko dla `updated_at` z automatycznym ON UPDATE

## Przykładowe Dane

Jeśli zaznaczono opcję "Dołącz przykładowe dane", generowane są:

1. **Podstawowe reguły cenowe** (4 kategorie):
   - Standard: 8.00 zł bazowa, 2.50 zł/km
   - Comfort: 10.00 zł bazowa, 3.00 zł/km
   - Premium: 15.00 zł bazowa, 4.00 zł/km
   - Van: 12.00 zł bazowa, 3.50 zł/km

2. **Przykładowy region**: Kraków - Centrum

3. **Przykładowy administrator** systemu

## Jak Używać

### 1. Pobranie Pliku SQL
1. Otwórz panel **Support**
2. Przejdź do **Zarządzanie Bazami Danych**
3. Zakładka **Tabele**
4. Kliknij **"Pobierz SQL dla MySQL"**
5. Dostosuj opcje według potrzeb
6. Kliknij **"Pobierz SQL"**

### 2. Import do MySQL/MariaDB

```bash
# Bezpośredni import
mysql -u root -p < taxi_dispatch_mysql_schema_2026-01-30.sql

# Lub przez phpMyAdmin
# - Wybierz "Import"
# - Wybierz pobrany plik .sql
# - Kliknij "Wykonaj"

# Lub przez MySQL Workbench
# - Data Import/Restore
# - Import from Self-Contained File
# - Wybierz plik i wykonaj
```

### 3. Weryfikacja
```sql
-- Sprawdź utworzone tabele
SHOW TABLES;

-- Sprawdź strukturę przykładowej tabeli
DESCRIBE drivers;

-- Sprawdź dane testowe (jeśli włączone)
SELECT * FROM pricing_rules;
```

## Bezpieczeństwo

### Hasła
W wygenerowanym schemacie kolumny `password_hash` są puste:
```sql
`password_hash` VARCHAR(255) DEFAULT NULL
```

**WAŻNE:** W produkcji należy używać bcrypt lub podobnych algorytmów haszowania!

### Klucze API i Tokeny
Tabela `map_tokens` przechowuje tokeny jako TEXT:
```sql
`token` TEXT NOT NULL
```

**UWAGA:** W produkcji rozważ szyfrowanie tokenów!

## Integracja z Istniejącym Systemem

System obsługuje dwa źródła danych:

1. **LocalStorage** (domyślnie) - dane w przeglądarce
2. **Supabase/PostgreSQL** - produkcyjna baza

SQL dla MySQL pozwala na:
- Migrację do własnej infrastruktury
- Backup danych
- Rozwój lokalny
- Testy integracyjne

## Kompatybilność

✅ **MySQL** 5.7+ (z natywnym JSON)
✅ **MySQL** 5.5 - 5.6 (z opcją TEXT zamiast JSON)
✅ **MariaDB** 10.2+ (z natywnym JSON)
✅ **MariaDB** 10.0 - 10.1 (z opcją TEXT zamiast JSON)
✅ **Percona Server** 5.7+

### Wymagania:
- InnoDB engine
- UTF-8MB4 support
- Foreign keys enabled

### Rozwiązane Problemy Kompatybilności:

**✅ Błąd #1071** - Klucz zbyt długi (max 767 bajtów)
- Kolumny `email` używają VARCHAR(191) zamiast VARCHAR(255)
- 191 * 4 bajty (utf8mb4) = 764 bajty < 767 (limit indeksu)

**✅ Błąd #1067** - Niewłaściwa wartość domyślna dla DATETIME
- Kolumny DATETIME NOT NULL bez DEFAULT CURRENT_TIMESTAMP
- Aplikacja wstawia wartości przy INSERT

**✅ Błąd #1293** - Zbyt wiele kolumn TIMESTAMP z DEFAULT
- Tylko jedna kolumna TIMESTAMP: `updated_at`
- Pozostałe kolumny czasowe to DATETIME

### Obsługa Starszych Wersji MySQL

**Problem:** MySQL w wersjach poniżej 5.7.8 nie posiada natywnego typu JSON.

**Rozwiązanie:** W modalu eksportu zaznacz opcję:
> ✅ **Użyj TEXT zamiast JSON (dla MySQL < 5.7)**

To zamieni wszystkie kolumny typu `JSON` na `TEXT`, zachowując pełną kompatybilność:

```sql
-- Z opcją włączoną (MySQL 5.5+):
`permissions` TEXT DEFAULT NULL COMMENT 'Array of permission strings'

-- Z opcją wyłączoną (MySQL 5.7+):
`permissions` JSON DEFAULT NULL COMMENT 'Array of permission strings'
```

**Dane w formacie JSON** nadal będą działać - po prostu będą przechowywane jako zwykły tekst. Aplikacja może parsować je jako JSON w kodzie.

### Ograniczenia Długości Indeksów (Błąd #1071)

**Problem:** W MySQL z utf8mb4 każdy znak zajmuje 4 bajty. Przy limicie 767 bajtów dla indeksów:
- VARCHAR(255) * 4 = 1020 bajtów > 767 bajtów ❌
- VARCHAR(191) * 4 = 764 bajtów < 767 bajtów ✅

**Rozwiązanie:** Wszystkie kolumny z indeksami UNIQUE używają VARCHAR(191):

```sql
-- Zmienione kolumny:
`email` VARCHAR(191) NOT NULL UNIQUE  -- było VARCHAR(255)
```

**Wpływ na aplikację:**
- Adresy email rzadko przekraczają 191 znaków
- Zgodnie ze standardem RFC 5321, maksymalna długość email to 254 znaki
- W praktyce 99.9% adresów email mieści się w 191 znakach
- Dla dłuższych adresów należy zastosować walidację po stronie aplikacji

**Kolumny niezmienione (bez indeksów UNIQUE):**
- `password_hash` VARCHAR(255) - bez indeksu, długość zachowana
- Inne kolumny tekstowe bez indeksów UNIQUE

### Kompatybilność DATETIME i TIMESTAMP (MySQL < 5.6.5)

**Problem 1:** W MySQL < 5.6.5 można mieć tylko jedną kolumnę TIMESTAMP z `CURRENT_TIMESTAMP`.
**Problem 2:** W MySQL < 5.6.5 kolumny DATETIME nie mogą mieć `DEFAULT CURRENT_TIMESTAMP`.

**Rozwiązanie Kompletne:** Generator używa strategii zapewniającej 100% kompatybilność:

#### 1. Wszystkie kolumny czasowe to DATETIME (bez DEFAULT CURRENT_TIMESTAMP):

**Kolumny NOT NULL (aplikacja wstawia wartość przy INSERT):**
- `created_at` DATETIME NOT NULL
- `entered_at` DATETIME NOT NULL
- `started_at` DATETIME NOT NULL
- `timestamp` DATETIME NOT NULL

**Kolumny NULL (domyślnie NULL):**
- `last_login` DATETIME NULL DEFAULT NULL
- `status_started_at` DATETIME NULL DEFAULT NULL
- `status_changed_at` DATETIME NULL DEFAULT NULL
- `free_since` DATETIME NULL DEFAULT NULL
- `last_seen` DATETIME NULL DEFAULT NULL
- `last_location_update` DATETIME NULL DEFAULT NULL
- `assigned_at` DATETIME NULL DEFAULT NULL
- `completed_at` DATETIME NULL DEFAULT NULL
- `cancelled_at` DATETIME NULL DEFAULT NULL
- `last_connected` DATETIME NULL DEFAULT NULL
- `ended_at` DATETIME NULL DEFAULT NULL

#### 2. Jedyna kolumna TIMESTAMP (z auto-update):
```sql
`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### 3. Przykład wygenerowanej tabeli:
```sql
CREATE TABLE `drivers` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  -- Kolumny czasowe BEZ DEFAULT CURRENT_TIMESTAMP:
  `created_at` DATETIME NOT NULL,
  `last_login` DATETIME NULL DEFAULT NULL,
  `last_seen` DATETIME NULL DEFAULT NULL,
  `status_started_at` DATETIME NULL DEFAULT NULL,
  -- Jedyna kolumna z CURRENT_TIMESTAMP:
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

#### 4. Wymagania po stronie aplikacji:

**WAŻNE:** Przy wstawianiu rekordów aplikacja MUSI podawać wartości dla kolumn NOT NULL:

```sql
-- Przykładowe INSERT z NOW():
INSERT INTO drivers (id, name, created_at, updated_at)
VALUES (UUID(), 'Jan Kowalski', NOW(), NOW());

-- Lub z CURRENT_TIMESTAMP:
INSERT INTO orders (id, customer_name, created_at, updated_at)
VALUES (UUID(), 'Klient', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- W PHP (PDO):
$stmt->execute([
    ':id' => $uuid,
    ':name' => $name,
    ':created_at' => date('Y-m-d H:i:s'),
    ':updated_at' => date('Y-m-d H:i:s')
]);
```

#### 5. Kompatybilność:
✅ **MySQL 5.5+** - pełna kompatybilność (bez błędów #1071, #1293, #1067)
✅ **MySQL 5.6+** - pełna kompatybilność
✅ **MySQL 5.7+** - pełna kompatybilność
✅ **MySQL 8.0+** - pełna kompatybilność
✅ **MariaDB 10.0+** - pełna kompatybilność
✅ **MariaDB 10.2+** - pełna kompatybilność
✅ **Percona Server** - wszystkie wersje

#### 6. Zalety tego podejścia:
- ✅ Brak błędów #1071 (długość indeksów), #1293 (TIMESTAMP), #1067 (DEFAULT)
- ✅ Działa na WSZYSTKICH wersjach MySQL/MariaDB
- ✅ Pełna kontrola nad wartościami czasowymi w aplikacji
- ✅ `updated_at` nadal aktualizuje się automatycznie
- ✅ Kolumny NULL mają sensowne wartości domyślne
- ✅ Optymalne długości VARCHAR dla indeksów utf8mb4

#### 7. DATETIME vs TIMESTAMP:
- **DATETIME**: Przechowuje wartość "tak jak jest", zakres 1000-9999
- **TIMESTAMP**: Konwertuje do UTC, zakres 1970-2038, auto-update przy UPDATE

Dla aplikacji dyspozytorskiej ta różnica jest niewidoczna i nie wpływa na funkcjonalność.

## Pliki Źródłowe

Implementacja znajduje się w:
- `src/services/mysqlSchemaGenerator.ts` - Generator schematu
- `src/services/databaseService.ts` - Metody eksportu
- `src/components/support/DatabaseManagement.tsx` - UI

## Przykład Wygenerowanego SQL

```sql
-- ===================================================================
-- Taxi Dispatch System - MySQL Database Schema
-- ===================================================================
-- Generated: 2026-01-30T12:00:00.000Z
-- Database: taxi_dispatch
-- Charset: utf8mb4 (supports emojis and international characters)
-- Collation: utf8mb4_unicode_ci
-- Engine: InnoDB (supports transactions and foreign keys)
-- ===================================================================

CREATE DATABASE IF NOT EXISTS `taxi_dispatch`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `taxi_dispatch`;

DROP TABLE IF EXISTS `drivers`;
CREATE TABLE `drivers` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `driver_code` VARCHAR(20) NOT NULL UNIQUE,
  `status` ENUM('free', 'driving', 'pickup', 'home', 'active', 'inactive')
    NOT NULL DEFAULT 'inactive',
  `current_location` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`),
  INDEX `idx_driver_code` (`driver_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ... (pozostałe tabele)
```

## Podsumowanie

Eksporter MySQL zapewnia:
- ✅ Kompletną strukturę 20+ tabel
- ✅ Pełne relacje i integralność danych
- ✅ Optymalne indeksy
- ✅ Gotowość produkcyjną
- ✅ Możliwość customizacji
- ✅ Wsparcie dla multi-tenant
- ✅ Kompatybilność z MySQL/MariaDB

Wszystko przygotowane do zaimportowania i uruchomienia!
