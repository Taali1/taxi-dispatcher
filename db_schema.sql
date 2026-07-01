-- ===================================================================
-- Taxi Dispatch System - MySQL Database Schema
-- ===================================================================
-- Generated for: taxi_db database
-- Charset: utf8mb4
-- Collation: utf8mb4_unicode_ci
-- Engine: InnoDB
-- ===================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+00:00';

-- ===================================================================
-- Use existing database (already created)
-- ===================================================================

USE `taxi_db`;

-- ===================================================================
-- Table: administrators
-- ===================================================================

DROP TABLE IF EXISTS `administrators`;
CREATE TABLE `administrators` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department` varchar(255) COLLATE utf8mb4_unicode_ci,
  `accessLevel` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `permissions` TEXT COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: drivers
-- ===================================================================

DROP TABLE IF EXISTS `drivers`;
CREATE TABLE `drivers` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `driverCode` varchar(50) COLLATE utf8mb4_unicode_ci,
  `phoneNumber` varchar(20) COLLATE utf8mb4_unicode_ci,
  `sideNumber` varchar(50) COLLATE utf8mb4_unicode_ci,
  `vehicleBrand` varchar(100) COLLATE utf8mb4_unicode_ci,
  `vehicleModel` varchar(100) COLLATE utf8mb4_unicode_ci,
  `vehicleColor` varchar(50) COLLATE utf8mb4_unicode_ci,
  `registrationNumber` varchar(50) COLLATE utf8mb4_unicode_ci,
  `status` enum('free','driving','pickup','home','active','inactive','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'inactive',
  `previous_status` enum('free','driving','pickup','home','active','inactive','suspended') COLLATE utf8mb4_unicode_ci,
  `current_location` TEXT COLLATE utf8mb4_unicode_ci,
  `suspendedUntil` datetime,
  `latitude` DOUBLE,
  `longitude` DOUBLE,
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: dispatchers
-- ===================================================================

DROP TABLE IF EXISTS `dispatchers`;
CREATE TABLE `dispatchers` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(50) COLLATE utf8mb4_unicode_ci,
  `shift` varchar(50) COLLATE utf8mb4_unicode_ci,
  `assignedZones` TEXT COLLATE utf8mb4_unicode_ci,
  `maxConcurrentOrders` int DEFAULT 10,
  `status` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: support_agents
-- ===================================================================

DROP TABLE IF EXISTS `support_agents`;
CREATE TABLE `support_agents` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agentId` varchar(50) COLLATE utf8mb4_unicode_ci,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci,
  `languages` TEXT COLLATE utf8mb4_unicode_ci,
  `ticketLimit` int DEFAULT 15,
  `specializations` TEXT COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: accounting_users
-- ===================================================================

DROP TABLE IF EXISTS `accounting_users`;
CREATE TABLE `accounting_users` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(50) COLLATE utf8mb4_unicode_ci,
  `accessLevel` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `certifications` TEXT COLLATE utf8mb4_unicode_ci,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: zones
-- ===================================================================

DROP TABLE IF EXISTS `zones`;
CREATE TABLE `zones` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `number` int NOT NULL,
  `coordinates` TEXT COLLATE utf8mb4_unicode_ci,
  `driversCount` int DEFAULT 0,
  `createdAt` datetime,
  `updatedAt` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: regions
-- ===================================================================

DROP TABLE IF EXISTS `regions`;
CREATE TABLE `regions` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `number` int NOT NULL,
  `description` TEXT COLLATE utf8mb4_unicode_ci,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: taxi_codes
-- ===================================================================

DROP TABLE IF EXISTS `taxi_codes`;
CREATE TABLE `taxi_codes` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `region_id` varchar(36) COLLATE utf8mb4_unicode_ci,
  `driver_id` varchar(36) COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: orders
-- ===================================================================

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pickup_address` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination_address` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `pickup_zone` int,
  `destination_zone` int,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'new',
  `driver_id` varchar(36) COLLATE utf8mb4_unicode_ci,
  `cost` decimal(10,2),
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_driver` (`driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: pricing_rules
-- ===================================================================

DROP TABLE IF EXISTS `pricing_rules`;
CREATE TABLE `pricing_rules` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_fare` decimal(10,2),
  `per_km_rate` decimal(10,2),
  `waiting_rate` decimal(10,2),
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: database_connections
-- ===================================================================

DROP TABLE IF EXISTS `database_connections`;
CREATE TABLE `database_connections` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host` varchar(255) COLLATE utf8mb4_unicode_ci,
  `port` int,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci,
  `database` varchar(255) COLLATE utf8mb4_unicode_ci,
  `is_active` boolean DEFAULT false,
  `is_default` boolean DEFAULT false,
  `last_connected` datetime,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: map_tokens
