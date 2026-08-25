-- settings table for app configuration (e.g. seguro fee)
-- Run against the primedb database used by the Invoices API

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NULL,
  updated_by VARCHAR(100) NULL,
  PRIMARY KEY (setting_key)
);

INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
VALUES ('seguro_fee', '0', NOW(), 'system')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
VALUES ('seguro_fee_enabled', '0', NOW(), 'system')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
