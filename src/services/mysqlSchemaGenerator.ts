// MySQL Schema Generator for Taxi Dispatch System
// Generates complete table creation statements for MySQL/MariaDB

export interface MySQLExportOptions {
  includeSampleData: boolean;
  includeDropStatements: boolean;
  includeForeignKeys: boolean;
  includeIndexes: boolean;
  includeTriggers: boolean;
  databaseName: string;
  useTextForJson: boolean;
}

export class MySQLSchemaGenerator {
  private options: MySQLExportOptions;

  constructor(options: Partial<MySQLExportOptions> = {}) {
    this.options = {
      includeSampleData: options.includeSampleData ?? false,
      includeDropStatements: options.includeDropStatements ?? true,
      includeForeignKeys: options.includeForeignKeys ?? true,
      includeIndexes: options.includeIndexes ?? true,
      includeTriggers: options.includeTriggers ?? true,
      databaseName: options.databaseName ?? 'taxi_dispatch',
      useTextForJson: options.useTextForJson ?? true,
    };
  }

  private getJsonType(): string {
    return this.options.useTextForJson ? 'TEXT' : 'JSON';
  }

  generateFullSchema(): string {
    let sql = this.generateHeader();
    sql += this.generateDatabaseCreation();
    sql += this.generateTableStatements();

    if (this.options.includeForeignKeys) {
      sql += this.generateForeignKeys();
    }

    if (this.options.includeTriggers) {
      sql += this.generateTriggers();
    }

    if (this.options.includeSampleData) {
      sql += this.generateSampleData();
    }

    return sql;
  }

  private generateHeader(): string {
    const now = new Date().toISOString();
    return `-- ===================================================================
-- Taxi Dispatch System - MySQL Database Schema
-- ===================================================================
-- Generated: ${now}
-- Database: ${this.options.databaseName}
-- Charset: utf8mb4 (supports emojis and international characters)
-- Collation: utf8mb4_unicode_ci
-- Engine: InnoDB (supports transactions and foreign keys)
-- ===================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+00:00';

`;
  }

  private generateDatabaseCreation(): string {
    return `-- ===================================================================
-- Database Creation
-- ===================================================================

CREATE DATABASE IF NOT EXISTS \`${this.options.databaseName}\`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE \`${this.options.databaseName}\`;

`;
  }

  private generateTableStatements(): string {
    let sql = `-- ===================================================================
-- Table Structures
-- ===================================================================

`;

    const tables = [
      this.generateAdministratorsTable(),
      this.generateDriversTable(),
      this.generateDispatchersTable(),
      this.generateSupportAgentsTable(),
      this.generateAccountingUsersTable(),
      this.generateRegionsTable(),
      this.generateTaxiCodesTable(),
      this.generateZonesTable(),
      this.generateOrdersTable(),
      this.generatePricingRulesTable(),
      this.generateDatabaseConnectionsTable(),
      this.generateCorporationsTable(),
      this.generateMapTokensTable(),
      this.generateCustomAddressesTable(),
      this.generateDriverQueueTable(),
      this.generateQueueSessionsTable(),
      this.generateZoneTransitionsTable(),
      this.generateDriverHistoryTable(),
      this.generateChatMessagesTable(),
      this.generateAssignmentRulesTable(),
    ];

    return sql + tables.join('\n\n');
  }

