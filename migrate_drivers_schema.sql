-- =============================================================
-- MIGRACJA TABELI drivers: camelCase → snake_case
-- Uruchom ten skrypt na swojej bazie danych MySQL.
-- Bezpieczny do wielokrotnego uruchomienia (sprawdza istnienie kolumn).
-- =============================================================

-- Zmień nazwę istniejących kolumn camelCase → snake_case
ALTER TABLE `drivers`
  CHANGE COLUMN IF EXISTS `driverCode`         `driver_code`         VARCHAR(50),
  CHANGE COLUMN IF EXISTS `phoneNumber`         `phone_number`        VARCHAR(20),
  CHANGE COLUMN IF EXISTS `sideNumber`          `side_number`         VARCHAR(50),
  CHANGE COLUMN IF EXISTS `vehicleBrand`        `vehicle_brand`       VARCHAR(100),
  CHANGE COLUMN IF EXISTS `vehicleModel`        `vehicle_model`       VARCHAR(100),
  CHANGE COLUMN IF EXISTS `vehicleColor`        `vehicle_color`       VARCHAR(50),
  CHANGE COLUMN IF EXISTS `registrationNumber`  `registration_number` VARCHAR(50),
  CHANGE COLUMN IF EXISTS `suspendedUntil`      `suspended_until`     DATETIME,
  CHANGE COLUMN IF EXISTS `createdAt`           `created_at`          DATETIME,
  CHANGE COLUMN IF EXISTS `updatedAt`           `updated_at`          DATETIME;

-- Dodaj brakujące kolumny (jeśli jeszcze nie istnieją)
ALTER TABLE `drivers`
  ADD COLUMN IF NOT EXISTS `pin`                  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS `license_number`       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS `license_expiry`       DATETIME,
  ADD COLUMN IF NOT EXISTS `current_zone`         INT,
  ADD COLUMN IF NOT EXISTS `zone_entered_at`      DATETIME,
  ADD COLUMN IF NOT EXISTS `queue_position`       INT,
  ADD COLUMN IF NOT EXISTS `rating`               DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS `total_rides`          INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `vehicle_categories`   TEXT,
  ADD COLUMN IF NOT EXISTS `emergency_contact`    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS `documents`            TEXT,
  ADD COLUMN IF NOT EXISTS `last_location_update` DATETIME;

-- Upewnij się, że kolumny current_location i previous_status istnieją
ALTER TABLE `drivers`
  ADD COLUMN IF NOT EXISTS `current_location` TEXT,
  ADD COLUMN IF NOT EXISTS `previous_status`  ENUM('free','driving','pickup','home','active','inactive','suspended');

SELECT 'Migracja zakończona pomyślnie.' AS status;
