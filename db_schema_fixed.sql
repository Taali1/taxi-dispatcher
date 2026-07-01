-- ===================================================================
-- Taxi Dispatch System - MySQL Database Schema
-- ===================================================================
-- Fixed version for FreeSQLDatabase
-- Removed CURRENT_TIMESTAMP defaults to avoid compatibility issues
-- ===================================================================

USE `sql7817074`;

-- ===================================================================
-- Table: administrators
-- ===================================================================
DROP TABLE IF EXISTS `administrators`;
CREATE TABLE `administrators` (
  `id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `department` varchar(255),
  `access_level` varchar(50) DEFAULT 'user',
  `permissions` TEXT,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: drivers
-- ===================================================================
DROP TABLE IF EXISTS `drivers`;
CREATE TABLE `drivers` (
  `id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `driver_code` varchar(50),
  `pin` varchar(20),
  `license_number` varchar(50),
  `license_expiry` datetime,
  `phone_number` varchar(20),
  `side_number` varchar(50),
  `vehicle_brand` varchar(100),
  `vehicle_model` varchar(100),
  `vehicle_color` varchar(50),
  `registration_number` varchar(50),
  `current_zone` int,
  `zone_entered_at` datetime,
  `queue_position` int,
  `rating` DECIMAL(3,2),
  `total_rides` int DEFAULT 0,
  `current_location` TEXT,
  `vehicle_categories` TEXT,
  `emergency_contact` varchar(255),
  `documents` TEXT,
  `status` enum('free','driving','pickup','home','active','inactive','suspended') DEFAULT 'inactive',
  `previous_status` enum('free','driving','pickup','home','active','inactive','suspended'),
  `suspended_until` datetime,
  `latitude` DOUBLE,
  `longitude` DOUBLE,
  `last_location_update` datetime,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: dispatchers
-- ===================================================================
DROP TABLE IF EXISTS `dispatchers`;
CREATE TABLE `dispatchers` (
  `id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `employee_id` varchar(50),
  `shift` varchar(50),
  `assigned_zones` TEXT,
  `max_concurrent_orders` int DEFAULT 10,
  `phone_extension` varchar(20),
  `training_completed` boolean DEFAULT 0,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: support_agents
-- ===================================================================
DROP TABLE IF EXISTS `support_agents`;
CREATE TABLE `support_agents` (
  `id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `agent_id` varchar(50),
  `department` varchar(100),
  `languages` TEXT,
  `ticket_limit` int DEFAULT 15,
  `specializations` TEXT,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: accounting_users
-- ===================================================================
DROP TABLE IF EXISTS `accounting_users`;
CREATE TABLE `accounting_users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `employee_id` varchar(50),
  `access_level` varchar(50) DEFAULT 'user',
  `certifications` TEXT,
  `department` varchar(100),
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: zones
-- ===================================================================
DROP TABLE IF EXISTS `zones`;
CREATE TABLE `zones` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `number` int NOT NULL,
  `coordinates` TEXT,
  `drivers_count` int DEFAULT 0,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: regions
-- ===================================================================
DROP TABLE IF EXISTS `regions`;
CREATE TABLE `regions` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `number` int NOT NULL,
  `description` TEXT,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: taxi_codes
-- ===================================================================
DROP TABLE IF EXISTS `taxi_codes`;
CREATE TABLE `taxi_codes` (
  `id` varchar(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `region_id` varchar(36),
  `driver_id` varchar(36),
  `status` varchar(50) DEFAULT 'available',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: orders
-- ===================================================================
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` varchar(36) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_phone` varchar(20) NOT NULL,
  `pickup_address` TEXT NOT NULL,
  `destination_address` TEXT NOT NULL,
  `pickup_zone` int,
  `destination_zone` int,
  `status` varchar(50) DEFAULT 'new',
  `driver_id` varchar(36),
  `cost` decimal(10,2),
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_driver` (`driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: pricing_rules
-- ===================================================================
DROP TABLE IF EXISTS `pricing_rules`;
CREATE TABLE `pricing_rules` (
  `id` varchar(36) NOT NULL,
  `category` varchar(50) NOT NULL,
  `base_fare` decimal(10,2),
  `per_km_rate` decimal(10,2),
  `waiting_rate` decimal(10,2),
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: database_connections
-- ===================================================================
DROP TABLE IF EXISTS `database_connections`;
CREATE TABLE `database_connections` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(50) NOT NULL,
  `host` varchar(255),
  `port` int,
  `username` varchar(255),
  `password` varchar(255),
  `database` varchar(255),
  `is_active` boolean DEFAULT 0,
  `is_default` boolean DEFAULT 0,
  `last_connected` datetime,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: map_tokens
-- ===================================================================
DROP TABLE IF EXISTS `map_tokens`;
CREATE TABLE `map_tokens` (
  `id` varchar(36) NOT NULL,
  `token` TEXT NOT NULL,
  `provider` varchar(50),
  `created_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: custom_addresses
-- ===================================================================
DROP TABLE IF EXISTS `custom_addresses`;
CREATE TABLE `custom_addresses` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `lat` double,
  `lng` double,
  `created_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: chat_messages
-- ===================================================================
DROP TABLE IF EXISTS `chat_messages`;
CREATE TABLE `chat_messages` (
  `id` varchar(36) NOT NULL,
  `sender_id` varchar(36),
  `sender_name` varchar(255),
  `sender_type` varchar(50),
  `recipient_id` varchar(36),
  `recipient_name` varchar(255),
  `recipient_type` varchar(50),
  `content` TEXT,
  `timestamp` datetime,
  `is_read` boolean DEFAULT 0,
  `is_broadcast` boolean DEFAULT 0,
  `created_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_sender` (`sender_id`),
  INDEX `idx_recipient` (`recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: driver_queue
-- ===================================================================
DROP TABLE IF EXISTS `driver_queue`;
CREATE TABLE `driver_queue` (
  `id` varchar(36) NOT NULL,
  `driver_id` varchar(36) NOT NULL,
  `status` varchar(50) DEFAULT 'offline',
  `current_region_number` int,
  `status_started_at` datetime,
  `queue_position` int,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_driver` (`driver_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Table: driver_history
-- ===================================================================
DROP TABLE IF EXISTS `driver_history`;
CREATE TABLE `driver_history` (
  `id` varchar(36) NOT NULL,
  `driver_id` varchar(36) NOT NULL,
  `action` varchar(100),
  `details` TEXT,
  `timestamp` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_driver` (`driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================================================================
-- Sample Test Data
-- ===================================================================

INSERT INTO `administrators` (`id`, `email`, `name`, `password`, `department`, `access_level`, `status`) VALUES
('admin_1', 'admin@taxi.com', 'Administrator', 'password', 'Management', 'admin', 'active');

INSERT INTO `drivers` (`id`, `email`, `name`, `password`, `driver_code`, `phone_number`, `vehicle_brand`, `vehicle_model`, `pin`, `status`) VALUES
('driver_1', 'driver@taxi.com', 'Jan Kowalski', 'password', 'DRV001', '+48123456789', 'Toyota', 'Prius', '1234', 'active'),
('driver_2', 'driver2@taxi.com', 'Piotr Nowak', 'password', 'DRV002', '+48987654321', 'BMW', '320', '5678', 'active');

INSERT INTO `dispatchers` (`id`, `email`, `name`, `password`, `employee_id`, `shift`, `status`) VALUES
('dispatcher_1', 'dispatcher@taxi.com', 'Dispatcher', 'password', 'EMP001', 'morning', 'active');

INSERT INTO `support_agents` (`id`, `email`, `name`, `password`, `agent_id`, `department`, `status`) VALUES
('support_1', 'support@taxi.com', 'Support Agent', 'password', 'SUP001', 'Customer Service', 'active');

INSERT INTO `accounting_users` (`id`, `email`, `name`, `password`, `employee_id`, `department`, `status`) VALUES
('accounting_1', 'accounting@taxi.com', 'Accountant', 'password', 'ACC001', 'Finance', 'active');

INSERT INTO `zones` (`id`, `name`, `number`, `coordinates`, `drivers_count`) VALUES
('zone_1', 'Stare Miasto', 1, '[]', 2),
('zone_2', 'Kazimierz', 2, '[]', 1),
('zone_3', 'Podgórze', 3, '[]', 1);

INSERT INTO `pricing_rules` (`id`, `category`, `base_fare`, `per_km_rate`, `waiting_rate`) VALUES
('pricing_1', 'standard', 8.00, 2.50, 0.50),
('pricing_2', 'comfort', 10.00, 3.00, 0.60),
('pricing_3', 'premium', 15.00, 4.00, 0.80),
('pricing_4', 'van', 12.00, 3.50, 0.70);

-- Done!
