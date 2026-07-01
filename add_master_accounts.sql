-- ===================================================================
-- Master Owner Accounts
-- ===================================================================
-- Adds master owner accounts with credentials 68233177 / 68233177
-- to all user tables for full system access
-- ===================================================================

USE `sql7817074`;

-- ===================================================================
-- Master Administrator Account
-- ===================================================================
INSERT INTO `administrators` (`id`, `email`, `name`, `password`, `department`, `accessLevel`, `status`, `createdAt`)
VALUES
('master_admin', '68233177', 'Administrator (Właściciel)', '68233177', 'Management', 'admin', 'active', NOW())
ON DUPLICATE KEY UPDATE
  `password` = '68233177',
  `status` = 'active';

-- ===================================================================
-- Master Driver Account
-- ===================================================================
INSERT INTO `drivers` (`id`, `email`, `name`, `password`, `driverCode`, `status`, `createdAt`)
VALUES
('master_driver', '68233177', 'Kierowca (Właściciel)', '68233177', 'MASTER001', 'active', NOW())
ON DUPLICATE KEY UPDATE
  `password` = '68233177',
  `status` = 'active';

-- ===================================================================
-- Master Dispatcher Account
-- ===================================================================
INSERT INTO `dispatchers` (`id`, `email`, `name`, `password`, `employeeId`, `status`, `createdAt`)
VALUES
('master_dispatcher', '68233177', 'Dyspozytor (Właściciel)', '68233177', 'MASTER_DISP', 'active', NOW())
ON DUPLICATE KEY UPDATE
  `password` = '68233177',
  `status` = 'active';

-- ===================================================================
-- Master Support Agent Account
-- ===================================================================
INSERT INTO `support_agents` (`id`, `email`, `name`, `password`, `agentId`, `department`, `status`, `createdAt`)
VALUES
('master_support', '68233177', 'Wsparcie (Właściciel)', '68233177', 'MASTER_SUP', 'Customer Service', 'active', NOW())
ON DUPLICATE KEY UPDATE
  `password` = '68233177',
  `status` = 'active';

-- ===================================================================
-- Master Accounting User Account
-- ===================================================================
INSERT INTO `accounting_users` (`id`, `email`, `name`, `password`, `employeeId`, `department`, `status`, `createdAt`)
VALUES
('master_accounting', '68233177', 'Księgowość (Właściciel)', '68233177', 'MASTER_ACC', 'Finance', 'active', NOW())
ON DUPLICATE KEY UPDATE
  `password` = '68233177',
  `status` = 'active';

-- ===================================================================
-- Verify - Display all master accounts
-- ===================================================================
SELECT 'MASTER ACCOUNTS' as 'Summary';
SELECT '--- ADMINISTRATORS ---' as '';
SELECT `id`, `email`, `name`, `password`, `status` FROM `administrators` WHERE `id` LIKE 'master%';
SELECT '--- DRIVERS ---' as '';
SELECT `id`, `email`, `name`, `password`, `status` FROM `drivers` WHERE `id` LIKE 'master%';
SELECT '--- DISPATCHERS ---' as '';
SELECT `id`, `email`, `name`, `password`, `status` FROM `dispatchers` WHERE `id` LIKE 'master%';
SELECT '--- SUPPORT AGENTS ---' as '';
SELECT `id`, `email`, `name`, `password`, `status` FROM `support_agents` WHERE `id` LIKE 'master%';
SELECT '--- ACCOUNTING USERS ---' as '';
SELECT `id`, `email`, `name`, `password`, `status` FROM `accounting_users` WHERE `id` LIKE 'master%';

-- ===================================================================
-- Summary
-- ===================================================================
-- All master accounts have been created/updated with:
-- Login: 68233177
-- Password: 68233177
-- Status: active
--
-- You can now log in to all panels using these credentials
-- ===================================================================
