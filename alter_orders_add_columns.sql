-- ===================================================================
-- Migracja: dodanie brakujących kolumn do tabeli orders
-- ===================================================================

ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `order_number`    VARCHAR(20)    NULL,
  ADD COLUMN IF NOT EXISTS `customer_id`     VARCHAR(36)    NULL,
  ADD COLUMN IF NOT EXISTS `pickup_region_id` INT           NULL,
  ADD COLUMN IF NOT EXISTS `vehicle_category` VARCHAR(50)   NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS `payment_method`  VARCHAR(50)    NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS `taxi_count`      INT            NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `scheduled_date`  DATE           NULL,
  ADD COLUMN IF NOT EXISTS `scheduled_time`  VARCHAR(10)    NULL,
  ADD COLUMN IF NOT EXISTS `notes`           TEXT           NULL,
  ADD COLUMN IF NOT EXISTS `order_type`      VARCHAR(50)    NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS `client_info`     TEXT           NULL,
  ADD COLUMN IF NOT EXISTS `internal_info`   TEXT           NULL,
  ADD COLUMN IF NOT EXISTS `preference_ids`  TEXT           NULL,
  ADD COLUMN IF NOT EXISTS `operator`        VARCHAR(255)   NULL,
  ADD COLUMN IF NOT EXISTS `pickup_lat`      DOUBLE         NULL,
  ADD COLUMN IF NOT EXISTS `pickup_lng`      DOUBLE         NULL,
  ADD COLUMN IF NOT EXISTS `destination_lat` DOUBLE         NULL,
  ADD COLUMN IF NOT EXISTS `destination_lng` DOUBLE         NULL;
