-- settings table for app configuration (e.g. credit card fee)
-- Run against the primedb database used by the Invoices API

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NULL,
  updated_by VARCHAR(100) NULL,
  PRIMARY KEY (setting_key)
);
