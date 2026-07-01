-- Tabela preferencji (lista wszystkich dostepnych preferencji)
CREATE TABLE IF NOT EXISTS preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela powiazan kierowca <-> preferencja (many-to-many)
CREATE TABLE IF NOT EXISTS driver_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id VARCHAR(36) NOT NULL,
  preference_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preference_id) REFERENCES preferences(id) ON DELETE CASCADE,
  UNIQUE KEY unique_driver_pref (driver_id, preference_id)
);