  private generateAdministratorsTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `administrators`;\n';
    }
    sql += `CREATE TABLE \`administrators\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL,
  \`department\` VARCHAR(100) DEFAULT NULL,
  \`access_level\` ENUM('super', 'standard', 'limited') NOT NULL DEFAULT 'standard',
  \`permissions\` ${jsonType} DEFAULT NULL COMMENT 'Array of permission strings',
  \`status\` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  \`last_login\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_email\` (\`email\`),
  INDEX \`idx_status\` (\`status\`),
  INDEX \`idx_access_level\` (\`access_level\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System administrators with various access levels';`;
    return sql;
  }

  private generateDriversTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `drivers`;\n';
    }
    sql += `CREATE TABLE \`drivers\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL,
  \`driver_code\` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Unique driver identification code',
  \`pin\` VARCHAR(10) NOT NULL COMMENT 'Driver PIN for authentication',
  \`license_number\` VARCHAR(50) NOT NULL,
  \`license_expiry\` DATE DEFAULT NULL,
  \`phone_number\` VARCHAR(20) NOT NULL,
  \`vehicle_brand\` VARCHAR(50) DEFAULT NULL,
  \`vehicle_model\` VARCHAR(50) DEFAULT NULL,
  \`vehicle_color\` VARCHAR(30) DEFAULT NULL,
  \`registration_number\` VARCHAR(20) DEFAULT NULL,
  \`side_number\` VARCHAR(10) DEFAULT NULL COMMENT 'Taxi side number',
  \`current_zone\` INT DEFAULT NULL,
  \`current_region_number\` INT DEFAULT NULL,
  \`queue_position\` INT DEFAULT NULL,
  \`status\` ENUM('free', 'driving', 'pickup', 'home', 'active', 'inactive', 'suspended') NOT NULL DEFAULT 'inactive',
  \`previous_status\` ENUM('free', 'driving', 'pickup', 'home', 'active', 'inactive', 'suspended') DEFAULT NULL,
  \`suspended_until\` DATETIME NULL DEFAULT NULL COMMENT 'Date until which the account is suspended',
  \`status_started_at\` DATETIME NULL DEFAULT NULL,
  \`status_changed_at\` DATETIME NULL DEFAULT NULL,
  \`free_since\` DATETIME NULL DEFAULT NULL,
  \`is_online\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`last_seen\` DATETIME NULL DEFAULT NULL,
  \`rating\` DECIMAL(3, 2) NOT NULL DEFAULT 5.00,
  \`total_rides\` INT NOT NULL DEFAULT 0,
  \`current_location\` ${jsonType} DEFAULT NULL COMMENT 'Current GPS coordinates {lat, lng}',
  \`latitude\` DOUBLE PRECISION DEFAULT NULL COMMENT 'Driver latitude coordinate',
  \`longitude\` DOUBLE PRECISION DEFAULT NULL COMMENT 'Driver longitude coordinate',
  \`last_location_update\` DATETIME NULL DEFAULT NULL,
  \`zone_entered_at\` DATETIME NULL DEFAULT NULL COMMENT 'Timestamp when driver entered current zone',
  \`target_zone\` INT DEFAULT NULL,
  \`session_id\` VARCHAR(36) DEFAULT NULL,
  \`vehicle_categories\` ${jsonType} DEFAULT NULL COMMENT 'Array of vehicle category strings',
  \`emergency_contact\` VARCHAR(100) DEFAULT NULL,
  \`documents\` ${jsonType} DEFAULT NULL COMMENT 'Driver documents and certifications',
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_driver_code\` (\`driver_code\`),
  INDEX \`idx_status\` (\`status\`),
  INDEX \`idx_current_zone\` (\`current_zone\`),
  INDEX \`idx_current_region\` (\`current_region_number\`),
  INDEX \`idx_is_online\` (\`is_online\`),
  INDEX \`idx_session\` (\`session_id\`),
  INDEX \`idx_queue_position\` (\`queue_position\`),
  INDEX \`idx_location\` (\`latitude\`, \`longitude\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Driver information and current status';`;
    return sql;
  }

  private generateDispatchersTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `dispatchers`;\n';
    }
    sql += `CREATE TABLE \`dispatchers\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL,
  \`employee_id\` VARCHAR(50) NOT NULL UNIQUE,
  \`shift\` ENUM('morning', 'afternoon', 'night', 'rotating') DEFAULT 'rotating',
  \`assigned_zones\` ${jsonType} DEFAULT NULL COMMENT 'Array of zone IDs',
  \`max_concurrent_orders\` INT NOT NULL DEFAULT 10,
  \`phone_extension\` VARCHAR(20) DEFAULT NULL COMMENT 'Internal phone extension',
  \`training_completed\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`status\` ENUM('active', 'inactive', 'on_break') NOT NULL DEFAULT 'active',
  \`last_login\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_employee_id\` (\`employee_id\`),
  INDEX \`idx_status\` (\`status\`),
  INDEX \`idx_shift\` (\`shift\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dispatchers managing orders and drivers';`;
    return sql;
  }

  private generateSupportAgentsTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `support_agents`;\n';
    }
    sql += `CREATE TABLE \`support_agents\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL,
  \`agent_id\` VARCHAR(50) NOT NULL UNIQUE,
  \`department\` VARCHAR(100) DEFAULT NULL,
  \`languages\` ${jsonType} DEFAULT NULL COMMENT 'Array of language codes',
  \`ticket_limit\` INT NOT NULL DEFAULT 20,
  \`specializations\` ${jsonType} DEFAULT NULL COMMENT 'Array of specialization areas',
  \`status\` ENUM('active', 'inactive', 'busy') NOT NULL DEFAULT 'active',
  \`last_login\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_agent_id\` (\`agent_id\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Support agents for customer service';`;
    return sql;
  }

  private generateAccountingUsersTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `accounting_users`;\n';
    }
    sql += `CREATE TABLE \`accounting_users\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL,
  \`employee_id\` VARCHAR(50) NOT NULL UNIQUE,
  \`access_level\` ENUM('full', 'standard', 'limited') NOT NULL DEFAULT 'standard',
  \`certifications\` ${jsonType} DEFAULT NULL COMMENT 'Array of accounting certifications',
  \`department\` VARCHAR(100) DEFAULT NULL,
  \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  \`last_login\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_employee_id\` (\`employee_id\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Accounting department users';`;
    return sql;
  }

  private generateRegionsTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `regions`;\n';
    }
    sql += `CREATE TABLE \`regions\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL,
  \`number\` INT NOT NULL UNIQUE,
  \`description\` TEXT DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_number\` (\`number\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Geographic regions for taxi operations';`;
    return sql;
  }

  private generateTaxiCodesTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `taxi_codes`;\n';
    }
    sql += `CREATE TABLE \`taxi_codes\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`code\` VARCHAR(20) NOT NULL UNIQUE,
  \`region_id\` VARCHAR(36) DEFAULT NULL,
  \`driver_id\` VARCHAR(36) DEFAULT NULL,
  \`status\` ENUM('available', 'assigned', 'inactive') NOT NULL DEFAULT 'available',
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_code\` (\`code\`),
  INDEX \`idx_region_id\` (\`region_id\`),
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Taxi identification codes assigned to drivers';`;
    return sql;
  }

  private generateZonesTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `zones`;\n';
    }
    sql += `CREATE TABLE \`zones\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL,
  \`number\` INT NOT NULL UNIQUE,
  \`coordinates\` ${jsonType} NOT NULL COMMENT 'Array of polygon coordinates [{lat, lng}]',
  \`drivers_count\` INT NOT NULL DEFAULT 0,
  \`color\` VARCHAR(7) DEFAULT '#3b82f6' COMMENT 'Hex color for map display',
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_number\` (\`number\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Geographic zones for driver dispatch';`;
    return sql;
  }

  private generateOrdersTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `orders`;\n';
    }
    sql += `CREATE TABLE \`orders\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`order_number\` VARCHAR(20) NOT NULL UNIQUE,
  \`customer_name\` VARCHAR(100) NOT NULL,
  \`customer_phone\` VARCHAR(20) NOT NULL,
  \`pickup_address\` TEXT NOT NULL,
  \`pickup_coordinates\` ${jsonType} DEFAULT NULL COMMENT '{lat, lng}',
  \`destination_address\` TEXT NOT NULL,
  \`destination_coordinates\` ${jsonType} DEFAULT NULL COMMENT '{lat, lng}',
  \`pickup_zone\` INT DEFAULT NULL,
  \`destination_zone\` INT DEFAULT NULL,
  \`status\` ENUM('new', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
  \`driver_id\` VARCHAR(36) DEFAULT NULL,
  \`dispatcher_id\` VARCHAR(36) DEFAULT NULL,
  \`vehicle_category\` VARCHAR(50) DEFAULT 'standard',
  \`cost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  \`distance_km\` DECIMAL(10, 2) DEFAULT NULL,
  \`duration_minutes\` INT DEFAULT NULL,
  \`payment_method\` ENUM('cash', 'card', 'corporate') DEFAULT 'cash',
  \`payment_status\` ENUM('pending', 'paid', 'refunded') DEFAULT 'pending',
  \`notes\` TEXT DEFAULT NULL,
  \`assigned_at\` DATETIME NULL DEFAULT NULL,
  \`completed_at\` DATETIME NULL DEFAULT NULL,
  \`cancelled_at\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_order_number\` (\`order_number\`),
  INDEX \`idx_status\` (\`status\`),
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_dispatcher_id\` (\`dispatcher_id\`),
  INDEX \`idx_created_at\` (\`created_at\`),
  INDEX \`idx_pickup_zone\` (\`pickup_zone\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Customer orders and ride requests';`;
    return sql;
  }

  private generatePricingRulesTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `pricing_rules`;\n';
    }
    sql += `CREATE TABLE \`pricing_rules\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`category\` VARCHAR(50) NOT NULL UNIQUE,
  \`base_fare\` DECIMAL(10, 2) NOT NULL DEFAULT 8.00,
  \`per_km_rate\` DECIMAL(10, 2) NOT NULL DEFAULT 2.50,
  \`waiting_rate_per_minute\` DECIMAL(10, 2) NOT NULL DEFAULT 0.50,
  \`minimum_fare\` DECIMAL(10, 2) NOT NULL DEFAULT 8.00,
  \`night_surcharge_percent\` DECIMAL(5, 2) DEFAULT 0.00 COMMENT 'Percentage surcharge for night rides',
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_category\` (\`category\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Pricing rules for different vehicle categories';`;
    return sql;
  }

  private generateDatabaseConnectionsTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `database_connections`;\n';
    }
    sql += `CREATE TABLE \`database_connections\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL,
  \`type\` ENUM('local', 'mariadb', 'mysql', 'postgresql') NOT NULL,
  \`host\` VARCHAR(255) DEFAULT NULL,
  \`port\` INT DEFAULT NULL,
  \`username\` VARCHAR(100) DEFAULT NULL,
  \`password\` VARCHAR(255) DEFAULT NULL COMMENT 'Encrypted password',
  \`database\` VARCHAR(100) DEFAULT NULL,
  \`is_active\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`last_connected\` DATETIME NULL DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Multi-tenant database connections';`;
    return sql;
  }

  private generateCorporationsTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `corporations`;\n';
    }
    sql += `CREATE TABLE \`corporations\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL,
  \`database_name\` VARCHAR(100) NOT NULL UNIQUE,
  \`connection_id\` VARCHAR(36) NOT NULL,
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`description\` TEXT DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_connection_id\` (\`connection_id\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Corporate clients with dedicated databases';`;
    return sql;
  }

  private generateMapTokensTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `map_tokens`;\n';
    }
    sql += `CREATE TABLE \`map_tokens\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`token\` TEXT NOT NULL,
  \`provider\` VARCHAR(50) NOT NULL DEFAULT 'openstreetmap',
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_provider\` (\`provider\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Map service API tokens';`;
    return sql;
  }

  private generateCustomAddressesTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `custom_addresses`;\n';
    }
    sql += `CREATE TABLE \`custom_addresses\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(255) NOT NULL,
  \`address\` TEXT NOT NULL,
  \`latitude\` DECIMAL(10, 8) NOT NULL,
  \`longitude\` DECIMAL(11, 8) NOT NULL,
  \`category\` VARCHAR(50) DEFAULT NULL COMMENT 'e.g., airport, station, hotel',
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_latitude_longitude\` (\`latitude\`, \`longitude\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Custom addresses for quick selection';`;
    return sql;
  }

  private generateDriverQueueTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `driver_queue`;\n';
    }
    sql += `CREATE TABLE \`driver_queue\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`driver_id\` VARCHAR(36) NOT NULL,
  \`zone_id\` INT NOT NULL,
  \`position\` INT NOT NULL,
  \`status\` ENUM('waiting', 'active', 'paused') NOT NULL DEFAULT 'waiting',
  \`entered_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`unique_driver_zone\` (\`driver_id\`, \`zone_id\`),
  INDEX \`idx_zone_position\` (\`zone_id\`, \`position\`),
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Driver queue management per zone';`;
    return sql;
  }

  private generateQueueSessionsTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `queue_sessions`;\n';
    }
    sql += `CREATE TABLE \`queue_sessions\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`driver_id\` VARCHAR(36) NOT NULL,
  \`zone_id\` INT NOT NULL,
  \`started_at\` DATETIME NOT NULL,
  \`ended_at\` DATETIME NULL DEFAULT NULL,
  \`duration_minutes\` INT DEFAULT NULL,
  \`orders_completed\` INT NOT NULL DEFAULT 0,
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_zone_id\` (\`zone_id\`),
  INDEX \`idx_started_at\` (\`started_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Historical queue sessions';`;
    return sql;
  }

  private generateZoneTransitionsTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `zone_transitions`;\n';
    }
    sql += `CREATE TABLE \`zone_transitions\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`driver_id\` VARCHAR(36) NOT NULL,
  \`from_zone\` INT DEFAULT NULL,
  \`to_zone\` INT DEFAULT NULL,
  \`transition_type\` ENUM('enter', 'exit', 'move') NOT NULL,
  \`timestamp\` DATETIME NOT NULL,
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_timestamp\` (\`timestamp\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Driver zone transition history';`;
    return sql;
  }

  private generateDriverHistoryTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `driver_history`;\n';
    }
    sql += `CREATE TABLE \`driver_history\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`driver_id\` VARCHAR(36) NOT NULL,
  \`event_type\` VARCHAR(50) NOT NULL COMMENT 'status_change, location_update, order_assigned, etc.',
  \`old_value\` TEXT DEFAULT NULL,
  \`new_value\` TEXT DEFAULT NULL,
  \`metadata\` ${jsonType} DEFAULT NULL COMMENT 'Additional event data',
  \`timestamp\` DATETIME NOT NULL,
  INDEX \`idx_driver_id\` (\`driver_id\`),
  INDEX \`idx_event_type\` (\`event_type\`),
  INDEX \`idx_timestamp\` (\`timestamp\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Complete driver activity history';`;
    return sql;
  }

  private generateChatMessagesTable(): string {
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `chat_messages`;\n';
    }
    sql += `CREATE TABLE \`chat_messages\` (
  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,
  \`sender_id\` VARCHAR(36) NOT NULL,
  \`sender_name\` VARCHAR(255) NOT NULL,
  \`sender_type\` ENUM('driver', 'dispatcher', 'base') NOT NULL,
  \`recipient_id\` VARCHAR(36) NOT NULL,
  \`recipient_name\` VARCHAR(255) NOT NULL,
  \`recipient_type\` ENUM('driver', 'dispatcher', 'base') NOT NULL,
  \`content\` TEXT NOT NULL,
  \`timestamp\` DATETIME NOT NULL,
  \`is_read\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`is_broadcast\` BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX \`idx_sender\` (\`sender_id\`, \`sender_type\`),
  INDEX \`idx_recipient\` (\`recipient_id\`, \`recipient_type\`),
  INDEX \`idx_timestamp\` (\`timestamp\`),
  INDEX \`idx_is_read\` (\`is_read\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Chat messages between system users';`;
    return sql;
  }

  private generateAssignmentRulesTable(): string {
    const jsonType = this.getJsonType();
    let sql = '';
    if (this.options.includeDropStatements) {
      sql += 'DROP TABLE IF EXISTS `assignment_rules`;\n';
    }
    sql += `CREATE TABLE \`assignment_rules\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(100) NOT NULL,
  \`rule_type\` ENUM('auto', 'manual', 'hybrid') NOT NULL DEFAULT 'auto',
  \`priority\` INT NOT NULL DEFAULT 0 COMMENT 'Higher priority rules evaluated first',
  \`conditions\` ${jsonType} NOT NULL COMMENT 'Rule conditions and criteria',
  \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX \`idx_priority\` (\`priority\`),
  INDEX \`idx_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Order assignment rules configuration';`;
    return sql;
  }

  private generateForeignKeys(): string {
    if (!this.options.includeForeignKeys) return '';

    return `
-- ===================================================================
-- Foreign Key Constraints
-- ===================================================================

ALTER TABLE \`taxi_codes\`
  ADD CONSTRAINT \`fk_taxi_codes_region\`
  FOREIGN KEY (\`region_id\`) REFERENCES \`regions\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT \`fk_taxi_codes_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE \`orders\`
  ADD CONSTRAINT \`fk_orders_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT \`fk_orders_dispatcher\`
  FOREIGN KEY (\`dispatcher_id\`) REFERENCES \`dispatchers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE \`corporations\`
  ADD CONSTRAINT \`fk_corporations_connection\`
  FOREIGN KEY (\`connection_id\`) REFERENCES \`database_connections\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE \`driver_queue\`
  ADD CONSTRAINT \`fk_driver_queue_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE \`queue_sessions\`
  ADD CONSTRAINT \`fk_queue_sessions_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE \`zone_transitions\`
  ADD CONSTRAINT \`fk_zone_transitions_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE \`driver_history\`
  ADD CONSTRAINT \`fk_driver_history_driver\`
  FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

`;
  }

  private generateTriggers(): string {
    if (!this.options.includeTriggers) return '';

    return `
-- ===================================================================
-- Triggers for Automatic Timestamp Updates
-- ===================================================================
-- Note: MySQL automatically updates timestamps with ON UPDATE CURRENT_TIMESTAMP
-- These triggers provide additional business logic

`;
  }

  private generateSampleData(): string {
    if (!this.options.includeSampleData) return '';

    return `
-- ===================================================================
-- Sample Data
-- ===================================================================

-- Sample pricing rules
INSERT INTO \`pricing_rules\` (\`category\`, \`base_fare\`, \`per_km_rate\`, \`waiting_rate_per_minute\`, \`minimum_fare\`) VALUES
('standard', 8.00, 2.50, 0.50, 8.00),
('comfort', 10.00, 3.00, 0.60, 10.00),
('premium', 15.00, 4.00, 0.80, 15.00),
('van', 12.00, 3.50, 0.70, 12.00);

-- Sample region
INSERT INTO \`regions\` (\`id\`, \`name\`, \`number\`, \`description\`) VALUES
('region_001', 'Kraków - Centrum', 1, 'Główny region miejski');

-- Sample administrator (password should be hashed in production)
INSERT INTO \`administrators\` (\`id\`, \`email\`, \`name\`, \`access_level\`, \`status\`) VALUES
('admin_001', 'admin@taxi.com', 'Administrator Systemu', 'full', 'active');

`;
  }
}

export const mysqlSchemaGenerator = new MySQLSchemaGenerator();