-- ===================================================================

DROP TABLE IF EXISTS `map_tokens`;
CREATE TABLE `map_tokens` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(50) COLLATE utf8mb4_unicode_ci,
  `created_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: custom_addresses
-- ===================================================================

DROP TABLE IF EXISTS `custom_addresses`;
CREATE TABLE `custom_addresses` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` double,
  `lng` double,
  `created_at` datetime,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: chat_messages
-- ===================================================================

DROP TABLE IF EXISTS `chat_messages`;
CREATE TABLE `chat_messages` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sender_id` varchar(36) COLLATE utf8mb4_unicode_ci,
  `sender_name` varchar(255) COLLATE utf8mb4_unicode_ci,
  `recipient_id` varchar(36) COLLATE utf8mb4_unicode_ci,
  `recipient_name` varchar(255) COLLATE utf8mb4_unicode_ci,
  `content` TEXT COLLATE utf8mb4_unicode_ci,
  `timestamp` datetime,
  `is_broadcast` boolean DEFAULT false,
  `created_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_sender` (`sender_id`),
  INDEX `idx_recipient` (`recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: driver_queue
-- ===================================================================

DROP TABLE IF EXISTS `driver_queue`;
CREATE TABLE `driver_queue` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `driver_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'offline',
  `current_region_number` int,
  `status_started_at` datetime,
  `queue_position` int,
  `created_at` datetime,
  `updated_at` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_driver` (`driver_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Table: driver_history
-- ===================================================================

DROP TABLE IF EXISTS `driver_history`;
CREATE TABLE `driver_history` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `driver_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci,
  `details` TEXT COLLATE utf8mb4_unicode_ci,
  `timestamp` datetime,
  PRIMARY KEY (`id`),
  INDEX `idx_driver` (`driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- Sample Test Data
-- ===================================================================

-- Administrator test account
INSERT INTO `administrators` (`id`, `email`, `name`, `password`, `department`, `accessLevel`, `status`) VALUES
('admin_1', 'admin@taxi.com', 'Administrator', 'password', 'Management', 'admin', 'active');

-- Driver test accounts
INSERT INTO `drivers` (`id`, `email`, `name`, `password`, `driverCode`, `phoneNumber`, `vehicleBrand`, `vehicleModel`, `status`) VALUES
('driver_1', 'driver@taxi.com', 'Jan Kowalski', 'password', 'DRV001', '+48123456789', 'Toyota', 'Prius', 'active'),
('driver_2', 'driver2@taxi.com', 'Piotr Nowak', 'password', 'DRV002', '+48987654321', 'BMW', '320', 'active');

-- Dispatcher test account
INSERT INTO `dispatchers` (`id`, `email`, `name`, `password`, `employeeId`, `shift`, `status`) VALUES
('dispatcher_1', 'dispatcher@taxi.com', 'Dispatcher', 'password', 'EMP001', 'morning', 'active');

-- Support agent test account
INSERT INTO `support_agents` (`id`, `email`, `name`, `password`, `agentId`, `department`, `status`) VALUES
('support_1', 'support@taxi.com', 'Support Agent', 'password', 'SUP001', 'Customer Service', 'active');

-- Accounting user test account
INSERT INTO `accounting_users` (`id`, `email`, `name`, `password`, `employeeId`, `department`, `status`) VALUES
('accounting_1', 'accounting@taxi.com', 'Accountant', 'password', 'ACC001', 'Finance', 'active');

-- Test zones
INSERT INTO `zones` (`id`, `name`, `number`, `coordinates`, `driversCount`) VALUES
('zone_1', 'Stare Miasto', 1, '[]', 2),
('zone_2', 'Kazimierz', 2, '[]', 1),
('zone_3', 'Podgórze', 3, '[]', 1);

-- Test pricing rules
INSERT INTO `pricing_rules` (`id`, `category`, `base_fare`, `per_km_rate`, `waiting_rate`) VALUES
('pricing_1', 'standard', 8.00, 2.50, 0.50),
('pricing_2', 'comfort', 10.00, 3.00, 0.60),
('pricing_3', 'premium', 15.00, 4.00, 0.80),
('pricing_4', 'van', 12.00, 3.50, 0.70);

SET FOREIGN_KEY_CHECKS = 1;
