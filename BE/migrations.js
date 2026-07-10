import { safeQuery } from './db.js';

// ============================================================================
// MIGRACJA BAZY DANYCH — dodaje brakujące kolumny jeśli nie istnieją
// ============================================================================
export async function runMigrations() {
  const report = await runMigrationsWithReport();
  if (report.tablesCreated.length > 0) {
    console.log('[Migration] ✅ Utworzono tabele:', report.tablesCreated.join(', '));
  }
  if (report.columnsAdded.length > 0) {
    console.log('[Migration] ✅ Dodano kolumny:', report.columnsAdded.join(', '));
  }
  if (report.alreadyOk) {
    console.log('[Migration] ✅ Wszystkie tabele i kolumny już istnieją');
  }
  console.log('[Migration] ✅ Tabele gotowe');
}

export async function runMigrationsWithReport() {
  const tablesCreated = [];
  const columnsAdded = [];

  const existingTables = await safeQuery(`SHOW TABLES`);
  const tableNames = existingTables.map(r => Object.values(r)[0]);

  const tableDefs = [
    {
      name: 'driver_notifications',
      sql: `CREATE TABLE IF NOT EXISTS driver_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT,
        order_id VARCHAR(36),
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_driver_id (driver_id),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    },
    {
      name: 'order_logs',
      sql: `CREATE TABLE IF NOT EXISTS order_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        data JSON NULL,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_order_id (order_id),
        INDEX idx_created_at (created_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    },
    {
      name: 'zones',
      sql: `CREATE TABLE IF NOT EXISTS zones (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        number INT UNIQUE NOT NULL,
        coordinates TEXT,
        drivers_count INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        color VARCHAR(20) DEFAULT '#3b82f6',
        preference_id INT NULL,
        scheduled_dispatch_minutes INT DEFAULT 10,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'city_boundaries',
      sql: `CREATE TABLE IF NOT EXISTS city_boundaries (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(20) DEFAULT '#f97316',
        coordinates TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'drivers',
      sql: `CREATE TABLE IF NOT EXISTS drivers (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        driver_code VARCHAR(50),
        pin VARCHAR(20),
        status ENUM('free','driving','pickup','home','active','inactive','suspended') DEFAULT 'inactive',
        current_zone INT NULL,
        zone_entered_at DATETIME NULL,
        queue_position INT NULL,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        last_location_update DATETIME NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL,
        free_since DATETIME NULL,
        status_changed_at DATETIME NULL,
        is_online TINYINT(1) NOT NULL DEFAULT 0,
        last_seen DATETIME NULL,
        license_number VARCHAR(50) NULL,
        license_expiry DATETIME NULL,
        phone_number VARCHAR(20) NULL,
        side_number VARCHAR(50) NULL,
        vehicle_brand VARCHAR(100) NULL,
        vehicle_model VARCHAR(100) NULL,
        vehicle_color VARCHAR(50) NULL,
        registration_number VARCHAR(50) NULL,
        suspended_until DATETIME NULL,
        previous_status ENUM('free','driving','pickup','home','active','inactive','suspended') NULL,
        rating DECIMAL(3,2) NULL,
        total_rides INT DEFAULT 0,
        vehicle_categories TEXT NULL,
        emergency_contact VARCHAR(255) NULL,
        documents TEXT NULL,
        session_token VARCHAR(64) NULL,
        preference_ids VARCHAR(1000) DEFAULT '[]',
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'chat_messages',
      sql: `CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        sender_id VARCHAR(36),
        sender_name VARCHAR(255),
        sender_type VARCHAR(50),
        receiver_id VARCHAR(36),
        receiver_name VARCHAR(255),
        receiver_type VARCHAR(50),
        message TEXT,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'orders',
      sql: `CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(36) PRIMARY KEY,
        order_number VARCHAR(20) UNIQUE,
        driver_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        pickup_address TEXT,
        destination_address TEXT,
        pickup_region_id INT NULL,
        vehicle_category VARCHAR(50) DEFAULT 'standard',
        payment_method VARCHAR(50) DEFAULT 'cash',
        taxi_count INT DEFAULT 1,
        scheduled_date DATE NULL,
        scheduled_time TIME NULL,
        notes TEXT,
        order_type VARCHAR(50) DEFAULT 'standard',
        client_info TEXT,
        internal_info TEXT,
        preference_ids JSON NULL,
        operator VARCHAR(255) NULL,
        pickup_lat DOUBLE NULL,
        pickup_lng DOUBLE NULL,
        destination_lat DOUBLE NULL,
        destination_lng DOUBLE NULL,
        status VARCHAR(50) DEFAULT 'new',
        cost DECIMAL(10,2) NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'clients',
      sql: `CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(36) PRIMARY KEY,
        phone_number VARCHAR(50) UNIQUE NOT NULL,
        client_name VARCHAR(255),
        client_code VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255) NULL,
        company_name VARCHAR(255) NULL,
        street VARCHAR(255) NULL,
        city VARCHAR(100) NULL,
        postal_code VARCHAR(20) NULL,
        nip VARCHAR(20) NULL,
        client_info TEXT NULL,
        internal_info TEXT NULL,
        permanent_preference_ids JSON NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'administrators',
      sql: `CREATE TABLE IF NOT EXISTS administrators (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'dispatchers',
      sql: `CREATE TABLE IF NOT EXISTS dispatchers (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'support_agents',
      sql: `CREATE TABLE IF NOT EXISTS support_agents (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'driver_queue',
      sql: `CREATE TABLE IF NOT EXISTS driver_queue (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36),
        name VARCHAR(255),
        email VARCHAR(100),
        driver_code VARCHAR(50),
        status ENUM('free','driving','pickup','home','active','inactive','suspended') DEFAULT 'inactive',
        current_zone INT NULL,
        zone_entered_at DATETIME NULL,
        queue_position INT NULL,
        free_since DATETIME NULL,
        status_changed_at DATETIME NULL,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        last_location_update DATETIME NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL,
        is_online TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'regions',
      sql: `CREATE TABLE IF NOT EXISTS regions (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        number INT NULL,
        description TEXT NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'accounting_users',
      sql: `CREATE TABLE IF NOT EXISTS accounting_users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'taxi_codes',
      sql: `CREATE TABLE IF NOT EXISTS taxi_codes (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'pricing_rules',
      sql: `CREATE TABLE IF NOT EXISTS pricing_rules (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        base_fare DECIMAL(10,2) DEFAULT 0,
        per_km DECIMAL(10,2) DEFAULT 0,
        per_minute DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'map_tokens',
      sql: `CREATE TABLE IF NOT EXISTS map_tokens (
        id VARCHAR(36) PRIMARY KEY,
        token TEXT NOT NULL,
        provider VARCHAR(50) DEFAULT 'mapbox',
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'custom_addresses',
      sql: `CREATE TABLE IF NOT EXISTS custom_addresses (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'address_pins',
      sql: `CREATE TABLE IF NOT EXISTS address_pins (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DECIMAL(10,8) NOT NULL,
        lng DECIMAL(11,8) NOT NULL,
        preference_ids JSON NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'driver_history',
      sql: `CREATE TABLE IF NOT EXISTS driver_history (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36),
        event_type VARCHAR(100),
        zone_number INT NULL,
        driver_state VARCHAR(50),
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'database_connections',
      sql: `CREATE TABLE IF NOT EXISTS database_connections (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        host VARCHAR(255),
        port INT DEFAULT 3306,
        username VARCHAR(100),
        password VARCHAR(255),
        database_name VARCHAR(100),
        is_active TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'settings',
      sql: `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        base_city VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'dispatcher_tasks',
      sql: `CREATE TABLE IF NOT EXISTS dispatcher_tasks (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        taxi_code VARCHAR(50) NULL,
        operator VARCHAR(255) NULL,
        order_id VARCHAR(36) NULL,
        order_number VARCHAR(20) NULL,
        status ENUM('new','in_progress','done','dismissed') DEFAULT 'new',
        source ENUM('system','manual') DEFAULT 'system',
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )`
    },
    {
      name: 'zone_assignment_rules',
      sql: `CREATE TABLE IF NOT EXISTS zone_assignment_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_zone INT NOT NULL,
        priority INT NOT NULL,
        search_zone INT NULL,
        driver_state ENUM('wolna','dojazd','zajeta','kursem') NOT NULL DEFAULT 'wolna',
        step_type VARCHAR(10) NOT NULL DEFAULT 'zone',
        radius_km DECIMAL(5,2) NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
        UNIQUE KEY uq_zone_priority (source_zone, priority),
        INDEX idx_source_zone (source_zone)
      )`
    },
    {
      name: 'zone_settings',
      sql: `CREATE TABLE IF NOT EXISTS zone_settings (
        source_zone INT PRIMARY KEY,
        fallback_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
      )`
    },
    {
      name: 'preferences',
      sql: `CREATE TABLE IF NOT EXISTS preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        color VARCHAR(20) DEFAULT '#3b82f6',
        icon VARCHAR(100) DEFAULT 'Star',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    },
    {
      name: 'driver_preferences',
      sql: `CREATE TABLE IF NOT EXISTS driver_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        preference_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (preference_id) REFERENCES preferences(id) ON DELETE CASCADE,
        UNIQUE KEY unique_driver_pref (driver_id, preference_id)
      )`
    },
    {
      name: 'driver_queries',
      sql: `CREATE TABLE IF NOT EXISTS driver_queries (
        id VARCHAR(36) PRIMARY KEY,
        driver_id VARCHAR(36) NOT NULL,
        question TEXT NOT NULL,
        answer VARCHAR(100) NULL,
        status ENUM('pending','answered') DEFAULT 'pending',
        created_at DATETIME DEFAULT NOW(),
        answered_at DATETIME NULL
      )`
    }
  ];

  for (const def of tableDefs) {
    const existed = tableNames.includes(def.name);
    try {
      await safeQuery(def.sql);
      if (!existed) {
        tablesCreated.push(def.name);
      }
    } catch (e) {
      console.error(`[Migration] Błąd tworzenia tabeli ${def.name}: ${e.message}`);
    }
  }

  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules ADD COLUMN step_type VARCHAR(10) NOT NULL DEFAULT 'zone'`);
    console.log('[Migration] zone_assignment_rules: dodano kolumnę step_type');
  } catch(e) { /* already exists */ }
  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules ADD COLUMN radius_km DECIMAL(5,2) NULL`);
    console.log('[Migration] zone_assignment_rules: dodano kolumnę radius_km');
  } catch(e) { /* already exists */ }
  try {
    await safeQuery(`ALTER TABLE zone_assignment_rules MODIFY COLUMN search_zone INT NULL`);
    console.log('[Migration] zone_assignment_rules: search_zone zmieniona na nullable');
  } catch(e) { /* already done */ }

  let columns = await safeQuery(`SHOW COLUMNS FROM drivers`);
  let colNames = columns.map(c => c.Field);

  const renameOps = [
    { from: 'driverCode',         to: 'driver_code',         type: 'VARCHAR(50)' },
    { from: 'phoneNumber',        to: 'phone_number',        type: 'VARCHAR(20)' },
    { from: 'sideNumber',         to: 'side_number',         type: 'VARCHAR(50)' },
    { from: 'vehicleBrand',       to: 'vehicle_brand',       type: 'VARCHAR(100)' },
    { from: 'vehicleModel',       to: 'vehicle_model',       type: 'VARCHAR(100)' },
    { from: 'vehicleColor',       to: 'vehicle_color',       type: 'VARCHAR(50)' },
    { from: 'registrationNumber', to: 'registration_number', type: 'VARCHAR(50)' },
    { from: 'suspendedUntil',     to: 'suspended_until',     type: 'DATETIME' },
    { from: 'createdAt',          to: 'created_at',          type: 'DATETIME' },
    { from: 'updatedAt',          to: 'updated_at',          type: 'DATETIME' },
  ];

  for (const op of renameOps) {
    if (colNames.includes(op.from) && !colNames.includes(op.to)) {
      try {
        await safeQuery(`ALTER TABLE drivers CHANGE COLUMN \`${op.from}\` \`${op.to}\` ${op.type}`);
        columnsAdded.push(`${op.from}→${op.to}`);
      } catch (e) {
        console.warn(`[Migration] Nie można zmienić nazwy kolumny ${op.from}: ${e.message}`);
      }
    }
  }

  columns = await safeQuery(`SHOW COLUMNS FROM drivers`);
  colNames = columns.map(c => c.Field);

  const colDefs = [
    { name: 'driver_state',         sql: `ADD COLUMN driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL` },
    { name: 'free_since',           sql: `ADD COLUMN free_since DATETIME NULL DEFAULT NULL` },
    { name: 'status_changed_at',    sql: `ADD COLUMN status_changed_at DATETIME NULL DEFAULT NULL` },
    { name: 'is_online',            sql: `ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0` },
    { name: 'last_seen',            sql: `ADD COLUMN last_seen DATETIME NULL DEFAULT NULL` },
    { name: 'queue_position',       sql: `ADD COLUMN queue_position INT NULL DEFAULT NULL` },
    { name: 'zone_entered_at',      sql: `ADD COLUMN zone_entered_at DATETIME NULL DEFAULT NULL` },
    { name: 'current_zone',         sql: `ADD COLUMN current_zone INT NULL DEFAULT NULL` },
    { name: 'latitude',             sql: `ADD COLUMN latitude DOUBLE NULL DEFAULT NULL` },
    { name: 'longitude',            sql: `ADD COLUMN longitude DOUBLE NULL DEFAULT NULL` },
    { name: 'last_location_update', sql: `ADD COLUMN last_location_update DATETIME NULL DEFAULT NULL` },
    { name: 'driver_code',          sql: `ADD COLUMN driver_code VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'pin',                  sql: `ADD COLUMN pin VARCHAR(20) NULL DEFAULT NULL` },
    { name: 'license_number',       sql: `ADD COLUMN license_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'license_expiry',       sql: `ADD COLUMN license_expiry DATETIME NULL DEFAULT NULL` },
    { name: 'phone_number',         sql: `ADD COLUMN phone_number VARCHAR(20) NULL DEFAULT NULL` },
    { name: 'side_number',          sql: `ADD COLUMN side_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'vehicle_brand',        sql: `ADD COLUMN vehicle_brand VARCHAR(100) NULL DEFAULT NULL` },
    { name: 'vehicle_model',        sql: `ADD COLUMN vehicle_model VARCHAR(100) NULL DEFAULT NULL` },
    { name: 'vehicle_color',        sql: `ADD COLUMN vehicle_color VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'registration_number',  sql: `ADD COLUMN registration_number VARCHAR(50) NULL DEFAULT NULL` },
    { name: 'suspended_until',      sql: `ADD COLUMN suspended_until DATETIME NULL DEFAULT NULL` },
    { name: 'previous_status',      sql: `ADD COLUMN previous_status ENUM('free','driving','pickup','home','active','inactive','suspended') NULL DEFAULT NULL` },
    { name: 'rating',               sql: `ADD COLUMN rating DECIMAL(3,2) NULL DEFAULT NULL` },
    { name: 'total_rides',          sql: `ADD COLUMN total_rides INT DEFAULT 0` },
    { name: 'vehicle_categories',   sql: `ADD COLUMN vehicle_categories TEXT NULL` },
    { name: 'emergency_contact',    sql: `ADD COLUMN emergency_contact VARCHAR(255) NULL DEFAULT NULL` },
    { name: 'documents',            sql: `ADD COLUMN documents TEXT NULL` },
    { name: 'session_token',        sql: `ADD COLUMN session_token VARCHAR(64) NULL DEFAULT NULL` },
    { name: 'preference_ids',       sql: `ADD COLUMN preference_ids VARCHAR(1000) DEFAULT '[]'` },
  ];

  const toAdd = colDefs.filter(c => !colNames.includes(c.name));
  if (toAdd.length > 0) {
    await safeQuery(`ALTER TABLE drivers ${toAdd.map(c => c.sql).join(', ')}`);
    columnsAdded.push(...toAdd.map(c => c.name));
  }

  try {
    await safeQuery(
      `ALTER TABLE drivers MODIFY COLUMN driver_state ENUM('wolna','dojazd','zajeta','kursem') NULL DEFAULT NULL`
    );
    console.log('[Migration] driver_state ENUM rozszerzony o zajeta');
  } catch (e) {
    console.warn('[Migration] driver_state ENUM — pominięto:', e.message);
  }

  const zoneColumns = await safeQuery(`SHOW COLUMNS FROM zones`);
  const zoneColNames = zoneColumns.map(c => c.Field);
  const zoneColDefs = [
    { name: 'drivers_count',             sql: `ADD COLUMN drivers_count INT DEFAULT 0` },
    { name: 'is_active',                 sql: `ADD COLUMN is_active TINYINT(1) DEFAULT 1` },
    { name: 'color',                     sql: `ADD COLUMN color VARCHAR(20) DEFAULT '#3b82f6'` },
    { name: 'updated_at',                sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
    { name: 'preference_id',             sql: `ADD COLUMN preference_id INT NULL` },
    { name: 'scheduled_dispatch_minutes',sql: `ADD COLUMN scheduled_dispatch_minutes INT DEFAULT 10` },
  ];
  const zoneToAdd = zoneColDefs.filter(c => !zoneColNames.includes(c.name));
  if (zoneToAdd.length > 0) {
    for (const col of zoneToAdd) {
      try {
        await safeQuery(`ALTER TABLE zones ${col.sql}`);
        columnsAdded.push(`zones.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] zones.${col.name}: ${e.message}`);
      }
    }
  }

  try {
    const prefColumns = await safeQuery(`SHOW COLUMNS FROM preferences`);
    const prefColNames = prefColumns.map(c => c.Field);
    const prefColDefs = [
      { name: 'color', sql: `ADD COLUMN color VARCHAR(20) DEFAULT '#3b82f6'` },
      { name: 'icon',  sql: `ADD COLUMN icon VARCHAR(100) DEFAULT 'Star'` },
    ];
    const prefToAdd = prefColDefs.filter(c => !prefColNames.includes(c.name));
    for (const col of prefToAdd) {
      try {
        await safeQuery(`ALTER TABLE preferences ${col.sql}`);
        columnsAdded.push(`preferences.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] preferences.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('[Migration] Tabela preferences nie istnieje jeszcze:', e.message);
  }

  const regionColumns = await safeQuery(`SHOW COLUMNS FROM regions`);
  const regionColNames = regionColumns.map(c => c.Field);
  const regionColDefs = [
    { name: 'number',      sql: `ADD COLUMN number INT NULL` },
    { name: 'description', sql: `ADD COLUMN description TEXT NULL` },
    { name: 'updated_at',  sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
  ];
  const regionToAdd = regionColDefs.filter(c => !regionColNames.includes(c.name));
  if (regionToAdd.length > 0) {
    await safeQuery(`ALTER TABLE regions ${regionToAdd.map(c => c.sql).join(', ')}`);
    columnsAdded.push(...regionToAdd.map(c => `regions.${c.name}`));
  }

  const orderColumns = await safeQuery(`SHOW COLUMNS FROM orders`);
  const orderColNames = orderColumns.map(c => c.Field);
  const orderColDefs = [
    { name: 'order_number',    sql: `ADD COLUMN order_number VARCHAR(20) UNIQUE` },
    { name: 'customer_id',     sql: `ADD COLUMN customer_id VARCHAR(36) NULL` },
    { name: 'customer_name',   sql: `ADD COLUMN customer_name VARCHAR(255)` },
    { name: 'customer_phone',  sql: `ADD COLUMN customer_phone VARCHAR(50)` },
    { name: 'pickup_region_id',sql: `ADD COLUMN pickup_region_id INT NULL` },
    { name: 'vehicle_category',sql: `ADD COLUMN vehicle_category VARCHAR(50) DEFAULT 'standard'` },
    { name: 'payment_method',  sql: `ADD COLUMN payment_method VARCHAR(50) DEFAULT 'cash'` },
    { name: 'taxi_count',      sql: `ADD COLUMN taxi_count INT DEFAULT 1` },
    { name: 'scheduled_date',  sql: `ADD COLUMN scheduled_date DATE NULL` },
    { name: 'scheduled_time',  sql: `ADD COLUMN scheduled_time TIME NULL` },
    { name: 'notes',           sql: `ADD COLUMN notes TEXT` },
    { name: 'order_type',      sql: `ADD COLUMN order_type VARCHAR(50) DEFAULT 'standard'` },
    { name: 'client_info',     sql: `ADD COLUMN client_info TEXT` },
    { name: 'internal_info',   sql: `ADD COLUMN internal_info TEXT` },
    { name: 'preference_ids',  sql: `ADD COLUMN preference_ids JSON NULL` },
    { name: 'operator',        sql: `ADD COLUMN operator VARCHAR(255) NULL` },
    { name: 'pickup_lat',      sql: `ADD COLUMN pickup_lat DOUBLE NULL` },
    { name: 'pickup_lng',      sql: `ADD COLUMN pickup_lng DOUBLE NULL` },
    { name: 'destination_lat', sql: `ADD COLUMN destination_lat DOUBLE NULL` },
    { name: 'destination_lng', sql: `ADD COLUMN destination_lng DOUBLE NULL` },
    { name: 'cost',            sql: `ADD COLUMN cost DECIMAL(10,2) NULL` },
    { name: 'updated_at',      sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
  ];
  const orderToAdd = orderColDefs.filter(c => !orderColNames.includes(c.name));
  if (orderToAdd.length > 0) {
    for (const col of orderToAdd) {
      try {
        await safeQuery(`ALTER TABLE orders ${col.sql}`);
        columnsAdded.push(`orders.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] orders.${col.name}: ${e.message}`);
      }
    }
  }

  try {
    const dispCols = await safeQuery(`SHOW COLUMNS FROM dispatchers`);
    const dispColNames = (dispCols ?? []).map(c => c.Field);
    const dispColDefs = [
      { name: 'employee_id',            sql: `ADD COLUMN employee_id VARCHAR(50) NULL` },
      { name: 'status',                 sql: `ADD COLUMN status VARCHAR(50) DEFAULT 'active'` },
      { name: 'shift',                  sql: `ADD COLUMN shift VARCHAR(50) DEFAULT 'morning'` },
      { name: 'assigned_zones',         sql: `ADD COLUMN assigned_zones JSON NULL` },
      { name: 'max_concurrent_orders',  sql: `ADD COLUMN max_concurrent_orders INT DEFAULT 15` },
      { name: 'phone_extension',        sql: `ADD COLUMN phone_extension VARCHAR(50) NULL` },
      { name: 'training_completed',     sql: `ADD COLUMN training_completed TINYINT(1) DEFAULT 0` },
      { name: 'updated_at',             sql: `ADD COLUMN updated_at DATETIME DEFAULT NOW()` },
      { name: 'created_at',             sql: `ADD COLUMN created_at DATETIME DEFAULT NOW()` },
    ];
    for (const col of dispColDefs.filter(c => !dispColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE dispatchers ${col.sql}`);
        columnsAdded.push(`dispatchers.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] dispatchers.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`[Migration] dispatchers columns: ${e.message}`);
  }

  try {
    const chatCols = await safeQuery(`SHOW COLUMNS FROM chat_messages`);
    const chatColNames = chatCols.map(c => c.Field);
    const chatColDefs = [
      { name: 'sender_name',   sql: `ADD COLUMN sender_name   VARCHAR(255) NULL` },
      { name: 'sender_type',   sql: `ADD COLUMN sender_type   VARCHAR(50)  NULL` },
      { name: 'receiver_id',   sql: `ADD COLUMN receiver_id   VARCHAR(36)  NULL` },
      { name: 'receiver_name', sql: `ADD COLUMN receiver_name VARCHAR(255) NULL` },
      { name: 'receiver_type', sql: `ADD COLUMN receiver_type VARCHAR(50)  NULL` },
      { name: 'message',       sql: `ADD COLUMN message       TEXT         NULL` },
      { name: 'is_read',       sql: `ADD COLUMN is_read       TINYINT(1)   DEFAULT 0` },
    ];
    for (const col of chatColDefs.filter(c => !chatColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE chat_messages ${col.sql}`);
        columnsAdded.push(`chat_messages.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] chat_messages.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`[Migration] chat_messages columns: ${e.message}`);
  }

  try {
    const clientCols = await safeQuery(`SHOW COLUMNS FROM clients`);
    const clientColNames = clientCols.map(c => c.Field);
    const clientColDefs = [
      { name: 'client_info',              sql: `ADD COLUMN client_info TEXT NULL`                   },
      { name: 'internal_info',            sql: `ADD COLUMN internal_info TEXT NULL`                 },
      { name: 'permanent_preference_ids', sql: `ADD COLUMN permanent_preference_ids JSON NULL`      },
      { name: 'email',                    sql: `ADD COLUMN email VARCHAR(255) NULL`                 },
      { name: 'company_name',             sql: `ADD COLUMN company_name VARCHAR(255) NULL`          },
      { name: 'street',                   sql: `ADD COLUMN street VARCHAR(255) NULL`                },
      { name: 'city',                     sql: `ADD COLUMN city VARCHAR(100) NULL`                  },
      { name: 'postal_code',              sql: `ADD COLUMN postal_code VARCHAR(20) NULL`            },
      { name: 'nip',                      sql: `ADD COLUMN nip VARCHAR(20) NULL`                    },
    ];
    for (const col of clientColDefs.filter(c => !clientColNames.includes(c.name))) {
      try {
        await safeQuery(`ALTER TABLE clients ${col.sql}`);
        columnsAdded.push(`clients.${col.name}`);
      } catch (e) {
        console.warn(`[Migration] clients.${col.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('[Migration] Tabela clients — migracja pól:', e.message);
  }

  try {
    const settingsCols = await safeQuery(`SHOW COLUMNS FROM settings`);
    const settingsColNames = settingsCols.map(c => c.Field);
    if (!settingsColNames.includes('pin_style')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN pin_style VARCHAR(20) DEFAULT 'classic'`);
      columnsAdded.push('settings.pin_style');
    }
    if (!settingsColNames.includes('gielda_timeout_minutes')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_timeout_minutes INT DEFAULT 3`);
      columnsAdded.push('settings.gielda_timeout_minutes');
    }
    if (!settingsColNames.includes('gielda_enabled')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_enabled TINYINT(1) DEFAULT 1`);
      columnsAdded.push('settings.gielda_enabled');
    }
    if (!settingsColNames.includes('gielda_registration_seconds')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_registration_seconds INT DEFAULT 15`);
      columnsAdded.push('settings.gielda_registration_seconds');
    }
    if (!settingsColNames.includes('gielda_hours_enabled')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_enabled TINYINT(1) DEFAULT 0`);
      columnsAdded.push('settings.gielda_hours_enabled');
    }
    if (!settingsColNames.includes('gielda_hours_from')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_from VARCHAR(5) DEFAULT '00:00'`);
      columnsAdded.push('settings.gielda_hours_from');
    }
    if (!settingsColNames.includes('gielda_hours_to')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_hours_to VARCHAR(5) DEFAULT '23:59'`);
      columnsAdded.push('settings.gielda_hours_to');
    }
    if (!settingsColNames.includes('gielda_priority_order')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_priority_order VARCHAR(100) DEFAULT 'wolna,kursem,dojazd,zajeta'`);
      columnsAdded.push('settings.gielda_priority_order');
    }
  } catch (e) {
    console.warn(`[Migration] settings columns: ${e.message}`);
  }

  try {
    const zsColsResult = await safeQuery(`SHOW COLUMNS FROM zone_settings`);
    const zsColNames = (zsColsResult ?? []).map(c => c.Field);
    if (!zsColNames.includes('gielda_max_distance_km')) {
      await safeQuery(`ALTER TABLE zone_settings ADD COLUMN gielda_max_distance_km DECIMAL(5,2) NULL`);
      columnsAdded.push('zone_settings.gielda_max_distance_km');
    }
  } catch (e) {
    console.warn(`[Migration] zone_settings columns: ${e.message}`);
  }

  try {
    const ordColsResult = await safeQuery(`SHOW COLUMNS FROM orders`);
    const ordColNames = (ordColsResult ?? []).map(c => c.Field);
    if (!ordColNames.includes('market_at')) {
      await safeQuery(`ALTER TABLE orders ADD COLUMN market_at DATETIME NULL`);
      columnsAdded.push('orders.market_at');
    }
  } catch (e) {
    console.warn(`[Migration] orders.market_at: ${e.message}`);
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS driver_logs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      driver_id   VARCHAR(36) NOT NULL,
      type        VARCHAR(60) NOT NULL,
      title       VARCHAR(250) NOT NULL,
      description TEXT NULL,
      metadata    JSON NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dl_driver (driver_id),
      INDEX idx_dl_created (created_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('driver_logs');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] driver_logs: ${e.message}`);
    }
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS gielda_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(36) NOT NULL,
      driver_id VARCHAR(36) NOT NULL,
      driver_lat DOUBLE NULL,
      driver_lng DOUBLE NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order_driver (order_id, driver_id),
      INDEX idx_order (order_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('gielda_registrations');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] gielda_registrations: ${e.message}`);
    }
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      driver_id VARCHAR(36) NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_driver_endpoint (driver_id, endpoint(191)),
      INDEX idx_driver (driver_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('push_subscriptions');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.warn(`[Migration] push_subscriptions: ${e.message}`);
    }
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_tariffs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      base_fare DECIMAL(8,2) NOT NULL DEFAULT 8.00,
      per_km_rate DECIMAL(8,2) NOT NULL DEFAULT 2.50,
      pulse_amount DECIMAL(8,2) NOT NULL DEFAULT 0.50,
      waiting_rate DECIMAL(8,2) NOT NULL DEFAULT 0.50,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('taximeter_tariffs');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_tariffs: ${e.message}`);
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_surcharges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      amount DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    tablesCreated.push('taximeter_surcharges');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_surcharges: ${e.message}`);
  }

  try {
    await safeQuery(`CREATE TABLE IF NOT EXISTS taximeter_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      initial_fee DECIMAL(8,2) NOT NULL DEFAULT 8.00,
      waiting_rate DECIMAL(8,2) NOT NULL DEFAULT 40.00,
      pulse_amount DECIMAL(8,2) NOT NULL DEFAULT 0.85,
      min_speed_kmh INT NOT NULL DEFAULT 20,
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safeQuery(`INSERT IGNORE INTO taximeter_settings (id, initial_fee, waiting_rate, pulse_amount, min_speed_kmh) VALUES (1, 8.00, 40.00, 0.85, 20)`);
    tablesCreated.push('taximeter_settings');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] taximeter_settings: ${e.message}`);
  }

  try {
    await safeQuery(`ALTER TABLE drivers ADD COLUMN taximeter_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (e) {
    if (!e.message.includes('Duplicate column')) console.warn(`[Migration] drivers.taximeter_enabled: ${e.message}`);
  }

  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS driver_client_blocks (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        driver_id  VARCHAR(36) NOT NULL,
        client_id  VARCHAR(36) NOT NULL,
        blocked_by ENUM('driver','client') NOT NULL,
        reason     TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_block (driver_id, client_id, blocked_by),
        INDEX idx_dcb_driver (driver_id),
        INDEX idx_dcb_client (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('driver_client_blocks');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] driver_client_blocks: ${e.message}`);
  }

  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        type        VARCHAR(64)  NOT NULL,
        category    VARCHAR(64)  NOT NULL DEFAULT 'general',
        user_id     VARCHAR(128) NULL,
        user_name   VARCHAR(255) NULL,
        user_role   VARCHAR(64)  NULL,
        description TEXT         NOT NULL,
        metadata    JSON         NULL,
        ip_address  VARCHAR(64)  NULL,
        created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sl_created (created_at),
        INDEX idx_sl_type    (type),
        INDEX idx_sl_role    (user_role),
        INDEX idx_sl_user    (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('system_logs');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] system_logs: ${e.message}`);
  }

  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS local_addresses (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        street       VARCHAR(255) NOT NULL,
        house_number VARCHAR(20)  DEFAULT NULL,
        city         VARCHAR(100) NOT NULL DEFAULT '',
        postcode     VARCHAR(10)  DEFAULT NULL,
        lat          DECIMAL(10,8) NOT NULL,
        lng          DECIMAL(11,8) NOT NULL,
        notes        VARCHAR(255) DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_la_street (street),
        INDEX idx_la_city   (city)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('local_addresses');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] local_addresses: ${e.message}`);
  }

  try {
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS announcements (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        sender_id   VARCHAR(128) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        message     TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ann_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tablesCreated.push('announcements');
  } catch (e) {
    if (!e.message.includes('already exists')) console.warn(`[Migration] announcements: ${e.message}`);
  }

  const allTables = [
    'zones', 'drivers', 'chat_messages', 'orders', 'clients',
    'administrators', 'dispatchers', 'support_agents', 'driver_queue',
    'regions', 'accounting_users', 'taxi_codes', 'pricing_rules',
    'map_tokens', 'custom_addresses', 'address_pins', 'driver_history',
    'database_connections', 'settings', 'dispatcher_tasks',
    'zone_assignment_rules', 'zone_settings', 'preferences',
    'driver_preferences', 'driver_queries',
    'gielda_registrations', 'push_subscriptions', 'system_logs', 'local_addresses', 'announcements'
  ];
  for (const tbl of allTables) {
    try {
      await safeQuery(`ALTER TABLE \`${tbl}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[Migration] Collation OK: ${tbl}`);
    } catch (e) {
      // Ignoruj — tabela nie istnieje lub inny błąd nieblokujący
    }
  }

  try {
    const settingsCols = await safeQuery(`SHOW COLUMNS FROM settings`);
    const settingsColNames = (settingsCols ?? []).map(c => c.Field);
    if (!settingsColNames.includes('gielda_auto_dispatch_wolna')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_auto_dispatch_wolna TINYINT(1) DEFAULT 0`);
      console.log('[Migration] ✅ settings.gielda_auto_dispatch_wolna dodana');
    }
    if (!settingsColNames.includes('gielda_auto_dispatch_dojazd')) {
      await safeQuery(`ALTER TABLE settings ADD COLUMN gielda_auto_dispatch_dojazd TINYINT(1) DEFAULT 0`);
      console.log('[Migration] ✅ settings.gielda_auto_dispatch_dojazd dodana');
    }
  } catch (e) {
    console.warn('[Migration] settings auto_dispatch:', e.message);
  }

  try {
    const taskCols = await safeQuery(`SHOW COLUMNS FROM dispatcher_tasks`);
    const taskColNames = (taskCols ?? []).map(c => c.Field);
    if (!taskColNames.includes('deleted_at')) {
      await safeQuery(`ALTER TABLE dispatcher_tasks ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL`);
      console.log('[Migration] ✅ dispatcher_tasks.deleted_at dodana');
    }
  } catch (e) {
    console.warn('[Migration] dispatcher_tasks.deleted_at:', e.message);
  }

  try {
    await safeQuery(`
      DELETE b1 FROM driver_client_blocks b1
      INNER JOIN driver_client_blocks b2
        ON b1.driver_id = b2.driver_id
       AND b1.client_id = b2.client_id
       AND b1.id < b2.id
    `);
    console.log('[Migration] ✅ driver_client_blocks: zduplikowane pary wyczyszczone');
  } catch (e) {
    console.warn('[Migration] driver_client_blocks dedup:', e.message);
  }

  const perfIndexes = [
    { name: 'idx_drivers_state_zone', sql: `CREATE INDEX idx_drivers_state_zone ON drivers (driver_state, current_zone)` },
    { name: 'idx_drivers_free_since', sql: `CREATE INDEX idx_drivers_free_since ON drivers (free_since)` },
    { name: 'idx_orders_status',      sql: `CREATE INDEX idx_orders_status ON orders (status)` },
    { name: 'idx_orders_driver_id',   sql: `CREATE INDEX idx_orders_driver_id ON orders (driver_id)` },
    { name: 'idx_orders_region',      sql: `CREATE INDEX idx_orders_region ON orders (pickup_region_id)` },
    { name: 'idx_orders_created_at',  sql: `CREATE INDEX idx_orders_created_at ON orders (created_at)` },
    { name: 'idx_order_logs_order',   sql: `CREATE INDEX idx_order_logs_order ON order_logs (order_id)` },
    { name: 'idx_zar_source_prio',    sql: `CREATE INDEX idx_zar_source_prio ON zone_assignment_rules (source_zone, priority)` },
  ];
  for (const idx of perfIndexes) {
    try {
      await safeQuery(idx.sql);
      console.log(`[Migration] ✅ Indeks ${idx.name} utworzony`);
    } catch (e) {
      if (!e.message?.includes('Duplicate key name') && !e.message?.includes('already exists')) {
        console.warn(`[Migration] Indeks ${idx.name}: ${e.message}`);
      }
    }
  }

  return {
    tablesCreated,
    columnsAdded,
    alreadyOk: tablesCreated.length === 0 && columnsAdded.length === 0,
  };
}
