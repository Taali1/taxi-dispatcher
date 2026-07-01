-- ===================================================================
-- Migracja: dodanie brakujących kolumn do tabeli clients
-- ===================================================================

SET @dbname = DATABASE();

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='email') = 0,
  'ALTER TABLE `clients` ADD COLUMN `email` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='company_name') = 0,
  'ALTER TABLE `clients` ADD COLUMN `company_name` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='street') = 0,
  'ALTER TABLE `clients` ADD COLUMN `street` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='city') = 0,
  'ALTER TABLE `clients` ADD COLUMN `city` VARCHAR(100) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='postal_code') = 0,
  'ALTER TABLE `clients` ADD COLUMN `postal_code` VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='clients' AND COLUMN_NAME='nip') = 0,
  'ALTER TABLE `clients` ADD COLUMN `nip` VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
